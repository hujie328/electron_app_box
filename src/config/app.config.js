/**
 * 项目普通配置文件。
 *
 * 这个文件面向日常开发和部署调整：窗口尺寸、端口、WebSocket 路径、UDP、自动更新等。
 * 这里保留“原始值”，类型转换、默认值兜底和资源路径拼接统一在 src/config/index.js 中完成。
 */
const rawConfig = {
    window: {
        width: 1920,
        height: 1080,

        // 页面加载模式:
        //   local  - 启动本地 StaticFileServer，并加载 appStatic 里的内置页面。
        //   remote - 不启动静态资源服务，直接加载 remoteUrl 指向的线上地址。
        loadMode: 'remote',

        // loadMode 为 remote 时生效，必须填写完整 http/https 地址。
        // 注意：如果线上页面来自不可信域名，不建议暴露过多 preload API。
        remoteUrl: 'https://fmcs.deerservice.com/its_camera/video-monitor',

        // true 表示启动后自动打开开发者工具；false 表示不自动打开。
        openDevTools: true
    },
    security: {
        // 是否拦截主窗口跳转到未知地址。通用外壳建议保持开启，尤其是 loadMode 为 remote 时。
        enableNavigationGuard: false,

        // 是否允许外部浏览器打开白名单内的外链。关闭后 window.open / target=_blank 都会被拦截。
        allowOpenExternal: false,

        // 允许主窗口直接加载或跳转的源。local 模式下会自动允许本地静态服务地址。
        // remote 模式下建议只填写你自己可控的线上域名，例如 ['https://example.com']。
        allowedOrigins: [
            'https://example.com'
        ],

        // 允许通过系统默认浏览器打开的外链源。为空表示不允许任何外链。
        externalAllowedOrigins: [
            'https://example.com'
        ],

        // 权限请求策略。remote 页面建议默认 deny，再按可信域名和权限逐项放开。
        permissions: {
            defaultAction: 'deny',
            allowedOrigins: [],
            allowedPermissions: []
        }
    },
    protocol: {
        // 自定义协议用于浏览器/网页唤起客户端，例如 electron-app-box://open?id=1。
        enabled: true,
        scheme: 'electron-app-box'
    },
    features: {
        // 控制 preload 暴露能力的开关。后续如果给不可信远程页面使用，可按需关闭。
        fileSystem: true,
        downloads: true,
        session: true,
        diagnostics: true,
        updater: true
    },
    server: {
        // 默认监听 127.0.0.1，只允许本机访问；如需局域网访问可改为 0.0.0.0。
        host: '127.0.0.1',

        // staticPort 托管 appStatic 目录，apiPort 承载 API 和 WebSocket。
        staticPort: 9000,
        apiPort: 50080,

        // 渲染页面连接 WebSocket 时使用的路径，例如 ws://127.0.0.1:50080/wskoa1。
        wsPath: '/wskoa1',

        // Electron 窗口默认加载的前端入口页面。
        entryPath: '/h5/index.html',

        // 桌面外壳通常是自己访问自己的服务，默认不需要 CORS。
        enableCors: false
    },
    udp: {
        // UDP 广播可能触发防火墙提示或网络权限要求，所以保留开关。
        enabled: true,
        port: 41234,
        startupMessage: '88888'
    },
    updater: {
        // 自动更新需要真实发布地址。默认关闭，避免开发阶段访问 example.com。
        enabled: false,
        feedUrl: 'http://example.com'
    }
}

module.exports = {
    rawConfig
}
