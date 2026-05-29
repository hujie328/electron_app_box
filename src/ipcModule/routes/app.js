/**
 * 应用级 IPC。
 *
 * 放置窗口关闭、应用信息、简单健康检查等和具体业务无关的能力。
 */
function registerAppIpc({ on, handle, mainWindow }) {
    on('app:close', (event) => {
        // send/on 形式适合“发出一个动作并等待一个简单回执”的场景。
        // 这里先给页面一个关闭提示，再调用 BrowserWindow.close() 触发正常窗口关闭流程。
        event.reply('app:close:reply', { message: '即将关闭' })
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
    })

    handle('app:demo:invoke', (_event, params) => {
        // invoke/handle 形式适合请求响应模型；保留这个 demo 方便前端验证 preload 链路是否正常。
        return { code: 0, data: 'pong', params }
    })
}

module.exports = { registerAppIpc }
