document.getElementById('reloadBtn')?.addEventListener('click', () => {
    // 兜底页只负责触发无缓存重载，真正加载本地/远程页面仍由主进程配置决定。
    window.AppFns?.reloadApp?.()
})
