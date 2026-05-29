const { dialog, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

/**
 * 标准化文件对话框参数。
 *
 * 只透传 Electron dialog 支持且项目明确允许的字段，避免渲染进程把任意对象传入主进程。
 * filters 必须是数组，否则 Electron 可能因为参数类型错误直接抛异常。
 */
function normalizeDialogOptions(options = {}) {
    return {
        title: options.title,
        defaultPath: options.defaultPath,
        buttonLabel: options.buttonLabel,
        filters: Array.isArray(options.filters) ? options.filters : undefined,
    }
}

/**
 * 判断渲染进程传入的路径是否至少是一个非空字符串。
 *
 * 这里不做权限扩大：showItemInFolder 只是让系统文件管理器定位路径，
 * 不读取、不删除、不写入文件；真正写文件仍然走 showSaveDialog 由用户选择。
 */
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
function registerFileIpc({ handle, mainWindow, config }) {
    handle('file:select', async (_event, options = {}) => {
        // 文件系统能力可通过 config.features.fileSystem 一键关闭，适合远程页面或低权限壳应用。
        if (!config.features.fileSystem) return { canceled: true, filePaths: [], message: 'file system feature is disabled' }

        // 只允许选择文件；多选必须显式传 multiSelections，避免默认一次拿到过多用户路径。
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
        // 目录选择和文件选择拆成两个通道，前端调用时语义更清晰，也便于后续分别加权限策略。
        if (!config.features.fileSystem) return { canceled: true, filePaths: [], message: 'file system feature is disabled' }

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
        // 保存文件必须先弹出系统保存对话框，由用户确认最终路径，避免页面静默写入任意位置。
        if (!config.features.fileSystem) return { canceled: true, filePath: '', message: 'file system feature is disabled' }

        const result = await dialog.showSaveDialog(mainWindow, normalizeDialogOptions(options))

        if (result.canceled || !result.filePath) {
            return { canceled: true, filePath: '' }
        }

        // content 统一转字符串，防止传入 null/undefined 时写入异常；encoding 默认 utf8。
        await fs.writeFile(result.filePath, String(options.content || ''), options.encoding || 'utf8')

        return {
            canceled: false,
            filePath: result.filePath,
        }
    })

    handle('file:show-in-folder', async (_event, targetPath) => {
        // 这里只打开系统文件管理器定位路径，不把文件内容返回给渲染进程。
        if (!config.features.fileSystem) return { code: 1, message: 'file system feature is disabled' }

        if (!isSafePath(targetPath)) {
            return { code: 1, message: 'targetPath is empty' }
        }

        // resolve 后再交给 shell，方便日志或返回值展示为标准绝对路径。
        const resolvedPath = path.resolve(targetPath)
        shell.showItemInFolder(resolvedPath)

        return { code: 0, path: resolvedPath }
    })
}

module.exports = { registerFileIpc }
