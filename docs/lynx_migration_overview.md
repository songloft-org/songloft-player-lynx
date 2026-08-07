# Songloft Player：Flutter → Lynx 迁移总览

> 本文档为迁移调研的第 1 篇，聚焦**为什么迁、迁到什么、代价与收益的总判断**。逐项能力对照见 [lynx_capability_matrix.md](./lynx_capability_matrix.md)，自研原生能力清单见 [lynx_native_modules_spec.md](./lynx_native_modules_spec.md)，分阶段路线见 [lynx_migration_roadmap.md](./lynx_migration_roadmap.md)。
>
> **文档版本约定**：本系列所有 Lynx 能力结论均以 **Lynx 4.0** 稳定版为基线；**Lynxtron 相关结论出自官方 `/next/`（canary）文档**（正式版仍标注为 Coming soon，API 可能变动），引用处单独标注。日后随 Lynx 迭代需按当时版本复核。
>
> **来源与确定性标注（全系列通用）**：
> - `✅代码` — 已核实，依据 `songloft-player/` 源码实测。
> - `✅官方` — 已核实，依据 Lynx 官方文档（标注 stable / canary）。
> - `⚠️待核实` — 尚未对官方文档或实测确认，实施前必须核实，**不得当作事实使用**。
> - `💭假设` — 基于经验的推断/选型倾向，非事实。
>
> **工程与目录约定（重要）**：
> - 本目录 `/Users/hanxi/toy/songloft-player-lynx/` 是**新客户端工程目录**（Lynx 版落地于此）。
> - 内层 `./songloft-player/` 是 Flutter 产品的**只读参考快照**，对应上游独立仓库 `songloft-org/songloft-player`。**本次调研与后续迁移均不修改 `./songloft-player/` 下任何文件**，它仅作对照。
> - 本 `docs/` 目录当前不受版本控制；如需纳管，在本工程根 `git init` 即可（**不要**写入或移动到 `./songloft-player/`）。
> - §3 所述「Flutter 版收敛为 Linux-only 维护分支」指的是**上游产品仓库** `songloft-org/songloft-player` 的分支策略，与本地这份只读快照无关。

---

## 1. 迁移动机

现有 Songloft Player 是一个 Flutter 客户端，覆盖 Android / iOS / Web / macOS / Windows / Linux 六端。迁移到 Lynx 的动机不是「Flutter 不好用」，而是围绕**热更新合规**与**分发架构简化**的一组具体收益：

1. **原生热更新能力**。当前为绕过应用商店审核限制而自建了一整套 Flutter 补丁机制（`flutter_patcher` / `libapp.so` 补丁 / Dart 契约哈希闸 / Kotlin 层冻结规则）。Lynx bundle 本身就是可下发的 JS 产物，热更新是**框架原生能力**，这套自研机制可整体删除。
2. **解除 GPL 传染**。当前客户端因链接了 `webf`（GPL-3.0-only）而整体按 GPL-3.0 分发，并承担随包分发源码通知义务。Lynx 的 `<webview>` 可替代 WebF 承载 JS 插件页，解除这一传染。
3. **统一渲染与包体**。Lynx 双线程模型 + 原生渲染，桌面端通过 Lynxtron（类 Electron）统一 macOS/Windows/Web 的 UI 代码。

**判定结论：可行，但不是平价迁移，属于整体重写。** Dart → TypeScript 无代码可直接复用（见 §5），主要工作量在于用 Lynx 重写全部 UI 与业务逻辑、并自研 Lynx 缺失的原生能力（音频、存储、平台特性）。

---

## 2. 平台矩阵：现有 6 端 vs Lynx 目标 5 端

**目标平台范围已定：Android / iOS / Web / macOS / Windows。Linux 不迁移**（Lynx 无 Linux 支持，`Integrate with Existing Apps` 官方文档无 Linux 章节）。Linux 版处置方案见 §3。

