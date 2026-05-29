const { app } = require('electron')
const path = require('node:path')
const os = require('node:os')
const dgram = require('node:dgram')
const http = require('node:http')
const Koa = require('koa')
const cors = require('@koa/cors')
const koaStatic = require('koa-static')
const WebSocket = require('ws')
const { logger } = require('../log/index.js')

const MAX_PORT = 65535
const DEFAULT_MAX_PORT_RETRIES = 10

// ─────────────────────────────────────────────
// 通用工具函数
// ─────────────────────────────────────────────

/**
 * 标准化服务启动参数。
 *
 * 兼容两种写法：
 *   new XxxServer(9000)
 *   new XxxServer({ host: '127.0.0.1', port: 9000 })
 *
 * 这样可以让调用方在简单场景少写配置，在复杂场景仍然能显式控制 host、port、staticDir 等参数。
 */
function normalizeServerOptions(options, defaultPort) {
    if (typeof options === 'number') {
        return { host: '127.0.0.1', port: options }
    }

    return { host: '127.0.0.1', port: defaultPort, ...options }
}

/**
 * 生成浏览器可访问的本地服务地址。
 *
 * 服务监听 0.0.0.0 时代表接受所有网卡连接，但浏览器不能把 0.0.0.0 当成目标地址访问，
 * 所以这里转成 127.0.0.1，确保 Electron 窗口 loadURL 能稳定打开页面。
 */
function buildLocalUrl(host, port) {
    const urlHost = host === '0.0.0.0' ? '127.0.0.1' : host
    return `http://${urlHost}:${port}`
}

/**
 * 判断端口占用后是否还能继续尝试下一个端口。
 *
 * 同时限制重试次数和端口范围，避免端口被连续占用时无限递增到非法端口。
 */
function canRetryPort(port, retryCount, maxRetries) {
    return retryCount < maxRetries && port < MAX_PORT
}

// ─────────────────────────────────────────────
// StaticFileServer — 静态文件服务
// ─────────────────────────────────────────────

/**
 * 托管 appStatic 目录的本地 HTTP 静态资源服务。
 *
 * 典型访问路径：
 *   appStatic/h5/index.html -> http://127.0.0.1:9000/h5/index.html
 *
 * 这里不主动设置 index: true，是为了让入口页面由 runtime 通过 entryPath 明确控制，
 * 避免将来 appStatic 下放多个页面时出现默认入口不清晰的问题。
 */
class StaticFileServer {
    constructor(options) {
        const opts = normalizeServerOptions(options, 9000)

        this.koaApp = new Koa()
        this.httpServer = null
        this.host = opts.host
        this.port = opts.port
        this.maxPortRetries = opts.maxPortRetries || DEFAULT_MAX_PORT_RETRIES
        this.staticDir = opts.staticDir || path.join(app.getAppPath(), 'appStatic')
        this.baseUrl = ''

        this.koaApp.use(koaStatic(this.staticDir, { index: false, hidden: false, defer: true }))
    }

    /**
     * 启动静态服务。
     *
     * 如果端口被占用，会自动尝试下一个端口，最多重试 maxPortRetries 次。
     * 每次重试都会丢弃上一轮失败的 server，避免 error 监听器和失败 server 残留。
     * 端口最终值会同步到 this.port，
     * 调用方应使用 listen 回调里的 this.baseUrl，而不是假设配置端口一定可用。
     */
    listen(callback) {
        let retryCount = 0

        const closeFailedServer = () => {
            if (!this.httpServer) return

            this.httpServer.removeAllListeners('error')
            try { this.httpServer.close() } catch (_) {}
            this.httpServer = null
        }

        const start = () => {
            closeFailedServer()

            this.httpServer = http.createServer(this.koaApp.callback())

            this.httpServer.once('error', (err) => {
                if (err.code === 'EADDRINUSE' && canRetryPort(this.port, retryCount, this.maxPortRetries)) {
                    const nextPort = this.port + 1
                    retryCount += 1
                    logger.error(`static port ${this.port} occupied, retry ${nextPort} (${retryCount}/${this.maxPortRetries})`)
                    this.port = nextPort
                    start()
                    return
                }

                logger.error(`static server listen failed on ${this.host}:${this.port}: ${err.message}`)
            })

            this.httpServer.listen(this.port, this.host, () => {
                this.baseUrl = buildLocalUrl(this.host, this.port)
                logger.info(`static server started: ${this.baseUrl}`)
                callback?.()
            })
        }

        start()
        return this
    }

