# Bug 跟踪

> 真机测试与代码审计发现的问题清单。开放条目保留在「待修复」，修复后经对应平台验证再闭合。
> 新发现的问题请新起条目，别在已闭合条目上续写。
>
> - 上游问题（`illegal css key:237`、swiper `autopx`、placeholder 空转）见 [`plans/upstream-issues.md`](plans/upstream-issues.md)
> - 审计修复实施细节见 [`../archive/2026-08-14-audit-fix-plan.md`](../archive/2026-08-14-audit-fix-plan.md)
> - 各批次的完整修复过程见 [`progress.md`](progress.md) 对应批次
>
> 格式：`症状 — 根因/修法（修复批次）`。

## 待修复（开放）

- [x] Web 前端直接挂载子路径时资源 404、黑屏（2026-10-07）— 保留 `e09592b` 旧包 11 项 404、Worker 0 的记录，旧包未修改。已补宿主目录、静态资源/图标、引擎/Worker、全部宿主模块/子 frame 桥接与 embedded API；恢复会话忽略旧服务器地址，Web 无 location 的主线程使用平台标识读取宿主目录。新源码在严格 `/songloft/` 服务的 Chrome 两种模式实际登录、已安装 Lynx/WebView 插件桥接及 Linux WebKit 两种模式的 P4/P5 通过，页面/媒体错误为空；根路径登录回归通过。目录入口需尾斜杠与隔离响应头，真实 Safari/MIoT 长后台仍开放。日志、夹具和交付记录见 [progress](progress.md) 与[部署指南](../guides/web-deployment.md)。

- [ ] Firefox 134 间歇性 Blob 脚本加载异常（2026-10-07）：数据导入/导出在 standalone/embedded 根路径通过，但数据流程与后续快捷键流程各捕获过 Lynx MTS iframe 的 `Failed to load script: blob:...`，阶段诊断后的最终流程未复现；新增 20 组加载/快速刷新和 10 组认证流程（30 次会话刷新）也未捕获异常，仍未定位根因，不能凭这些通过闭合。媒体 `MEDIA_ERR_DECODE` 已另定位为本机输出初始化失败 `NS_ERROR_DOM_MEDIA_MEDIASINK_ERR`；接入临时 PulseAudio 空输出后，空白页探针与快捷键最终回归均无媒体错误，不修改应用或宿主配置。实际播放/暂停/切歌/音量/重复/持久化与输入/菜单保护通过，但未验证扬声器听感。当前 web-core 包目标列 Chrome/Safari，不承诺 Firefox 整体稳定；证据与边界见 progress。

- [ ] Android 模拟器 SwiftShader 宿主崩溃（2026-10-07 P6a，现有环境可绕过）：37.2.12 的 software/显式 SwiftShader 最终均退出 139、OOMKilled=false，末尾有 ColorBuffer 错误。临时官方 35.6.11 的初始化失败在补 SDK 根与路径斜杠后绕过，API 35 / 16 KB 能开机但仍退出 139；普通 API 34 / 4 KB 下安装、预编译和真实登录也成功，登录后宿主仍 SIGSEGV，不能只归因于 16 KB。GDB core 确认 qemu 宿主崩溃，但无完整符号栈，不归因于剪贴板或声称已定位具体根因。切为 Mesa 22.3.6 / llvmpipe 后，同一 `e09592b` APK 两处跨应用系统粘贴、三轮根 resumed 和基础播放/暂停/通知通过，设备环境已可用；不闭合 SwiftShader 或既有 x86_64 SVG/JIT 问题。证据 `/tmp/lynx-p6-android-device/`、`/tmp/lynx-p6-container/emulator35-api34-mesa.log`，原日志 `/tmp/lynx-p6a-emulator*.log`；复现脚本、范围和剩余插件/歌词/锁屏验收见 progress。

- [ ] Android x86_64 / 16 KB 模拟器长批量验证（2026-10-07 新发现）：实际 APK 的 `servalsvg:0.1.1` 仅含 arm64-v8a/armeabi-v7a/x86 `.so`，没有 x86_64；自动选择 x86_64 时 SVG JNI `renderWithDiagnostics` 报 UnsatisfiedLinkError，图标为空。235 首批量任务在已完成 35 首时另有主线程 SIGSEGV，栈落在 ART JIT 的 `UIBody.rebuildViewTree`；不能仅凭同时出现就断定 SVG 缺库是该 SIGSEGV 根因。本机转用同一 APK 的 arm64 ABI（模拟器 native bridge）并预编译后复验，图标正常；两项变更没有分开做对照，因此不宣称修复 x86_64 崩溃。该环境不计作正常 x86_64 验收；继续保留设备回归和 ABI 修复问题。证据 `/tmp/lynx-p3b-device-crash.log`。

- [ ] **DLNA 投屏重播旧曲、离开投屏页后主播放器控制本地音频（2026-10-05，代码与测试包已完成，待 Android 实测）** — DIDL `res` 没有 MIME 且忽略 SOAP HTTP 错误，URI 被拒后仍发 Play；投屏设备只存在页面 state，主播放器控制没有路由到远端。现补 MIME 元数据、SOAP Fault 校验、跨页面会话与串行控制，远端状态/进度轮询及队列完成路由。JS 2760 项与 Android 11 项回归（分批）、类型检查、双 bundle 和最终 APK 编译通过。ADB 无连接设备，需实测主播放器暂停/继续、上一曲/下一曲、自动连播、进度/音量与断开；iOS/HarmonyOS 同步源码；HarmonyOS HAP 现已编译，iOS 编译及两端设备验证仍开放。

- [ ] **三端插件恢复前台通知待设备验收（songloft-org/songloft#493，2026-10-07 P6c 源码补齐）** — MIoT 后台静默失效的连接可能在前台持续停更。三端根生命周期与 WebView/Lynx 消费点已接入，SDK 事件独立注册/ready 已补但未发布，插件需重建。Chrome/Firefox 的保活与可见性证据见 progress。Android 模板加载修复后的 `9bfd35c` 及含能力标记的新 `1d86b77` APK 均在 API 34 / Mesa 环境通过原生子 frame 初始通知、A/B 共五次 HOME 每次一次、退出后无推送与新标识重入。iOS/HarmonyOS 也已补模板接线源码；`1d86b77` 新 HAP 的实际源码 clean 编译和包校验通过，尚未签名/安装，iOS 尚未编译。MIoT 长后台、断网重连和音箱状态恢复仍待设备验证，不勾选整体完成。

> 2026-08-31 从 handoff.md 迁入。尚未闭合，修复后改 `[x]` 并移主题归类，别在已闭合条目上续写。

- [ ] **首页插件网格排序需要较新后端（2026-10-06 订正）** — 2026-09-15 实测旧后端 GET/PUT `/settings/plugin-order` 返回 404，排序回滚；当前主仓库已在 `routers.go` 注册此端点并生成 Swagger，不能继续声称接口不存在。旧部署仍有兼容问题，新后端上的拖拽持久化需要端到端复验。批76 的 404 是历史证据。

- [x] **视频服务端失败被报成「该文件没有视频轨」**（2026-09-11 批69 实测发现，**批71 已修**）— 症状：用户点 MV 后看到「该文件没有视频轨」，而真实原因是转码请求失败（服务端无 ffmpeg / 后端拒绝）。根因分两层，**第二层是批69 才查出来的**：① 宿主 `open()` 只回答 `hasVideoTrack()`，把「item 加载失败」与「加载成功但流里没有视频轨」压成同一个 `false`，JS 拿不到区分信号；② 更关键的是**失败的转码请求不一定会让 `audio.load()` reject** —— 实测 `format: mkv` 的歌曲（iOS 判为 `hls`）`enterVideoSource()` 返回的是 **`'switched'`**，而真实结果是远端 404、`errorMessage` = `The requested URL was not found on this server.`，错误由 `audio.on('error')` **异步**送达。**修法（批71 落地）**：`SongloftVideo.open` 返回三态原因 `{result:"opened"|"noTrack"|"failed"}`；两端引擎加 `videoTrackState()` 先按 item.status / `playerError` 判 `failed` 再问是否有轨道，模块轮询到 ready/failed/8s 超时才回答；TS facade `openReason()` 兼容旧宿主布尔。iOS 模拟器实测 3/3（无 item→`failed`、audio-only→`noTrack`、video→`opened`）；Android 模拟器实测 `failed`/`opened` 闭环（批72 补）。**仍开放**：「在 `load` 阶段就把 HTTP 失败 reject」这一更彻底的修法未做（影响三端媒体加载语义，未拍板）。证据：批69 设备实测（iOS 26.5 / iPhone 17 Pro 模拟器，`enterVideoSource()` → `'switched'` 而同一次 `errorMessage` 为 404 文本）。

