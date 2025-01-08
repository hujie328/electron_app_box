const { app } = require('electron')
const path = require('path')
const koa2 = require("koa")
const cors = require('koa2-cors');
const http = require('http');
const koaStatic = require('koa-static');
const { logger } = require('../log/index.js')
const ws = new require("ws")


class appServe {
    serve = null
    httpServe = null
    port = 50080
    serve_url = ''
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
            callback()
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
    appServe
}