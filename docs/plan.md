# Songloft Player: Flutter 到 Lynx 迁移调研文档

> **⚠️ 文档性质：原始调研母本**
> 本文档是 4 篇迁移调研子文档（overview/capability_matrix/native_modules_spec/roadmap）的母本，产出于项目启动前。当前项目已完成 P0–P2，实际状态见 [README.md](./README.md)。

## 摘要

产出物是 4 篇中文 Markdown 文档，落在新建目录 `/Users/hanxi/toy/songloft-player-lynx/docs/`。本次**不写任何业务代码，不改动 `songloft-player/` 下任何文件**。

目标平台范围已定：Android / iOS / Web / macOS / Windows，**Linux 不迁移**（Lynx 无 Linux 支持），Linux 版处置方案在文档中单列。

## 调研结论（已核实，将写入文档）

事实基线（Lynx 4.0.0 为当前最新稳定版）：

- 平台支持：Android / iOS / HarmonyOS / Web 一等公民；macOS / Windows 自 3.7 起官方支持，走自研 clay 渲染引擎（CSS 属性覆盖 97%，元素属性覆盖 73%）；**Linux 不在支持列表**（`Integrate with Existing Apps` 无 Linux 章节）。
- 宿主形态：移动端可用 Sparkling（iOS/Android）或自建宿主；**桌面端（macOS / Windows）技术选型确定为官方 Lynxtron**——按官方定义，Lynxtron 是「把 Chromium 渲染层替换为 Lynx 的 Electron」：**单进程 + 主线程 / Lynx BTS 双线程隔离**架构，主进程运行在 Node.js 上并提供 Electron 同名桌面 API（`app` / `LynxWindow` / `Menu` / `Tray` / `Notification` / `dialog` / `shell` / `screen`），UI 层用 ReactLynx 渲染 Lynx 元素（非 HTML），打包用 `@lynx-js/lynxtron-builder`（基于 electron-builder，复用 `electron-builder.yml`，支持 macOS universal）。Web 端仍保留 `@lynx-js/web-core` + `<lynx-view>` 嵌入现有页面的既有方案（Lynxtron 面向桌面，Web 独立走 web-core）。
  - **发布状态：Lynxtron 已有可用的开发/预览版本**——`/next/`（canary）文档已提供完整上手链路（`npm create @lynx-js/lynxtron@latest`、Node.js 22+、`npm run start` / `pack`），但**稳定版文档仍标注为「Coming soon」**，即处于「预览可用、正式版在路上」阶段（2026 Roadmap 将桌面就绪度列为投入方向）。据此本计划确定采用 Lynxtron，同时把「预览版成熟度 / 正式发布时点」列入风险登记（见 P4 与风险登记），并保留自建 C++/CMake 宿主（`lynx.dll` / dylib、`explorer/windows/lynx_explorer`）作为兜底回退，不作为主路径。
  - **桌面原生能力两条路径（已核实，`/next/` Lynxtron 文档）**：(1) **Node.js 原生模块**——直接用 npm 原生模块（`.node`，如 `better-sqlite3`），需 `@lynx-js/lynxtron-rebuild` 按 Lynxtron ABI 重编，再由主进程 `require` 后经桥接暴露给 UI；(2) **Lynx 原生能力库**——C++ 侧用 `LYNX_REGISTER_NATIVE_MODULE` / `LYNX_REGISTER_ELEMENT` 静态注册，产出 `NativeModules.<ModuleName>` 与自定义元素，用 `npm create lynx-library --platforms lynxtron` 脚手架、宿主侧 `pluginLynxtron()` 走 **AutoLink**（**AutoLink 覆盖 Lynxtron 桌面**，修正早前「Autolink 不覆盖桌面」的说法）。
  - **线程间通信（IPC，已核实）**：Node→Lynx 推送用 `LynxWindow.sendGlobalEvent()` → `GlobalEventEmitter`；Lynx→Node 双向调用用 `NativeModules.bridge.call()` + `lynxBridge.handle()`；单向用 `NativeModules.bridge.send()` + `lynxBridge.on()`；preload script 经 `contextBridge.exposeInLynxBTS()` 把 Node.js JS 对象/函数/Promise 直接暴露到 `NativeModules.nodejs.exposed`。
  - **网络 / HTTP（已核实结论）**：主进程具备完整 Node.js 能力，`fetch` / 代理 / 自签证书均可在 Node 主进程或 preload 侧实现并桥接给 UI，**桌面不再需要自实现 `LynxHttpService`**——早前的桌面 HTTP service 顾虑基本消解。
  - **系统能力（已核实）**：托盘 / 菜单 / 通知 / 对话框 / 屏幕 / 多窗口由 Lynxtron 的 Electron 风格 API 原生提供；桌面多窗口歌词 = 多个 `LynxWindow`；无边框 / 透明 / 自定义标题栏用 `-x-app-region: drag` + `<title-bar-view>`。
  - **桌面 `<webview>`（已核实）**：官方 `@lynx-js/cef-webview`（基于 CEF，因体积未默认内置，按原生能力库消费 + `initialize()`）提供；**Web 端仍无 `<webview>`**（另走 iframe 分支）。
