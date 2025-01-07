const { ipcMain } = require("electron")

const registerIpcMainHandle = (win) => {
    // 关闭窗口
    ipcMain.on('app_close', (event, params) => {
        event.reply('app_close_reply', '马上关闭')
        win.close()
    })

    // 窗口给渲染进程发送消息
    win.webContents.send('event_on_01', '传递参数')

    // 监听信息
    ipcMain.handle('invoke_msg_01', (event, params) => {
        return 'pong'
    })
}

module.exports = {
    registerIpcMainHandle
}