const { globalShortcut } = require('electron')
const { logger } = require('../log/index.js')

/**
 * 构建快捷键注册表。
 *
 * key 使用 Electron accelerator 字符串；value 是快捷键触发时执行的函数。
 * 将快捷键集中在这里维护，可以避免注册和注销逻辑分散到多个地方。
 */
function buildShortcutMap(mainWindow) {
    return {
        'Alt+F12': () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.openDevTools()
        },
        'Alt+F11': () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setFullScreen(!mainWindow.isFullScreen())
        },
    }
}

// 保存已注册的 accelerator 列表，注销时只清理本模块注册的快捷键。
let registeredAccelerators = []

/**
 * 注册全局快捷键。
 *
 * 每次注册前先注销旧快捷键，确保窗口重建时快捷键回调绑定的是最新的 BrowserWindow。
 */
const registerGlobalShortcut = (mainWindow) => {
    unregisterGlobalShortcut()

    const shortcutMap = buildShortcutMap(mainWindow)

    registeredAccelerators = Object.keys(shortcutMap)

    registeredAccelerators.forEach((accelerator) => {
        const registered = globalShortcut.register(accelerator, shortcutMap[accelerator])
        // 快捷键可能被系统或其它软件占用，register 返回 false 时记录日志方便排查。
        if (!registered) logger.error(`globalShortcut register failed: ${accelerator}`)
    })
}

/** 注销本模块注册的全局快捷键；Electron 对未注册快捷键执行 unregister 是安全的。 */
const unregisterGlobalShortcut = () => {
    registeredAccelerators.forEach((accelerator) => {
        globalShortcut.unregister(accelerator)
    })
    registeredAccelerators = []
}

module.exports = { registerGlobalShortcut, unregisterGlobalShortcut }
