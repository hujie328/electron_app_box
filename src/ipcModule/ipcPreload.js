const { contextBridge, ipcRenderer } = require('electron')

/**
 * 创建渲染进程订阅函数。
 *
 * 调用方式：
 *   const unsubscribe = window.AppFns.onReady(callback)
 *   unsubscribe()
 *
 * 这里不能直接暴露 ipcRenderer，避免渲染进程任意访问 Electron IPC。
 * 每个订阅函数只暴露经过白名单筛选的 channel，并返回取消订阅函数供组件卸载时调用。
 */
function createIpcSubscription(channel) {
    return (callback) => {
        if (typeof callback !== 'function') {
            throw new TypeError(`[AppFns] "${channel}" 的监听器必须是函数`)
        }

        // 只把业务数据 data 传给页面，不暴露 Electron 原始 event，减少误用和安全风险。
        const listener = (_event, data) => callback(data)
        ipcRenderer.on(channel, listener)

        // Vue/React 组件卸载时必须调用返回函数，否则重复挂载会导致监听器堆积。
        return () => ipcRenderer.removeListener(channel, listener)
    }
}

contextBridge.exposeInMainWorld('AppFns', {
    // ── 渲染进程 → 主进程 ────────────────────────────────────────
    closeApp: () => ipcRenderer.send('app:close'),

    // ── 主进程 → 渲染进程（订阅）────────────────────────────────
    onCloseReply: createIpcSubscription('app:close:reply'),
    onReady: createIpcSubscription('app:ready'),
    onWsMessage: createIpcSubscription('app:ws:message'),

    // ── 请求 / 响应 ───────────────────────────────────────────────
    invoke: (params) => ipcRenderer.invoke('app:demo:invoke', params),

    // ── 文件系统能力 ─────────────────────────────────────────────
    selectFile: (options) => ipcRenderer.invoke('file:select', options),
    selectDirectory: (options) => ipcRenderer.invoke('file:select-directory', options),
    saveTextFile: (options) => ipcRenderer.invoke('file:save-text', options),
    showItemInFolder: (targetPath) => ipcRenderer.invoke('file:show-in-folder', targetPath),
})
