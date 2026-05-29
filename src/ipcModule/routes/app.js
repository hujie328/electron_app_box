/**
 * 应用级 IPC。
 *
 * 放置窗口关闭、应用信息、简单健康检查等和具体业务无关的能力。
 */
function registerAppIpc({ on, handle, mainWindow }) {
    on('app:close', (event) => {
        event.reply('app:close:reply', { message: '即将关闭' })
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
    })

    handle('app:demo:invoke', (_event, params) => {
        return { code: 0, data: 'pong', params }
    })
}

module.exports = { registerAppIpc }