| 平台 | 现有 Flutter | Lynx 目标 | 宿主形态 | 成熟度 | 需自建的原生工作 |
|---|---|---|---|---|---|
| **Android** | ✅ 一等公民 | ✅ 迁移 | Sparkling 或自建宿主 | 高（一等公民） | 音频（ExoPlayer + MediaSessionService + 前台服务）、悬浮歌词 overlay、存储、后端、DLNA、权限 |
| **iOS** | ✅ 一等公民 | ✅ 迁移 | Sparkling 或自建宿主 | 高（一等公民） | 音频（AVPlayer + AVAudioSession + MPNowPlayingInfoCenter/MPRemoteCommandCenter）、Live Activity、存储、后端、DLNA、权限 |
| **Web** | ✅ | ✅ 迁移 | `@lynx-js/web-core` + `<lynx-view>` 嵌入现有页面 | 中高（`<list>` 支持；**无 `<webview>`**） | 音频（HTMLAudioElement + hls.js + MediaSession API，可复用 `web/hls_bridge.js`、`web/equalizer.js`）、JS 插件页改走 iframe |
| **macOS** | ✅（clay 前为 Flutter macOS） | ✅ 迁移 | **Lynxtron**（类 Electron，主进程 Node.js）| 预览可用（正式版 Coming soon） | 音频（Node.js 原生模块或 Lynx 原生能力库，封装 AVFoundation/libmpv）、托盘/多窗口歌词/通知走 Lynxtron API、后端子进程、DLNA |
| **Windows** | ✅ | ✅ 迁移 | **Lynxtron**（类 Electron，主进程 Node.js）| 预览可用（正式版 Coming soon） | 音频（Node.js 原生模块或 Lynx 原生能力库，封装 Media Foundation/libmpv）、托盘/多窗口/通知走 Lynxtron API、后端子进程、DLNA |
| **Linux** | ✅（`just_audio_media_kit` + `audio_service_mpris`） | ❌ **不迁移** | — | Lynx 无 Linux 支持 | 见 §3 处置方案 |

**平台能力事实基线（Lynx 4.0）：**

- Android / iOS / HarmonyOS / Web 为一等公民；macOS / Windows 自 **3.7** 起官方支持，桌面走自研 **clay 渲染引擎**。
  - **CSS 属性覆盖（已用 `@lynx-js/css-defines@0.0.16` 数据集核实 `✅官方`）**：本播放器所需的 CSS 属性在 `clay_macos` + `clay_windows` @ Lynx 4.0 **几乎全部可用**——flex 全套/定位/尺寸/间距/边框/圆角/背景/`box-shadow`/`opacity`/`overflow`/`transform`(+origin)/`transition`/`animation`/排版/`z-index`/`visibility` 均 1.0；`gap` 2.14、`aspect-ratio` 1.2、`grid-template-columns` 2.1、`conic-gradient` 3.6（4.0 均满足）；`filter` 及 `blur/brightness/contrast/grayscale/saturate` 1.0；linear/radial 渐变基线可用。**结论：CSS 层无阻断性缺口。**
  - **两个不是 Lynx CSS 属性的项**（数据集无）：`backdrop-filter`（毛玻璃）→ 优先用官方 **`<blur-view>` 元素**（`✅官方` 有此元素，核心属 `blur-radius`；但**其桌面 clay 支持文档未列，须实测**），或「复制一层 `<image>` + `filter: blur()`」，或 Lynxtron macOS 窗口 `vibrancy` 选项；`object-fit`（图片裁切）→ Lynx `<image>` 用 `mode` 属性（`scaleToFill`/`aspectFit`/`aspectFill`/`center`）`✅官方`，非 CSS。
  - **element/元素属性轴——无法靠文档闭环，只能实测**：早期「元素属性覆盖 ~73%」指 element 属性这一轴。已查 `lynx-api-docs` 元素文档（image/list/scroll-view/text/blur-view/overlay/viewpager/webview/input/svg），发现其「Platform Availability Matrix」**只列 iOS/Android/Harmony 三列，没有 Desktop/clay 列**——即官方未提供桌面元素/属性的逐项支持表。**结论：桌面元素属性覆盖是唯一必须靠 P0 真机（clay）实测才能闭环的项**，无任何文档捷径。`⚠️待核实（须实测）`
- **桌面宿主采用 Lynxtron**（详见 §4）。Lynxtron 定义为「把 Chromium 渲染层替换为 Lynx 的 Electron」，主进程运行 Node.js 并提供 Electron 同名 API。来源：官方 `/next/` 文档 `lynxtron/learn/what-is-lynxtron`。
- **Lynx 无任何内置音频能力**（无 audio 元素、无媒体 API，官方 issue `lynx-family/lynx#250` 明确音频须走各平台 Native API + Native Module）——这是本次迁移**最大的单点工作量**。
- 持久化存储只有 `SessionStorage`（跨 LynxView 共享，非持久化），持久化须自研 Native Module。
- `<webview>` 自 4.0 起支持 Android/iOS/Harmony 及桌面（桌面经 `@lynx-js/cef-webview`），**Web 端不支持**；`<list>` 全平台含 Web 均支持。
- 无 DOM、无 `window`/`document`、无 `useLayoutEffect`；双线程模型（主线程 ES2019 / 后台线程 ES2015），事件命名 `bindtap` 体系，滚动须用 `<scroll-view>`。

---

## 3. Linux 版处置方案

Lynx 无 Linux 支持，Linux 版不参与迁移。处置策略：

