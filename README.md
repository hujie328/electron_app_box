# Electron 基础桌面应用外壳

## 项目介绍

本项目用于把 Web 应用包装成桌面端应用，提供一个可打包成 exe 的 Electron 外壳。

外壳层通过 Node.js / Electron 主进程为页面提供系统能力，例如：

- 托管内置静态页面资源；
- 提供本地 HTTP / WebSocket 服务；
- 通过 IPC 暴露安全的主进程能力；
- 限制应用单实例运行，避免多开抢占端口和系统资源；
- 持久化窗口位置、尺寸和最大化状态；
- 注册全局快捷键和系统托盘；
- 写入本地日志；
- 预留自动更新能力；
- 可选发送 UDP 广播消息。

## 项目结构

| 路径 | 作用 |
| ---- | ---- |
| `src/index.js` | Electron 主入口，负责创建窗口和绑定应用生命周期 |
| `src/runtime/index.js` | 应用运行时编排器，统一启动和停止托盘、IPC、快捷键、本地服务等资源 |
| `src/ipcModule/ipcMain.js` | 主进程 IPC 通道注册与卸载 |
| `src/ipcModule/routes/` | IPC 路由目录，按能力拆分 app、file 等通道 |
| `src/ipcModule/ipcPreload.js` | 预加载脚本，通过 `contextBridge` 向页面注入安全 API |
| `src/koaServe/index.js` | 本地静态服务、HTTP 服务、WebSocket 服务、UDP 广播服务 |
| `src/security/index.js` | 窗口导航守卫和外链白名单模块 |
| `src/download/index.js` | 下载管理模块，接管下载进度和完成事件 |
| `src/protocol/index.js` | 自定义协议注册与协议唤起处理 |
| `src/config/app.config.js` | 可直接修改的原始运行配置 |
| `src/config/index.js` | 配置标准化入口，负责默认值兜底、类型转换、路径补全 |
| `src/customGlobal/index.js` | 全局快捷键注册与注销 |
| `src/customMenu/index.js` | 系统托盘菜单创建与销毁 |
| `src/log/index.js` | `electron-log` 日志配置 |
| `src/store/index.js` | `electron-store` 持久化配置封装 |
| `src/upload/index.js` | 自动更新检查封装 |
| `src/utils/assetPath.js` | 内置资源路径拼接工具 |
| `appStatic/` | Electron 窗口默认加载的内置静态资源目录 |
| `index.html` | 独立 WebSocket 调试示例页 |
| `package.json` | 运行脚本、依赖和 `electron-builder` 打包配置 |

## 核心模块说明

### 运行时 `AppRuntime`

`AppRuntime` 是应用运行时编排器，主入口 `src/index.js` 创建窗口后会调用：

```js
runtime = new AppRuntime(appConfig)
runtime.start(win)
```

它集中管理以下资源：

- 托盘菜单：`createTrayMenu`
- 导航安全守卫：`AppSecurityGuard`
- 下载管理器：`DownloadManager`
- 主进程 IPC：`registerIpcMainHandle`
- 全局快捷键：`registerGlobalShortcut`
- 静态资源服务：`StaticFileServer`
- 本地 API / WebSocket 服务：`LocalHttpServer`
- UDP 广播服务：`UdpBroadcastServer`
- 自动更新检查：`checkForUpdates`

窗口关闭或应用退出时调用：

```js
runtime?.stop()
```

`stop()` 会统一注销 IPC、快捷键、托盘，并关闭 HTTP / WebSocket / UDP 服务，避免端口、监听器或系统资源残留。

### 单实例与窗口状态

`src/index.js` 启动时会调用 `app.requestSingleInstanceLock()`：

- 第一个实例正常启动；
- 第二个实例不会重新启动服务，只会把已有窗口显示并聚焦；
- 避免多个实例抢占本地端口、重复注册托盘/快捷键、重复发送 UDP 广播。

窗口状态通过 `electron-store` 保存：

- 保存字段：窗口 `bounds` 和 `isMaximized`；
- 保存时机：窗口移动、缩放、关闭；
- 下次启动优先恢复用户上次的位置、尺寸和最大化状态；
- 配置损坏或缺失时回退到 `src/config/app.config.js` 里的默认宽高。

### 本地服务

`src/koaServe/index.js` 当前导出以下类：

