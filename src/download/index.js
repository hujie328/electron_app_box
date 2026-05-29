const path = require('node:path')
const { app, session } = require('electron')
const { logger } = require('../log/index.js')

/**
 * DownloadManager — Electron 下载管理器。
 *
 * Electron 的下载行为发生在主进程 session 层，渲染进程不能直接可靠地拿到下载进度。
 * 这个类统一接管 will-download 事件，并把开始、进度、完成、失败状态通过 IPC 推给页面。
 */
class DownloadManager {
    constructor(mainWindow) {
        this.mainWindow = mainWindow
        // downloadURL(url) 只能传 URL，额外的 filename/savePath 先放到 Map，等 will-download 触发时再取出。
        this.pendingOptions = new Map()
        // 保存正在下载的 DownloadItem，后续如果要扩展取消/暂停/恢复，可以基于这里继续做。
        this.downloads = new Map()
        // 绑定一次函数引用，stop() 时才能准确 removeListener。
        this.boundWillDownload = this._handleWillDownload.bind(this)
    }

    /** 开始监听默认 session 的下载事件。 */
    start() {
        session.defaultSession.on('will-download', this.boundWillDownload)
    }

    /** 停止监听下载事件并清空内存中的任务记录。 */
    stop() {
        session.defaultSession.removeListener('will-download', this.boundWillDownload)
        this.downloads.clear()
        this.pendingOptions.clear()
    }

    /**
     * 发起下载。
     *
     * @param {string} url 下载地址，只允许 http/https。
     * @param {object} options 可选下载参数，例如 filename、savePath。
     */
    download(url, options = {}) {
        const downloadUrl = String(url || '')
        if (!/^https?:\/\//i.test(downloadUrl)) {
            return { code: 1, message: 'download url must be http or https' }
        }

        // 先保存下载配置，再调用 webContents.downloadURL 触发 will-download。
        this.pendingOptions.set(downloadUrl, options)
        this.mainWindow.webContents.downloadURL(downloadUrl)

        return { code: 0, url: downloadUrl }
    }

    /** 安全地向页面发送下载事件，窗口被销毁时直接忽略。 */
    _send(channel, payload) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, payload)
        }
    }

    /** 处理 Electron 原生 DownloadItem，并把生命周期转成业务 IPC 事件。 */
    _handleWillDownload(_event, item) {
        const url = item.getURL()
        const options = this.pendingOptions.get(url) || {}
        this.pendingOptions.delete(url)

        const filename = options.filename || item.getFilename()
        // 未指定保存路径时默认放到系统下载目录，符合普通桌面应用习惯。
        const savePath = options.savePath || path.join(app.getPath('downloads'), filename)
        const totalBytes = item.getTotalBytes()

        // setSavePath 必须在 will-download 阶段设置，下载开始后再改路径会失效。
        item.setSavePath(savePath)
        this.downloads.set(url, item)

        this._send('download:started', { url, savePath, filename, totalBytes })

        // updated 会频繁触发，只发送必要字段，避免 IPC 传输过重。
        item.on('updated', (_event, state) => {
            this._send('download:progress', {
                url,
                state,
                savePath,
                receivedBytes: item.getReceivedBytes(),
                totalBytes,
            })
        })

        // done 只会触发一次；无论成功失败，都从任务表中清理。
        item.once('done', (_event, state) => {
            this.downloads.delete(url)

            if (state === 'completed') {
                this._send('download:done', { url, savePath, filename })
                return
            }

            logger.error(`download failed: ${url}, state=${state}`)
            this._send('download:failed', { url, savePath, filename, state })
        })
    }
}

module.exports = { DownloadManager }
