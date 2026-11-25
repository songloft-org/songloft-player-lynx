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

2026-11-24 这轮验证未覆盖 Docker Chromium 长时间页面实测和原生设备。收藏订阅修改随后随 Lynx `02def364483c15ade0a3aa4d2a972bc0b5454083`、主仓库 `2587f7823504eb6b6087b1eb16600f87c563fb11` 发布到 dev 镜像。

<a id="web-user-timing"></a>

## 2026-11-25 · Web 性能计时复查

报告者在 `2587f78` 上仍遇到卡顿。用该提交的 CI 镜像、同版内置 Lynx Web、已发布的音箱插件 `v2026.11.23.2`（`21efa9e6ef00dfdff971dd58c757d9d36d263530`），在 Linux amd64 Docker Chrome 121 下经本地 HTTPS 反代进入真实嵌套插件页。用测试账号、歌单及设备数据复现，并每 15 秒采样浏览器线程 CPU 和 Web Worker 的 User Timing 条目。每组实点「记忆」「口令」「搜索」「监听」，等待对应卡片变为选中状态。

关闭对话监听后，对真实状态 WebSocket 的首帧做夹具拷贝，每秒交替推送一次音量值。原版在 90 秒时累计 41,215 条 mark 和 94,070 条 measure，插件 worker 单核 CPU 达 89.8%。三个需要切换的卡片均超过 5 秒。CPU 剖析热点为 `profileEnd → performance.clearMarks()`。Mark 主要来自 `ReactLynx::diffFinishNoPatch`；`@lynx-js/web-core@0.23.1` 在浏览器具备 User Timing API 时即记录这些事件。

- 第 30 秒只清 mark，下一采样段的 worker CPU 为 14.2%，同期原版为 36.0%。随着新 mark 积累，CPU 再次升高。只清 measure 的同期 CPU 为 34.2%，后续仍升到 90.9%。
- 用本地反代只替换 Web 主线程和 worker 的计时模块，关闭 User Timing 追踪。相同的每秒一帧负载下，120 秒时已注入 123 帧，worker CPU 为 1.1%，计时条目均为零，最后一轮四次切换耗时 53–115 毫秒。
- 单独把 Web 主线程和 worker 的 `isProfileRecording()` 改为返回假，也能阻止条目累积。120 秒注入 121 帧后，仍为零条 mark 和一条 measure，worker CPU 为 0.7%，最后一轮四次切换耗时 48–88 毫秒。
- 每六秒推送一帧的五分钟对照中，两组各收 50 帧，原版积累 28,163 条 mark 和 70,311 条 measure，末轮切换耗时 92–240 毫秒。禁用追踪组的条目为零，末轮切换耗时 44–73 毫秒。
- 原版嵌套页启用对话监听、间隔两秒、开启调试日志且未注入状态帧时，15 分钟内只收到 13 帧状态和一帧对话快照。64 次卡片点击都完成切换，末轮耗时 70–136 毫秒。该夹具的空闲状态下未复现卡顿。
- 报告环境中的持续重渲染来源仍待采样。真实 Edge、小米账号和实体音箱未运行。临时实验只替换隔离服务的 Web 资产，仓库运行时代码暂无改动。

Lynx 上游已在 web-core 0.26.8 引入显式开启机制。新版的 `isProfileRecording()` 只在该视图显式启用追踪且浏览器具备 User Timing API 时返回真。复查镜像锁定的是 `0.23.1`。[上游修复](https://github.com/lynx-family/lynx-stack/pull/4330) · [web-core 0.26.8](https://github.com/lynx-family/lynx-stack/releases/tag/@lynx-js%2Fweb-core@0.26.8)

### 0.26.8 升级对照

在同一隔离镜像经本地 HTTP 反代加载 npm 发布的 web-core 0.26.8，校验包的 SHA-512。原版资产替换后，主界面能打开，嵌入插件页未出现。把现有 `nativeModulesMap` 兼容补丁应用到新运行时的 `client.js` 后，嵌套音箱页正常打开。

Docker Chrome 121 的两组测试各注入 91 条变化的状态帧。90 秒时，0.23.1 插件 worker 留有 42,168 个 mark 和 95,644 个 measure，四张卡片切换耗时 195–686 毫秒。0.26.8 插件 worker 留有零个 mark 和一个 measure，切换耗时 49–87 毫秒。完整的现有 `postinstall` 脚本在 0.26.8 上仍有六处模式匹配失败。正式升级还需迁移这些补丁并重建 Web 产物。

<a id="lynx-upgrade"></a>

### Lynx 依赖升级验证

Lynx 客户端基线为 `37f6d43b0bc9a091a63bd0b2b2951153670d5a22`。本地候选升级了共享客户端和示例插件的 Lynx npm 依赖，包括 Web Core 0.26.9、ReactLynx 0.129.4、Rspeedy 0.19.0 和 Lynx UI 3.143.0。迁移输入、滑块、排序和 Web Core 补丁。Web Core 上游新增的 `blur-view` 映射由补丁接回 Songloft 的移动透镜子类。

Linux amd64 Docker Chrome 121 打开重新构建的内嵌 Web，在 `2587f78` 后端上用实际键盘登录并打开已发布的智能音箱插件。夹具在 90 秒内发送 91 条变化的状态帧，插件 Worker 始终只有零条 mark 和一条 measure。最后一轮四张卡片切换耗时 116–223 毫秒。真实 Edge、小米账号和实体音箱待验证。

Android 同批升级到 Lynx 4.2.0、PrimJS 4.2.1、Debug Router 0.0.22 和 Serval SVG 0.3.4。Linux amd64 上用 Gradle 8.7 执行 `:app:assembleDebug` 成功，检查了 APK 内的 bundle、原生版本元数据和四种 ABI 的 Lynx 与 SVG 库。合并清单的 `minSdk` 为 21。

iOS 和 HarmonyOS 同步到 Lynx 4.2.0 和 PrimJS 4.2.1。iOS 的开发与发布 Podfile 声明了 Lynx 官方 Specs 源，CocoaPods 1.16.2 对两份锁文件重新解析得到相同结果。HarmonyOS 由 OHPM 5.1.3 生成锁文件，并对该版本实际安装的 SDK 执行 WebView 存储和事件上报补丁。三个移动平台的热更新均精确匹配运行时版本，旧壳须先安装新版客户端。

桌面打包器更新到 Lynxtron Builder 0.0.31。发布的 npm 包内置了 Lynxtron 和 DMG 补丁及 `@electron/get` 3.1.0，桌面兼容性测试直接访问内置依赖。Linux 本地通过了 38 项桌面测试。安装包构建和设备运行分别记录。

[报告者复测](https://github.com/songloft-org/songloft/issues/591#issuecomment-7160069715) · [原版镜像 CI](https://github.com/songloft-org/songloft/actions/runs/45420147112)
