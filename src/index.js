try {
    const { app, BrowserWindow } = require('electron')
    const path = require('path')
    const { registerIpcMainHandle } = require('./ipcModule/ipcMainFns.js')
    const { appServe } = require('./koaServe/index.js')
    const { checkUpdate } = require('./upload/index.js')
    const { customTrayMenu } = require('./customMenu/index.js')
    const { registerGlobalShortcut } = require('./customGlobal/index.js')
    // 声明window系统托盘图片,必须声明在全局防止托盘图标丢失

    const createWindow = () => {

        // https://www.electronjs.org/zh/docs/latest/api/browser-window
        const win = new BrowserWindow({
            width: 1920,
            height: 1080,

            // https://www.electronjs.org/zh/docs/latest/api/structures/web-preferences
            webPreferences: {
                contextIsolation: true,
                preload: path.join(__dirname, '/ipcModule/preload.js')
            }
        })

        // win.fullScreen = true // 开启全屏
        // win.webContents.openDevTools()
        customTrayMenu(win)

        // 允许加载线上地址
        // win.loadURL('https://cn.bing.com/?FORM=BEHPTB')

        // 以file协议加载本地文件
        // win.loadURL(`file:///${app.getAppPath()}/appStatic/h5/index.html`)

        // 启动node服务
        const myServe = new appServe()
        myServe.openStatic().openWs(win).listen(() => {
            // 以node服务托管资源加载路径
            win.loadURL(myServe.serve_url + '/h5/index.html')
        })

        // 注册主进程事件
        registerIpcMainHandle(win)

        // 注册全局快捷键
        registerGlobalShortcut(win)

        // 监听更新
        // checkUpdate()
    }

    app.on('ready', async () => {
        createWindow()
    })


    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    app.on('browser-window-created', (event, win) => {

    })

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })

    app.on('before-quit', () => {

    })

    app.on('child-process-gone', () => {
        app.quit()
    })

    app.on('render-process-gone', () => {
        app.quit()
    })
} catch (e) {
    const { logger } = require('./log/index.js')
    logger.error(e)
    process.exit();
}