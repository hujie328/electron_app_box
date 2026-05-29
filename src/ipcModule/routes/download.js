/**
 * 下载类 IPC。
 *
 * 真正的下载进度由 DownloadManager 通过 download:* 事件推送，
 * 这里的 invoke 只负责发起下载任务并返回启动结果。
 */
function registerDownloadIpc({ handle, services, config }) {
    handle('download:start', (_event, url, options = {}) => {
        if (!config.features.downloads) {
            return { code: 1, message: 'downloads feature is disabled' }
        }

        // 如果功能开关关闭或 Runtime 尚未启动下载管理器，这里直接返回明确错误。
        if (!services.downloadManager) {
            return { code: 1, message: 'download manager is not ready' }
        }

        return services.downloadManager.download(url, options)
    })
}

module.exports = { registerDownloadIpc }
