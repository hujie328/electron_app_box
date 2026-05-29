const path = require('node:path')
const { app } = require('electron')
const { logger } = require('../log/index.js')

/**
 * 从启动参数中提取自定义协议 URL。
 *
 * Windows 上通过协议唤起已运行应用时，URL 通常会出现在 second-instance 的 argv 中；
 * 首次启动时也可能直接出现在 process.argv 中。
 */
function getProtocolUrlFromArgs(argv, scheme) {
    return (argv || []).find((item) => typeof item === 'string' && item.startsWith(`${scheme}://`)) || ''
}

/**
 * 注册应用自定义协议。
 *
 * 打包后直接用 app.setAsDefaultProtocolClient(scheme) 即可。
 * 开发环境需要额外传入当前脚本路径，否则系统只能启动 electron.exe，无法定位项目入口。
 */
function registerAppProtocol(config, onOpenUrl) {
    const { enabled, scheme } = config.protocol
    if (!enabled || !scheme) return

    try {
        if (app.isPackaged) {
            app.setAsDefaultProtocolClient(scheme)
        } else {
            app.setAsDefaultProtocolClient(scheme, process.execPath, [path.resolve(process.argv[1])])
        }
    } catch (err) {
        logger.error(`register protocol failed: ${err.message}`)
    }

    // macOS 会通过 open-url 事件投递协议 URL；Windows 主要走 second-instance。
    app.on('open-url', (event, url) => {
        event.preventDefault()
        onOpenUrl(url)
    })
}

module.exports = {
    getProtocolUrlFromArgs,
    registerAppProtocol,
}