| 类名 | 作用 |
| ---- | ---- |
| `StaticFileServer` | 托管 `appStatic` 静态资源，供 Electron 窗口加载页面 |
| `LocalHttpServer` | 本地 HTTP 服务，可挂载 Koa 中间件，并在同端口处理 WebSocket |
| `UdpBroadcastServer` | UDP 广播发送器，应用启动后可向局域网发送发现消息 |
| `StandaloneWebSocketServer` | 独立端口 WebSocket 服务，当前作为预留能力 |

当前项目默认使用：

- `StaticFileServer` 加载 `appStatic/h5/index.html`；
- `LocalHttpServer.openWebSocket()` 监听 WebSocket；
- `UdpBroadcastServer` 根据配置决定是否发送启动广播。

### IPC 通信

主进程 IPC 已按路由拆分，目录为 `src/ipcModule/routes/`：

| 路由文件 | 作用 |
| -------- | ---- |
| `app.js` | 应用级能力，例如关闭窗口、示例 invoke |
| `file.js` | 文件系统能力，例如选择文件、选择目录、保存文本、显示文件位置 |
| `diagnostics.js` | 应用信息、日志目录、日志导出、userData 目录 |
| `session.js` | 缓存、Storage 清理和页面无缓存重载 |
| `download.js` | 下载任务启动 |
| `updater.js` | 手动检查更新 |
| `index.js` | 汇总所有 IPC 路由，供 `ipcMain.js` 统一注册 |

路由文件中通过统一上下文注册通道：

```js
function registerXxxIpc({ on, handle, mainWindow }) {
    on('xxx:event', handler)
    handle('xxx:invoke', handler)
}
```

所有 `ipcMain.on` / `ipcMain.handle` 都通过内部包装函数注册，注册时会记录通道类型，卸载时统一清理：

- `ipcMain.on` 对应 `ipcMain.removeAllListeners(channel)`；
- `ipcMain.handle` 对应 `ipcMain.removeHandler(channel)`。

预加载脚本 `src/ipcModule/ipcPreload.js` 只暴露白名单 API 到页面：

```js
window.AppFns.closeApp()
window.AppFns.invoke(params)
window.AppFns.onReady(callback)
window.AppFns.onCloseReply(callback)
window.AppFns.onWsMessage(callback)
window.AppFns.selectFile(options)
window.AppFns.selectDirectory(options)
window.AppFns.saveTextFile(options)
window.AppFns.showItemInFolder(targetPath)
window.AppFns.getAppInfo()
window.AppFns.openLogDir()
window.AppFns.exportLog(options)
window.AppFns.clearCache()
window.AppFns.clearStorageData(options)
window.AppFns.reloadApp()
window.AppFns.startDownload(url, options)
window.AppFns.checkForUpdates()
```

订阅类 API 会返回取消订阅函数，组件化页面中必须在卸载时调用：

```js
const unsubscribe = window.AppFns.onReady((data) => {
    console.log(data)
})

unsubscribe()
```

这样可以避免页面组件反复挂载后 `ipcRenderer` 监听器堆积。

文件系统 API 示例：

```js
const fileResult = await window.AppFns.selectFile({
    title: '选择文件',
    filters: [{ name: 'Text', extensions: ['txt'] }]
})

const dirResult = await window.AppFns.selectDirectory({
    title: '选择目录'
})

const saveResult = await window.AppFns.saveTextFile({
    title: '保存文本',
    content: 'hello',
    defaultPath: 'hello.txt'
})

await window.AppFns.showItemInFolder(saveResult.filePath)
```

### 应用信息、日志和缓存

诊断能力适合做“关于应用”“导出日志”“客户现场排查”：

```js
const appInfo = await window.AppFns.getAppInfo()
await window.AppFns.openLogDir()
await window.AppFns.exportLog()
```

缓存/会话能力适合远程页面更新后清理旧资源：

```js
await window.AppFns.clearCache()
await window.AppFns.clearStorageData()
await window.AppFns.reloadApp()
```

这些能力受 `features.diagnostics` 和 `features.session` 控制。

### 下载管理

下载由主进程接管，页面通过 IPC 启动下载，并通过订阅事件获取状态：

```js
const offProgress = window.AppFns.onDownloadProgress((data) => {
    console.log(data.receivedBytes, data.totalBytes)
})

window.AppFns.onDownloadDone((data) => {
    console.log('download done', data.savePath)
    offProgress()
})

await window.AppFns.startDownload('https://example.com/file.zip')
```

默认保存到系统下载目录，也可以传入 `filename` 或 `savePath`。

### 自定义协议

协议模块支持从浏览器唤起客户端：

```text
electron-app-box://open?id=1
```

页面监听：