    /** 关闭静态服务，释放端口；重复调用保持安全。 */
    close() {
        if (this.httpServer) {
            try { this.httpServer.close() } catch (err) {
                logger.error(`static server close failed: ${err.message}`)
            }
            this.httpServer = null
        }
        return this
    }
}

// ─────────────────────────────────────────────
// StandaloneWebSocketServer — 独立 WebSocket 服务
// ─────────────────────────────────────────────

/**
 * 独占端口的 WebSocket 服务。
 *
 * 与 LocalHttpServer.openWebSocket() 的区别：
 *   LocalHttpServer.openWebSocket() 复用已有 HTTP 端口，适合页面 API + WS 共用一个入口。
 *   StandaloneWebSocketServer 独占一个端口，适合需要与 HTTP API 做网络层隔离的场景。
 *
 * 当前 runtime 默认使用 LocalHttpServer.openWebSocket()，这个类作为预留能力保留。
 */
class StandaloneWebSocketServer {
    constructor(options) {
        const opts = normalizeServerOptions(options, 60000)

        this.webSocketServer = new WebSocket.Server({ host: opts.host, port: opts.port })
        this.port = opts.port
        this.host = opts.host
        this.clients = new Set()
        this.messageHandlers = []
        this.pendingMessages = []

        this.webSocketServer.on('connection', (client) => {
            this.clients.add(client)
            this._flushPendingMessages()

            client.on('message', (raw) => {
                const message = raw.toString()
                this.messageHandlers.forEach((handler) => handler(message))
            })

            client.on('close', () => this.clients.delete(client))
        })
    }

    /** 向所有已连接客户端广播消息；没有客户端时先放入队列，等连接建立后自动补发。 */
    sendMessage(message) {
        if (this.clients.size === 0) {
            this.pendingMessages.push(message)
            return this
        }

        this.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) client.send(message)
        })

        return this
    }

    /** 注册客户端消息回调；允许多个模块同时监听，按注册顺序执行。 */
    onMessage(callback) {
        if (typeof callback !== 'function') throw new TypeError('callback must be a function')
        this.messageHandlers.push(callback)
        return this
    }

    _flushPendingMessages() {
        while (this.pendingMessages.length) {
            this.sendMessage(this.pendingMessages.shift())
        }
    }

    /** 关闭所有客户端连接并停止 WS 服务。 */
    close() {
        this.clients.forEach((client) => client.close())
        this.clients.clear()
        try { this.webSocketServer.close() } catch (err) {
            logger.error(`StandaloneWebSocketServer close failed: ${err.message}`)
        }
    }
}

// ─────────────────────────────────────────────
// UdpBroadcastServer — UDP 广播服务
// ─────────────────────────────────────────────

/**
 * UDP 广播发送器。
 *
 * 用途：应用启动后向局域网广播一条消息，让其它设备或进程发现当前应用。
 * 注意：UDP 广播依赖网卡、子网、防火墙策略，发送成功只代表本机 socket 写入成功。
 */
class UdpBroadcastServer {
    // 广播地址在同一台机器上通常不变，计算一次后缓存，避免每次发送都遍历网卡。
    static broadcastAddress = ''

    /** 根据 IPv4 地址和子网掩码计算广播地址，例如 192.168.1.10/24 -> 192.168.1.255。 */
    static calcBroadcastAddress(ip, mask) {
        const toOctets = (str) => str.split('.').map(Number)
        const maskOctets = toOctets(mask)

        return toOctets(ip)
            .map((octet, index) => (octet | (~maskOctets[index] & 0xff)))
            .join('.')
    }