- [ ] **Android 全屏视频 open→isOpen 有竞态**（2026-09-14 批72 实测发现；**`1cc08e0` 后机制已消除，待真机复核**）— 症状：`open()` 刚返回的瞬间再点一次「观看 MV」会读到 `isOpen()===false` → 二次 `open()` → 叠第二个 Activity。原根因：`open()` 在 `startActivity` 后立刻回 `"opened"`，而 `isOpen()` 读的 `activity` 要等 `SongloftVideoActivity.onCreate` 才由 `setActivity` 置上。**`1cc08e0`（视频控制层上移 JS）把那个 Activity 整个删掉了**：画面改为 `MainActivity` 视图树里、Lynx 视图之下的一个 `SurfaceView`（`MainActivity.kt:51-63`），`isOpen` 由 `showSurface()` 在 `callback.invoke(OPENED)` **之前**同步置位（`SongloftVideoModule.kt:75-79`），且全仓已无视频路径上的 `startActivity`（manifest 只剩 `MainActivity` 与 `platform.FilePickerActivity`）⇒「回 open 时 isOpen 还是 false」这个状态不可再达。**待办**：真机复核一次再闭合（本批无 AVD/系统镜像，`android-video-fullscreen` 跑不了）。原证据：批72 Android 模拟器探针（`emulator-5554`，TestBridge），open→`'opened'` 后立即 isOpen=false，需 5s 轮询才翻 true。

- [ ] HLS 播放列表内的绝对 https URI（自签名下）不通 — P3。批47 修完 iOS 自签名媒体流后剩余缺口：播放列表里的**相对** URI 继续带自定义 scheme 回到 `InsecureMediaLoader`（Songloft 自有 HLS 反代产出相对 URL，按构造是通的），但**绝对** `https://` URI 由 AVFoundation 自行加载、撞同一道证书墙。**无可测自签名 HLS 源，未实测**。复现环境见 [pitfalls.md](pitfalls.md) 附录
- [ ] Android 后台自动连播被陈旧 `MEDIA_BUTTON` stop 打断（Issue #1）— 最新附件 `songloft-logs-20260831-203401.zip` 的失败链路为：`20:32:38.695` 播放器进入 `ENDED` → `20:32:38.793` 加载下一首 → `20:32:39.272` 下一首已 `READY + playWhenReady=true` → `20:32:39.304` 收到 `ACTION_MEDIA_BUTTON` → `20:32:39.312` 被重置为 `IDLE`。提交 `1edd44b` 只判断 `BUFFERING`，因此在真正 stop 到达时漏拦。当前修复在 `ENDED -> load` 过渡上武装 2 秒 guard，并仅消费带 `KEYCODE_MEDIA_STOP` 的 intent；已通过 Kotlin 编译与静态回归测试，待新 APK 真机连续播放确认。证据与验证标准见 [handoff.md](handoff.md)「Issue #1」。
- [ ] Android 后台播放通知栏偶现消失（Issue #2）— 附件 `songloft-logs-20260903-083706.zip` 的链路：`08:34:28.412` media3 交还前台位 → `.545` 重新发出真卡片 → `08:34:29.181` 收到 media3 通知的 deleteIntent（`mediaButtonKey=86`，被自动连播守卫抑制）。deleteIntent 只在通知真的离开通知栏时才发，晚于 `.545` ⇒ HyperOS 清掉的是刚重发的那张；`mediaNotificationOwnsSlot` 与 media3 的 `startedInForeground` 双方仍记着「已发出」，无人重发，而下一首无歌词 ⇒ 无 metadata 变化 ⇒ 通知栏空了 77 秒，直到用户手动切歌。当前修复为 `SongloftPlaybackService` 通知看护（`getActiveNotifications` 判据 + 10 秒心跳 + 400ms 快检查 + media3 漏斗重发 + 盲发熔断）；已过 Kotlin 编译与 14 条闸门（9 变异全咬），**待 HyperOS 真机连播到无歌词曲目确认**后闭合。判据与证据见 [progress.md](progress.md)「Issue #2」与 [pitfalls.md](pitfalls.md) §3
- [ ] 导出日志很慢（Issue #3）— 功能三端都通，慢在**工作发生在哪一侧**：JS 把后端日志（后端上限 10 MiB）与客户端日志（会话上限 20 MB）读成 JS 字符串、`fflate.zipSync` 压缩、手写 base64，全部跑在无 JIT 的 JS 线程，再把 payload 跨桥回原生；Flutter 参考实现同样步骤走 AOT Dart 的 `archive` 并把**文件路径**交给 `share_plus`。同一份 `fflate` + base64 在 Node(V8) 上 5MB 日志已需 ~411ms、20MB 需 ~1724ms（设备端无 JIT 通常再慢一个数量级）。当前修复新增原生 `shareLogArchive`（三端各自下载 + 原生 zip + 分享，JS 只跨桥三个短字符串），JS 打包路径保留给 Web 与旧原生壳。已过 `tsc -b` / 2289 项 Vitest（新增 31 项，反向验证 21/21 全咬）/ `pnpm run build` 双产物 / Android `assembleDebug`；**iOS 侧已编译通过**（`pnpm run ios:build` 自 2026-09-11 起多次 `BUILD SUCCEEDED`，含 `shareLogArchive` 这版代码），**HarmonyOS 现已通过未签名 HAP 编译（2026-10-07 CLI），两端的真机耗时改善仍未实测**，待这些确认后闭合。根因数据见 [pitfalls.md](pitfalls.md) §3「CPU 密集活不能留在 JS 侧」
- [ ] 播放列表歌曲很多时打开卡死（Issue #4）— 根因：队列抽屉 `SortableRoot as='ScrollView'` 零虚拟化全量挂载，每行是主线程 `DraggableRoot`（`main-thread:bindlayoutchange` + 拖拽 overlay + 四组主线程 ref），500 首打开时一帧创建 ~3000+ 节点与 500 份拖拽注册，且抽屉关闭时不挂载、成本全落在打开帧。修复：抽屉改 `VirtualList`（原生 `<list>`），按用户决定（方案 A）移除队列内拖拽排序，级联删 store `reorderPlaylist`、`queue.ts` `moveItem`/`indexAfterMove`/`reorder`、8 个对应用例与死 CSS（`.drawer__row-handle`/`.drawer__row-actions`）。已验（Web，Docker Chrome，同一脚本对旧/新产物 A/B，500 首）：打开 **6246ms → 387ms**、抽屉 DOM 节点 **13017 → 5513**、帧延迟 1ms、滚动真实位移、点击播放正确、console 错误 0；vitest 反向验证 6/6 全咬；**2285 全绿（212 文件）**。**待真机确认 500 首队列打开抽屉不卡后闭合**（Issue 报告者平台未知；web-core `<list>` 不虚拟化尚且 16× 快，原生 `<list>` 只挂可视区 ~15 行，真机收益结构性更大）。细节见 [progress.md](progress.md)「Issue #4」
- [ ] 冷启动没有正常进入歌词界面（Issue #7）— 用户开启了「打开后自动进入歌词」偏好，但冷启动 App 后停在首页、没进歌词页。根因是**移植遗漏**而非竞态：偏好此前只驱动 `FullPlayerPage` 内部的 auto-swipe（`swipeTo(1)`），而该页只有用户手动打开全屏播放器才挂载，冷启动落在首页时那段代码根本不执行。Flutter 参考实现（`shell_layout.dart` `_scheduleAutoEnterLyrics`）在启动后一旦恢复出上次歌曲就**主动导航**到全屏播放器并落在歌词页，与「自动恢复播放」相互独立。修复：新增 `src/features/player/data/auto-enter-lyrics.ts` 的 `navigateAutoEnterLyricsIfNeeded()`，接入 `src/index.tsx` 启动链路的 `authenticated` 分支（`restorePlaybackState()` 已 await、auth 已解析之后，与通知导航同处）；有恢复歌曲且偏好开启时 `router.navigate({ to: '/player' })`，之后窄屏由 FullPlayerPage 既有 auto-swipe 落歌词、宽屏分栏天然同屏。无恢复歌曲时刻意不导航（避免冷启动落进「nothing playing」空态）。已过 `tsc -b --force` / `pnpm test` **2299 全绿（213 文件，新增 3 条单测，反向验证 3/3 全咬）** / `pnpm run build` 双产物 / `git diff --check` 与 U+FFFD 干净。**待真机确认（开启偏好 + 有上次歌曲）冷启动直接落歌词页后闭合**（纯 JS 启动导航，无原生改动）。细节见 [progress.md](progress.md)「Issue #7」
- [ ] 从全屏播放器返回首页/曲库页会闪一下（Issue #6）— 大屏幕左侧导航栏延迟出现、布局不稳定。根因：`/player` 是 chrome-less 路由，挂在 `rootRoute` 下、`shellRoute` 之外，进入全屏播放器时 `ShellLayout` 整体卸载、返回时重新挂载；而 `ShellLayout` 用 `useBreakpoint(0, '.shell')` 起步，width=0 → `mobile` → 首帧渲染窄屏底部导航，异步 `boundingClientRect` 测量返回后才切到宽屏 rail，可见闪烁。仓库已有同类问题的现成解法（模块级 `shellWidth` 缓存，`LibraryLayout` 已用 `useSyncExternalStore` 同步读取做种子消除钻取页闪烁），但 `ShellLayout` 自身只写缓存、从未读。修复：`ShellLayout` 改用 `useBreakpoint(cachedWidth, '.shell')`，种子取自 `useSyncExternalStore(subscribeShellWidth, getShellWidth)`；`FullPlayerPage` 渲染期 `setShellWidth(width)` 保持全屏期间旋转后缓存不旧。已过 `tsc -b` / `pnpm test` **2301 全绿（214 文件，新增 2 条单测，反向验证 2/2 全咬）** / `pnpm run build` 双产物 / `git diff --check` 与 U+FFFD 干净。**待真机确认（大屏往返全屏播放器不闪）后闭合**（纯 JS，无原生改动）。细节见 [progress.md](progress.md)「Issue #6」
- [ ] iOS 15–18 上「app 主题与系统相反」时状态栏文字可能与页面同色 — 由安全区改造（全屏渲染）新暴露，**未实测，按机制推断**。改造前 LynxView 缩进在安全区内，状态栏那条带由 `view.backgroundColor = .systemBackground` 绘制，颜色跟系统走，而 `.default` 状态栏样式也跟系统走，两者天然同侧、永远可读；改造后页面自己画到屏幕顶边，那条带变成 app 主题的底色，而宿主没有任何 `preferredStatusBarStyle` / `overrideUserInterfaceStyle` 代码，样式仍按**系统**外观解析 —— 系统浅色 + app 强制深色即黑字压黑底。**iOS 26 实测无此问题**：iPhone 17 Pro 模拟器上把 app 强制切深色（系统仍浅色），逐像素量状态栏字形，时钟与右侧图标从黑翻成白（浅色下 549px 黑字形 / 深色下 554px 白字形），是系统按背后内容自适应，与本 app 代码无关。所以缺口只在 iOS 26 以下，而部署底线是 15/16。**未在 18.3 上量到**：该机 TestBridge 的 9230 没有 bind（`lsof` 无监听，App 进程在跑），无法远程把 app 主题强制成深色来构造这个组合，故按推断记录而非结论。修法需要一条 page→host 的主题通道；`SongloftPlatform` 接口的方法按铁律必须三端齐备（Android/HarmonyOS 并不全屏，为它们加这个方法是净负担），因此更合适的是仿 `LiveActivityModule` 建 iOS-only 模块 + TS facade 能力探测降级 + 契约闸门单端 `describe`。待有人能在 iOS ≤18 真机/模拟器上量到再决定是否做
- [ ] **iOS 上「字体大小」设置完全无效**（连带：主题包/材质对部分复合令牌可能同样无效）— 由安全区改造实测顺带发现，**已实测确认，未修**。`tokens.css` 的 12 个 HIG 文本令牌都是 `calc(Npx * var(--font-scale))`，而 `--font-scale` 是 `ThemeProvider` 以 **inline** 自定义属性写在 `.theme-root` 上的（`themePackToStyleVars` 恒定输出它）。实测（iPhone 17 Pro / iOS 26.5，把 inline 值强制成 `2` 后逐像素量）：`.nav-item__label` 高度仍是 **16.67pt**、`.home__content` 高度 **1058 一像素不变** —— 即 `calc()` 里用的是类声明的 `1`，inline 覆盖没送进去。对照实验证明这**不是**「inline 覆盖一律无效」：同一个 inline 令牌被属性**直接**消费时是好的（`padding-top: var(--safe-top)` 量到 62、`bottom: calc(var(--space-2) + var(--safe-bottom))` 量到 42）。所以规则是「**inline 覆盖只到达属性值里的 `var()`，到不了另一个自定义属性值里嵌套的 `var()`**」。默认字号下 12 个令牌仍算出正确尺寸，这就是它能一直藏着的原因 —— 坏的只有用户的字号选择。修法两条：`ThemeProvider` 直接把 12 个算好的 px 以 inline 输出（值它本来就有），或去掉这层间接。闸门 `shared/theme/__tests__/inline-token-indirection.test.ts` 已把 12 个令牌登记为 `KNOWN_FONT_SCALE_DEBT`（**反向验证 3/3**：把 `--nav-inset` 改回 calc 形态、新造一个同类令牌、删一条登记项，各转红），修好后应删登记项而非删断言。**同一机制下的未实测嫌疑**（非 calc 的普通替换，刻意没写进闸门，因为没量过就不该断言）：`--glass-sheen-layer: … var(--glass-sheen)`、`--glass-rim-sides: … var(--glass-rim-side)` —— 若主题包覆盖了 `--glass-sheen`，iOS 上的玻璃高光可能不跟包走（原清单里还有 `--shadow-focus`，**批68 已把它从仓库里删掉**：它没有任何消费者，四端都没有 tab 顺序与按键处理，焦点环不可达）；`tokens.css` 里「nested var 会 per-theme 解析、白拿材质系统的 inline 覆盖」那句注释是 **headless-Chrome（Web）验证的**，已在原处补上 iOS 反例。
- [ ] HarmonyOS 音量几乎静音 — store 已把 0–100 换算成 0–1，ArkTS module 又除以 100。代码已改为透传一次归一化后的值，并加契约闸门；HAP 编译已通过，待真机音量验证后闭合。
- [ ] HarmonyOS 视频完整播放待设备验收（2026-10-06 订正）— 历史占位模块确曾恒返回 `false`，随后被移除；当前 `Index.ets` 已重新注册真实 `SongloftVideoModule`，并用 XComponent 绑定共享 AVPlayer，模块已实现打开/关闭、表面布局与方向控制。旧“模块已删除、视频另做”的状态已过期；整个宿主 HAP 已编译（2026-10-07，未改视频源码）；仍需设备打开 MV、seek/旋转、退出解绑与后续纯音频播放验证，不能把移除占位实现等同于当前视频已验收。
- [ ] HarmonyOS DLNA 扫描后仍为空且无法控制设备 — 发现结果只存于局部数组，`getDevices` 恒返回空；投屏又把 `deviceId` 当 SOAP URL。代码已持久保存解析后的设备与 AVTransport `controlUrl`，控制前按 id 查表，并加三端契约闸门；HAP 编译已通过，待真实投屏设备验证后闭合。

