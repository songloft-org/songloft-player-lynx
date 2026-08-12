# Songloft Player：Flutter → Lynx 能力对照矩阵

> **⚠️ 文档性质：预研阶段参考**
> 本文档产出于迁移启动前。核心能力（音频/存储/网络/鉴权/UI 组件）已在 Android + iOS 实现并验证。剩余未实现项：桌面端(Lynxtron)、DLNA、Live Activity、悬浮歌词。当前实际状态见 [README.md](./README.md)。

> 本文档为迁移调研第 2 篇。逐项列出现有 Flutter 实现 → Lynx 侧方案 → 平台可用性 → 工作量档位 → 风险等级。总览见 [lynx_migration_overview.md](./lynx_migration_overview.md)，自研原生能力接口草案见 [lynx_native_modules_spec.md](./lynx_native_modules_spec.md)，路线见 [lynx_migration_roadmap.md](./lynx_migration_roadmap.md)。
>
> **图例**：工作量档位 S（<1 周）/ M（1–3 周）/ L（3–8 周）/ XL（>8 周，含跨端）；风险 🟢 低 / 🟡 中 / 🔴 高。平台缩写：A=Android, I=iOS, W=Web, M=macOS, Win=Windows（均指 Lynx 目标端；Linux 不迁移）。
>
> **确定性标注**（详见 [overview](./lynx_migration_overview.md) 头部）：`✅代码`=源码实测 / `✅官方`=官方文档（标 stable/canary）/ `⚠️待核实`=实施前须确认 / `💭`=假设。工作量与风险档位为**经验估计（💭）**，非承诺。Lynxtron 结论出自官方 `/next/`（canary），API 以 canary 为准。
>
> ⚠️ **重要提醒**：下表所有「现有实现」的文件路径/依赖均为 `✅代码`（已核实 `songloft-player/` 只读参考）；「Lynx 侧方案」除标 `✅官方` 者外，多为**方案设想**，具体 API 与可行性以实施时官方文档为准。

---

## 1. 音频链路（迁移最大单点工作量）

**现有实现**（`lib/core/audio/`，共 20 文件，已核实）：

- 依赖：`just_audio` ^0.10.5 + `audio_service` ^0.18.17 + `just_audio_media_kit` ^2.0.0（libmpv，Windows/Linux 后端）+ `audio_session` ^0.2.3 + `smtc_windows` ^1.1.0 + `audio_service_mpris` ^0.2.1（Linux）+ `volume_controller` ^2.0.7 + `media_kit`（EQ 直接访问 NativePlayer 设 mpv 音频滤镜）。
- 关键文件：`audio_service.dart`、`audio_backend.dart`、`songloft_mediakit_player.dart`（桌面 libmpv）、`songloft_web_audio_player.dart`（Web）、`songloft_just_audio_platform.dart`、`equalizer_service*.dart`（8 文件，含 native/web/mpv 工厂）、`smtc_service*.dart`、`system_volume_provider.dart`、`media_browse_data_source.dart`、`video_controller_provider.dart`。