    constructor(options) {
        const opts = normalizeServerOptions(options, 41234)

        this.socket = dgram.createSocket('udp4')
        this.port = opts.port
        this.closed = false
        this.ready = false
        this.pendingMessages = []

        // UDP socket 需要先 bind，bind 完成后才能 setBroadcast 和 send。
        this.socket.bind(this.port, () => {
            if (this.closed) return
            this.ready = true
            this.socket.setBroadcast(true)
            this.pendingMessages.splice(0).forEach((message) => this.sendMessage(message))
        })

        this.socket.on('error', (err) => {
            logger.error(`dgram error: ${err.message}`)
            this.close()
        })

        this.socket.on('close', () => logger.info('dgram closed'))
    }

    /**
     * 找到第一个可用的非内网 IPv4 网卡，并计算对应广播地址。
     *
     * 多网卡机器上这里默认取第一个可用网卡；如果后续要指定网卡，可在 options 中扩展 interfaceName。
     */
    _resolveBroadcastAddress() {
        if (UdpBroadcastServer.broadcastAddress) return true

        const interfaces = os.networkInterfaces()
        for (const interfaceList of Object.values(interfaces)) {
            const ipv4Interface = interfaceList?.find((item) => item.family === 'IPv4' && !item.internal)
            if (ipv4Interface) {
                UdpBroadcastServer.broadcastAddress = UdpBroadcastServer.calcBroadcastAddress(
                    ipv4Interface.address,
                    ipv4Interface.netmask
                )
                logger.info(`dgram broadcast address: ${UdpBroadcastServer.broadcastAddress}`)
                return true
            }
        }

        logger.error('dgram: no available IPv4 interface for broadcast')
        return false
    }

    /**
     * 发送 UDP 广播消息。
     *
     * 如果 socket 尚未 bind 完成，会先进入 pendingMessages 队列，等 ready 后自动发送。
     */
    sendMessage(message) {
        if (this.closed) return this

        if (!this.ready) {
            this.pendingMessages.push(message)
            return this
        }

        if (!this._resolveBroadcastAddress()) return this

        const buffer = Buffer.from(message || '')
        this.socket.send(buffer, this.port, UdpBroadcastServer.broadcastAddress, (err) => {
            if (err) logger.error(`dgram send failed: ${err.message}`)
            else logger.info('dgram send success')
        })

        return this
    }

    /** 关闭 UDP socket，并丢弃尚未发送的等待队列。 */
    close() {
        if (this.closed) return this
        this.closed = true
        this.pendingMessages = []
        try { this.socket.close() } catch (err) {
            logger.error(`dgram close failed: ${err.message}`)
        }
        return this
    }
}

// ─────────────────────────────────────────────
// LocalHttpServer — HTTP + WebSocket 复用服务
// ─────────────────────────────────────────────

/**
 * 本地 HTTP 服务。
 *
 * 当前主要职责：
 *   1. 挂载 Koa 中间件，作为后续 API 的基础；
 *   2. 在同一个 HTTP 端口上处理 WebSocket upgrade；
 *   3. 统一管理 WS 客户端集合，供业务层广播消息。
 */
class LocalHttpServer {
    constructor(options) {
        const opts = normalizeServerOptions(options, 50080)

        this.koaApp = new Koa()
        this.httpServer = null
        this.host = opts.host
        this.port = opts.port
        this.maxPortRetries = opts.maxPortRetries || DEFAULT_MAX_PORT_RETRIES
        this.wsPath = opts.wsPath || '/wskoa1'
        this.staticDir = opts.staticDir || path.join(app.getAppPath(), 'appStatic')
        this.baseUrl = ''
        this.wsClients = new Set()
        this.webSocketServer = null
        this.upgradeHandler = null

        this._createHttpServer()
    }

    _createHttpServer() {
        this.httpServer = http.createServer(this.koaApp.callback())

        if (this.upgradeHandler) {
            this.httpServer.on('upgrade', this.upgradeHandler)
        }
    }

    /** 开启跨域支持；只有外部页面访问本地服务时才建议启用。 */
    openCors() {
        this.koaApp.use(cors())
        return this
    }

