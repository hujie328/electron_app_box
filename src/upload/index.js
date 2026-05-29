const { dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const { logger } = require('../log/index.js')

/**
 * 向渲染进程推送更新事件。
 *
 * 页面只需要监听 updater:event，再根据 type 区分 checking、progress、downloaded 等状态。
 */
function sendUpdaterEvent(mainWindow, type, data = {}) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:event', { type, ...data })
    }
}

/**
 * 注册自动更新事件。
 *
 * autoUpdater 是单例，多次调用 checkForUpdates 时如果不先清理旧监听，
 * 同一个事件会触发多次，例如下载完成后弹出多个确认框。
 */
function registerUpdaterEvents(mainWindow) {
    // 每次检查前先清理旧监听，保证同一事件只处理一次。
    autoUpdater.removeAllListeners('error')
    autoUpdater.removeAllListeners('update-available')
    autoUpdater.removeAllListeners('checking-for-update')
    autoUpdater.removeAllListeners('download-progress')
    autoUpdater.removeAllListeners('update-downloaded')

    autoUpdater.on('error', (err) => {
        logger.error(`update listener failed: ${err}`)
        sendUpdaterEvent(mainWindow, 'error', { message: String(err) })
    })

    autoUpdater.on('update-available', () => {
        logger.info('update available')
        sendUpdaterEvent(mainWindow, 'available')
    })

    autoUpdater.on('checking-for-update', () => {
        logger.info('checking new version')
        sendUpdaterEvent(mainWindow, 'checking')
    })

    autoUpdater.on('download-progress', (progress) => {
        // progress 由 electron-updater 提供，包含 percent、bytesPerSecond、transferred、total 等字段。
        sendUpdaterEvent(mainWindow, 'progress', { progress })
    })

    autoUpdater.on('update-downloaded', () => {
        sendUpdaterEvent(mainWindow, 'downloaded')
        // 新版本下载完后再询问用户是否立即安装，避免用户正在操作时被强制退出。
        dialog.showMessageBox({
            type: 'info',
            title: '应用更新',
            message: '发现新版本，是否更新？更新后请重新登录！',
            buttons: ['是', '否']
        }).then((buttonIndex) => {
            if (buttonIndex.response === 0) {
                autoUpdater.quitAndInstall()
            }
        })
    })
}

/**
 * 检查应用更新。
 *
 * feedUrl 需要指向 electron-builder generic provider 的发布目录，目录中必须包含 latest.yml
 * 以及对应安装包文件。开发阶段默认关闭更新，避免访问占位地址。
 */
const checkForUpdates = (feedUrl, mainWindow) => {
    if (!feedUrl) {
        logger.error('update feed url is empty')
        return Promise.resolve(null)
    }

    autoUpdater.setFeedURL(feedUrl)
    registerUpdaterEvents(mainWindow)

    return autoUpdater.checkForUpdates().catch((err) => {
        logger.error(`check update failed: ${err}`)
        return null
    })
}

module.exports = {
    checkForUpdates,
}
