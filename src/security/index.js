const { shell } = require('electron')
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
        if (!this.config.security.enableNavigationGuard || !mainWindow || mainWindow.isDestroyed()) return

        this.mainWindow = mainWindow

        mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
            if (this._canLoadInMainWindow(targetUrl)) return

            event.preventDefault()
            logger.error(`blocked navigation: ${targetUrl}`)
        })

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

    _canLoadInMainWindow(targetUrl) {
        const origin = getUrlOrigin(targetUrl)
        return Boolean(origin && this.allowedOrigins.has(origin))
    }

    _canOpenExternal(targetUrl) {
        if (!this.config.security.allowOpenExternal) return false

        const origin = getUrlOrigin(targetUrl)
        return Boolean(origin && this.externalAllowedOrigins.has(origin))
    }
}

module.exports = {
    AppSecurityGuard,
    getUrlOrigin,
}