## Web 端插件（2026-09-08 用户报障）

- [x] **打开插件 tab 后切走，Chrome 渲染进程崩溃（error code 11）** — 根因不在无障碍（用户与前一轮调查的初判都指向那里，已证伪），而是我们在切 tab 时 `detach` 插件 iframe：`PluginWebViewPage` 卸载 → `webview.close()` → `destroyIframe()` → `remove()`，撞上 Chrome「往正在拆掉的 frame 里注入扩展内容脚本」路径的空指针（`EXC_BAD_ACCESS`，`fault_addr` 7 个 dump 恒为 `0xf8`）。三个必要条件：①我们 detach ②装了 `all_frames: true` 的扩展（二分确认是 KISS Translator；React DevTools 与 Vimium C 各自 0/2）③DevTools 真的打开（仅启用 CDP `Accessibility` 域不够，0/3；视口高度也已排除）。全齐 **15/15** 崩，缺一即 0。修法：主线程按插件保活 frame，切 tab 只 `hide` 不 detach；`close` 改为导航 `about:blank` 且不摘元素，只在禁用/卸载/强制更新/登出时调。lynx 路径同样保活，并补上等待 web-core 异步 dispose 再重建。已验：`tsc -b` + **2363 全绿（220 文件，新增 18 条执行宿主脚本的单测，反向验证 8/8 全咬）** + `build:web` 产物与源逐字节一致 + **真实 Chrome（KISS + DevTools docked，修复前 15/15 崩）单次 0/4、7 插件轮转 30 次 0 崩、落地脚本 24 次 0 崩**，且保活有界（frame 数 1→8 后停止增长）。**lynx 引擎路径无真实浏览器验证**（本机 7 个插件全是 iframe 路径，没有 lynx 插件；仅单测覆盖）。根因全文见 [`../archive/web-plugin-tab-crash.md`](../archive/web-plugin-tab-crash.md)
- [x] **`renderEngine: "lynx"` 插件在 standalone 部署产物里从未生效** — 上一条的连带发现。`web/index.html` 引用 `/lynx-frame-host.js`，但 `copy-bundle-web.mjs` 的 `HOST_SCRIPTS` 没有它，也没有 `songloft-lynx-frame-module.js` / `songloft-lynx-bridge-module.js`：script 标签 404，`SongloftLynxFrame` 从未注册。补齐三个文件，并把 `web-host-page.test.ts` 里同样硬编码的宿主脚本列表改为从 `index.html` 推导 + 断言每个引用都在部署清单里