```js
window.AppFns.onProtocolOpen(({ url }) => {
    console.log(url)
})
```

配置位于 `src/config/app.config.js`：

```js
protocol: {
    enabled: true,
    scheme: 'electron-app-box'
}
```

### 安全模块

`src/security/index.js` 提供 `AppSecurityGuard`，用于保护主窗口导航和外链打开：

- 拦截主窗口跳转到未授权 origin；
- 拦截 `window.open` / `target=_blank` 在 Electron 内部打开新窗口；
- 只允许白名单外链通过系统默认浏览器打开；
- local 模式下会在静态服务启动后自动允许本地静态服务 origin。

安全配置位于 `src/config/app.config.js`：

```js
security: {
    enableNavigationGuard: true,
    allowOpenExternal: true,
    allowedOrigins: ['https://example.com'],
    externalAllowedOrigins: ['https://example.com'],
    permissions: {
        defaultAction: 'deny',
        allowedOrigins: [],
        allowedPermissions: []
    }
}
```

配置说明：

- `allowedOrigins`：主窗口允许加载或跳转的线上源。
- `externalAllowedOrigins`：允许通过系统默认浏览器打开的外链源。
- `permissions`：控制摄像头、麦克风、通知、地理位置等权限请求。
- `loadMode: 'remote'` 时，必须把 `remoteUrl` 所属 origin 加入 `allowedOrigins`。
- 不建议把不可信域名加入白名单，因为线上页面可以访问 preload 暴露的 `window.AppFns`。

## 运行时配置

外壳的窗口、端口、更新地址等配置集中在 `src/config/app.config.js`。

`src/config/app.config.js` 保留原始配置值，`src/config/index.js` 会生成最终 `appConfig`：

- 对数字配置做正数兜底；
- 对布尔配置兼容 `true` / `false`、`'true'` / `'false'`、`1` / `0`；
- 自动补全窗口图标、静态资源根目录等路径。
- 支持 `APP_ENV` / `NODE_ENV` 加载 `app.config.{env}.js`。
- 支持 `app.config.local.js` 做本机覆盖配置。
- 支持启动参数临时覆盖配置，例如 `--remote-url=https://xxx`。

| 配置路径 | 作用 | 默认值 |
| -------- | ---- | ------ |
| `window.width` | 窗口宽度 | `1920` |
| `window.height` | 窗口高度 | `1080` |
| `window.loadMode` | 页面加载模式，`local` 加载内置页面，`remote` 加载线上地址 | `local` |
| `window.remoteUrl` | `loadMode` 为 `remote` 时加载的线上地址 | `https://example.com` |
| `window.openDevTools` | 是否启动后打开 DevTools | `true` |
| `security.enableNavigationGuard` | 是否开启主窗口导航守卫 | `true` |
| `security.allowOpenExternal` | 是否允许白名单外链用系统浏览器打开 | `true` |
| `security.allowedOrigins` | 主窗口允许加载或跳转的线上源 | `['https://example.com']` |
| `security.externalAllowedOrigins` | 允许打开到系统浏览器的外链源 | `['https://example.com']` |
| `protocol.enabled` | 是否注册自定义协议 | `true` |
| `protocol.scheme` | 自定义协议名称 | `electron-app-box` |
| `features.fileSystem` | 是否暴露文件系统能力 | `true` |
| `features.downloads` | 是否暴露下载能力 | `true` |
| `features.session` | 是否暴露缓存/会话能力 | `true` |
| `features.diagnostics` | 是否暴露诊断和日志能力 | `true` |
| `features.updater` | 是否暴露更新检查能力 | `true` |
| `server.host` | 本地服务监听地址 | `127.0.0.1` |
| `server.staticPort` | 静态资源服务端口 | `9000` |
| `server.apiPort` | API / WebSocket 服务端口 | `50080` |
| `server.wsPath` | WebSocket 路径 | `/wskoa1` |
| `server.entryPath` | Electron 窗口默认加载入口 | `/h5/index.html` |
| `server.enableCors` | 是否开启 Koa CORS | `false` |
| `udp.enabled` | 是否开启 UDP 广播 | `true` |
| `udp.port` | UDP 广播端口 | `41234` |
| `udp.startupMessage` | UDP 启动后发送的默认消息 | `88888` |
| `updater.enabled` | 是否启用自动更新检查 | `false` |
| `updater.feedUrl` | 自动更新发布地址 | `http://example.com` |

启动参数示例：

```bash
npm run dev-e:once -- --load-mode=remote --remote-url=https://example.com --api-port=50081 --disable-udp
```