**Lynx 侧事实**：Lynx **无任何内置音频能力**（无 audio 元素、无媒体 API）`⚠️待核实`（此结论早期依据官方 issue `lynx-family/lynx#250`，issue 编号与结论需按当前官方状态复核；但「Lynx 无内置音频」这一大方向可信度高）。全部音频须自研 `SongloftAudio` 原生模块（接口见 [lynx_native_modules_spec.md](./lynx_native_modules_spec.md#1-songloftaudio)）。

| 能力 | 现有实现 | Lynx 侧方案 | 平台 | 档位 | 风险 |
|---|---|---|---|---|---|
| 基础播放（load/play/pause/seek/volume/speed） | `just_audio` | `SongloftAudio` 原生模块 | 全端 | XL | 🔴 |
| 网络流 + HLS | `just_audio` + hls（Web `web/hls.min.js`） | A: ExoPlayer；I: AVPlayer；W: HTMLAudioElement + hls.js（复用 `web/hls_bridge.js`）；M/Win: libmpv 或 AVFoundation/Media Foundation | 全端 | L | 🔴 |
| 后台播放 + 通知栏/锁屏控制 | `audio_service` | A: MediaSessionService + 前台服务；I: MPNowPlayingInfoCenter + MPRemoteCommandCenter + AVAudioSession；W: MediaSession API；桌面: 系统媒体控件 | 全端 | L | 🔴 |
| Windows 系统媒体控件（SMTC） | `smtc_windows`（`smtc_service_native.dart`） | Win: SystemMediaTransportControls（Lynxtron 主进程 Node 原生模块或 Lynx 原生能力库） | Win | M | 🟡 |
| 均衡器（10 段 31Hz–16kHz） | `equalizer_service*.dart` + `media_kit` NativePlayer + `web/equalizer.js` | A: `Equalizer`(AudioEffect)；I: AVAudioUnitEQ；W: Web Audio BiquadFilter（复用 `web/equalizer.js` 参数）；桌面: libmpv af 或原生 EQ | 全端 | L | 🟡 |
| 系统音量 | `volume_controller`（`system_volume_provider.dart`） | 并入 `SongloftAudio` 或平台模块 | 全端 | S | 🟢 |
| 媒体浏览数据源（车机/系统媒体库） | `media_browse_data_source.dart` | A: MediaBrowserService；I: MPRemoteCommand | A/I | M | 🟡 |
| 视频渲染（`media_kit_video`） | `video_controller_provider.dart` | 需评估 Lynx 视频元素或原生视图注册 | 全端 | M | 🟡 |

> Linux 专属的 `audio_service_mpris`（`equalizer_service_mpv.dart`）不迁移。

---

## 2. 原生通道逐条映射

**现有通道（已核实，`grep MethodChannel/常量`）：**

| 现有通道 | 用途 | 迁移后 | 档位 | 风险 |
|---|---|---|---|---|
| `com.songloft/contract` | Dart 契约哈希闸（热更合规） | **消失**（Lynx bundle 原生热更，见 overview §6） | — | 🟢 |
| `com.songloft/backend` | 内嵌 Go 后端生命周期 | **保留**，改为 `SongloftBackend` 原生模块 | L | 🟡 |
| `com.songloft.playback` | 播放控制通道 | 并入 `SongloftAudio` | L | 🔴 |
| `com.songloft/floating_lyric` | Android 悬浮歌词 overlay | `SongloftPlatform.floatingLyric`（A） | M | 🟡 |
| `com.songloft.songloftFlutter/liveActivity` | iOS Live Activity | `SongloftPlatform.liveActivity`（I） | M | 🟡 |
| `com.songloft/widget_action` | home widget 动作 | `SongloftPlatform.widget`（A/I） | M | 🟡 |
| `songloft.desktop_lyric` | 桌面多窗口歌词 IPC | 桌面: 多个 `LynxWindow` + `lynxBridge`（Lynxtron）；见 §3 | M | 🟡 |

模块接口草案见 [lynx_native_modules_spec.md](./lynx_native_modules_spec.md)。

---

## 3. 平台特性

| 特性 | 现有实现 | Lynx 侧方案 | 平台 | 档位 | 风险 |
|---|---|---|---|---|---|
| iOS Live Activity | `com.songloft.songloftFlutter/liveActivity` | Swift ActivityKit + 原生模块桥接 | I | M | 🟡 |
| Android 悬浮歌词 overlay | `com.songloft/floating_lyric`、`android_floating_lyric_controller.dart` | Kotlin WindowManager overlay + `SYSTEM_ALERT_WINDOW` 权限 + 原生模块 | A | M | 🟡 |
| 桌面小组件 | home widget 通道 | A/I: 原生 widget；桌面: 评估 Lynxtron 托盘/迷你窗替代 | A/I/M/Win | M | 🟡 |
| 系统托盘 / 窗口管理 / 单实例 | 桌面 Flutter | **Lynxtron 原生**：`Tray` / `LynxWindow` / `Menu`；单实例走 Node 主进程锁（`app.requestSingleInstanceLock` 等价） | M/Win | S | 🟢 |
| 桌面多窗口歌词 | `songloft.desktop_lyric`（`desktop_lyric_ipc.dart`、`desktop_lyric_main.dart`、`desktop_lyric_controller.dart`、`desktop_lyric_font_size.dart`） | **Lynxtron**：独立 `LynxWindow` 承载歌词窗，主进程 `lynxBridge` + `sendGlobalEvent` 做窗口间 IPC（对偶现有多窗口 IPC 模型） | M/Win | M | 🟡 |
| DLNA 投屏 | `dlna_dart` ^0.1.1（`lib/features/dlna/` 715 行） | SSDP + SOAP 控制点：移动端原生模块或纯 TS（Web 受限）；桌面走 Node 主进程 | A/I/M/Win（W 受限） | L | 🟡 |
| 权限申请 | Flutter 权限插件 | A/I: 原生模块；桌面: Lynxtron/OS API | A/I | M | 🟡 |

> **桌面侧净收益**：托盘/窗口/多窗口/通知/对话框由 Lynxtron 的 Electron 风格 API 原生提供，工作量档位低（🟢/S），是相对 Flutter 桌面的确定性简化点。

---

## 4. 基础设施

| 能力 | 现有实现 | Lynx 侧方案 | 平台 | 档位 | 风险 |
|---|---|---|---|---|---|
| HTTP 客户端 | `dio` ^5.7.0（`lib/core/network/api_client.dart`） | 移动端 Native `fetch`；**桌面: Lynxtron 主进程 Node.js 网络能力**（代理/自签证书在 Node 侧实现，**无需自实现 HTTP service**） | 全端 | M | 🟡 |
| JWT 双 Token 拦截器 | `auth_interceptor.dart` | TanStack Query + fetch 拦截层重写（access/refresh 刷新队列） | 全端 | M | 🟡 |
| 代理 / 自签证书 / 重定向 | `dio_insecure.dart`、`insecure_media_proxy.dart`、`insecure_tls_provider.dart`、`github_proxy_fallback.dart`、`server_redirect_resolver.dart`、`server_probe.dart` | 移动端: 原生模块暴露 TLS 放宽/代理；**桌面: Node.js（`https.Agent` / `undici` 等）在主进程实现**；Web: 受浏览器安全模型限制，部分能力不可行（待决） | 全端（W 受限） | L | 🟡 |
| 偏好设置 | `shared_preferences` ^2.3.4（`app_preferences.dart`） | `SongloftStorage.prefs`（自研原生模块；Web 用 localStorage） | 全端 | M | 🟡 |
| 安全存储 | `secure_storage.dart`（自研，非 flutter_secure_storage） | `SongloftStorage.secure`：I/M Keychain、A Keystore、Win DPAPI/Credential Locker | 全端 | M | 🟡 |
| 应用目录路径 | `path_provider` ^2.1.0 | `SongloftStorage.paths`（桌面直接用 Node `app.getPath()`） | 全端 | S | 🟢 |
| 图片加载/缓存 | `cached_network_image` ^3.4.1 | `<image>`：`mode` 拟合（scaleToFill/aspectFit/aspectFill/center）+ `placeholder` + `prefetch-width/height`（iOS/Android，Harmony 无）`✅官方`；装饰性背景用 `<view>` 的 CSS `background-image` | 全端 | M | 🟡 |
| 封面取色 | `palette_generator` ^0.3.3 | 原生模块取色 或 TS 像素采样（需 Lynx 取像素能力，待核实） | 全端 | M | 🟡 |
| SVG | `flutter_svg` ^2.3.0 | `<svg>`（**限制：覆盖 17 个 SVG 标签 + 40+ 属性** `✅官方`（svg.md 原文）；后台线程解析、整图作为单个原生视图渲染；超出范围的复杂 SVG 需光栅化或替换资源） | 全端 | M | 🟡 |
| Markdown | `flutter_markdown` ^0.7.6 | TS markdown 解析 → Lynx 元素渲染（自研或社区库）`💭` | 全端 | M | 🟡 |
| 文件选择 | `file_picker` ^10.3.10 | A/I: 原生模块；桌面: Lynxtron `dialog` `✅官方 canary` | 全端 | M | 🟡 |
| 分享 | `share_plus` ^10.1.4 | A/I: 原生分享 sheet；桌面: `shell`/剪贴板 `💭` | 全端 | S | 🟢 |
| 压缩 | `archive` ^3.6.1 | TS 库（如 fflate）或桌面 Node zlib `💭` | 全端 | S | 🟢 |
| 加密 | `crypto` ^3.0.6 | Web Crypto / TS 库；`⚠️待核实` 早期结论称「PrimJS 无 `TextEncoder`/`TextDecoder`，须用 `TextCodecHelper`」——PrimJS 具体缺失项与替代 API 名称须按当前官方文档复核 | 全端 | M | 🟡 |

---

## 5. JS 插件体系

**现有实现**：`lib/features/jsplugin/`（3,918 行）+ `flutter_inappwebview` ^6.1.5 + `webf` ^0.24.27（GPL-3.0）+ `webf_cupertino_ui` ^0.4.1（31 个 `<flutter-cupertino-*>` 元素）。插件页可声明 `renderEngine: "webf"` 用原生元素渲染。

| 能力 | 现有实现 | Lynx 侧方案 | 平台 | 档位 | 风险 |
|---|---|---|---|---|---|
| 插件页 WebView 承载 | `flutter_inappwebview` | `<webview>`（A/I 内置；桌面经官方 `@lynx-js/cef-webview` `✅官方 canary`，CEF、需 `initialize()`、体积增大） | A/I/M/Win | L | 🟡 |
| WebF 原生元素渲染 | `webf` + `webf_cupertino_ui` | **由 `<webview>` 统一替代**（解除 GPL 传染，见 overview §6）`💭` | A/I/M/Win | L | 🟡 |
| **Web 端插件页** | — | **Web 无 `<webview>`** `✅官方`，须另走 `<iframe>` 分支 `💭`（能力/消息通道与原生 `<webview>` 不一致，需单独设计） | W | M | 🔴 |

> Web 端无 `<webview>` 是本组明确风险：插件页在 Web 上须走 iframe，能力与消息通道与原生 `<webview>` 不一致，需单独设计。

---

## 6. 响应式与车机模式

**现有实现**：4 级断点 — mobile（<600）/ tablet（600–900）/ desktop（≥900）/ auto（宽高比 >2.2，车机横屏）。

| 能力 | Lynx 侧方案 | 档位 | 风险 |
|---|---|---|---|
| 尺寸自适应 | `rpx` 单位 + CSS 变量 | S | 🟢 |
| 断点切换 | 监听容器布局变化驱动断点状态（3.7 blog 示例用 `bindlayoutchange` `✅官方`；是否需配合 main-thread script 视性能而定 `⚠️待核实`） | M | 🟡 |
| 车机横屏（宽高比 >2.2） | 同上，按宽高比计算 auto 档 | S | 🟢 |

---

## 7. 「当前无可行 Lynx 方案」/ 待决项

以下能力**没有现成 Lynx 方案**或**存在硬约束**，列为显式待决项（而非隐性风险），需在 P0/P3 专门决策：

1. **Web 端 JS 插件页**：无 `<webview>`，须自建 iframe 承载 + 消息桥，能力对齐度待评估。🔴
2. **Web 端代理/自签证书/不安全 TLS**：浏览器安全模型限制，`insecure_media_proxy` / `dio_insecure` 类能力在 Web 上大概率不可完整复刻，需产品侧确认降级策略。🟡
3. **封面取色**：Lynx 是否暴露图片像素读取能力待核实；否则须走原生模块或后端预计算。🟡
4. **复杂 SVG**：超出 `<svg>` 的约 17 标签/40+ 属性支持范围的图形须光栅化或替换资源。🟡
5. **桌面 clay 覆盖**：**CSS 属性轴已核实无阻断**（`@lynx-js/css-defines@0.0.16`，`clay_macos`/`clay_windows` @4.0：flex/定位/尺寸/边框/圆角/背景/box-shadow/opacity/overflow/transform/transition/animation/排版全 1.0，gap 2.14、aspect-ratio 1.2、grid 2.1、conic-gradient 3.6、filter+blur/brightness 等 1.0；仅 `backdrop-filter`/`object-fit` 非 Lynx CSS 属性，有 workaround）`✅官方`。**element/元素属性轴：官方文档无桌面列**——`lynx-api-docs` 元素文档的平台矩阵仅 iOS/Android/Harmony，无 Desktop/clay；故此轴**只能 P0 真机(clay)实测闭环，无文档捷径** `⚠️待核实（须实测）`。🟡（原 🔴 下调：CSS 风险已消解，剩元素属性轴须实测）
6. **Lynxtron 预览版成熟度**：正式版 Coming soon，API 以 canary 为准（见路线图风险登记）。🔴
7. **数据层选型未定**：路由已定型（react-router v6 / TanStack Router 均官方支持 `✅官方`）；数据层 TanStack Query 的「官方推荐」仍 `⚠️待核实`，且与路由耦合（见 roadmap R11）。P1 前需定型。🟡
8. **音频后台播放各端策略**：iOS 后台会话、Android 厂商省电策略差异大，属实现风险而非可行性风险 `💭`。🔴
9. **路由能力缺口**（官方两篇路由文档未覆盖，见 roadmap R12）：无 `<Link>` 声明式导航、嵌套/持久化 tab 外壳、鉴权重定向、深链映射、硬件/手势返回、Web URL 同步、路由转场动画——均需自研范式。🟡

各待决项的验证归属见 [lynx_migration_roadmap.md](./lynx_migration_roadmap.md) 风险登记。

---

## 8. 核心 Lynx 元素能力速查（已查 `lynx-api-docs`）

> ⚠️ **统一告警**：以下元素文档的「Platform Availability Matrix」**只列 iOS / Android / Harmony**，均无 Desktop/clay 列。故下表属性在**桌面 clay 的可用性一律须 P0 实测**；Web 端另需单独确认。

| 元素 | 关键能力（我们会用到的） | 注意 |
|---|---|---|
| `<list>` | 虚拟列表：`scroll-y`/`scroll-x`、`bindscrolltolower`（**近底加载更多=分页**）、`bindscrolltoupper`、`scroll-into-view`、`upper/lower-threshold`、`enable-flex` | 须给**确定高度**；`key`+`item-key` 稳定唯一；避免大 list 套大 list；每项包 `<list-item>`。library/playlist/home feed 用它 `✅官方` |
| `<scroll-view>` | 有界滚动：`scroll-orientation`、`enable-scroll`、`scrollTo/scrollBy`、`autoScroll`、边缘事件 | `bounces` Android 无；`bindscrollstart` iOS 无；小静态内容才用它，长列表用 `<list>` |
| `<image>` | `mode`=scaleToFill/aspectFit/aspectFill/center（拟合）、`placeholder`、`prefetch-width/height`（iOS/Android）、`tint-color`、`cap-insets`、`auto-size` | **`<image>` 内不支持 SVG**（全端 No）；装饰背景走 `<view>` CSS `background-image` |
| `<text>` | 文本必须包 `<text>`；`text-maxline` 截断/省略 | 纯文本裸写非法 |
| `<blur-view>` | 毛玻璃容器，核心 `blur-radius`；iOS `blur-effect`/`spacing`；Android `android-capture-target` 等 | 专辑虚化背景首选；**桌面支持文档未列，须实测** |
| `<overlay>` | 浮层/弹窗：`visible`、`events-pass-through`、`mode` | 播放 sheet/歌词浮层可用；Android 窗口/状态栏属性仅 Android |
| `<viewpager>` | 分页/轮播（`<viewpager-item>`）：`selectTab`、change 事件 | **不可当大虚拟列表用**（那用 `<list>`）；`bounces` iOS/Harmony、`setDragGesture` Harmony 无 |
| `<webview>` | jsplugin 承载；桌面经 `@lynx-js/cef-webview` | 桌面/PC 专有 API：cookie、`initjs`、`use-osr`、`openwindow`、`locationchange`；**Web 端无 `<webview>`** |
| `<input>`/`<textarea>` | 搜索/表单单行/多行 | 显式设 `maxlength`；`beforeinput`/`keyboard` 仅 iOS；`line-height`/`letter-spacing` 三端不一致 |
| `<svg>` | `src`/`content`、`bindload`；17 标签+40+ 属性 | svg 内 `image`/`text`/`tspan` 仅 iOS/Android 部分支持、Harmony 无；`binderror` 全端无 |
| `<refresh>` | 下拉刷新（header） | footer 加载更多用 `<list>` 的 `bindscrolltolower` |
