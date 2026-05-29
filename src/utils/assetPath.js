const { app } = require('electron')
const path = require('node:path')

/**
 * 拼接应用内置资源路径。
 *
 * app.getAppPath() 在开发环境通常指向项目根目录，打包后可能指向 asar 包或解包后的应用目录。
 * 所有内置资源都通过这里拼接，避免每个模块自己判断开发/打包路径。
 */
function getAssetPath(...segments) {
    return path.join(app.getAppPath(), ...segments)
}

/** 获取内置静态站点根目录，供 Koa 静态服务托管。 */
function getStaticRoot() {
    return getAssetPath('appStatic')
}

module.exports = {
    getAssetPath,
    getStaticRoot
}
