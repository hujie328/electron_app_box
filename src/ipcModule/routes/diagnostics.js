const { app, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { getLogDir, getLogPath } = require('../../log/index.js')

/**
 * 诊断类 IPC。
 *
 * 这些接口主要面向“关于应用”“导出日志”“客户现场排查”场景，
 * 不直接参与业务流程，但能显著提升问题定位效率。
 */
function registerDiagnosticsIpc({ handle, config }) {
    handle('diagnostics:app-info', () => {
        if (!config.features.diagnostics) return { code: 1, message: 'diagnostics feature is disabled' }

        // 只返回可公开的运行信息，不包含 token、环境变量、证书等敏感内容。
        return {
            name: app.getName(),
            version: app.getVersion(),
            appPath: app.getAppPath(),
            userDataPath: app.getPath('userData'),
            logPath: getLogPath(),
            logDir: getLogDir(),
            platform: process.platform,
            arch: process.arch,
            electron: process.versions.electron,
            node: process.versions.node,
            chrome: process.versions.chrome,
            loadMode: config.window.loadMode,
            remoteUrl: config.window.remoteUrl,
        }
    })

    handle('diagnostics:open-log-dir', () => {
        if (!config.features.diagnostics) return { code: 1, message: 'diagnostics feature is disabled' }
        // 使用系统文件管理器打开日志目录，方便用户把日志发给开发者。
        return shell.openPath(getLogDir())
    })

    handle('diagnostics:open-user-data-dir', () => {
        if (!config.features.diagnostics) return { code: 1, message: 'diagnostics feature is disabled' }
        // userData 中通常包含运行配置、缓存和持久化数据，排查配置问题时很有用。
        return shell.openPath(app.getPath('userData'))
    })

    handle('diagnostics:export-log', async (_event, options = {}) => {
        if (!config.features.diagnostics) return { code: 1, message: 'diagnostics feature is disabled' }

        const source = getLogPath()
        // 默认导出到桌面，降低用户寻找文件的成本；也支持调用方指定 targetPath。
        const target = options.targetPath || path.join(app.getPath('desktop'), `electron_app_box_log_${Date.now()}.log`)

        await fs.copyFile(source, target)

        return { code: 0, path: target }
    })
}

module.exports = { registerDiagnosticsIpc }
