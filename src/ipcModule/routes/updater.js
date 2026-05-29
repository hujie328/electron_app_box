const { checkForUpdates } = require('../../upload/index.js')

/**
 * 自动更新 IPC。
 *
 * 页面通过 checkForUpdates 主动触发检查，更新过程中的状态由 upload 模块推送 updater:event。
 */
function registerUpdaterIpc({ handle, config, mainWindow }) {
    handle('updater:check', () => {
        if (!config.features.updater) {
            return { code: 1, message: 'updater feature is disabled' }
        }

        if (!config.updater.enabled) {
            return { code: 1, message: 'updater is disabled' }
        }

        // checkForUpdates 内部会注册 autoUpdater 事件，并把 checking/progress/downloaded 等状态推送给页面。
        return checkForUpdates(config.updater.feedUrl, mainWindow).then(() => ({ code: 0 }))
    })
}

module.exports = { registerUpdaterIpc }
