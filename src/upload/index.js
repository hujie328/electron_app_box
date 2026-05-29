const { dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const { logger } = require('../log/index.js')

/**
 * 注册自动更新事件。
 *
 * autoUpdater 是单例，多次调用 checkForUpdates 时如果不先清理旧监听，
 * 同一个事件会触发多次，例如下载完成后弹出多个确认框。
 */
function registerUpdaterEvents() {
    autoUpdater.removeAllListeners('error')
    autoUpdater.removeAllListeners('update-available')
    autoUpdater.removeAllListeners('checking-for-update')
    autoUpdater.removeAllListeners('update-downloaded')

    autoUpdater.on('error', (err) => {
        logger.error(`update listener failed: ${err}`)
    })

    autoUpdater.on('update-available', () => {
        logger.info('update available')
    })

    autoUpdater.on('checking-for-update', () => {
        logger.info('checking new version')
    })

    autoUpdater.on('update-downloaded', () => {
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
const checkForUpdates = (feedUrl) => {
    if (!feedUrl) {
        logger.error('update feed url is empty')
        return Promise.resolve(null)
    }

    autoUpdater.setFeedURL(feedUrl)
    registerUpdaterEvents()

    return autoUpdater.checkForUpdates().catch((err) => {
        logger.error(`check update failed: ${err}`)
        return null
    })
}

module.exports = {
    checkForUpdates,
}
