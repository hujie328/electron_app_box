const { getAssetPath, getStaticRoot } = require('../utils/assetPath.js')
const { rawConfig } = require('./app.config.js')

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

/**
 * 应用最终运行配置。
 *
 * rawConfig 是用户可编辑的原始配置；appConfig 是经过路径补全、类型转换、默认值兜底后的安全配置。
 * 其它模块只读取 appConfig，避免每个模块重复处理配置兼容逻辑。
 */
const appConfig = {
    window: {
        width: toPositiveNumber(rawConfig.window.width, 1920),
        height: toPositiveNumber(rawConfig.window.height, 1080),

        // local 加载内置静态页面；remote 加载线上页面。
        loadMode: toWindowLoadMode(rawConfig.window.loadMode),

        // loadMode 为 remote 时使用；为空时 runtime 会记录错误并回退到本地页面。
        remoteUrl: toRemoteUrl(rawConfig.window.remoteUrl),

        // 窗口图标使用 png；Windows 安装包图标在 package.json 的 build.win.icon 中使用 ico。
        icon: getAssetPath('icons', 'icon.png'),

        // 是否打开 DevTools 由普通配置文件 src/config/app.config.js 控制。
        openDevTools: toBoolean(rawConfig.window.openDevTools, true)
    },
    security: {
        // 导航守卫默认开启，防止页面跳转到未授权域名。
        enableNavigationGuard: toBoolean(rawConfig.security?.enableNavigationGuard, true),

        // 是否允许白名单外链用系统默认浏览器打开。
        allowOpenExternal: toBoolean(rawConfig.security?.allowOpenExternal, true),

        // 主窗口允许加载的线上源；local 模式本地服务地址由安全模块运行时补充。
        allowedOrigins: toOriginList(rawConfig.security?.allowedOrigins),

        // 允许 shell.openExternal 打开的外链源。
        externalAllowedOrigins: toOriginList(rawConfig.security?.externalAllowedOrigins)
    },
    server: {
        // 默认监听 127.0.0.1，只允许本机访问，避免把本地服务暴露到局域网。
        host: rawConfig.server.host || '127.0.0.1',

        // staticPort 托管 appStatic 目录，apiPort 承载 API 和 WebSocket。
        staticPort: toPositiveNumber(rawConfig.server.staticPort, 9000),
        apiPort: toPositiveNumber(rawConfig.server.apiPort, 50080),

        // 渲染页面连接 WebSocket 时使用的路径，例如 ws://127.0.0.1:50080/wskoa1。
        wsPath: rawConfig.server.wsPath || '/wskoa1',

        // 前端静态资源根目录和 Electron 窗口默认入口页面。
        staticRoot: getStaticRoot(),
        entryPath: rawConfig.server.entryPath || '/h5/index.html',

        // 桌面外壳通常是自己访问自己的服务，默认不需要 CORS。
        enableCors: toBoolean(rawConfig.server.enableCors, false)
    },
    udp: {
        // UDP 广播可能触发防火墙提示或网络权限要求，所以保留开关。
        enabled: toBoolean(rawConfig.udp.enabled, true),
        port: toPositiveNumber(rawConfig.udp.port, 41234),
        startupMessage: rawConfig.udp.startupMessage || '88888'
    },
    updater: {
        // 自动更新需要真实发布地址。默认关闭，避免开发阶段访问 example.com。
        enabled: toBoolean(rawConfig.updater.enabled, false),
        feedUrl: rawConfig.updater.feedUrl || 'http://example.com'
    }
}

module.exports = {
    appConfig
}