- **Lynx 无任何内置音频能力**：无 audio 元素、无媒体 API，官方 issue `lynx-family/lynx#250` 明确音频须走各平台 Native API + Native Module。这是本次迁移的最大单点工作量。
- 存储只有 `SessionStorage`（跨 LynxView 共享），持久化须自研 Native Module（官方 Native Modules 教程正是本地持久化示例）。
- `<webview>` 自 4.0 起支持 Android/iOS/Harmony/Clay Windows/Clay macOS，**Web 端不支持**；`<list>` 全平台含 Web 均支持。
- 无 DOM、无 `window`/`document`、无 `useLayoutEffect`；双线程模型（主线程 ES2019 / 后台线程 ES2015），事件命名 `bindtap` 体系，滚动须用 `<scroll-view>`。

现状实测规模（`songloft-player/`）：

- `lib/` 314 个 Dart 文件 / 87,211 行，其中 `l10n/` 生成代码 16,638 行、`features/` 52,407 行、`core/` 11,579 行、`shared/` 5,894 行；测试 33 个文件。
- `features/` 行数分布：settings 16,134 / player 13,093 / playlist 5,685 / home 5,329 / library 5,178 / jsplugin 3,918 / auth 1,261 / dlna 715 / desktop_lyric 690 / startup 404。
- Dart 到 TypeScript 无代码可复用，可复用资产仅限：后端 API 契约、l10n 文案（arb 可转 i18next JSON）、UI 设计与交互规格、业务规则文档。

## 文档 1：docs/lynx_migration_overview.md

- 迁移动机与判定结论（可行但非平价迁移，属整体重写）。
- 平台矩阵表：现有 6 端 vs Lynx 目标 5 端，逐端标注宿主形态、成熟度、需自建的原生工作。
- Linux 版处置方案：Flutter 版冻结为 Linux-only 分支维护，仅接受安全与后端接口适配修复，不再跟进新功能；文档给出该分支的裁剪清单（可移除移动端与 Web 相关代码路径）。
- 目标技术栈决策（决策完成，实施时不再讨论）：Rspeedy + ReactLynx + TypeScript；桌面宿主 Lynxtron（macOS / Windows，Electron 风格主进程 + Node.js 原生模块 / Lynx 原生能力库 AutoLink；采用其开发/预览版，自建 C++ 宿主仅作兜底回退）；状态管理 Zustand（官方文档支持，最接近现有手写 Riverpod Provider 风格）；数据层 TanStack Query（官方 Data Fetching 推荐）；路由 react-router v6 memory router；i18n i18next（官方方案）；UI 用 lynx-ui + LUNA tokens + `@lynx-js/motion`；测试 ReactLynx Testing Library + Vitest。
- 迁移中的净收益清单：`flutter_patcher` / `libapp.so` 补丁 / dart 契约哈希闸 / Kotlin 层冻结规则整套机制可**直接删除**（Lynx bundle 天然可下发热更）；WebF（GPL-3.0）可被 `<webview>` 替代，解除 GPL 传染与随包分发源码通知的义务。

## 文档 2：docs/lynx_capability_matrix.md

逐项能力对照表，每行给出：现有实现（文件路径）→ Lynx 侧方案 → 平台可用性 → 工作量档位（S/M/L/XL）→ 风险等级。

覆盖分组：