## 开发环境

推荐 Node.js 版本 20 以上。当前 `electron-builder` 固定到支持 Node.js 20 且 NSIS 构建更稳定的 24.x 版本，避免安装时出现 Node 22 才支持的 `EBADENGINE` 警告。

当前项目以 CommonJS 为主，`electron-store` 9+ 是 ESM 包，所以 `src/store/index.js` 中通过动态 `import()` 加载。

常用命令：

```bash
npm run dev-e
npm run dev-e:once
npm run build-e
npm run build-e:nsis
npm run build-e:portable
npm run build-e:unsigned
```

命令说明：

- `npm run dev-e`：使用 `nodemon` 监听 `src` 和 `appStatic`，代码变更后自动重启 Electron。
- `npm run dev-e:once`：只启动一次 Electron，不启用热重载。
- `npm run build-e`：默认等同于 `npm run build-e:nsis`。
- `npm run build-e:nsis`：只产出 Windows NSIS 安装包。
- `npm run build-e:portable`：只产出 Windows portable 可执行文件。
- `npm run build-e:unsigned`：Windows 本地调试用的未签名打包命令，会关闭证书自动发现和 Windows 可执行文件签名编辑。

首次使用热重载前需要安装依赖：

```bash
npm install
```

## 静态资源入口

应用默认加载：

```text
appStatic/h5/index.html
```

对应配置：

```js
server.entryPath = '/h5/index.html'
```

静态服务启动后，窗口实际加载地址类似：

```text
http://127.0.0.1:9000/h5/index.html
```

如果 `9000` 端口被占用，`StaticFileServer` 会自动尝试下一个端口，并使用最终成功监听的 `baseUrl` 加载页面。

端口重试有上限，默认最多重试 10 次，并且不会超过 `65535`。如果连续端口都被占用，会记录错误并停止继续递增，避免无限重试。

### CSP

内置页面 `appStatic/h5/index.html` 默认使用较严格的 CSP：

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;">
```

示例脚本已移到 `appStatic/h5/app.js`，避免依赖 `'unsafe-inline'`。

如果你的页面确实需要内联脚本，建议优先使用外部文件、nonce 或 hash；不建议直接恢复 `'unsafe-inline'`，否则 XSS 风险会变高。

## 打开线上地址

如果不想加载本地 `appStatic` 页面，而是直接打开线上 Web 地址，修改 `src/config/app.config.js`：

```js
const rawConfig = {
    window: {
        width: 1920,
        height: 1080,

        // 改为 remote 后，Electron 窗口会直接加载 remoteUrl。
        loadMode: 'remote',

        // 填写你的线上地址，必须是完整 http/https URL。
        remoteUrl: 'https://your-domain.com',

        openDevTools: true
    },
}
```

配置说明：

- `loadMode: 'local'`：启动 `StaticFileServer`，加载 `appStatic/h5/index.html`。
- `loadMode: 'remote'`：不启动静态资源服务，直接 `mainWindow.loadURL(remoteUrl)`。
- `remoteUrl` 必须以 `http://` 或 `https://` 开头，否则会记录错误并回退加载本地页面。
- `LocalHttpServer`、WebSocket、UDP 等外壳能力仍会按配置启动，页面来源不影响这些本地能力。
- 如果线上页面加载失败，会自动显示本地兜底页 `appStatic/fallback/index.html`，避免白屏。

注意事项：

- 线上页面仍然可以访问 preload 注入的 `window.AppFns`，所以只建议加载你自己可控的可信域名。
- 如果线上页面是 `https://`，浏览器安全策略可能限制它访问 `ws://127.0.0.1` 这类非加密 WebSocket；这种场景更推荐通过 preload/IPC 与本地能力通信。
- 如果线上页面需要请求本地 HTTP API，可能需要把 `server.enableCors` 改为 `true`，并按业务补充更严格的 CORS 白名单。

## WebSocket

本地 WebSocket 默认复用 API 服务端口：

```text
ws://127.0.0.1:50080/wskoa1
```

外部客户端向该地址发送消息后，`LocalHttpServer` 接收消息，`AppRuntime` 会通过 IPC 转发给页面：

```js
window.AppFns.onWsMessage((message) => {
    console.log(message)
})
```

根目录 `index.html` 提供了一个独立 WebSocket 调试示例，方便用普通浏览器验证本地 WS 服务。

## HTTP 健康检查

本地 API 服务提供 `/health`：

```text
http://127.0.0.1:50080/health
```