- **Flutter 版冻结为 Linux-only 维护分支**，仅接受两类修复：(1) 安全修复；(2) 后端接口适配（后端契约变更时的最小跟随）。**不再跟进新功能**。
- 该分支可执行**裁剪**以降低维护面（下列为可移除的代码路径清单，供分支裁剪时参考）：
  - 移动端专属：`android/`、`ios/`、iOS Live Activity（`com.songloft.songloftFlutter/liveActivity`）、Android 悬浮歌词（`com.songloft/floating_lyric`）、home widget（`com.songloft/widget_action`）。
  - Web 专属：`web/`、`songloft_web_audio_player.dart`、`web_audio_platform_web.dart`、`equalizer_service_web.dart`、`equalizer_service_factory_web.dart`。
  - Windows/macOS 专属：`windows/`、`macos/`、`smtc_windows`（`smtc_service_native.dart`）。
  - **Linux 版保留**：`linux/`、`just_audio_media_kit`（libmpv 后端）、`audio_service_mpris`（`equalizer_service_mpv.dart`、MPRIS 媒体键）。
- 裁剪属可选优化，非必须；若维护成本可接受，保留全平台代码亦可，仅在发布口径上收敛为 Linux。

---

## 4. 目标技术栈决策（已决策，实施时不再讨论）

| 层 | 选型 | 依据 / 备注 |
|---|---|---|
| 构建 + 框架 + 语言 | **Rspeedy + ReactLynx + TypeScript** | Lynx 官方主推组合 `✅官方` |
| 桌面宿主 | **Lynxtron**（macOS / Windows） | 类 Electron，主进程 Node.js + Electron 风格 API，UI 用 ReactLynx；采用其开发/预览版；自建 C++/CMake 宿主仅作兜底回退（见下）`✅官方 canary` |
| 状态管理 | **Zustand** | 官方有专门文档 `react/state-management/zustand` `✅官方`；选它因最接近现有手写 Riverpod Provider 风格，迁移心智负担最小 `💭` |
| 数据层（服务端态） | **TanStack Query**（决策） | `💭 推荐`（非官方专页背书）。服务端数据（library/playlist/song/home）是典型 server-state 缓存场景，不手写缓存层；TanStack Query 框架无关、不依赖 DOM、与 TanStack Router 同生态。`⚠️待核实` **P0 必做 spike**：Lynx 无 `window`/`document`/`navigator`，须在初始化 no-op 掉 `focusManager`/`onlineManager`；验证通过则定型，否则回退「基于 fetch 的自研缓存层」 |
| 路由 | **TanStack Router**（file-based + memory history，决策） | `✅官方` 两个官方路由（TanStack Router、react-router v6 `MemoryRouter`）均要求 memory routing（Lynx History API 受限）。**选 TanStack** 因大体量 app（settings 16k / player 13k / 深层导航 + auth 门禁）受益于 file-based、类型安全 params、`beforeLoad` 守卫、`loader` 预取（与 TanStack Query 同生态）。前置：`@lynx-js/react/compat`（React 18 shim，补 `startTransition`）+ `url-search-params-polyfill` + `isServer:false`。**轻量备选**：react-router v6（React 17、依赖少，但无 `<Link>`、无 loader/类型安全，手写路由表） |
| 国际化 | **i18next** | `⚠️待核实` 需确认官方 i18n 指引是否即 i18next；现有 `.arb` 可转 i18next JSON（见 §5） |
| UI | **lynx-ui（`@lynx-js/lynx-ui`）+ LUNA tokens + `@lynx-js/motion`** | 官方 Headless 组件库（`✅官方`），大量用主线程脚本、支持 tree-shaking。配置：`targetSdkVersion 2.14` + `enableNewGesture`，Lynx Engine ≥ 3.2。`⚠️注意` **iOS/Android 全面支持，Harmony/Web/Desktop「持续完善」中**——我们的 Web + macOS/Windows 三端须逐组件核实覆盖（用按组件包 + 具体组件更宽松的约束，或用 `<view>/<text>` 原语自组合兜底）。已装 `lynx-ui` skill 辅助选型 |
| 测试 | **ReactLynx Testing Library + Vitest** | `⚠️待核实` 官方测试栈名称需按当前文档复核 |

**桌面宿主 Lynxtron 关键事实（来源：官方 `/next/` canary 文档）：**

