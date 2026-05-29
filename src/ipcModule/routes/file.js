const { dialog, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

function normalizeDialogOptions(options = {}) {
    return {
        title: options.title,
        defaultPath: options.defaultPath,
        buttonLabel: options.buttonLabel,
        filters: Array.isArray(options.filters) ? options.filters : undefined,
    }
}

function isSafePath(targetPath) {
    return typeof targetPath === 'string' && targetPath.trim().length > 0
}

/**
 * 文件系统 IPC。
 *
 * 这里只提供明确、有限的桌面能力，不暴露任意 fs API：
 *   - 选择文件；
 *   - 选择目录；
 *   - 保存文本文件；
 *   - 打开路径所在位置。
 */
function registerFileIpc({ handle, mainWindow }) {
    handle('file:select', async (_event, options = {}) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            ...normalizeDialogOptions(options),
            properties: ['openFile', ...(options.multiSelections ? ['multiSelections'] : [])],
        })

        return {
            canceled: result.canceled,
            filePaths: result.filePaths,
        }
    })

    handle('file:select-directory', async (_event, options = {}) => {
        const result = await dialog.showOpenDialog(mainWindow, {
            ...normalizeDialogOptions(options),
            properties: ['openDirectory'],
        })

        return {
            canceled: result.canceled,
            filePaths: result.filePaths,
        }
    })

    handle('file:save-text', async (_event, options = {}) => {
        const result = await dialog.showSaveDialog(mainWindow, normalizeDialogOptions(options))

        if (result.canceled || !result.filePath) {
            return { canceled: true, filePath: '' }
        }

        await fs.writeFile(result.filePath, String(options.content || ''), options.encoding || 'utf8')

        return {
            canceled: false,
            filePath: result.filePath,
        }
    })

    handle('file:show-in-folder', async (_event, targetPath) => {
        if (!isSafePath(targetPath)) {
            return { code: 1, message: 'targetPath is empty' }
        }

        const resolvedPath = path.resolve(targetPath)
        shell.showItemInFolder(resolvedPath)

        return { code: 0, path: resolvedPath }
    })
}

module.exports = { registerFileIpc }