返回运行模式、时间戳等基础状态，便于外部程序确认桌面壳是否已经启动。

## 快捷键

当前内置全局快捷键：

| 快捷键 | 作用 |
| ------ | ---- |
| `Alt+F12` | 打开开发者工具 |
| `Alt+F11` | 切换窗口全屏 |

快捷键集中维护在 `src/customGlobal/index.js` 的 `buildShortcutMap()` 中。

## 日志

日志模块使用 `electron-log`。

日志文件优先写入 Electron 推荐的 `app.getPath('logs')` 目录，路径不可用时回退到 `userData/logs/log.log`。

## 自动更新

自动更新封装在 `src/upload/index.js`，入口方法：

```js
checkForUpdates(feedUrl)
```

`feedUrl` 需要指向 `electron-builder` generic provider 的发布目录，目录中必须包含：

- `latest.yml`
- 对应平台的安装包文件

开发阶段默认关闭自动更新：

```js
updater.enabled = false
```

页面可以手动检查更新并监听更新事件：

```js
window.AppFns.onUpdaterEvent((event) => {
    console.log(event.type, event)
})

await window.AppFns.checkForUpdates()
```

## 打包注意事项

开发环境下 Electron 和 electron-builder 下载可能较慢，可以切换镜像源。

打包或调试时还可能下载编译文件、二进制文件，这些下载地址通常来自 GitHub，不完全受 npm 镜像源影响。如果下载失败，可以根据报错信息手动下载并复制到对应缓存目录。

示例目录：

```text
electron-builder 缓存目录 -> C:\Users\Administrator\AppData\Local\electron-builder
electron 缓存目录         -> C:\Users\Administrator\AppData\Local\electron
```

当前 `package.json` 已提供 Windows / macOS / Linux 参考打包配置。Windows 打包目标通过命令二选一产出：

- `npm run build-e:nsis`：只生成 NSIS 安装包。
- `npm run build-e:portable`：只生成 portable 可执行文件。
- macOS：`dmg`、`zip`
- Linux：`AppImage`、`deb`

如果只发布 Windows，可以删除 `build.mac` 和 `build.linux`；如果需要跨平台发布，建议分别在对应系统上构建，尤其 macOS 签名和 notarize 通常需要 macOS 环境。

### 代码签名

生产发布建议配置代码签名：

- Windows 未签名安装包更容易触发 SmartScreen 提示；
- macOS 未签名/未 notarize 应用可能被 Gatekeeper 拦截；
- 证书密码不要写进仓库，建议使用 CI 环境变量。

Windows 常用环境变量示例：

```bash
set WIN_CSC_LINK=C:\certs\windows-code-signing.pfx
set WIN_CSC_KEY_PASSWORD=your_password
npm run build-e
```

macOS 常用环境变量示例：

```bash
export CSC_LINK=/path/to/mac-certificate.p12
export CSC_KEY_PASSWORD=your_password
export APPLE_ID=your_apple_id@example.com
export APPLE_APP_SPECIFIC_PASSWORD=your_app_specific_password
npm run build-e
```

当前模板默认关闭 Windows 可执行文件签名编辑和更新包签名校验，方便本地无证书环境直接打包。

如果你已经配置了真实代码签名证书，可以在 `package.json` 中恢复：

```json
"win": {
    "signAndEditExecutable": true,
    "verifyUpdateCodeSignature": true
}
```

真实证书仍需要通过本机证书仓库或环境变量提供。

### Windows winCodeSign 解压失败

如果构建时报错：

```text
Cannot create symbolic link
Cache\winCodeSign\...\darwin\10.12\lib\libcrypto.dylib
```

说明当前 Windows 用户没有创建符号链接权限，`electron-builder` 解压 `winCodeSign` 缓存包失败。

推荐处理方式：

1. 开启 Windows 开发者模式：`设置 -> 隐私和安全性 -> 开发者选项 -> 开发人员模式`。
2. 或使用“以管理员身份运行”的终端执行构建。
3. 删除失败缓存目录后重试：`C:\Users\Admin\AppData\Local\electron-builder\Cache\winCodeSign`。
4. 如果只是本地调试安装包，可以临时执行 `npm run build-e:unsigned`。

`electron-builder` 资源复制与排除示例：

```js
// 指定文件目录复制
"extraResources": [
    {
        "from": "./appStatic",
        "to": "appStatic"
    }
],

// 排除打包某个文件或目录
"files": [
    "!appStatic/**/*",
    "!electronDepend/**/*",
]
```
