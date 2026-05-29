const { app } = require('electron')
const path = require('node:path')
const logger = require('electron-log')

// 日志路径在模块加载时解析一次；resolvePathFn 每次写日志都会调用，避免重复执行 getPath。
let resolvedLogPath
try {
    // app.getPath('logs') 是 Electron 推荐的日志目录，通常位于用户数据目录下并具备写权限。
    resolvedLogPath = path.join(app.getPath('logs'), 'log.log')
} catch {
    // 极端情况下 logs 路径不可用时回退到 userData/logs，保证日志系统尽量可用。
    resolvedLogPath = path.join(app.getPath('userData'), 'logs', 'log.log')
}

// 统一文件日志路径，方便定位运行问题；控制台输出仍由 electron-log 默认 transport 处理。
logger.transports.file.resolvePathFn = () => resolvedLogPath

// 日志格式包含级别、时间、scope 和正文，便于排查打包后用户机器上的问题。
logger.transports.file.format = '[{level}][{y}-{m}-{d} {h}:{i}:{s}.{ms}]{scope} ----> "{text}"'

module.exports = { logger }