- **架构**：单进程 + 主线程 / Lynx BTS 双线程隔离。主进程运行 Node.js，提供 Electron 同名桌面 API（`app` / `LynxWindow` / `Menu` / `Tray` / `Notification` / `dialog` / `shell` / `screen`）。UI 用 ReactLynx 渲染 Lynx 元素（非 HTML）。
- **发布状态**：已有可用的**开发/预览版本**（`npm create @lynx-js/lynxtron@latest`、Node.js 22+、`npm run start` / `pack`），但稳定版文档仍标「Coming soon」。定性为「**预览可用、正式版在路上**」。故确定采用 Lynxtron 为主路径，同时保留自建 C++/CMake 宿主（`lynx.dll`/dylib、`explorer/windows/lynx_explorer`）作兜底回退，不作为主路径。
- **原生能力两条路径**：(1) **Node.js 原生模块**（`.node`，`@lynx-js/lynxtron-rebuild` 按 Lynxtron ABI 重编）；(2) **Lynx 原生能力库**（C++ `LYNX_REGISTER_NATIVE_MODULE`/`LYNX_REGISTER_ELEMENT` 静态注册，`npm create lynx-library --platforms lynxtron` + 宿主侧 `pluginLynxtron()` 走 **AutoLink**，AutoLink 覆盖 Lynxtron 桌面）。
- **网络**：主进程具备完整 Node.js，`fetch`/代理/自签证书均可在 Node 侧实现并桥接，桌面**不需要自实现 HTTP service**。
- **系统能力**：托盘/菜单/通知/对话框/多窗口原生提供；桌面多窗口歌词 = 多个 `LynxWindow`；打包用 `@lynx-js/lynxtron-builder`（基于 electron-builder，复用 `electron-builder.yml`，支持 macOS universal）。
- **打包**：桌面 `<webview>` 由官方 `@lynx-js/cef-webview` 提供（基于 CEF，因体积未默认内置，按原生能力库消费 + `initialize()`）。

---

## 5. 可复用资产与不可复用部分

**不可复用**：Dart → TypeScript 无代码可直接复用；全部 UI 与业务逻辑重写。

**可复用资产（仅限以下四类）：**

| 资产 | 说明 | 迁移方式 |
|---|---|---|
| 后端 API 契约 | 与内嵌 Go 后端的接口定义 | 直接沿用；`com.songloft/contract` 通道机制随迁移消失，改为 Lynx 侧直接请求 |
| l10n 文案 | `lib/l10n/app_zh.arb`（模板，2,814 行）+ `app_en.arb`（2,709 行）= **arb 源 5,523 行** `✅代码`；`flutter gen-l10n` 生成的 `app_localizations*.dart` **16,618 行** `✅代码`（不迁移，生成代码由构建产出） | **只迁 arb 源**：arb → i18next JSON |
| UI 设计与交互规格 | 现有界面布局、交互流程 | 作为重写的设计输入 |
| 业务规则文档 | 播放、鉴权、插件等业务逻辑 | 作为重写的需求输入 |
| Web 音频算法 | `web/hls_bridge.js`、`web/equalizer.js`（算法与 EQ 参数） | Web 端 `SongloftAudio` 可直接复用 |

**现状实测规模（`songloft-player/lib/`，已核实）：**

- 共 314 个 Dart 文件 / 87,211 行 `✅代码`。其中 `l10n/` 生成代码 16,618 行（含 arb 源 5,523 行）、`features/` 52,407 行、`core/` 11,579 行、`shared/` 5,894 行；测试 33 个文件。
- `features/` 各模块行数（已逐一核实）：

  | 模块 | 行数 | 模块 | 行数 |
  |---|---|---|---|
  | settings | 16,134 | library | 5,178 |
  | player | 13,093 | jsplugin | 3,918 |
  | playlist | 5,685 | auth | 1,261 |
  | home | 5,329 | dlna | 715 |
  | | | desktop_lyric | 690 |
  | | | startup | 404 |

工作量量化方法与估算区间见 [lynx_migration_roadmap.md](./lynx_migration_roadmap.md) §「工作量量化」。

---

## 6. 迁移净收益清单

迁移完成后可**直接删除**或**解除**的历史包袱：

| 可删除 / 解除 | 原因 |
|---|---|
| `flutter_patcher` 整套机制 | Lynx bundle 天然可下发热更 |
| `libapp.so` 补丁流程 | 同上 |
| Dart 契约哈希闸 | `com.songloft/contract` 通道随迁移消失 |
| Kotlin 层冻结规则 | 热更不再依赖 native 层冻结 |
| **WebF（GPL-3.0）依赖** | 由 `<webview>` 替代，**解除 GPL 传染与随包分发源码通知义务** |

> 注意：净收益需扣除新增成本——Lynx 缺失的音频/存储/平台特性须自研原生模块（见 [lynx_native_modules_spec.md](./lynx_native_modules_spec.md)），且需承担 Lynx 月度发布节奏的 `engineVersion` 兼容维护、以及 Lynxtron 预览版成熟度风险（见路线图风险登记）。

---

## 7. 一句话总判断

迁移**技术可行、收益明确（热更合规 + 解除 GPL）**，但**代价是整体重写 + 自研全部缺失的原生能力**，且桌面依赖尚在预览阶段的 Lynxtron。因此路线图以 **P0 技术验证闸门**开局（不预先承诺全量迁移），验证不通过则止损（见 [lynx_migration_roadmap.md](./lynx_migration_roadmap.md)）。
