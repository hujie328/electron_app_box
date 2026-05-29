const { registerIpcMainHandle, unregisterIpcMainHandle } = require('../ipcModule/ipcMain.js')
const { LocalHttpServer, StaticFileServer, UdpBroadcastServer } = require('../koaServe/index.js')
const { checkForUpdates } = require('../upload/index.js')
const { createTrayMenu, destroyTray } = require('../customMenu/index.js')
const { registerGlobalShortcut, unregisterGlobalShortcut } = require('../customGlobal/index.js')
const { AppSecurityGuard } = require('../security/index.js')
const { DownloadManager } = require('../download/index.js')
const { getAssetPath } = require('../utils/assetPath.js')
const { logger } = require('../log/index.js')

/**
 * AppRuntime — 应用运行时编排器。
 *
 * Electron 主入口只负责创建窗口，具体资源的启动和停止集中放在 Runtime 中：
 *   - 托盘菜单
 *   - IPC 通道
 *   - 全局快捷键
 *   - 本地静态资源服务
 *   - 本地 API + WebSocket 服务
 *   - UDP 广播
 *   - 自动更新检查
 *
 * 这样窗口重建、应用退出、异常兜底时只需要调用 start()/stop()，不会把生命周期逻辑散落到各个文件。
 */
class AppRuntime {
    constructor(config) {
        this.config = config
        this.mainWindow = null
        this.securityGuard = new AppSecurityGuard(config)

        // 统一保存会占用系统资源或端口的服务实例，stop() 时按需释放。
        this.services = {
            staticServer: null,
            apiServer: null,
            udpServer: null,
            downloadManager: null,
        }
    }

    /** 启动应用运行期资源；win 必须是当前仍然有效的 BrowserWindow。 */
    start(win) {
        this.mainWindow = win

        this._startTray()
        this._startSecurityGuard()
        this._startDownloadManager()
        this._startIpc()
        this._startShortcuts()
        this._startLocalServices()

        if (this.config.updater.enabled) {
            this._startUpdater()
        }
    }

    /** 创建托盘入口，提供显示窗口、退出应用等桌面端常用操作。 */
    _startTray() {
        createTrayMenu(this.mainWindow)
    }

    /** 挂载导航和外链安全守卫，防止页面跳转到未授权域名。 */
    _startSecurityGuard() {
        this.securityGuard.attach(this.mainWindow)
    }

    /** 下载管理器接管 Electron will-download，向页面推送下载进度。 */
    _startDownloadManager() {
        if (!this.config.features.downloads) return

        this.services.downloadManager = new DownloadManager(this.mainWindow)
        this.services.downloadManager.start()
    }

    /** 注册主进程 IPC 通道，让渲染进程可以通过 preload 暴露的 API 与主进程通信。 */
    _startIpc() {
        registerIpcMainHandle(this.mainWindow, {
            config: this.config,
            services: this.services,
        })
    }

    /** 注册系统级快捷键；窗口关闭或应用退出时必须注销，否则可能影响其它应用。 */
    _startShortcuts() {
        registerGlobalShortcut(this.mainWindow)
    }

    /** 启动页面加载、本地 API/WebSocket 和可选 UDP 广播。 */
    _startLocalServices() {
        const { window, server, udp } = this.config

        // 页面可以从本地 appStatic 加载，也可以直接打开线上地址。
        // API / WebSocket / UDP 是外壳能力，和页面来源无强绑定，所以仍然按配置启动。
        if (window.loadMode === 'remote') {
            this._loadRemotePage()
        } else {
            this._startStaticPageServer()
        }

        this._startApiServer(server)
        this._startUdpServer(udp)
    }

    /** 启动静态资源服务，并在服务就绪后加载本地入口页面。 */
    _startStaticPageServer() {
        const { server } = this.config

        this.services.staticServer = new StaticFileServer({
            host: server.host,
            port: server.staticPort,
            staticDir: server.staticRoot,
        })

        this.services.staticServer.listen(() => {
            this.securityGuard.allowAppOrigin(this.services.staticServer.baseUrl)

            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.loadURL(`${this.services.staticServer.baseUrl}${server.entryPath}`)
            }
        })
    }

    /** 直接加载线上页面；remoteUrl 配置错误时回退到本地页面，避免窗口空白。 */
    _loadRemotePage() {
        const { remoteUrl } = this.config.window

        if (!remoteUrl) {
            logger.error('window.loadMode is remote, but window.remoteUrl is empty or invalid')
            this._startStaticPageServer()
            return
        }

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            // loadURL 返回 Promise；DNS、证书、网络等错误会走 catch。
            this.mainWindow.loadURL(remoteUrl).catch((err) => {
                logger.error(`load remote page failed: ${err.message}`)
                this._loadFallbackPage()
            })

            // did-fail-load 能覆盖更多 Chromium 导航失败场景，例如主资源加载中断。
            this.mainWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
                logger.error(`remote page did-fail-load: ${errorCode}, ${errorDescription}, ${validatedURL}`)
                this._loadFallbackPage()
            })
        }
    }

    /** 加载本地兜底页，避免 remoteUrl 不可达时窗口白屏。 */
    _loadFallbackPage() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.loadFile(getAssetPath('appStatic', 'fallback', 'index.html'))
        }
    }

    /** 启动本地 API 服务和 WebSocket 服务。 */
    _startApiServer(server) {
        // API 服务当前主要承载 WebSocket，后续 Koa 路由也可以统一挂在这里。
        this.services.apiServer = new LocalHttpServer({
            host: server.host,
            port: server.apiPort,
            wsPath: server.wsPath,
            staticDir: server.staticRoot,
        })

        if (server.enableCors) {
            this.services.apiServer.openCors()
        }

        // health 用于外部进程或页面确认本地壳服务是否已经启动。
        this.services.apiServer.get('/health', () => ({
            code: 0,
            name: 'electron_app_box',
            mode: this.config.window.loadMode,
            timestamp: Date.now(),
        }))

        // WS 收到的消息转发给渲染进程。网络服务本身不关心 UI，业务桥接集中在 runtime。
        this.services.apiServer.openWebSocket({
            onMessage: (_client, message) => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('app:ws:message', message)
                }
            },
        }).listen()
    }

    /** 按配置启动 UDP 广播；关闭后不会占用 UDP 端口，也不会触发防火墙提示。 */
    _startUdpServer(udp) {
        if (udp.enabled) {
            this.services.udpServer = new UdpBroadcastServer({ port: udp.port })
            this.services.udpServer.sendMessage(udp.startupMessage)
        }
    }

    /** 触发自动更新检查；真正的更新事件处理在 upload 模块内部维护。 */
    _startUpdater() {
        checkForUpdates(this.config.updater.feedUrl, this.mainWindow)
    }

    /**
     * 停止运行期资源。
     *
     * stop() 可能从窗口 closed、before-quit 等多个路径触发，所以每一步都要允许重复调用。
     */
    stop() {
        unregisterIpcMainHandle()
        unregisterGlobalShortcut()
        destroyTray()

        this.services.downloadManager?.stop()
        this.services.udpServer?.close()
        this.services.apiServer?.close()
        this.services.staticServer?.close()

        this.services = { staticServer: null, apiServer: null, udpServer: null, downloadManager: null }
        this.mainWindow = null
        logger.info('AppRuntime stopped')
    }
}

module.exports = { AppRuntime }
