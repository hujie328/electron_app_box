const { getAssetPath, getStaticRoot } = require('../utils/assetPath.js')
const { rawConfig } = require('./app.config.js')

/**
 * 判断是否是普通对象。
 *
 * 配置合并只递归合并普通对象；数组、字符串、数字等都按整体值覆盖。
 * 这样可以避免 allowedOrigins 这类数组被错误地按索引合并。
 */
function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 深度合并配置对象。
 *
 * 合并优先级从低到高：
 *   1. app.config.js 基础配置；
 *   2. app.config.{APP_ENV}.js / app.config.{NODE_ENV}.js 环境配置；
 *   3. app.config.local.js 本机私有配置；
 *   4. 命令行参数临时覆盖。
 */
function deepMerge(target, source) {
    const result = { ...target }

    Object.entries(source || {}).forEach(([key, value]) => {
        if (isPlainObject(value) && isPlainObject(result[key])) {
            result[key] = deepMerge(result[key], value)
        } else {
            result[key] = value
        }
    })

    return result
}

/**
 * 尝试加载可选配置文件。
 *
 * 文件不存在时直接返回空对象，避免开发者不需要环境配置时还必须创建空文件。
 * 只读取导出的 rawConfig，保持所有配置文件结构一致。
 */
function loadOptionalRawConfig(filename) {
    try {
        return require(filename).rawConfig || {}
    } catch {
        return {}
    }
}

/**
 * 解析命令行参数。
 *
 * 支持格式：
 *   --remote-url=https://example.com
 *   --load-mode=remote
 *   --disable-udp
 *
 * 参数名会从 kebab-case 转成 camelCase，方便后续读取。
 */
function parseCliArgs(argv = process.argv.slice(2)) {
    const args = {}

    argv.forEach((item) => {
        if (!item.startsWith('--')) return
        const [rawKey, ...rawValue] = item.slice(2).split('=')
        const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase())
        args[key] = rawValue.length ? rawValue.join('=') : true
    })

    return args
}

/**
 * 使用命令行参数覆盖配置。
 *
 * 这类覆盖只影响本次启动，不会写回 app.config.js，适合现场临时调试或 CI 构建注入。
 */
function applyCliOverrides(config) {
    const args = parseCliArgs()
    const nextConfig = deepMerge({}, config)

    if (args.loadMode) nextConfig.window.loadMode = args.loadMode
    if (args.remoteUrl) nextConfig.window.remoteUrl = args.remoteUrl
    if (args.openDevTools !== undefined) nextConfig.window.openDevTools = args.openDevTools
    if (args.staticPort) nextConfig.server.staticPort = args.staticPort
    if (args.apiPort) nextConfig.server.apiPort = args.apiPort
    if (args.disableUdp) nextConfig.udp.enabled = false
    if (args.udpPort) nextConfig.udp.port = args.udpPort

    return nextConfig
}

// 先加载环境配置和本机配置，再应用启动参数，得到最终的原始配置。
const envName = process.env.APP_ENV || process.env.NODE_ENV || ''
const envConfig = envName ? loadOptionalRawConfig(`./app.config.${envName}.js`) : {}
const localConfig = loadOptionalRawConfig('./app.config.local.js')
const mergedRawConfig = applyCliOverrides(deepMerge(deepMerge(rawConfig, envConfig), localConfig))

/**
 * 把配置值转换为正数。
 *
 * 配置文件可能被手动修改成字符串、空值或负数，这里集中做兜底，
 * 避免窗口尺寸、端口等关键配置传入非法值导致启动失败。
 */
function toPositiveNumber(value, defaultValue) {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : defaultValue
}

/**
 * 把配置值转换为布尔值。
 *
 * 同时兼容 true/false、'true'/'false'、1/0、'1'/'0'，方便通过环境或外部配置工具写入。
 */
function toBoolean(value, defaultValue) {
    if (value === true || value === 'true' || value === 1 || value === '1') return true
    if (value === false || value === 'false' || value === 0 || value === '0') return false

    return defaultValue
}

/**
 * 标准化窗口页面加载模式。
 *
 * local 表示加载 appStatic 内置页面；remote 表示加载线上 URL。
 * 未知值统一回退到 local，避免配置写错后窗口空白。
 */
function toWindowLoadMode(value, defaultValue = 'local') {
    return ['local', 'remote'].includes(value) ? value : defaultValue
}

/**
 * 标准化线上页面地址。
 *
 * 这里只接受完整 http/https URL，避免把普通路径误当成线上地址。
 * URL 合法性只做基础校验，具体证书、DNS、网络可达性由 Chromium 加载时处理。
 */
function toRemoteUrl(value) {
    if (typeof value !== 'string') return ''

    const url = value.trim()
    return /^https?:\/\//i.test(url) ? url : ''
}

/**
 * 标准化 URL 源白名单。
 *
 * 只保留合法的 http/https origin，例如 https://example.com。
 * 这里会自动去掉路径、查询参数和尾部斜杠，方便安全模块做精确 origin 匹配。
 */
