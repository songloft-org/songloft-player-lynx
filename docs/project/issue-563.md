# #563 服务端收藏同步

为认证会话订阅 `/playlists/favorites/changes`，收到失效通知后重新读取完整收藏；不依赖设置页或插件 WebView。后台／退出／服务器或账号切换停止旧订阅，恢复时对账；旧宿主 404 停止订阅，网络失败退避重试。

基线 `bc692c14be23190aef4d3468e428dc292fd456af` + 未提交工作树。`pnpm exec tsc -b`、3793 项完整 Vitest、Lynx / Web 构建通过。新回归覆盖重连／取消、缓存更新及旧会话响应；浏览器实测真实 QuickJS 插件增删时，当前歌单行红心自动切换。

证据：`/tmp/songloft-563-extra/` 的测试／构建日志、截图和 `worktree-final.json`。首次并行构建因内存压力终止，串行分目标重跑；首次 Lynx 全量测试因该失败构建缺少产物而失败，成功构建后全量通过。

Not run：Android/iOS/HarmonyOS 及桌面真机、发行包与远端 CI。当前仅代码和 Web／注入测试验收；本记录描述提交前验证。用户随后授权提交、推送、SDK 发版和回复 songloft-org/songloft#563，最终提交及 CI 以 GitHub 和父仓库交付记录为准。