- 音频链路：`just_audio` + `audio_service` + `just_audio_media_kit`(libmpv) + `audio_session` + `smtc_windows` + `audio_service_mpris` + `volume_controller`，以及 `lib/core/audio/` 下 20 个文件（`audio_service.dart`、`songloft_mediakit_player.dart`、`songloft_web_audio_player.dart`、`equalizer_service_*.dart`）。
- 原生通道逐条映射（现有 6 条）：`com.songloft/contract`（迁移后消失）、`com.songloft/backend`（保留，改为 Lynx Native Module）、`com.songloft/floating_lyric`、`com.songloft.songloftFlutter/liveActivity`、`songloft.desktop_lyric`（多窗口 IPC）、home widget 通道。
- 平台特性：iOS Live Activity、Android 悬浮歌词 overlay、桌面小组件、系统托盘 / 窗口管理 / 单实例、桌面多窗口歌词、DLNA 投屏（`dlna_dart`）、权限申请。其中桌面侧托盘 / 窗口 / 多窗口歌词 / 通知 / 对话框可直接映射到 Lynxtron 的 Electron 风格 API（`Tray` / `LynxWindow` / `Notification` / `dialog`），单实例走 Node 主进程锁；移动端特性仍走各平台原生模块。
- 基础设施：Dio 到 `fetch`（移动端 Native + 桌面在 Lynxtron 主进程用 Node.js 网络能力，代理/自签证书在 Node 侧实现，无需自实现 HTTP service）、JWT 双 Token 拦截器重写、`secure_storage` / `shared_preferences` / `path_provider` 到自研存储模块、`cached_network_image` 到 `<image>` + `requestResourcePrefetch`、`palette_generator` 取色、`flutter_svg` 到 `<svg>`（17 标签 / 40+ 属性限制）、`flutter_markdown`、`file_picker`、`share_plus`、`archive`、`crypto`（注意 PrimJS 无 `TextEncoder`/`TextDecoder`，须用 `TextCodecHelper`）。
- JS 插件体系：`flutter_inappwebview` + `webf` 到 `<webview>`，并标注 Web 端无 `<webview>` 需另走 iframe 分支。
- 响应式与车机模式：4 级断点（mobile <600 / tablet 600-900 / desktop ≥900 / auto 宽高比 >2.2）在 Lynx 侧的实现方式（`rpx` + CSS 变量 + `main-thread:bindlayoutchange`）。
- 明确列出「当前无可行 Lynx 方案」的能力，作为待决项而非隐性风险。

## 文档 3：docs/lynx_native_modules_spec.md

自研原生能力清单与接口草案（迁移工作量的核心，按 Autolink `lynx.lib.json` 库形态组织）：

- `SongloftAudio`：方法与事件签名草案（load / play / pause / seek / setVolume / setSpeed / queue 操作 / 播放状态与进度事件 / HLS 支持 / 均衡器 10 段 31Hz-16kHz）。逐端实现路径：Android ExoPlayer + MediaSessionService + 前台服务；iOS AVPlayer + AVAudioSession + MPNowPlayingInfoCenter + MPRemoteCommandCenter；Web HTMLAudioElement + hls.js + MediaSession API（可复用现有 `web/hls_bridge.js`、`web/equalizer.js` 的算法与参数）；macOS/Windows 在 Lynxtron 宿主下二选一实现：**Node.js 原生模块**（`.node`，`@lynx-js/lynxtron-rebuild` 重编，主进程 `require` 后经 `NativeModules.bridge` 桥接）或 **Lynx 原生能力库**（`LYNX_REGISTER_NATIVE_MODULE` + `pluginLynxtron()` AutoLink，直接产出 `NativeModules.SongloftAudio`），底层封装 AVFoundation / Media Foundation 或沿用 libmpv；播放状态/进度事件经 `LynxWindow.sendGlobalEvent()` 推给 UI。
- `SongloftStorage`：偏好设置 + 安全存储（Keychain / Keystore）+ 应用目录路径。
- `SongloftBackend`：内嵌 Go 后端生命周期与后端热更（start / stop / isRunning / getPort / stageBackendPatch / confirmBackendPatch / restartProcess），移动端复用现有 gomobile 产物与 `BackendPatchManager` 逻辑，桌面端沿用子进程模型（在 Lynxtron 主进程用 Node.js `child_process` 拉起 Go 后端进程，端口/状态经桥接与 `sendGlobalEvent` 通知 UI）。
- `SongloftPlatform`：Live Activity、悬浮歌词、桌面小组件、托盘 / 窗口 / 单实例、DLNA、权限。
- 每个模块标注：需覆盖的平台、可复用的现有原生代码（Swift/Kotlin 文件路径）、Autolink 可用性前提（`create-lynx-library`、`@lynx-js/autolink-codegen`、Gradle 插件、CocoaPods 插件，Autolink 不生成 Web/HarmonyOS 代码，但**覆盖 Lynxtron 桌面**（`--platforms lynxtron` + `pluginLynxtron()`））；桌面端（macOS/Windows）在 Lynxtron 下按「Node.js 原生模块」或「Lynx 原生能力库（AutoLink）」二选一实现，纯 Node.js 逻辑（存储、后端子进程、文件/网络）优先走主进程 + preload/bridge，性能相关或需注册为 Lynx 元素的能力走 Lynx 原生能力库；标注各模块在两条路径下的封装边界与可复用的现有原生/C++ 代码。

## 文档 4：docs/lynx_migration_roadmap.md