- [x] **lynx 引擎插件在 Web 上收不到播放状态** — 上面两条的自审连带发现。`LynxPluginFrame` 把播放状态订阅 gate 在 `loaded`，而 `loaded` 只由原生 `<frame>` 的 `bindload` 置位；Web 分支渲染的是占位 `<view>`，没有该事件 ⇒ 订阅从未安装，而推送通道只送变化量 ⇒ 子 frame 对播放一无所知。修法：初始快照随 `globalProps` 送达（宿主在 `url` 前设置，且每次 `open` 合并新快照，正好覆盖保活后的再进入），增量继续走 `sendEvent`；`loaded` / `onLoad` / 原生 `bindload` 一并作为死代码删除。新增 `lynx-plugin-frame-web.test.tsx` 8 条，反向验证 2/2 全咬（去掉 `playerState` 咬 1 条、恢复永不置位的门咬 4 条）。**仅单测覆盖，无真实浏览器验证**（本机无 lynx 引擎插件）

## Web 拖拽（2026-09-15 用户报障）

- [x] **鼠标拖拽在光标离开手柄时被掐断（首页插件网格 / 曲库视图编辑 / 设置 tab 顺序 / 歌单排序）** — 症状：桌面浏览器用鼠标拖「卡顿不跟手」，快速甩动时干脆停在原地，首页网格还会把卡片弹回原位。根因：`lynx-ui` 的 `useDraggable` 把 `main-thread:bindmouseleave` 绑成 `handleDragEnd`（`useDraggable.tsx:264`），而 web-core 按**命中路径**派发事件 —— touch 由浏览器做**隐式指针捕获**（滑出手柄后 move 仍归手柄），**鼠标没有**：光标一离开手柄就收不到 `mousemove`（实测收到 0 条），离开时产生的 `mouseleave` 直接把拖拽结束掉。修法（批76，纯 Web 宿主层）：新增 `web/drag-mouse-capture.js`，在 `pointerdown` 时对命中路径上的手柄元素 `setPointerCapture`（手柄判据是库渲染的 `ios-enable-simultaneous-touch`，`SortableItemArea` 是 `DraggableArea` 的再导出 ⇒ 四个面一条规则全盖），并拒绝手柄子树内的原生 `dragstart`（Web 上 `Icon` 是真实 `<img>`，实测被触发过）。**同 build A/B 实测**（CDP 屏蔽脚本 vs 加载，`scripts/verify-drag-mouse.mjs`）：曲库编辑器位移 **26px→26px（不跟手、顺序不变）** vs **26px→51px（跟手，且后端 `PUT /settings/library-browse` 换位）**；tab 顺序 **23px→46px** 且 `PUT /settings/tab-config` 落盘；首页网格 **42px→84px**。闸门 `web-drag-mouse-capture.test.ts` 7 条。根因与实现要点见 [pitfalls.md](pitfalls.md) §2「鼠标没有隐式指针捕获」，全量过程见 [progress.md](progress.md)「批76」

- [x] **松手后卡片继续跟着鼠标走（首页插件网格，2026-09-15 批76 用户反馈后实测复现）** — 症状：拖完松手，把光标移回那张卡片，它就继续跟着光标动（用户：「鼠标松开后为何图标还是跟着鼠标动」）。**与拖拽被掐断是同一处的第二个缺口**：`useDraggable` 的 `handleDragMove`（`useDraggable.tsx:204`）没有「正在拖拽」判断，只做 `cursor − touchStartPoint` 再写 transform，而锚点只有 `MTSResetInternalTranslateValues()` 会清 —— 全库唯一调用点是 `useSortable`（`useSortable.tsx:455`），所以排序面（曲库视图编辑 / 设置 tab 顺序 / 歌单）在一次排序结束后清掉了锚点，**`PluginGrid` 这个唯一直接挂 `DraggableRoot` 的面没有**，锚点一直留到节点消失；甚至只需按过一次（哪怕只是点击）就够。修法（批76，同属 Web 宿主层）：`buttons === 0` 的 `mousemove` 一律不派发进手柄子树（capture 相 `stopPropagation`；真拖拽的移动带 `buttons !== 0`，不受影响）。**同 build A/B 实测**：拖完松手后把光标移回该卡手柄做 4 次不按键移动，屏蔽脚本 **4px**（bug 在）vs 加载 **0px**；三处面的拖拽本身不受影响（曲库 26→51px、tab 23→46px、网格 42→84px）。闸门 `web-drag-mouse-capture.test.ts`（9 条，新增这条守卫 4 个变异全咬）。机制与量法见 [pitfalls.md](pitfalls.md) §2

## 代码审计发现（2026-09-01 · 9 条中 5 条已修，4 条仍开放）

> 完整快照已归档：[`../archive/2026-09-01-codebase-audit/`](../archive/2026-09-01-codebase-audit/)。原报告的「漂移状态：有效」与验数（18 failing / 185 契约）都已过期，**只把仍开放的条目迁到这里**，其余随审计归档。已修 5 条：AUD-001（`b08ae1a` Harmony 音量二次 `/100`）、AUD-004（`6c8c46b` 响应式测试门禁）、AUD-006（`54233ac` Harmony 视频假能力）、AUD-007 / AUD-008（`40e7cf9` Harmony DLNA 发现持久化 + `controlUrl`）。

- [ ] **AUD-002 · HarmonyOS 通知歌词设备验收待完成**（P2）— P6b 已接入队列元数据/AVSession 歌词 title/subtitle、清空/切源/暂停与串行更新；facade 按方法探测并安全降级。实际源码在 Node SDK 适配器下覆盖元数据、故障、毫秒命令、音量与销毁时序；iOS 保留旧单参数选择器并新增布局接口。Android 系统暂停定位遗漏进度已修复，`1cfe401` 新包通过通知两种布局、暂停定位/空行、锁屏控制、无歌词切歌、短时熄屏跨歌词与退出清理；另 7 组模拟器封面/时长回归通过，两种布局和空行保留封面，无封面歌曲清除旧图，锁屏封面也已观察；不能代替实体设备、长后台或厂商保活。HarmonyOS HAP 已编译，其媒体卡片与 Apple 编译/锁屏回归仍开放，证据见 progress。
- [ ] **AUD-003 · 全局删除歌曲失效的是一个不存在的查询键**（P2）— `src/shared/ui/SongRowOverlays.tsx:139` 失效 `['songs']`，而仓库里歌曲列表的真实 key 是 `['library','songs']` / `['playlist','songs']`，全仓没有任何 query 以裸 `['songs']` 建立 ⇒ **没有缓存被命中**。影响：后端已删歌，曲库/歌单/统计仍显示陈旧数据，直到发生无关 refetch。修法：按权威 key factory 同时失效 library / playlist / stats。**核查 2026-09-15：仍在，行号未变。**
- [ ] **AUD-005 · HarmonyOS 剪贴板系统验收待完成**（P2）— P6a 已用 Pasteboard 异步写入替换空实现，四端新增 `setClipboardWithResult`；TS 与 ProxySettingsPage/SongEditDialog 只在确认成功后提示，缺方法/拒绝/空回调/超时均失败。源码适配器覆盖成功/拒绝/同步异常，Chrome 已验流程的证据见 progress；HarmonyOS HAP 已编译，仍缺系统输入框粘贴验收，保持开放，不将源码检查当设备通过。
- [x] **AUD-009 · HarmonyOS 音频契约漏检**（P6b）— 音频接口方法、事件与七种状态已纳入 HarmonyOS；拒绝空方法的反例闸门和转译实际源码的毫秒/音量/命令参数测试已落地。EQ 明确禁用并验证消费点，保留其非支持占位。HAP 编译已通过，设备行为仍在 AUD-002 等条目验收，契约测试不作设备证明。

## 手动测试发现

- [ ] HarmonyOS/iOS 原生插件模板加载验收（2026-10-07 P6c 接线核查）— HarmonyOS 原 LynxView 没有 templateResourceFetcher，现补远程 RCP 下载器和注册，8 项实际源码 HTTP/TLS 适配器、真实 SDK clean HAP 编译通过。含接线与 `pluginFrame.templates.v1` 的 `1d86b77` 新 HAP 已完成 clean 编译和包校验，独立保存在 `/tmp/lynx-local-delivery/1d86b77/`，尚未签名/安装；根模板验签选择不变，原 `e09592b` 包未重写。HarmonyOS 设备 frame 加载/恢复及重定向行为尚未验证，不能套用 Android 160101 的设备结论；iOS 已补根/动态/新版模板入口与流式下载源码，Apple 核心验证程序已配置但未编译执行；iOS 编译与两端设备验收继续。证据见 progress。

- [x] Android 已安装 Lynx 插件空白（2026-10-07 P6c 实测）— `e09592b` 只设置根资源 provider，frame 报 160101，没有可用 lazy bundle fetcher。仅注册新版模板 fetcher 的 `f91d861` 仍失败，默认资源模式没有启用该接口；`9bfd35c` 补动态入口并复用同一限时/限额/TLS 下载器，保留根模板更新选择器和现有图片/字体路径。41 项 JVM、相关桥接回归、类型/双产物/APK 通过；真实上传的 SDK 插件在新 APK 中加载并完成初始、五次 HOME、切换/退出和重入验收。负例与新包身份见 progress；不据此闭合 iOS/HarmonyOS 模板加载或 MIoT 重连。

