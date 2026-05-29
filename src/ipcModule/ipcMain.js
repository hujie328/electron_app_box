const { ipcMain } = require('electron')
const { logger } = require('../log/index.js')
const { ipcRoutes } = require('./routes/index.js')

// 记录由本模块注册的 IPC 通道，窗口重建或应用退出时可统一清理，避免重复注册。
const registeredChannels = []

/**
 * 注册主进程 IPC 处理器。
 *
 * 设计原则：
 *   1. 所有 ipcMain.on / ipcMain.handle 都通过内部 on/handle 包装函数注册；
 *   2. 包装函数自动记录通道类型，unregisterIpcMainHandle 负责统一卸载；
 *   3. register 前先 unregister，保证开发热重载或窗口重建时不会堆积监听器。
 */
function registerIpcMainHandle(mainWindow, context = {}) {
    unregisterIpcMainHandle()

    const on = (channel, handler) => {
        ipcMain.on(channel, handler)
        registeredChannels.push({ type: 'on', channel })
    }

    const handle = (channel, handler) => {
        ipcMain.handle(channel, handler)
        registeredChannels.push({ type: 'handle', channel })
    }

    // 路由模块只关心自己的业务通道；注册、记录、卸载规则统一由这里提供。
    ipcRoutes.forEach((registerRoute) => {
        registerRoute({ on, handle, mainWindow, ...context })
    })

    // 页面加载完成后向渲染进程推送就绪事件。
    // 如果页面还在加载，使用 once 避免 did-finish-load 监听器残留；如果已经加载完成则立即发送。
    const sendReady = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:ready', { timestamp: Date.now() })
        }
    }

    if (mainWindow.webContents.isLoading()) {
        mainWindow.webContents.once('did-finish-load', sendReady)
    } else {
        sendReady()
    }

    logger.info('IPC registered')
}

/**
 * 卸载本模块注册过的 IPC 通道。
 *
 * ipcMain.on 使用 removeAllListeners(channel) 清理事件监听；
 * ipcMain.handle 使用 removeHandler(channel) 清理 invoke 处理器。
 */
function unregisterIpcMainHandle() {
    registeredChannels.forEach(({ type, channel }) => {
        if (type === 'on') ipcMain.removeAllListeners(channel)
        else try { ipcMain.removeHandler(channel) } catch (_) {}
    })
    registeredChannels.length = 0
}

module.exports = { registerIpcMainHandle, unregisterIpcMainHandle }
