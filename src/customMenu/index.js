const { Menu, app, session, shell, Tray } = require('electron')
const { getAssetPath } = require('../utils/assetPath.js')
const { getLogDir } = require('../log/index.js')

// Tray 对象必须放在模块顶层保存引用，否则可能被 V8 GC 回收，导致系统托盘图标消失。
let tray = null

/** 销毁当前托盘实例；窗口重建或应用退出时调用，避免残留多个托盘图标。 */
const destroyTray = () => {
    if (tray) {
        tray.destroy()
        tray = null
    }
}

/**
 * 创建应用托盘菜单。
 *
 * 托盘菜单属于系统级资源，和 BrowserWindow 生命周期不完全一致：
 *   - 窗口隐藏后托盘仍可用；
 *   - 窗口重建时需要重新绑定最新的 win 引用；
 *   - 应用退出时需要主动 destroy。
 */
const createTrayMenu = (mainWindow) => {
    destroyTray()

    tray = new Tray(getAssetPath('icons', 'icon.png'))
    tray.setToolTip(app.getName())

    // Windows/Linux 常见交互：左键点击托盘图标直接显示窗口。
    tray.on('click', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show()
            mainWindow.focus()
        }
    })

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示窗口',
            click: () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.show()
                    mainWindow.focus()
                }
            },
        },
        { type: 'separator' },
        {
            label: '重新加载页面',
            click: () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    // 无缓存重载，适合 remote 页面发版后用户仍看到旧资源的情况。
                    mainWindow.webContents.reloadIgnoringCache()
                }
            },
        },
        {
            label: '清理缓存',
            // 只清 Chromium HTTP 缓存；Storage/Cookie 清理交给页面通过 AppFns 精确触发。
            click: () => session.defaultSession.clearCache(),
        },
        {
            label: '打开日志目录',
            // 现场排查时用户可以直接从托盘打开日志目录，不需要记住 userData 路径。
            click: () => shell.openPath(getLogDir()),
        },
        { type: 'separator' },
        {
            label: '退出',
            click: () => app.quit(),
        },
    ])

    tray.setContextMenu(contextMenu)
}

module.exports = { createTrayMenu, destroyTray }