- [x] HarmonyOS 缓存/更新器 ArkTS 编译失败（2026-10-07）：5 处 catch 变量裸重抛违反 `arkts-limited-throw`。改为显式 `Error` 类型，保留原异常与清理/回退；15 项实际源码适配器、306 项原生契约和 clean release HAP 构建通过，包内版本/身份/生产 bundle 校验通过。SDK `26.0.0.105`，未签名及设备边界见 progress。

- [x] P3c Android 缓存索引列表误报加载失败（2026-10-07）：`org.json` 会把 key 内斜杠转义，JS 用重新序列化的字节比较后错误拒绝有效条目。改为逐字段校验并保留原生原始 key；实际 98 个本账号版本可枚举、断网播放所选音轨，增加转义/空白 JSON 回归。
- [x] 缓存队列播放完毕后点击播放没有重新开始（P3c）：结束时清除已加载源标记，下一次播放重新加载；reset 同步清除标记。缓存结束重播回归通过，Android 最终 APK 实测 `STOPPED / 35031ms` 后再次播放为 `PLAYING / 0ms`。
- [x] P3c 最大字号登录离线入口截断、说明挤掉缓存列表（2026-10-07）：入口改为可换行独立按钮，表单可滚动；缓存说明/搜索/清理操作改为虚拟列表页头，歌曲区域可滚动。最终 Android APK 中英 / 320、375、1024px / 最大字号登录与列表、列表滚动共六组实测通过；证据 `/tmp/lynx-p3c-device/matrix-*.png`。
- [x] P3c 原生会话清理依赖 `Promise.allSettled`（2026-10-07）：Android 真实重新登录在保存 token 后报 `not a function`；本机 PrimJS 不提供该方法。改为 `Promise.all` 加逐项 catch，新增缺失 API 反例；最终 APK 实际登录及退出后的 token/身份撤销、冷启动隐藏本地入口均通过，98 个完成缓存文件保留。

- [x] **插件源和更新弹窗按钮文字换行（2026-10-02，已修复并验证 Web）** — 卡片仅有 `max-width`、按钮等分且横向 padding 共 32px，Lynx 的文本可被继续压缩；源列表同一行还挤入开关与两个图标。统一明确宽度、单行标签及内容尺寸按钮，放不下时整颗按钮换行；源信息/操作分区、更新主操作独占一行。长内容使用独立受限滚动区，标题和按钮固定；全部直接弹窗复核，歌曲弹窗保留原有单行高度预算。中英、最大字号、320px 窄屏及宽屏浏览器验证通过；原生界面复验待补。

