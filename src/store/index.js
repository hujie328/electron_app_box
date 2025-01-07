const Store = require('electron-store');
const { app } = require('electron')
const path = require('path')
let option = {
    name: 'config',//文件名称,默认 config
    fileExtension: 'json',//文件后缀,默认json
    cwd: path.resolve(app.getAppPath(), "../config/"),//文件位置,尽量不要动，默认情况下，它将通过遵循系统约定来选择最佳位置。C:\Users\xxx\AppData\Roaming\test\config.json
    //encryptionKey:aes-256-cbc ,//对配置文件进行加密
    clearInvalidConfig: true, // 发生 SyntaxError  则清空配置,
}

const store = new Store(option);


store.set('key','值')

store.get('key')

module.exports = {
    store
}