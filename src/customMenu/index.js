const { Menu, app, Tray } = require('electron')
const path = require('path')
const customMenuHandle = (win) => {
    //创建菜单集合
    let template = [
        {
            label: '菜单项一',
            click: () => {

            }
        }
    ]
    //载入模板
    const menu = Menu.buildFromTemplate(template)
    //主进程设置应用菜单
    Menu.setApplicationMenu(menu)
}

let tray = null

const customTrayMenu = (win) => {
    let iconPath = path.join(app.getAppPath(), "/icons/icon1.png")
    tray = new Tray(iconPath)
    // 添加右下角的菜单
    let trayMenu = Menu.buildFromTemplate([
        {
            label: "退出",
            click: () => {
                win.close()
            }
        }
    ])
    tray.setContextMenu(trayMenu)
}

module.exports = {
    customMenuHandle,
    customTrayMenu
}