- [x] **`.increase-contrast` 的 accent 覆盖被内联基线压过**（批65 发现并当批修复）— **症状**：开关打开后 accent 实心填充仍是 `#0088ff`（应为 `#1e6ef4`），而同一次探针里 `--separator` 确实变成了 `#c6c6c8` ⇒ class 生效、坏的是优先级。**根因**：`ThemeProvider` 把 `PACK_OVERRIDABLE_BASELINE`（含 `--accent` / `--accent-content`）以 inline 自定义属性写在 `.theme-root` 上（无 pack 时也写——ReactLynx 的 style 对象只 merge 不删 key），inline 压过同元素的 class 规则，而这正是 `theme-pack-mapping.ts` 写明的刻意设计（「inline beats the class declarations… no `!important` anywhere」）。**修法（用户拍板方案 A）**：Apple 的可达 accent 并入内联通道（`CONTRAST_ACCENT`），在展开 baseline 之后、应用 pack 字段之前写入 ⇒ **主题包继续赢**（pack 是用户在设置里显式选的，无障碍开关不该悄悄改色），无 pack 时拿到 Apple accent；`tokens.css` 两块里的 `--accent` / `--accent-content` 删除（留着就是死规则），label / `--system-red` / `--separator` / 灰阶**没有**动——它们都不在 baseline 里，没人压得过。**不变式与闸门**：一个对比度 token 只许活在两条通道之一；`increase-contrast-wiring.test.ts` 断言键集不相交 + 开关打开时 `themePackToStyleVars` 真的输出 Apple accent + pack 仍赢（4 条变异全咬）。**iOS 实测（iPhone 17 Pro / iOS 26.5）**：`.theme-tile__check` 像素 ON `#1e6ef4` → OFF `#0088ff` → 再 ON `#1e6ef4`，开关轨道 `#34c759` ↔ `#ffffff` 同步；同一次 ON/OFF 全帧 diff 51023 px（1.61%）跨 22/53 条带。**未验**：Android / HarmonyOS、暗色主题、带主题包的设备取色（pack 赢目前只有单测）。通用教训见 [pitfalls.md](pitfalls.md)
- [x] 暗色下输入框提示文字看不清 — 补 `-x-placeholder-color`（批19）；后续查出全库 15 个文本字段有 6 处用 `--paper`/`--canvas` 当输入框底（对比度 1.04:1）、15 处圆角用错 token，统一为 `--neutral-faint` + `--radius-sm`，新增 `input-css.test.ts` 闸门从 TSX 反推字段清单
- [x] 切 tab 回曲库不记得子页签 — 会话记忆恢复
- [x] 安卓 CI 打包需 gh 配置密钥证书（参考 songloft-player 工程）
- [x] 通知栏缺下一曲/收藏按钮、封面角标图标错 — 补齐
- [x] 应用图标与名称非正式 songloft — 更换
- [x] 首页歌单/电台布局错、无法拖动 — 改为矩形卡片
- [x] 首页插件图标不显示 — 修复渲染
- [x] 全屏播放器关闭总回首页 — 改回上次 tab；mini player 条只在首页/曲库显示
- [x] 设置页多余的播放设置 — 移除
- [x] 首页统计改用 `/songs/stats` 接口数据
- [x] 外观跟随系统无效（恒深色）— 修复 SystemAppearance 链路
- [x] 语言跟随系统无效（恒英语）— 修复
- [x] SettingsPage/HomePage/HomeSection 首帧闪帧 + HomeSection Web 网格失效 — 同类隐患排查：shell 内各页面 `useBreakpoint(0)` 首帧窄屏、测量返回后跳宽屏 = 闪帧；HomeSection `useBreakpoint()` 无 selector 致 Web 网格永不可达。提取 `useShellSeededBreakpoint` 共享 hook 做种子，HomeSection 改收 `isWide` prop。细节见 [progress.md](progress.md)「布局稳定性全量修复」
- [x] 插件顶部标题改用插件 name 字段
- [x] 首页下拉刷新不触发（批20 发现，非本批引入；首页数据靠 query 缓存自动失效，未阻塞）
- [x] 底部导航插件 tab 图标硬编码 settings — `ShellLayout.tsx` 改用插件自身图标
- [x] 插件 WebView 内容空白（批20）— 修复
- [x] 歌单详情关闭应回首页 — 修复返回目标
- [x] 歌单/曲库封面改正方形（与首页一致）
- [x] 插件启用/禁用文案反了、全部更新无反应、刷新图标错、搜索框不能输入 — 批33 逐一修复
- [x] Tab 配置不及时生效 — 批33 变更后 invalidateQueries
- [x] iOS 主题/语言/图标核查 — 批33 审计确认 SystemAppearance 正确，补 AppIcon PNG
- [x] 日志导出改为直接下载 zip（批33），移除内联查看页
- [x] Web 首页残留「下拉刷新」文字 — 根因：`isWebEnvironment()` 探 `window`/`document`，在 web-core background Worker 里恒 false；且 Web 没有 `<refresh>` 实现。改按 `SystemInfo.platform` 判定并在 Web 整段不渲染；同根因顺带修了 Web 上的 `<webview>`
- [x] 代理设置输入框贴边、角被卡片圆角削掉 — padding 不对称 + `overflow: hidden` 圆角容器；改对称 padding。附带查出 3 处漏写 placeholder 色（补齐）、白名单单行 `<input>` 装不下多行改 `TextArea`（maxLength 140→2000）
- [x] GitHub 代理加「复制 Prompt 让 AI 帮你找」按钮 — 全库此前无剪贴板能力，新增 `SongloftPlatform.setClipboard` 三端（Kotlin/Swift 必须主线程；契约闸门自动逼出双端实现）；提示词刻意不做 i18n
- [x] `ProxySettingsPage` 裸 `fetch`+`useEffect` 导致 loading 闸在测试环境永不放行 — 迁到 api+query 层，补 2 条渲染测试
- [x] 删除插件无二次确认 / 从文件安装点击无反应 — 三个症状同根：①两段式确认对纯图标无效，改 `ConfirmDialog`（顺带收敛两份手写对话框 CSS）；②闪帧：`show` 直接由 `pendingDelete` 驱动，退出动画期间名字已清空，改状态分离；③安装 401：`getUploadUrl()` 返回裸相对路径且无凭据，改绝对地址 + `?access_token=`；④更深根因：Web 的 `nativeModulesMap` 塞普通对象被 `import()` 强转 `"[object Object]"` 拒绝，**三个自定义模块全部静默失效**，改注册 ESM URL 转发模块
- [x] 播放历史面板的列表行是白色实心、加入歌单面板是透明（用户报「一个白色，一个透明色」）— 两个面板材质逐字相同，差别全在行组件：`.song-row` 带 `background-color: var(--canvas)`（三份页面副本合并时带进来的，在页面上是空操作，因为页面根本来就是 `--canvas`），进了 `--glass-fill-strong` 面板就是逐行满幅不透明板，盖掉玻璃填充/sheen/ramp 与面板底下的 `<blur-view>`；同一条填充还盖掉 `.playlist-detail__song-row-wrapper--selected` 的整行选中高亮（画在行的祖先上，只在勾选框槽里露出来，暗色 #0f0f11 vs #17171b 明显）。修法：删掉该填充（行不是 surface）；新增从用法反推的玻璃面板遍历闸门，规则是「不透明填充只允许在自带 `border-radius` 的有界对象上」。复查确认播放列表面板（`.drawer__row`）无此问题（本批）
- [x] 设置页开关形式不统一（布尔值三种画法、带框勾六份互不相同的副本）— 定为三角色各一控件写进 `DESIGN.md`：开/关→Switch、单选→无框对勾、多选→新 `AppCheckbox`；删六份副本，产物小 6 KB
- [x] `var(--on-primary)` 不存在的 token 被 5 处使用，两处内容彻底不可见 — 正确是 `--primary-content`；新增 `tokens-defined.test.ts` 闸门（无 fallback 的 `var()` 必须有声明），当场又查出 6 处 Material 风格遗留命名
- [x] 曲库管理页最后两项入口与设置区不匹配（宽 32px/更紧凑/双线边框/无标题）— 手写裸卡片改 `SettingsSection`+`SettingsRow`
- [x] 扫描完成后拿不回「跳过/重新导入」选择 — `onResetScan` 直接发起扫描跳过 idle 态；对齐 Flutter：只 reset + 本地 `dismissed` 标记
- [x] 二级页面导航 tab 全不亮 — 移植丢了前缀匹配（`pathname === dest.path`）；按 Flutter 参考实现补 `navPathOwns`/`activeNavPath`，最长匹配优先，首页兜底
- [x] 白名单输入框 Web 上超出卡片（Web 独有）— `x-textarea.css` 的 `::part()` 不转发 `box-sizing`，内层 `content-box` 继承 `width:100%` 撑破；改 flex 定尺。⚠️ 同缺口 `border-radius` 也不转发，Web 多行字段是直角，未修
- [x] 设置页从二级页返回落回顶部 — 子页是兄弟路由，卸载即丢 `useRef` 滚动偏移；改模块级 `scroll-memory.ts` + `initial-scroll-offset`（查过三端 SDK 才选的这个属性，`scroll-top` 在两条 new-arch 路径不存在）
- [x] Web 刷新掉登录 — worker realm 无 `localStorage`，能力探测落到内存存储；新增 `idb-storage.ts`（worker 里 IndexedDB 原生可用，零宿主配合，`open` 带 3s 超时防 version-change 挂死）
- [x] 日志导出缺客户端日志 / 日志等级设置缺标题 — 对齐 Flutter 补齐
- [x] 速度/播放模式弹出层能同时开两个（批51）— `PopoverBackdrop` 有 `100vw×100vh` 却没 `top`/`left`，fixed 元素落在静态位置没盖住触发器外侧；补 `top:0;left:0`
- [x] 音频质量分段控件小屏文字超框（Issue #8）— `.segmented__label` 的 `white-space: nowrap` 逼长标签（`原始（无损）`/`高（320 kbps）`）单行，而每段只 `flex:1`（≈¼ 宽），窄屏放不下就横向溢出胶囊；删 nowrap 让其段内换行 + `line-height:1.25`，四段仍等宽、选中态不变。已过 playback-page vitest + `tsc -b`
- [x] 音乐库从重复检测页返回丢失滚动位置（Issue #8）— 上文「设置页从二级页返回落回顶部」只修了 `SettingsPage` 主列表，子页壳 `SubPageShell` 的 `<scroll-view>` 没接 `scroll-memory`；进入 `/settings/duplicates`（窄屏路由 / 宽屏 pane 切换）都会卸载 `LibraryOpsPage`，返回重挂载即回顶。给 `SubPageShell` 加可选 `scrollMemoryKey`（无条件调 `useScrollMemory`，仅在传 key 时挂 `initial-scroll-offset`/`bindscroll`），`LibraryOpsPage` 传 `'library-ops'`。已过 sub-page-shell + library-ops vitest + `tsc -b`
- [x] 歌单创建方式选项常驻展开（Issue #8）— `ScanSettingsSection` 里「扫描间隔」是折叠交互（`showIntervals` + `chevron-up/down` + 点头部切换），但「歌单创建方式」头部行不可点、选项只要 autoCreate 开就全铺出；对齐扫描间隔：加 `showPlaylistModes` 状态 + 头部行 `trailingIcon`/`onTap`，选项条件由 `autoCreateOn` 改 `autoCreateOn && showPlaylistModes`（`disabled` 时 `SettingsRow` 已忽略 onTap）。同步改 library-ops 测试为先点头部再断言选项。已过 vitest + `tsc -b`
- [x] 弹出层点完约 1 秒才消失（批51，非卡顿）— CSS 没声明任何 transition，`Presence` 等不到 `transitionend`，退化成 24 帧空转（BTS 背景线程每帧一次往返）；补 `transition: opacity 140ms` + closed 态 `opacity:0`。同批修了自己引入的回归：受控模式漏传 `onVisibleChange` 导致弹层根本打不开。铁律见 `AGENTS.md` §3.3「Popover / Presence」
- [x] 全屏播放器封面 Android 整块不显示 — `box-shadow` 加在 `<image>` 上导致位图不渲染（元素占位画背景色）；阴影挪到外层 `<view>`。这类失效只有真机可见
- [x] 全屏播放器 Web 宽度恒 0、歌词页不可达 — `useBreakpoint()` 漏传 `measureSelector`（Web 的 `bindlayoutchange` 只对首屏元素触发）；新增全库闸门 `measure-selector-contract.test.ts`
- [x] 「打开后自动进歌词」偏好从未生效 — mount 时 Swiper 还没挂载，`swipeTo` 静默丢弃；改等「偏好读到 + Swiper 挂载」两者齐备
- [x] 全屏横屏封面上溢 — 高度预算错把整页高度喂给 Flutter 公式；改测 stage 自身高度
- [x] 全屏封面 Android 非正方形（letterbox）— **无法复现关闭**：模拟器多路径实测全程 405×405，原设备不可用。若真机再现请重开并记录设备型号/分辨率/密度
- [x] 播放器 logcat 两条 `illegal css key:237` — **上游 bug，无害**：`lynx-ui-swiper` SwiperItem 用 camelCase `marginInlineEnd` 调 kebab-case 解析器，名称未命中落到表尾+1=237；被丢的是默认值 `margin-inline-end: 0px`。已记 upstream-issues
- [x] 播放历史页面报错（批50）— 三处独立错：前端把 context 放 JSON body 而后端从 query 读且必须 `type=play` 才落库 ⇒ **写入从来没成功过**；「设置→播放历史」入口拿不到上下文（后端按播放上下文分桶、无全局最近播放端点）⇒ 不可能修好，移除入口。详见 progress.md 批50
- [x] 曲库设计问题、自定义显示分类无效（批51-A~D）— 探查证实该功能**从未生效过**：PUT 契约是 `{views:[{key,visible}]}` 而旧实现发 `{id,visible,order}` ⇒ 恒 400 被 `.catch(()=>{})` 吞掉；`KNOWN_VIEWS` 自创 4 个假 id、丢 4 个真的。曲库重写为对齐 Flutter 的单页 14 视图
- [x] 弹出层位置错乱（批53）— `lynx-ui-popover` 返回**相对触发器**坐标而 `OverlayView` 用 `position:absolute` 施加（含块是最近定位祖先），实测排序菜单落在 `x=-122` 整块屏外；库的溢出检测还拿浏览器屏幕尺寸当视口。自研 `PopoverMenu`/`PopoverPanel` + `anchored-overlay.ts` 退役该库，铁律见 `AGENTS.md` §3.3
- [x] 插件商店缺「重新安装最新版本」（批57）— 对照 Flutter 盘点挖出模型级 bug：schema 把 `conflict` 建模为 string 而后端发 boolean ⇒ 撞名冲突流程一直是死的。行动作补齐四态
- [x] 禁用插件后 tab 图标还显示（批57b）— tab-config 不过滤 `isActive` + mutation invalidate 的 query key 与 shell-nav 的 key 对不上（staleTime 60s 永不刷新）
- [x] 底部导航选中态整块紫底反白观感差（批58）— 按 Liquid Glass 重做为悬浮胶囊 + 淡色 tint；用户随即报内容被 mini player 挡住 ⇒ 新增 `--nav-inset` 两档变量（无歌 80/有歌 148），见 `AGENTS.md` §3.4
- [x] 宽屏 rail 选中跳动（批58b）— 批58 的固定尺寸规则没限作用域，选中 52px 撑高 ~40px 的行；收进 `.shell__bottombar` 作用域，rail 选中只变色
- [x] 编辑弹窗保存按钮无强调、标题溢出（批60b）— 无主题包时 `--primary` 回退墨色使描边按钮黑边黑字，改实心填充；`max-height:85%` 在 fixed 弹层下原生引擎不可靠，改 `85vh`
- [x] 编辑弹窗标题被「挡住」（批60c，实为 flex 压扁）— 高度钳制下 flex 把溢出摊给所有 shrink 非零子项，标题行被压到 13.4px 且 Lynx 元素自带 `overflow:clip` 裁掉文字上半；固定 chrome 加 `flex-shrink:0`。判据：`getComputedStyle().height` vs `scrollHeight`，见 `AGENTS.md` §3.3
- [x] 底部滑入面板 Android 只剩标题行 — `absolute` 无 `height` ⇒ shrink-to-fit，而 body `flex-basis:0` 对内容高度贡献 0 ⇒ 塌成 chrome 高；`max-height` 只给上限不给高度。播放历史改 `height:70%`，其余 body 改 `auto` basis；闸门 `bottom-sheet-height.test.ts`
- [x] ⋯ 菜单与宽屏行内按钮重复（批62）— 按打开行的视口裁剪菜单（窄屏菜单是唯一入口不能无条件删）；顺带修 `PlayHistoryPanel` 行漏传 `showDeleteAction={false}`
- [x] 曲库视图配置保存报 400 `非法的视图 key: tag`（2026-09-01）— 根因：前端 `LIBRARY_VIEW_KEYS`（Lynx）/`defaultOrder`（Flutter）含 `'tag'`，解析器/`ensureAllViews` 会把 tag 补齐随 PUT 发回后端；但后端 `libraryViewKeys` 白名单（`library_browse_setting.go`）**不含 tag** ⇒ `isValidLibraryViewKey("tag")==false` ⇒ 400，曲库视图配置保存即失败。Lynx 的 tag 视图还走通用 facet `GET /songs/facets?field=tag`，后端 `songFacetFields` 也不认 ⇒ 再吃一个 400；Flutter 的 tag 视图特化走 `/song-tags`（自定义标签 CRUD，本就可用），故 Flutter 仅中 PUT 400、视图本身不坏。修法（方案 B，后端实现 tag facet）：后端 `libraryViewKeys`/`songFacetFields` 加 tag、`IsSongFacetField` 认 tag、`ListFacet`/`CountFacet` 加 tag join 分支（song_tags↔song_tag_links↔songs、`COUNT(DISTINCT song_id)`）；Lynx/Flutter 仅订正过时注释（代码已含 tag）。真后端 live 验证 PUT 带 tag 200、`field=tag` 200、bogus 仍 400。详见 `progress.md` tag 对齐条目
- [x] 玻璃上的选中/当前行是一块实心板（2026-09-03）— `.drawer__row--active` / `.popover-menu__item--selected` 用不透明 `--neutral-faint` 满幅上色，把刚做成真模糊的玻璃在那一行**换成**实心浅灰（HIG 的选中态是在材质**上**加一层薄色，不是换材质）；改用 accent wash `--primary-faint`。同批新增中性通道 `--fill-faint` 收走插件弹窗 6 处内嵌块与 mini-player 进度槽（后者此前拿**分隔线**令牌 `--line` 当背景，且没有圆角）。闸门盲区见 [pitfalls.md](pitfalls.md) §5
- [x] 多选高亮画出来了但看不见（2026-09-03）— `.playlist-detail__song-row-wrapper--selected` / `.library-page__song-row-wrapper--selected` 用 `--paper` 坐在 `--canvas` 上，对比度 **1.04（light）/ 1.07（dark）**；上批修掉 `.song-row` 的行填充后，症状从「被行盖住」变成「压根看不出」。改 `--primary-faint`（1.11–1.41），并给 `contrast.test.ts` 加一条 wash **可见度下限** 1.08（WCAG 不管填充对表面）
- [x] 暗色下被 wash 的行三级文字不过 AA（2026-09-03，随上两条一起付）— wash 在暗色是**提亮**表面，`--content-muted` 从 5.42 掉到 3.86（玻璃）/ 4.14（页面）。修法不是放宽门槛或开豁免，而是把被 wash 行的副标题/时长/艺术家抬到 `--content-2`（新增 `SongRow` 的 `isSelected` prop——wash 仍画在祖先上，因为它得盖住勾选框那一列），并把 light `--content-2` 加深 `#6b6b74`→`#67676f`（5.43，改善 light 下每一处用到它的文字）
- [x] 两条中文界面文案被打碎成 U+FFFD（2026-09-03，用户 `rg` 发现）— `src/i18n/resources.ts` 的 `removeSongMessage`（「从歌单移除歌曲」确认弹窗正文）与 `unpinnedToast`（取消置顶 toast）里有替换字符，屏幕上是「确定从该歌单移◆◆这首歌◆◆◆？」/「歌单已◆◆消置顶」。根因是编辑工具切坏了多字节序列；U+FFFD **本身是合法 UTF-8**，所以 `tsc` 过、打包过、直接上线。**已上线两次**：`1f02383` 曾专门清过一轮，`580e002`（HIG 阶段2）重新引入 1 行、`4868733`（HIG 阶段11）变成 2 行。`i18n.test.ts` 抓不到，因为它断言的是「键集一致」和「叶子是非空字符串」——被打碎的串仍然非空，乱码也从不碰键名。修法：按 `023fcc7`（最后一份干净版本）恢复原文，并新增字节层闸门 `src/__tests__/source-encoding.test.ts`（`src`/`web`/`scripts`/`e2e` + 根目录规则文档全扫：不许 U+FFFD、不许有解不出 UTF-8 的字节、扫描非空、缺陷形状自检）。
- [x] 徽标文字在 accent wash 上不过 AA（2026-09-03，上一批漏掉的同类）— `.media-list-item__badge` 与 `.playlist-card__chip` 是 `--primary-faint` 底 + `--content-muted` 字，还是全应用最小号 `--font-2xs`：暗色实测 4.14（页面）/ 3.74（玻璃）。上一批已经立了「被 wash 的文字抬到 `--content-2`」这条规则，但只落在**行**上，这两处不是行所以漏了；上批闸门的注释还写着「已经没有被 wash 的行用 `--content-muted` 了」——散文式白名单。两处都抬到 `--content-2`（暗 5.43/4.90，亮 4.74），并把那句注释换成一条正交的网：扫全部业务样式表，背景是 wash 通道且自身 `color` 是 `--content-muted` 的规则一律红。

