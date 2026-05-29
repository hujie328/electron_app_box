const { app } = require('electron')
const path = require('node:path')

/**
 * electron-store 配置。
 *
 * 配置文件写入 userData/config/config.json，符合系统目录规范，也避免安装目录只读时写入失败。
 */
const storeOptions = {
    name: 'config',
    fileExtension: 'json',
    cwd: path.join(app.getPath('userData'), 'config'),
    // 如需加密，启用 encryptionKey；密钥不应硬编码到公开仓库，建议从安全配置或系统凭据读取。
    // encryptionKey: 'aes-256-cbc',
    clearInvalidConfig: true,
}

const WINDOW_STATE_KEY = 'windowState'

// 缓存 Store 初始化 Promise，避免多处同时调用时重复动态 import 和重复创建实例。
let storePromise = null

/**
 * 获取 electron-store 实例。
 *
 * electron-store 9+ 是 ESM 包，而当前项目使用 CommonJS，所以必须用动态 import() 加载。
 * 如果加载失败会清空缓存，保证下一次调用可以重新尝试。
 */
function getStore() {
    if (!storePromise) {
        storePromise = import('electron-store')
            .then(({ default: Store }) => new Store(storeOptions))
            .catch((err) => {
                storePromise = null
                throw err
            })
    }

    return storePromise
}

/** 写入持久化配置值。 */
async function setStoreValue(key, value) {
    const store = await getStore()
    return store.set(key, value)
}

/** 读取持久化配置值；不存在时返回 defaultValue。 */
async function getStoreValue(key, defaultValue) {
    const store = await getStore()
    return store.get(key, defaultValue)
}

function toValidBounds(bounds, defaultBounds) {
    if (!bounds || typeof bounds !== 'object') return defaultBounds

    const { x, y, width, height } = bounds
    const validSize = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    const validPosition = Number.isFinite(x) && Number.isFinite(y)

    if (!validSize || !validPosition) return defaultBounds

    return { x, y, width, height }
}

/**
 * 读取上次保存的窗口状态。
 *
 * bounds 保存窗口位置和尺寸；isMaximized 保存是否最大化。
 * 如果配置文件被手动改坏或缺失字段，会回退到 appConfig 里的默认尺寸。
 */
async function getWindowState(defaultBounds) {
    const savedState = await getStoreValue(WINDOW_STATE_KEY, {})

    return {
        bounds: toValidBounds(savedState.bounds, defaultBounds),
        isMaximized: savedState.isMaximized === true,
    }
}

/**
 * 保存当前窗口状态。
 *
 * 最大化状态下 getBounds() 可能返回最大化后的尺寸，因此这里优先使用 getNormalBounds()，
 * 确保下次启动取消最大化时能恢复到用户原来的窗口尺寸。
 */
async function saveWindowState(win) {
    if (!win || win.isDestroyed()) return

    const bounds = win.getNormalBounds()
    await setStoreValue(WINDOW_STATE_KEY, {
        bounds,
        isMaximized: win.isMaximized(),
    })
}

module.exports = {
    getStore,
    setStoreValue,
    getStoreValue,
    getWindowState,
    saveWindowState,
}