分阶段路线，每阶段给出目标、范围、退出判据（可验证）、以及「不通过则回退」的决策点：

- P0 技术验证（不承诺全量迁移）：Android 上打通 `SongloftAudio` 最小闭环（网络流播放 + 后台播放 + 通知栏控制 + 进度事件）、登录 + 歌曲列表（`<list>` 分页）+ 播放页；同时在 **Lynxtron 桌面预览版**上验证最小闭环：`npm create @lynx-js/lynxtron` 起工程 → `LynxWindow` 加载 bundle、跑通登录/列表/播放页、用主进程 Node.js 网络能力跑通请求（含代理/自签证书）、`SongloftAudio` 以 Node.js 原生模块或 Lynx 原生能力库接入并经 `bridge` + `sendGlobalEvent` 打通播放与进度事件、`@lynx-js/lynxtron-builder` 产出可安装包。若预览版成熟度不达标，回退自建 C++/CMake 宿主完成同等验证。退出判据不达成则终止迁移，仅保留 Web/移动端局部试点。
- P1 基础设施：五端宿主工程（Android / iOS 自建宿主或 Sparkling、macOS / Windows 采用 Lynxtron（`@lynx-js/lynxtron-builder` 打包，兜底才回退自建 C++ 宿主）、Web `<lynx-view>` 宿主页并对齐现有 embedded 子路径部署模型）、CI 产物矩阵（含 Lynxtron 桌面 `lynxtron-builder` 打包/签名/公证/分发流程与原生模块 `lynxtron-rebuild`）、网络与鉴权、存储、i18n（arb 转 i18next）、主题与响应式、路由骨架。
- P2 核心业务：按 auth → library → player → playlist → home → settings 顺序迁移，逐 feature 给出行数与工作量档位。
- P3 平台特性与长尾：均衡器、歌词（含悬浮/桌面歌词）、Live Activity、小组件、托盘与多窗口、DLNA、jsplugin。
- P4 双轨发布与下线：灰度策略、版本与渠道口径（dev/stable）、Lynx bundle 热更新替代 `flutter_patcher` 的新流程、Flutter 版收敛为 Linux-only 的时间点与判据。
- 风险登记：**Lynxtron 预览版成熟度风险（桌面选型的头号风险）——已有开发版可用但正式版仍标「Coming soon」，含正式发布时点、API 稳定性（`/next/` canary 文档可能随版本变动）、桌面元素/CSS 覆盖成熟度、`lynxtron-builder` 签名/公证/分发链路与 `lynxtron-rebuild` 原生模块 ABI 兼容的完备度；缓解措施为 P0 在预览版上跑通最小闭环 + 全程保留自建 C++/CMake 宿主兜底**、桌面元素覆盖 73% 的具体缺口、Web 无 `<webview>`（桌面 `<webview>` 由 `@lynx-js/cef-webview` 提供、体积增大需评估）、无 Linux、音频后台播放各端策略差异（尤其 iOS 后台与 Android 厂商省电策略）、l10n 16,638 行迁移、Lynx 月度发布节奏带来的 `engineVersion` 兼容负担、桌面代理/自签证书能力重建（桌面已明确在 Lynxtron 主进程 Node.js 侧实现，风险降为工程量而非可行性；对应现有 `insecure_media_proxy`、`dio_insecure`、`github_proxy_fallback`）。
- 工作量量化：按 `features/` 实测行数分档给出重写规模估算区间与估算方法说明（不给单点工期承诺）。

## 假设与说明

- 文档目录为 `/Users/hanxi/toy/songloft-player-lynx/docs/`。该路径当前**不是 git 仓库**（仅 `songloft-player/` 是独立仓库 `songloft-org/songloft-player`），故文档不受版本控制；如需纳管，后续可 `git init` 或移入 `songloft-player/docs/`，此事在 overview 文档开头标注。
- 只写中文文档，不产出 en 版本。
- 文档中所有 Lynx 能力结论均标注对应官方文档链接与 Lynx 版本（4.0），便于日后随 Lynx 迭代复核。
- **Lynxtron 相关结论出自官方 `/next/`（canary）文档**（`lynxtron/learn/what-is-lynxtron`、`Communication-Between-Node-And-Lynx`、`Native-Libraries/NodeJS-Native-Modules`、`Lynx-Native-Libraries`、`cef-webview-getting-started`、`Migrating-From-Electron`，经 curl 核实）；稳定版文档中 Lynxtron 仍为「Coming soon」。故 Lynxtron 的 API（`LynxWindow` / `lynxBridge` / `contextBridge.exposeInLynxBTS` / `NativeModules.nodejs.exposed` 等）以 canary 为准，正式发布前可能变动，实施时须复核当时版本。
