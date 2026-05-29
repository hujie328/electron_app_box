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
    // 浏览器通过自定义协议唤起客户端时，主进程会把原始 URL 推送给页面处理。
    onProtocolOpen: createIpcSubscription('protocol:open'),
    // 下载事件由 DownloadManager 推送，页面要在组件卸载时取消订阅。
    onDownloadStarted: createIpcSubscription('download:started'),
    onDownloadProgress: createIpcSubscription('download:progress'),
    onDownloadDone: createIpcSubscription('download:done'),
    onDownloadFailed: createIpcSubscription('download:failed'),
    // 自动更新状态统一走一个事件通道，payload.type 区分 checking/progress/downloaded/error。
    onUpdaterEvent: createIpcSubscription('updater:event'),

    // ── 请求 / 响应 ───────────────────────────────────────────────
    invoke: (params) => ipcRenderer.invoke('app:demo:invoke', params),

    // ── 文件系统能力 ─────────────────────────────────────────────
    selectFile: (options) => ipcRenderer.invoke('file:select', options),
    selectDirectory: (options) => ipcRenderer.invoke('file:select-directory', options),
    saveTextFile: (options) => ipcRenderer.invoke('file:save-text', options),
    showItemInFolder: (targetPath) => ipcRenderer.invoke('file:show-in-folder', targetPath),

    // ── 诊断信息 / 日志 ─────────────────────────────────────────
    getAppInfo: () => ipcRenderer.invoke('diagnostics:app-info'),
    // 打开目录类能力返回 shell.openPath 的结果；空字符串表示成功。
    openLogDir: () => ipcRenderer.invoke('diagnostics:open-log-dir'),
    openUserDataDir: () => ipcRenderer.invoke('diagnostics:open-user-data-dir'),
    exportLog: (options) => ipcRenderer.invoke('diagnostics:export-log', options),

    // ── 会话 / 缓存 ─────────────────────────────────────────────
    clearCache: () => ipcRenderer.invoke('session:clear-cache'),
    clearStorageData: (options) => ipcRenderer.invoke('session:clear-storage-data', options),
    reloadApp: () => ipcRenderer.invoke('session:reload'),

    // ── 下载 / 更新 ─────────────────────────────────────────────
    startDownload: (url, options) => ipcRenderer.invoke('download:start', url, options),
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
})