## 代码审计发现（2026-08-14 · 27 条已全部修完）

> 四路并行审计产出。P0 批41/43 修完，P1 批42，P2 批43/45/47/48。

### P0 — 让某个平台整体不可用

- [x] `pnpm run build` 不再产出原生 bundle（批41）— `lynx.config.ts` 的 `environments: {web:…}` **替换**了 rspeedy 默认环境，Android/iOS 一直打陈旧产物；补 `lynx: {}` + 产物新鲜度断言脚本
- [x] iOS 自批39 起无法构建（批41）— `project.pbxproj` Sources 数组内多了一行赋值语句；契约闸门的 `toContain` 恰好被子串满足而全绿，补结构校验
- [x] `build:web` 产物黑屏（批41，两层根因）— ①引用文件名与产物不符；②入口是 ES module 却无 `type="module"`，`import.meta` 异常不进 `console.error` 只走 `pageerror`。补 `web-host-page.test.ts`
- [x] Web 完全没声音且表现一切正常（批43）— `typeof HTMLAudioElement !== 'undefined'` 在 background Worker 里恒 false，落到会走完整进度的静音 mock；主线程 API 无法从 worker 直调，改宿主桥接注册 `NativeModules.SongloftAudio`
- [x] embedded 模式 Web 无宿主页（批43）— 拷贝脚本的 `!isEmbedded` 守卫；移除并清掉烤进去的 9 MB canvaskit
- [x] Web 硬编码 `localhost:58091`（批43）— 改 `self.location.origin` 自动检测 + deployMode 自动 embedded

### P1 — 一眼可见（批42 全修）

