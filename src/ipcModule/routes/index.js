const { registerAppIpc } = require('./app.js')
const { registerFileIpc } = require('./file.js')

const ipcRoutes = [
    registerAppIpc,
    registerFileIpc,
]

module.exports = { ipcRoutes }
