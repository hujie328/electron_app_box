const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const { appConfig } = require('./config/index.js')
const { AppRuntime } = require('./runtime/index.js')
const { logger } = require('./log/index.js')
const { getWindowState, saveWindowState } = require('./store/index.js')

// BrowserWindow 必须在模块顶层保存引用，避免对象被 GC 回收后窗口被意外关闭。
let mainWindow = null

// Runtime 持有托盘、IPC、快捷键、本地服务等资源；放在顶层便于退出时统一 stop。
let runtime = null

const gotSingleInstanceLock = app.requestSingleInstanceLock()

function focusMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
}

function registerWindowStatePersistence(win) {
    let saveTimer = null
    let isClosing = false

    const saveState = () => {
        if (isClosing || win.isDestroyed()) return

        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
            saveWindowState(win).catch((err) => {
                logger.error(`save window state failed: ${err.message}`)
            })
        }, 300)
    }

    win.on('resize', saveState)
    win.on('move', saveState)

    // close 发生时窗口仍可读取 bounds，因此这里做最后一次兜底保存。
    win.on('close', () => {
        isClosing = true
        clearTimeout(saveTimer)
        saveWindowState(win).catch((err) => {
            logger.error(`save window state on close failed: ${err.message}`)
        })
    })
}

/**
 * 创建主窗口并启动应用运行期资源。
 *
 * 主入口只负责 Electron 生命周期和窗口创建；业务资源交给 AppRuntime 编排，
 * 这样窗口关闭、应用退出、异常兜底时都能走同一套清理逻辑。
 */
async function createWindow() {
    const windowState = await getWindowState({
        width: appConfig.window.width,
        height: appConfig.window.height,
    })

    const win = new BrowserWindow({
        ...windowState.bounds,
        icon: appConfig.window.icon,
        webPreferences: {
            // 开启上下文隔离，页面只能访问 preload 通过 contextBridge 显式暴露的 API。
            contextIsolation: true,
            // 禁止渲染进程直接使用 Node.js，降低页面被注入脚本后的破坏范围。
            nodeIntegration: false,
            // preload 当前使用 require('electron')，所以 sandbox 必须保持关闭。
            sandbox: false,
            preload: path.join(__dirname, 'ipcModule', 'ipcPreload.js'),
        },
    })

    mainWindow = win
    registerWindowStatePersistence(win)

    runtime = new AppRuntime(appConfig)
    runtime.start(win)

    if (windowState.isMaximized) {
        win.maximize()
    }

    if (appConfig.window.openDevTools) {
        win.webContents.openDevTools()
    }

    // closed 事件触发后 BrowserWindow 已不可用，必须释放引用并停止所有依赖窗口的资源。
    win.on('closed', () => {
        runtime?.stop()
        runtime = null
        mainWindow = null
    })

    return win
}

if (!gotSingleInstanceLock) {
    app.quit()
} else {
    // 第二个实例启动时不再创建新进程，只把已存在窗口拉到前台，避免端口、托盘、快捷键重复占用。
    app.on('second-instance', focusMainWindow)

    // app.whenReady 后才能安全创建 BrowserWindow、Tray、globalShortcut 等 Electron 资源。
    app.whenReady().then(createWindow).catch((err) => {
        logger.error(`create window failed: ${err.stack || err}`)
        app.quit()
    })

    // macOS: Dock 图标被点击且没有窗口时重新创建窗口，符合平台习惯。
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow().catch((err) => {
                logger.error(`recreate window failed: ${err.stack || err}`)
            })
        }
    })

    // 非 macOS: 所有窗口关闭后退出应用；macOS 通常保留应用进程等待再次激活。
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit()
    })

    // before-quit 是应用退出前的兜底清理时机；即使窗口 closed 已调用 stop，重复调用也保持安全。
    app.on('before-quit', () => {
        runtime?.stop()
        runtime = null
    })

    // 子进程异常通常说明 GPU、utility process 等底层能力已经异常，记录日志后退出让用户重新启动。
    app.on('child-process-gone', (_event, details) => {
        logger.error(`child-process-gone: ${JSON.stringify(details)}`)
        app.quit()
    })

    // 渲染进程崩溃或被系统杀死时退出应用，避免主进程继续保留不可用的后台服务。
    app.on('render-process-gone', (_event, _webContents, details) => {
        logger.error(`render-process-gone: ${JSON.stringify(details)}`)
        app.quit()
    })
}

// 捕获未处理同步异常，写日志后退出，避免应用处于半初始化状态。
process.on('uncaughtException', (err) => {
    logger.error(`uncaughtException: ${err.stack || err}`)
    app.quit()
})

// Promise 未处理异常先记录日志；是否退出取决于后续业务需要，当前保持进程不中断。
process.on('unhandledRejection', (reason) => {
    logger.error(`unhandledRejection: ${reason}`)
})
