const { session, shell } = require('electron')
const { logger } = require('../log/index.js')

/**
 * 从 URL 字符串中提取 origin。
 *
 * 返回值示例：
 *   http://127.0.0.1:9000/h5/index.html -> http://127.0.0.1:9000
 *   https://example.com/a?b=1             -> https://example.com
 */
function getUrlOrigin(targetUrl) {
    try {
        const url = new URL(targetUrl)
        return url.origin
    } catch {
        return ''
    }
}

/** 把 origin 数组转换为 Set，便于高频权限/导航判断时 O(1) 查询。 */
function normalizeOrigins(origins) {
    return new Set(
        (origins || [])
            .map(getUrlOrigin)
            .filter(Boolean)
    )
}

/**
 * AppSecurityGuard — 主窗口安全守卫。
 *
 * 负责处理三类风险：
 *   1. 主窗口主动跳转到未知域名；
 *   2. 页面通过 window.open / target=_blank 打开未知外链；
 *   3. 外链在 Electron 内部新开窗口，绕过主窗口安全配置。
 */
class AppSecurityGuard {
    constructor(config) {
        this.config = config
        this.mainWindow = null
        this.allowedOrigins = normalizeOrigins(config.security.allowedOrigins)
        this.externalAllowedOrigins = normalizeOrigins(config.security.externalAllowedOrigins)
    }

    /**
     * 允许当前本地静态服务地址。
     *
     * local 模式下静态服务端口可能自动递增，所以必须等服务实际启动后把 baseUrl 加入白名单。
     */
    allowAppOrigin(originUrl) {
        const origin = getUrlOrigin(originUrl)
        if (origin) this.allowedOrigins.add(origin)
    }

    /** 将安全守卫挂到 BrowserWindow 上。 */
    attach(mainWindow) {
        if (!mainWindow || mainWindow.isDestroyed()) return

        this.mainWindow = mainWindow
        // 权限守卫独立于导航守卫，即使关闭导航拦截，也仍然可以控制摄像头/麦克风等权限。
        this._attachPermissionGuard()

        if (!this.config.security.enableNavigationGuard) return

        // 阻止当前主窗口跳转到未授权 origin，避免远程页面通过 location.href 接管桌面壳。
        mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
            if (this._canLoadInMainWindow(targetUrl)) return

            event.preventDefault()
            logger.error(`blocked navigation: ${targetUrl}`)
        })

        // 不允许在 Electron 内部打开新窗口；需要打开的白名单外链交给系统默认浏览器。
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            if (this._canOpenExternal(url)) {
                shell.openExternal(url).catch((err) => {
                    logger.error(`open external failed: ${err.message}`)
                })
            } else {
                logger.error(`blocked external url: ${url}`)
            }

            return { action: 'deny' }
        })
    }

    _attachPermissionGuard() {
        const permissionConfig = this.config.security.permissions || {}
        const allowedOrigins = normalizeOrigins(permissionConfig.allowedOrigins)
        const allowedPermissions = new Set(permissionConfig.allowedPermissions || [])
        const defaultAction = permissionConfig.defaultAction || 'deny'

        // 统一处理通知、摄像头、麦克风、地理位置等权限请求。
        // 默认 deny 更适合作为通用外壳模板，避免远程页面意外获取敏感权限。
        session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
            const origin = getUrlOrigin(details.requestingUrl || webContents.getURL())
            const isAllowedOrigin = allowedOrigins.has(origin)
            const isAllowedPermission = allowedPermissions.has(permission)

            // 只有 origin 和 permission 同时在白名单中才自动允许。
            if (isAllowedOrigin && isAllowedPermission) {
                callback(true)
                return
            }

            // allow 适合完全可信的内网/自有页面；生产公网 remote 页面不建议使用。
            if (defaultAction === 'allow') {
                callback(true)
                return
            }

            logger.error(`blocked permission request: ${permission}, origin=${origin}`)
            callback(false)
        })
    }

    _canLoadInMainWindow(targetUrl) {
        // 只允许主窗口加载白名单 origin；路径级权限由前端路由或服务端鉴权负责。
        const origin = getUrlOrigin(targetUrl)
        return Boolean(origin && this.allowedOrigins.has(origin))
    }

    _canOpenExternal(targetUrl) {
        // 外链必须同时满足功能开关和 external 白名单，避免远程页面随意拉起系统浏览器。
        if (!this.config.security.allowOpenExternal) return false

        const origin = getUrlOrigin(targetUrl)
        return Boolean(origin && this.externalAllowedOrigins.has(origin))
    }
}

module.exports = {
    AppSecurityGuard,
    getUrlOrigin,
}
