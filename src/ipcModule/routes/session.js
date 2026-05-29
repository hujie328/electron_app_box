const { session } = require('electron')

/**
 * 会话/缓存类 IPC。
 *
 * remote 页面更新后，Chromium 缓存、Storage、Cookie 可能导致用户仍看到旧页面。
 * 这些接口让页面或托盘菜单可以主动清理缓存并无缓存重载。
 */
function registerSessionIpc({ handle, mainWindow, config }) {
    handle('session:clear-cache', async () => {
        if (!config.features.session) return { code: 1, message: 'session feature is disabled' }

        // 只清 HTTP 缓存，不会删除 localStorage、IndexedDB、Cookie。
        await session.defaultSession.clearCache()
        return { code: 0 }
    })

    handle('session:clear-storage-data', async (_event, options = {}) => {
        if (!config.features.session) return { code: 1, message: 'session feature is disabled' }

        // options 可透传 Electron 的 clearStorageData 参数，用于指定 origin 或 storageTypes。
        await session.defaultSession.clearStorageData(options)
        return { code: 0 }
    })

    handle('session:reload', () => {
        if (!config.features.session) return { code: 1, message: 'session feature is disabled' }

        // reloadIgnoringCache 会绕过缓存重新加载，适合“清理缓存后立即刷新”的场景。
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.reloadIgnoringCache()
        }
        return { code: 0 }
    })
}

module.exports = { registerSessionIpc }
