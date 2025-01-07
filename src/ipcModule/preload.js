const { contextBridge, ipcRenderer } = require('electron')



contextBridge.exposeInMainWorld('AppFns', {
    // 关闭窗口
    CloseApp: () => {
        ipcRenderer.send('app_close', '关闭窗口')
    },
    // 主进程对于关闭窗口的回复
    CloseReplied: (callback) => {
        ipcRenderer.on('app_close_reply', (event, params) => {
            callback(params)
        })
    },
    // 监听主进程消息
    EventHandle_01: (callback) => {
        ipcRenderer.on('event_on_01', (event, params) => {
            callback(params)
        })
    },

    // 发送信息方式二
    SenMsgEmp1: (callback) => {
        ipcRenderer.invoke('invoke_msg_01', 'ping').then(msg => {
            // msg == pong
            callback(msg)
        })
    },
    SenMsgEmp2: async (params) => {
        // msg == pong
        let msg = await ipcRenderer.invoke('invoke_msg_01', params)
        return msg
    }
})


// 可以声明多个模块，方便业务区分
contextBridge.exposeInMainWorld('AppFns2', {

})