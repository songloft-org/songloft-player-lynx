# #591 收藏长轮询在页面切换时中断

基线为 `2f3010c5beff70b1e2263ff1ecdb47840201c3fb`，本批修改保留在未提交工作树。问题报告显示语音设置页运行数分钟后控件停止响应，服务端同时观察到收藏变更长轮询在客户端超时后重连。

本批把收藏变更 watcher 的生命周期与 HTTP 请求绑定。停止 watcher 或切换服务器、账号、前后台状态时立即 abort 在途请求；同一 watcher 重复调用 `run()` 只复用一个运行循环。订阅固定使用启动该会话时的服务器地址，避免全局配置在切换过程中改变目标。35 秒接收超时、成功刷新后推进 cursor 和失败退避继续保留。

## 验证

- `pnpm exec vitest run src/features/library/__tests__/favorite-change-watcher.test.ts src/features/library/__tests__/favorite-changes.test.ts`：8 项通过。
- `pnpm exec tsc -b`：通过。
- `pnpm test`：376 个文件、3929 项通过。
- `pnpm run build`：Lynx 与 Web bundle 通过，保留既有 `touch-action` 警告。
- `pnpm run build:web`：Web bundle 和部署复制通过。
- 新回归覆盖中止在途请求、旧响应不触发刷新和同一 watcher 单飞。未运行修改前隔离副本的反向测试，测试断言在旧实现下会因缺少 abort 信号失败。

未运行：Docker Chromium 长时间页面实测、报告人的 Docker 镜像复测、Android/iOS/HarmonyOS 和桌面设备。代码尚未提交、推送或发布。