- [x] 登出确认框取消按钮字面显示 `common.cancel` — 补 key + 新增全库 `t('…')` key 存在性闸门
- [x] 播放进度从不落盘、续播永远从 0 — 阈值 `>5000ms` 在 250/500ms 步长下永不成立；改 10s 桶
- [x] DLNA 页 Android 真机进去就崩 — 按 Kotlin/Swift 真实契约重写 promisify，禁 `as DlnaModule` 强转
- [x] 切服务器立刻被踢回登录并抹掉目标 token — 新增 `invalidateTokenCaches()`
- [x] 冷启动后 mini player 播放键无效 — 补 `_loadedSongId` 跟踪，不一致时补 load
- [x] 元数据「再次刷新」不开始轮询 — forced 优先于终态 + `dataUpdatedAt >= startedAt` 守卫
- [x] `getPlatformCapabilities()` 死代码 — 改 `isWebPlatform()`，接上三个消费点
- [x] HTTP 请求无任何超时 — `timeoutMs` + AbortController + `HttpTimeoutError`
- [x] 收藏歌单 ID 拉取可能死循环刷请求 — 空页即停 + 200 页兜底
- [x] 升级轮询后端重启后永不停止 — 容忍 15 次失败落终态
- [x] 多选状态跨搜索/筛选残留（会把不存在的歌加进歌单）— selected 与 filters 联动
- [x] 队列重复歌曲拖动排序钉错「当前播放」— `indexOf` 按对象身份改纯下标
- [x] iOS Live Activity 重复 start 泄漏锁屏卡片 — in-flight 标记 + 空 id 闭锁（JS 侧）

### P2 — 结构性

- [x] 每个 feature 各建一套 `TokenStore`+`AuthInterceptor`（6 份）（批43）— 换账号后曲库带别人 token、多 bundle 互刷 refresh；改 `getSharedApiBundle()` 进程级单例
- [x] 悬浮歌词（Android）五重死（批43 修三：无 `@LynxMethod`、未注册、签名不符；批48 修二：见下）— ⚠️ 批43 误记「权限与 service 声明此前已有」活了四个批次，原因是 manifest 无闸门
- [x] Live Activity（iOS）是普通 enum 不是 Lynx 模块（批43）— enum→class + @objc/name/methodLookup + 注册
- [x] 契约闸门不覆盖批35+ 的 4 个模块、不验证「注册」（批43）— +30 例，覆盖 6 模块双端
- [x] `setInsecureTls`/`setArtworkUri` 只有 Android、且 Android 侧半残（批45）— `setArtworkUri` iOS 存了从不读 ⇒ 锁屏永远无封面；Android trust-all 装在 `HttpsURLConnection` 而 fetch 走 OkHttp 完全无视 ⇒ 功能唯一用途失效。两侧替换宿主 HTTP service 收口，双向可逆
- [x] iOS 自签名媒体流不通（批47 实测通过）— `InsecureMediaLoader` 自定义 scheme 拦截 + 放宽信任的 session 拉字节范围。两个坑：回调队列挂 `.main` 会自己锁死自己（卡 10s 后 -11800）；一次性收数据会把整条音轨读进内存且 seek 失效，改流式
- [x] `setInsecureTls` 关闭不影响已建连接（批47）— 值变化时 `invalidateAndCancel()` 重建 session；Android 本来就是重建 OkHttpClient 即时生效，两端语义对齐

### 批48 · 悬浮歌词第四、第五重死

- [x] manifest 缺 `SYSTEM_ALERT_WINDOW` 与 `FloatingLyricService` 声明 — 两者都是静默失败（`startService` 解析不到只打日志不抛异常；权限缺失使 app 不出现在授权列表），功能自始至终没工作过
- [x] `updateText` 在 Lynx JS 线程碰 View，`CalledFromWrongThreadException` 被裸 `catch` 吞掉 — 窗口浮出但无歌词；定位靠 `mLayoutSeq` 逐字节比对。改 `Handler(Looper.getMainLooper())` post；顺带给覆盖层加深色底（白字无背景在浅色应用上不可见）
- [x] `AndroidManifest.xml` 完全无闸门 — 新增 7 例，从 Kotlin 源码推导需求（Service 声明/覆盖窗权限/foregroundServiceType 配套权限/configChanges），六条反向验证过
- [x] 悬浮歌词零 e2e 覆盖 — 新增 5 例，断言全落在进程外 `dumpsys` 上（三重死没有一次能让页面侧看到错误）。⚠️ 平台门控要写 `(process.env.E2E_PLATFORM ?? 'android')`，裸 `===` 会让整套被静默跳过

### 悬浮歌词第六重死（2026-08-28 真机报障）

- [x] 首次授权返回后开关是开的但无窗口，需关再开 — `requestPermission` 把异步授权当同步用：`startActivity` 后紧接着就答 `false`。新增 `OverlayPermission.kt` 把待答请求停在授权返回时（`onResume` 重读 + 重试）。顺带修同源两条：启动链误调 `requestPermission` 会把用户弹去系统页（改只读 `hasPermission`）；pref 与系统授权两个真相源（进页以授权为准回写）
- [x] 未授权 `show()` 直接杀进程 — `addView` 抛在 `onStartCommand` 等于 FATAL；用户可随时撤销授权且 `START_STICKY` 会重发。先查授权 + try/catch 兜 ROM 说谎
- [x] e2e `serviceRunning()` 把尸体读成活服务 — `dumpsys` 的 `Destroying services` 段能挂到重启；只读 `active services` 段

### 批49 途中发现

- [x] HLS 电台落到 `ProgressiveMediaSource` — `songUrl()` 追加 `?access_token` 使 `endsWith(".m3u8")` 失效 + 电台走 `hls: false` 的 fallback 分支；新增 `isHlsPlaylistPath()`（剥 query 看扩展名）一处修好 Android 与 Web。⚠️ 不能对电台一律传 true：后端只对真播放列表加 `.m3u8` 后缀
- [x] HLS 电台仍无声的第二个原因：跨协议重定向被拒 — `hls_proxy` 关闭时后端 302→https，`DefaultHttpDataSource` 默认拒绝 http→https，报完全不指向真因的 `Response code: 302`；`setAllowCrossProtocolRedirects(true)`。连带：300s 读超时改按 `/video-hls/` 路径判定，避免直播流死等五分钟。⚠️ iOS 侧未实测

### 其他定性

- [x] 本地歌曲封面 404 — **查明是预期行为，非缺陷**：DB 里 `cover_path`/`cover_url` 本就为空（合成音频无封面），按需刮削搜不到返 404 正常。留档教训：观察与因果要分开记
- [x] Swiper `itemHeight='auto'` 被插值成 `"autopx"` — **上游良性怪癖**：`'auto'` 就是默认值，非法值被整条丢弃恰好落回 `auto` 行为，不该改。记 upstream-issues Issue 4
- [x] `-x-placeholder-color` Web 空转 — 浏览器丢弃未知属性，web-elements 占位符走 `::part` 自带默认 `grey`；CDP 否掉三条直觉修法后 patch web-core 打包产物默认值改 `var(--content-muted,grey)`，一处生效全库
- [x] 构建警告「归零」说法过期 — 现剩 3 类已知警告（`-webkit-box-orient`/`-webkit-line-clamp` 跨平台双写，有注释说明）；「归零」退役为「警告应只剩已知 3 类」。教训：没有闸门读的文档断言不会自己保持为真
- [x] `.song-row` 三份互相冲突的副本 — 同特异性靠源码顺序决定谁赢；提取 `SongRow.css` 删三份，闸门断言他处不得定义 `.song-row*`
- [x] `savePlaybackState` 4 个位置参数违反 API 约定 — 改对象参数，实际只有 6 处改动。教训：「churn 大」拖着不改，往往因为没真数过
- [x] 偶发全屏灰层 — **无法复现关闭**（仅批29 一次偶发）。若再出现：先 `adb logcat | grep -i "\[Sheet\] Invalid state transition"` 再重开

## iOS e2e 首次运行发现（2026-08-15 · 批46 全部修完）

> iOS 首次真编译、e2e 首次跑模拟器。首跑 104/110，修完 iOS 110/110、Android 107/110（3 例平台门控跳过）。

### 音频引擎语义差异

- [x] `playing` 到达时 `durationMs` 仍为 0 — 首跑归因（「提早发 progress」）被实测推翻：`.readyToPlay` 时 AVPlayer 时长本就是 `indefinite`。真根因在 JS：progress 处理**无条件**用 0 覆盖已知时长（两宿主都把未知归一为 0）；`playAtIndex` 还从不写 duration ⇒ 切歌沿用上一首时长。改用服务端元数据播种 + `>0` 才覆盖
- [x] 0.5 倍速 1s 内进度推进为 0 — 首跑归因被推翻：`addPeriodicTimeObserver` 间隔按**媒体时间**计，0.5x 下墙钟间隔 1s，测试窗口结构性 flaky、播放本身正常。改按 `interval × speed` 安装并在变速时重装。教训：推测性改动在根因查明后应回退
- [x] 坏 URL 后 state 停在 `loading` — AVPlayer 失败后仍发 `timeControlStatus` 转换，把刚落定的 error 盖掉；`itemFailed` 标记阻断

### appearance 测试读错对象（3 条，测试侧）

- [x] theme 读到 `'unknown'` — eval 跑在 BTS realm，`lynx.__globalProps` 是主线程 Lepus realm 的全局；改经 `e2e-bridge` 的 `__E2E_APPEARANCE__`。附带教训：只断言 `getSystemAppearance()` 会测空气（模拟器持久化了用户覆盖主题），测试须自建前提（`changeAppTheme('system')`）并断言**解析后**的主题
