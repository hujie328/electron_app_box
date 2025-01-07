const { app } = require('electron')

const path = require('path')

const logger = require('electron-log')

let logPath = path.resolve(app.getPath("exe"), "../log/log.log")

logger.transports.file.resolvePathFn = () => logPath

logger.transports.file.format = '[{level}][{y}-{m}-{d} {h}:{i}:{s}.{ms}]{scope} ----> "{text}"';

module.exports = {
    logger
}