
const { globalShortcut } = require('electron')

const registerGlobalShortcut = (win) => {
    globalShortcut.register('Alt+F12', () => {
        win.webContents.openDevTools()
    })
    globalShortcut.register('Alt+F11', () => {
        win.fullScreen = !win.fullScreen
    })
}

module.exports = {
    registerGlobalShortcut
}