function toOriginList(value) {
    if (!Array.isArray(value)) return []

    return value
        .map((item) => {
            try {
                if (typeof item !== 'string') return ''
                const url = new URL(item.trim())
                return ['http:', 'https:'].includes(url.protocol) ? url.origin : ''
            } catch {
                return ''
            }
        })
        .filter(Boolean)
}

/** 标准化字符串数组，过滤掉非字符串配置项。 */
function toStringList(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

/** 标准化权限默认动作；未知值统一回退 deny，避免误放开权限。 */
function toPermissionAction(value) {
    return ['allow', 'deny', 'ask'].includes(value) ? value : 'deny'
}

/**
 * 应用最终运行配置。
 *
 * rawConfig 是用户可编辑的原始配置；appConfig 是经过路径补全、类型转换、默认值兜底后的安全配置。
 * 其它模块只读取 appConfig，避免每个模块重复处理配置兼容逻辑。
 */
const appConfig = {
    window: {
        width: toPositiveNumber(mergedRawConfig.window.width, 1920),
        height: toPositiveNumber(mergedRawConfig.window.height, 1080),

        // local 加载内置静态页面；remote 加载线上页面。
        loadMode: toWindowLoadMode(mergedRawConfig.window.loadMode),

        // loadMode 为 remote 时使用；为空时 runtime 会记录错误并回退到本地页面。
        remoteUrl: toRemoteUrl(mergedRawConfig.window.remoteUrl),

        // 窗口图标使用 png；Windows 安装包图标在 package.json 的 build.win.icon 中使用 ico。
        icon: getAssetPath('icons', 'icon.png'),

        // 是否打开 DevTools 由普通配置文件 src/config/app.config.js 控制。
        openDevTools: toBoolean(mergedRawConfig.window.openDevTools, true)
    },
    security: {
        // 导航守卫默认开启，防止页面跳转到未授权域名。
        enableNavigationGuard: toBoolean(mergedRawConfig.security?.enableNavigationGuard, true),

        // 是否允许白名单外链用系统默认浏览器打开。
        allowOpenExternal: toBoolean(mergedRawConfig.security?.allowOpenExternal, true),

        // 主窗口允许加载的线上源；local 模式本地服务地址由安全模块运行时补充。
        allowedOrigins: toOriginList(mergedRawConfig.security?.allowedOrigins),

        // 允许 shell.openExternal 打开的外链源。
        externalAllowedOrigins: toOriginList(mergedRawConfig.security?.externalAllowedOrigins),

        permissions: {
            defaultAction: toPermissionAction(mergedRawConfig.security?.permissions?.defaultAction),
            allowedOrigins: toOriginList(mergedRawConfig.security?.permissions?.allowedOrigins),
            allowedPermissions: toStringList(mergedRawConfig.security?.permissions?.allowedPermissions)
        }
    },
    protocol: {
        enabled: toBoolean(mergedRawConfig.protocol?.enabled, true),
        scheme: mergedRawConfig.protocol?.scheme || 'electron-app-box'
    },
    features: {
        fileSystem: toBoolean(mergedRawConfig.features?.fileSystem, true),
        downloads: toBoolean(mergedRawConfig.features?.downloads, true),
        session: toBoolean(mergedRawConfig.features?.session, true),
        diagnostics: toBoolean(mergedRawConfig.features?.diagnostics, true),
        updater: toBoolean(mergedRawConfig.features?.updater, true)
    },
    server: {
        // 默认监听 127.0.0.1，只允许本机访问，避免把本地服务暴露到局域网。
        host: mergedRawConfig.server.host || '127.0.0.1',

        // staticPort 托管 appStatic 目录，apiPort 承载 API 和 WebSocket。
        staticPort: toPositiveNumber(mergedRawConfig.server.staticPort, 9000),
        apiPort: toPositiveNumber(mergedRawConfig.server.apiPort, 50080),

        // 渲染页面连接 WebSocket 时使用的路径，例如 ws://127.0.0.1:50080/wskoa1。
        wsPath: mergedRawConfig.server.wsPath || '/wskoa1',

        // 前端静态资源根目录和 Electron 窗口默认入口页面。
        staticRoot: getStaticRoot(),
        entryPath: mergedRawConfig.server.entryPath || '/h5/index.html',

        // 桌面外壳通常是自己访问自己的服务，默认不需要 CORS。
        enableCors: toBoolean(mergedRawConfig.server.enableCors, false)
    },
    udp: {
        // UDP 广播可能触发防火墙提示或网络权限要求，所以保留开关。
        enabled: toBoolean(mergedRawConfig.udp.enabled, true),
        port: toPositiveNumber(mergedRawConfig.udp.port, 41234),
        startupMessage: mergedRawConfig.udp.startupMessage || '88888'
    },
    updater: {
        // 自动更新需要真实发布地址。默认关闭，避免开发阶段访问 example.com。
        enabled: toBoolean(mergedRawConfig.updater.enabled, false),
        feedUrl: mergedRawConfig.updater.feedUrl || 'http://example.com'
    }
}

module.exports = {
    appConfig
}