    /** 让 API 服务同时托管静态文件；默认静态资源由 StaticFileServer 负责。 */
    openStatic() {
        this.koaApp.use(koaStatic(this.staticDir, { index: false, hidden: false, defer: true }))
        return this
    }

    /**
     * 在当前 HTTP 端口上开启 WebSocket 支持（noServer 模式，不额外占用端口）。
     *
     * 这个方法只负责网络层：连接建立、消息接收、连接关闭。
     * 具体业务处理通过 handlers 注入，避免服务基础设施和业务逻辑耦合。
     *
     * @param {object}   [handlers]
     * @param {function} [handlers.onConnect]  客户端连接时调用 (client)
     * @param {function} [handlers.onMessage]  收到消息时调用 (client, message: string)
     * @param {function} [handlers.onClose]    客户端断开时调用 (client)
     */
    openWebSocket(handlers = {}) {
        const { onConnect, onMessage, onClose } = handlers

        this.webSocketServer = new WebSocket.Server({ noServer: true })

        this.webSocketServer.on('connection', (client) => {
            this.wsClients.add(client)
            onConnect?.(client)

            client.on('message', (raw) => onMessage?.(client, raw.toString()))

            client.on('close', () => {
                this.wsClients.delete(client)
                onClose?.(client)
            })
        })

        // 只接受指定 wsPath 的 upgrade 请求。其它路径直接销毁，避免非预期请求挂起。
        this.upgradeHandler = (req, socket, head) => {
            const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

            if (pathname === this.wsPath) {
                this.webSocketServer.handleUpgrade(req, socket, head, (connection) => {
                    this.webSocketServer.emit('connection', connection, req)
                })
                return
            }

            socket.destroy()
        }

        this.httpServer.on('upgrade', this.upgradeHandler)

        return this
    }

    /** 向所有已连接的 WebSocket 客户端广播消息。 */
    broadcast(message) {
        this.wsClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) client.send(message)
        })
        return this
    }

    /** 运行期修改端口，必须在 listen() 之前调用才会生效。 */
    setPort(port) {
        this.port = port
        return this
    }

    /**
     * 启动 HTTP 服务；端口被占用时自动递增重试，但最多重试 maxPortRetries 次。
     *
     * 每次重试都会重新创建 httpServer，并重新挂载 WebSocket upgrade 处理器，
     * 避免失败 server 和 error 监听器在连续重试时残留。
     */
    listen(callback) {
        let retryCount = 0

        const closeFailedServer = () => {
            if (!this.httpServer) return

            this.httpServer.removeAllListeners('error')
            try { this.httpServer.close() } catch (_) {}
            this.httpServer = null
        }

        const start = () => {
            closeFailedServer()
            this._createHttpServer()

            this.httpServer.once('error', (err) => {
                if (err.code === 'EADDRINUSE' && canRetryPort(this.port, retryCount, this.maxPortRetries)) {
                    const nextPort = this.port + 1
                    retryCount += 1
                    logger.error(`api port ${this.port} occupied, retry ${nextPort} (${retryCount}/${this.maxPortRetries})`)
                    this.port = nextPort
                    start()
                    return
                }

                logger.error(`api server listen failed on ${this.host}:${this.port}: ${err.message}`)
            })

            this.httpServer.listen(this.port, this.host, () => {
                this.baseUrl = buildLocalUrl(this.host, this.port)
                logger.info(`api server started: ${this.baseUrl}`)
                callback?.()
            })
        }

        start()
        return this
    }

    /** 关闭 HTTP、WebSocket 以及所有客户端连接。 */
    close() {
        this.wsClients.forEach((client) => client.close())
        this.wsClients.clear()

        if (this.webSocketServer) {
            try { this.webSocketServer.close() } catch (err) {
                logger.error(`webSocketServer close failed: ${err.message}`)
            }
            this.webSocketServer = null
        }

        try { this.httpServer.close() } catch (err) {
            logger.error(`http server close failed: ${err.message}`)
        }

        return this
    }
}

module.exports = {
    StaticFileServer,
    StandaloneWebSocketServer,
    UdpBroadcastServer,
    LocalHttpServer,
}
