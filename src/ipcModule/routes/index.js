const { registerAppIpc } = require('./app.js')
const { registerFileIpc } = require('./file.js')
const { registerDiagnosticsIpc } = require('./diagnostics.js')
const { registerSessionIpc } = require('./session.js')
const { registerDownloadIpc } = require('./download.js')
const { registerUpdaterIpc } = require('./updater.js')

/**
 * IPC 路由注册表。
 *
 * 每个 route 文件只负责一类能力，例如 app、file、session、download。
 * ipcMain.js 会遍历这个数组，并把统一封装后的 on/handle 注入给每个注册函数。
 * 新增 IPC 能力时优先新建独立 route，再追加到这里，避免主 IPC 文件越来越臃肿。
 */
const ipcRoutes = [
    registerAppIpc,
    registerFileIpc,
    registerDiagnosticsIpc,
    registerSessionIpc,
    registerDownloadIpc,
    registerUpdaterIpc,
]

module.exports = { ipcRoutes }
