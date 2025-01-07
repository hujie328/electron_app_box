# Electron 基础桌面应用外壳

## 项目介绍

把 web 应用打包到桌面端,提供一个基础的 exe 应用外壳，把 web 页面包装成一个桌面应用。
外壳通过 node.js 可以给 web 页面提供与系统交互的能力。
内置了静态文件托管服务，和 socket 推送服务,实时推送消息到页面。

### 模块介绍

| 模块                 | 作用                                              |
| -------------------- | ------------------------------------------------- |
| index                | electron 主进程文件                               |
| ipcModule            | 通信模块                                          |
| ipcModule/preload.js | 预加载脚本，用于提前在 windeows 中注入一些方法    |
| log                  | 日志模块,主进程是没有可视界面的，用于记录日志信息 |
| customGlobal         | 注册快捷键                                        |
| customGlobal         | 注册快捷键                                        |
| koaServe             | koa 服务模块                                      |
| appStatic            | node 代理的静态资源目录                           |
| upload               | 更新检查                                          |
| package.json/build   | electron 打包配置项                               |

### 注意事项

1.开发环境包 electron 和 electron-builder 下载慢可以切换镜像源  
2.打包时或者调试时需要下载编译文件和一些二进制字节码文件，下载地址是 github 仓库,并且不受 npm 的镜像源影响,会的话可以使用 TZ 搭建终端代理。  
不然的话根据报错信息点击链接手动下载，然后复制到 C 盘指定文件即可。具体文件位置可根据报错信息自行搜索。
