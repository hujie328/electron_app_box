// AppFns 由 preload 通过 contextBridge 注入。
// 这里使用可选链，避免页面被浏览器直接打开时报错。
const unsubscribeReady = window.AppFns?.onReady((data) => {
    console.log('[AppFns] onReady', data)
    unsubscribeReady?.()
})

// invoke 示例：渲染进程发起请求，主进程 ipcMain.handle 返回结果。
window.AppFns?.invoke('ping').then((res) => {
    console.log('[AppFns] invoke result:', res)
})

// WebSocket 消息示例：外部 WS 客户端发给本地 API 服务，runtime 再通过 IPC 转发到页面。
// 当前页面生命周期等同应用页面生命周期，所以这里不主动取消订阅；组件化页面中必须在卸载时调用返回函数。
window.AppFns?.onWsMessage((message) => {
    console.log('[AppFns] ws message:', message)
})
