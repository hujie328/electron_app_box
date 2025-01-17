const { app } = require('electron')
const path = require('path')
const koa2 = require("koa")
const cors = require('koa2-cors');
const http = require('http');
const koaStatic = require('koa-static');
const { logger } = require('../log/index.js');
const ws = require("ws")

// 静态资源服
class staticServe {
    serve = null
    port = 9000
    staticDir = path.join(app.getAppPath(), './appStatic')
    serve_url = ''
    constructor(port) {
        if (port) this.port = port
        this.serve = new koa2()
        this.serve.use(koaStatic(this.staticDir, {
            index: false,
            hidden: false,
            defer: true
        }))
    }
    listen(callback) {
        this.serve.listen(this.port, () => {
            this.serve_url = `http://localhost:${this.port}`
            callback && callback()
        })
        return this
    }
}

// websocket服务
class wsServer {
    wss = null
    port = 60000
    ws = null
    onMessagesList = []
    needSendMsg = []
    constructor(port) {
        if (port) this.port = port
        this.wss = new ws.Server({ port: this.port })
        this.wss.on('connection', (ws) => {
            this.ws = ws
            this.clearNeedSendMsg()
            this.ws.on('message', (message) => {
                this.onMessagesList.forEach(fn => {
                    fn(message.toString())
                })
            })
        });
    }
    sendMessage(msg) {
        if (!this.ws) {
            this.needSendMsg.push(msg)
        } else {
            this.ws.send(msg)
        }
        return this
    }
    AddReceiveMssage(callback) {
        if (typeof callback !== 'function') {
            throw new Error('params is not function');
        } else {
            this.onMessagesList.push(callback)
        }
        return this
    }
    clearNeedSendMsg() {
        while (this.needSendMsg.length) {
            let msg = this.needSendMsg.shift()
            this.sendMessage(msg)
        }
    }
}

// udp广播通信服务
class dgramServe {
    socket = null
    port = 41234
    ipAddress = ''
    subnetMask = ''
    // 广播发送地址
    static socketAddress = ''
    static calculateBroadcastAddress(ipAddress, subnetMask) {

        // 将 IP 地址和子网掩码转换为二进制数组
        const ipBinary = ipAddress.split('.').map(part => parseInt(part).toString(2).padStart(8, '0'));
        const maskBinary = subnetMask.split('.').map(part => parseInt(part).toString(2).padStart(8, '0'));

        // 计算子网掩码的反码
        const maskInvertedBinary = maskBinary.map(part => part.split('').map(digit => digit === '0' ? '1' : '0').join(''));

        // 计算广播地址的二进制数组
        const broadcastBinary = ipBinary.map((ipPart, index) => (parseInt(ipPart, 2) | parseInt(maskInvertedBinary[index], 2)).toString(2).padStart(8, '0'));

        // 将广播地址的二进制数组转换回十进制并拼接成 IP 地址
        const socketAddress = broadcastBinary.map(part => parseInt(part, 2)).join('.');
        return socketAddress;
    }
    constructor(port) {
        const dgram = require('dgram')
        if (port) this.port = port
        // 创建 UDP 套接字
        this.socket = dgram.createSocket('udp4');
        // 设置广播端口
        this.socket.bind(this.port, () => {
            this.socket.setBroadcast(true);
            // 启用广播功能，允许发送广播消息
        })
        this.socket.on('error', () => {
            this.socket.close()
        })

        this.socket.on('close', () => {
            logger.info("dgram is close")
        })
    }
    getIPAndSubnetMask() {
        const os = require('os');
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const interfaceInfo of interfaces[name]) {
                if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
                    logger.info('Ipv4 is --->' + interfaceInfo.address)
                    logger.info('Mask is --->' + interfaceInfo.netmask)
                    this.ipAddress = interfaceInfo.address
                    this.subnetMask = interfaceInfo.netmask
                }
            }
        }
        return this
    }
    sendMessage(message) {
        message = Buffer.from(message || '')
        if (!dgramServe.socketAddress) {
            this.getIPAndSubnetMask()
            dgramServe.socketAddress = dgramServe.calculateBroadcastAddress(this.ipAddress, this.subnetMask)
        }
        this.socket.send(message, this.port, dgramServe.socketAddress, (err) => {
            if (err) {
                // 如果发送过程中出现错误
                logger.info('dgram send is error')
            } else {
                // 如果发送成功
                logger.info('dgram send is success')
            }
        })
    }

}

// 综合服务模块
class appServe {
    serve = null
    httpServe = null
    port = 50080
    serve_url = ''
    ws = null
    constructor() {
        this.serve = new koa2()
        this.httpServe = http.createServer(this.serve.callback())
    }
    openCors() {
        this.serve.use(cors())
        return this
    }
    openStatic() {
        this.serve.use(koaStatic(path.join(app.getAppPath(), './appStatic'), {
            index: false,
            hidden: false,
            defer: true
        }))
        return this
    }
    openWs(win) {
        const wss1 = new ws.Server({ noServer: true })
        wss1.on("connection", (ws) => {
            this.ws = ws
            ws.on("message", (message) => {
                win.webContents.send('set-data', message.toString())
                ws.send("pang")
            })
            ws.on("open", (message) => {
                ws.send("链接成功")
            })
        })
        this.httpServe.on("upgrade", (req, socket, head) => {
            if (req.url.toString() === "/wskoa1") {
                //由chatWS 进行处理
                wss1.handleUpgrade(req, socket, head, (conn) => {
                    wss1.emit("connection", conn, req);
                });
            }
            else {
                //直接关闭连接
                socket.destroy();
            }
        });
        return this
    }
    setPort(port) {
        this.port = port
        return this
    }
    close() {
        this.httpServe.close();
        return this
    }
    listen(callback) {
        this.httpServe.listen(this.port, () => {
            logger.info(`服务器启动成功，端口号：${this.port}`)
            this.serve_url = `http://localhost:${this.port}`
            callback && callback()
        })
        this.httpServe.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logger.error(`${port}端口被占用`)
                this.port++
                this.httpServe.close();
                this.httpServe.listen(port)
            } else {
                logger.error(err)
            }
        })
        return this
    }
}

module.exports = {
    staticServe,
    wsServer,
    dgramServe,
    appServe
}