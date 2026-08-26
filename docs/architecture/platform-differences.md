# 平台差异

Songloft Player 一套 ReactLynx 代码跑三个宿主：Android（Kotlin + ExoPlayer）、iOS（Swift + AVPlayer）、Web（`@lynx-js/web-core`，业务代码在真 Worker 里）。三端**不是**同一套能力的三份实现，差异有三个不同来源：

1. **宿主根本没有那个东西** —— iOS 没有返回键（无 `UINavigationController`，连边缘滑动都没有），Web 没有原生视频画面（Lynx 4.0.x 无 video 元素，web-core 的标签表里也没有条目）。这类差异不可能靠写代码消除。
2. **同一个 OS 概念的实现语义不同** —— iOS 的 `addPeriodicTimeObserver(forInterval:)` 按**媒体时间**计间隔，Android 的 `postDelayed` 按**墙钟**计。两者都"每 500ms 上报一次进度"，变速时行为分叉。
3. **某个模块只在一端实现了** —— 悬浮歌词只有 Android，Live Activity 只有 iOS。这类是取舍而非限制，但对上层代码来说与第 1 类没有区别：**必须查能力位，不能假定存在**。

能力位的唯一真源是 [`src/native/platform-capabilities.ts`](../../src/native/platform-capabilities.ts)；模块在哪些宿主上存在由契约闸门 [`src/__tests__/native-module-contract.test.ts`](../../src/__tests__/native-module-contract.test.ts) 的 `hosts` / `modules` 表锁定。**本文档不是那两处的副本，读完矩阵后请以它们为准。**

---

## 能力矩阵

### A. `platform-capabilities.ts` 显式定义的 10 个能力位

每一位都键在**自己的**模块（或方法）上，不是「有没有任何原生模块」的总开关 —— 因为它们真的会分叉。

| 能力（能力位） | Android | iOS | Web | 探测什么 |
|---|---|---|---|---|
| 悬浮歌词 `floatingLyric` | ✅ overlay 窗口 | ⛔ 无模块 | ⛔ 无模块 | `SongloftFloatingLyric` 模块存在 |
| Live Activity `liveActivity` | ⛔ 无模块 | ✅ 灵动岛/锁屏 | ⛔ 无模块 | `SongloftLiveActivity` 模块存在 |
| DLNA 投屏 `dlna` | ✅ | ✅ | ⛔ 无模块 | `SongloftDlna` 模块存在 |
| 全屏视频 `video` | ✅ 借用同一播放器 | ✅ 借用同一播放器 | ⛔ **无视频表面** | `SongloftVideo` 模块存在 |
| 单曲离线缓存 `songCache` | ✅ | ✅ | ⛔ 无模块 | `SongloftSongCache.getCacheInfo` **方法**存在 |
| 数据导入/导出 `dataTransfer` | ✅ | ✅ | ⛔ 显式 `isWeb` 关闭 | `isWeb ? false : SongloftPlatform` |
| 文件交付 `fileExport` | ✅ 系统分享面板 | ✅ 系统分享面板 | ✅ **浏览器下载** | `SongloftPlatform.shareFile` **方法**存在 |
| 原生文件选择 `nativeFilePicker` | ✅ | ✅ | ✅ 但可能不弹框（见下） | `SongloftPlatform` 模块存在 |
| Bundle 本地模式 `bundleMode` | ✅ | ✅ | ✅（同上探测） | 同 `nativeFilePicker`，**全库暂无消费点** |
| 系统托盘 `systemTray` | ✅（同探测） | ✅（同探测） | ⛔ 显式 `isWeb` 关闭 | `!isWeb && SongloftPlatform`，**全库暂无消费点** |

两处刻意用**方法级**而非模块级探测（`fileExport` / `songCache`）：JS bundle 可以热更到旧原生壳上，那时模块在、方法不在，而「点了才报错的死按钮」正是这个模块存在的理由。`songCache` 键在 `getCacheInfo` 而非 `download` 上，因为后者改过 arity —— 旧壳仍有 `download`，会声称支持缓存然后被喂进绑不上的参数。

`bundleMode` / `systemTray` 两位目前**没有任何消费点**。列在这里是为了说明它们的探测语义（尤其 `bundleMode` 在 Web 上报 true，因为 Web 经 `nativeModulesMap` 注册了 `SongloftPlatform`），别当成已验证过的能力用。

### B. 由原生模块存在性定义的能力（契约闸门 `modules` 表）

| 模块 / 能力 | Android | iOS | Web | 备注 |
|---|---|---|---|---|
| `SongloftAudio` 音频播放 | ✅ ExoPlayer | ✅ AVPlayer | ✅ 主线程 `HTMLAudioElement` | Web 经 `nativeModulesMap` 复用 `NativeSongloftAudio` 路径 |
| `SongloftStorage` 安全存储 | ✅ Keystore | ✅ Keychain | ⛔ **刻意不注册** | Web 走 worker 内的 IndexedDB，见「存储」节 |
| `SongloftPlatform` 打开 URL / 剪贴板 | ✅ | ✅ | ✅ | Web 侧全部转发到主线程 |
| `SongloftNavigation` 返回键拦截 | ✅ 真拦截 + 双击退出 | ⛔ **无返回键可拦** | ✅ 主线程 sentinel history | iOS 侧 TS facade 降级为惰性桩 |
| `SongloftWebview` 插件页 | ⛔ 用原生 `<webview>` | ⛔ 用原生 `<webview>` | ✅ **Web 独有**（iframe） | iframe 必须挂进 `lynxView.shadowRoot`，z-index 50 |
| `SongloftVideo` 全屏视频 | ✅ | ✅ | ⛔ | 同 A 表 `video` |
| `SongloftSongCache` 离线缓存 | ✅ | ✅ | ⛔ | 同 A 表 `songCache` |
| `SongloftDlna` 投屏 | ✅ | ✅ | ⛔ | 同 A 表 `dlna` |

### C. 行为层面的差异（同一功能，三种实现）

| 行为 | Android | iOS | Web |
|---|---|---|---|
| 后台播放 | ✅ 前台服务 + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | ✅ `UIBackgroundModes: audio` + `.playback` 会话 | ⚠️ 由浏览器标签页策略决定，应用无法保证 |
| 锁屏 / 通知栏元数据 | ✅ media3 `MediaSession` | ✅ `MPNowPlayingInfoCenter` | ⚠️ `navigator.mediaSession`，依浏览器支持与安全上下文 |
| 10 段 EQ | ⚠️ `audiofx.Equalizer`，**部分设备不支持**（静默降级） | ✅ `MTAudioProcessingTap` + `NBandEQ`，固定 10 段 | ✅ `BiquadFilterNode` 链（lowshelf + 8 peaking + highshelf） |
| HLS | ✅ ExoPlayer 原生 | ✅ AVPlayer 原生 | ✅ hls.js（Safari 回落原生 HLS） |
| 不安全 TLS（自签名） | ✅ 重建 OkHttpClient 即时生效 | ✅ `invalidateAndCancel()` 重建 session + `InsecureMediaLoader` | ⛔ **no-op**，证书信任归浏览器 |
| 系统深浅色跟随 | ✅ `setGlobalProps` + `sendGlobalEvent` | ✅ 同左 | ✅ `global-props` 属性 + 主线程 `matchMedia` |
| 系统语言跟随 | ✅ 同上两通道 | ✅ 同左 | ⚠️ 只在深浅色变化时随 `navigator.language` 一并重发 |
| 客户端日志落盘 | ✅ `logWrite` / `logRead` | ✅ 同左 | ⛔ 无该方法 → 恒回落内存缓冲 |
| 长按手势 `bindlongpress` | ✅ | ✅ | ⛔ **web-core 不合成该手势** |

---

## 一条贯穿性的警告：判平台只能用 `isWebPlatform()`

**`typeof <DOM 全局> !== 'undefined'` 不是平台判断。** web-core 把背景线程实现为**真正的 Web Worker**（`new Worker(…, { name: 'lynx-bg' })`），业务组件跑在那个 realm 里，那里没有 `document` / `localStorage` / `sessionStorage` / `HTMLAudioElement`（`window` 却是 `object`，所以它也不能用来判断）。**DOM 探测在 Web 平台上会回答「不是 Web」。**

| 问题 | 用什么 |
|---|---|
| 当前**平台**是不是 Web？（选实现分支、选渲染分支） | `isWebPlatform()` —— 读 `SystemInfo.platform`，**两个 realm 都有** |
| 当前 **realm** 有没有 DOM？（只守卫紧随其后的那几行 DOM 调用） | `isWebEnvironment()` |

`isWebEnvironment()` **绝不可用来选择实现分支**。已踩三次，三次都是「测试全绿 + 真机部分功能静默死亡」：

1. 首页永久显示「下拉刷新…」—— 探 `window` + `document`，于是 Web 分支从未生效，未映射的 `<refresh-header>` 子节点当普通内容渲染出来了。
2. Web 刷新掉登录 —— 探 `localStorage`，落到内存存储。
3. **Web 完全没声音** —— `web-audio.ts:30` 的 `isWebAudioEnvironment()` 探 `HTMLAudioElement`，永远为 false，`audio-facade.ts` 因此从不构造 `WebSongloftAudio`，落到静音 mock。而 mock 拿到了真实时长，**进度条照走、自动切歌照切，唯独不出声** —— 这是最难归因的那种失败。

推论：**主线程 API 不能在业务代码里直接调**。`new Audio()` / `new AudioContext()` / `navigator.mediaSession` / `window.open` / `document.createElement` 在 worker realm 全部抛 `ReferenceError`。Web 上需要它们，只能经 web-core 的 `nativeModulesMap` 在主线程注册宿主模块（`web/audio-host.js` 等），让 worker 侧通过 `NativeModules.X` 拿到 —— 这也顺带复用了已有的 native 分支，这就是 Web 音频最终走 `NativeSongloftAudio` 而不是 `WebSongloftAudio` 的原因（后者已是死代码，保留仅供参考）。

另一个同源陷阱：`getPlatformTarget()`（[`src/native/platform-target.ts`](../../src/native/platform-target.ts)）与 `isWebPlatform()` **刻意不互相实现**。两者无宿主时的兜底值相反 —— 前者返回 `'web'`（格式集最保守，未知宿主也一定播得出），后者返回 `false`（渲染上「不是 Web」保留 `<refresh>` / `<webview>`，这在设备上是对的，也是全部现有测试的预期）。把一个接到另一个上，会在改动那一刻翻转一批渲染决策。

---

## 存储差异

| | 实现 | 持久性 |
|---|---|---|
| Android | `SharedPreferences`（`prefs`）+ Keystore（`secure`） | 跨重启持久 |
| iOS | `UserDefaults`（`prefs`）+ Keychain（`secure`） | 跨重启持久 |
| Web | IndexedDB（DB 名 `songloft`） | 跨刷新持久，但**无 secure enclave** |

**Web 上 `secure` 命名空间只是一个命名空间**，安全性等同任何同源脚本。

探测链在 `createSongloftStorage()`（`src/core/storage/index.ts`），顺序是 **native → IndexedDB → localStorage → 内存**，且 IndexedDB 必须**赢过** localStorage：

- worker realm **没有**浏览器真正的 `localStorage`（Web Storage 是 window-only）。web-core 会往背景 realm 注入一批浏览器全局的 scope 绑定，里面那个 `localStorage` **不是**页面持久化的那个 —— 写进去的 token 每次刷新即消失，且在页面自己的 DevTools storage 视图里看不见。这就是「登录成功、刷新、被弹回 `/login`（还带一帧登录卡片闪现）」那个 bug。
- 同一个 realm 里的 `indexedDB` **是**与页面 origin 共享且持久的，所以顺序必须是现在这个。

`SongloftStorage` **刻意不在 Web 上注册为宿主模块**：worker 已有可用的 `idb-storage`，而宿主那份用的是另一个 DB 名，接上会把已持久化的 token 换库，刷新即掉登录。

---

## 音频差异

三种实现（ExoPlayer / AVPlayer / 主线程 `HTMLAudioElement` 宿主模块）共享同一个 facade 契约（方法名、事件名、`stateChanged` 状态词表），所以 store 层看不出区别。**但有两条实测结论会漏到 JS 侧**，改播放器代码前必须知道。

### ① iOS 的进度 tick 间隔按媒体时间计，变速时必须按 rate 重装 observer

Android 的 tick 是 `mainHandler.postDelayed(this, PROGRESS_INTERVAL_MS)` 循环，`PROGRESS_INTERVAL_MS = 500L` 是**墙钟**时间，与播放速率无关。

iOS 的 `addPeriodicTimeObserver(forInterval:)` 数的是**该 item 时间线**上的时间，不是真实时间，所以固定间隔实际每 `interval / rate` 墙钟秒触发一次：0.5× 速率下 0.5s 的间隔**每秒**才 tick 一次（实测：位置以 500ms 为步进、每秒跳一次，于是 1 秒采样窗口里要么完全没动、要么整跳 500ms），3× 下会每秒 tick 六次。

所以 `SongloftAudioEngine.installTimeObserver` 用 `progressIntervalSeconds * Double(speed)` 作间隔，并在 `setSpeed()` 里**重装** observer —— 按 rate 缩放间隔，正是让两个宿主以同一墙钟节奏上报进度的那一步。改速率相关代码时别把重装那步优化掉。

### ② 「时长未知」两端都归一成 0，但只有 iOS 会把这个 0 暴露给 JS

- Android：`if (p.duration == C.TIME_UNSET || p.duration < 0) 0L else p.duration`
- iOS：`CMTimeGetSeconds(time)`，`seconds.isFinite && seconds > 0 ? seconds * 1000 : 0` —— 收敛 `indefinite` / `NaN`（直播流、尚未解析出的时长）

归一化是一致的，**暴露程度不一致**：ExoPlayer 进入 `READY` 时已经知道时长，所以 Android 上这个 0 基本不出现；iOS 会在容器解析完成前先发若干 `durationMs: 0` 的 progress 事件。

因此 JS 侧消费必须是 `player-store.ts:816` 那个形状：

```ts
duration: e.durationMs > 0 ? e.durationMs : s.duration,
```

直接赋值会让已知时长被 iOS 的 0 抹掉。这条也是 mock 曾经测不出来的东西 —— mock 被 `load` **直接告知**时长并同步回显，表达不出真实宿主的「我还不知道」，得靠 `simulateUnknownDurationProgress()` 才复现得了。

### 其他音频侧分叉

- **EQ 的可靠性不同**：Android 用系统 `audiofx.Equalizer`，构造失败被 `catch (_: Throwable) {}` 吞掉（部分设备确实不支持），且 band 数由设备决定 —— `applyBandGain` 会按 `eq.numberOfBands` 与 `bandLevelRange` 双重钳制。iOS 的 `NBandEQ` 与 Web 的 BiquadFilter 链都是固定 10 段、必定存在。
- **全屏视频复用同一个播放器**，不新建：Android 把 `SurfaceView` 借给正在放的 `ExoPlayer`（`attachVideoOutput`），iOS 把 `AVPlayer` 交给 `AVPlayerViewController`。因此 EQ / MediaSession / 锁屏 / 进度事件 / `InsecureTls` 全部零改动继承。退出必须 `detachVideoOutput()`，否则**下一首纯音频歌**会在 video renderer 里静默死掉。
- **不安全 TLS 的「关掉」两端机制不同**：Android 重建 `OkHttpClient`（新连接池，天然即时生效）；iOS 必须 `invalidateAndCancel()` 重建 `URLSession`，因为已握手的连接复用时不再发起 server-trust 挑战。验证「关掉是否生效」时若不换 hostname，测到的可能只是热连接。

---

## Web 独有的限制

部署前该知道用户会遇到什么。完整清单与更新记录见 [Web 部署指南](../guides/web-deployment.md)。

| 限制 | 说明 |
|---|---|
| **无 longpress** | web-core 不合成该手势，任何「长按打开菜单」的功能在 Web 上必须另有按钮入口（歌曲行的 ⋯ 就是） |
| **部分 Lynx 元素无实现** | web-core 的 `LYNX_TAG_TO_HTML_TAG_MAP` 只映射 view/text/image/raw-text/scroll-view/wrapper/list/page/input/x-input-ng/textarea/svg/frame。**未映射的标签走恒等回落**，作为 `HTMLUnknownElement` 原样落进 DOM —— 子节点当普通内容渲染、**属性开关完全无效**。`<refresh>`/`<refresh-header>`/`<webview>` 正是如此（`@lynx-js/web-elements` 注册的是 `x-refresh-view`/`x-webview`，对不上）。写跨平台页面用了新标签，**先查这张表**，Web 分支该整段不渲染而不是靠属性关掉 |
| **占位符颜色恒为库自带 grey** | `x-input` / `x-textarea` 的 `--placeholder-color` 默认值是 `grey`，而 web-elements 只经 `registerAttributeHandler('placeholder-color')` 从**属性**读取它。CSS 里的 `-x-placeholder-color` 声明在 Web 上是空转 |
| **文件选择器可能不弹框** | `pickAndUploadFile` 的调用从 worker 经桥转发到主线程，此时 user activation 可能已丢。无头环境不可观测，需真浏览器确认。同源问题也影响剪贴板 —— 所以 `setClipboard` 以 `navigator.clipboard` 为主、textarea + `execCommand` 为回落 |
| **`scroll-into-view` 是 no-op** | web-elements 只认命令式 `__scrollIntoView`，故歌词自动滚动在 Web 上不工作 |
| **`<list>` 的 px 形式 `lower-threshold` 无效** | `x-list` 只注册了 `lower-threshold-item-count`；`scroll-view` 上的 px 形式**是**有效的（`x-scroll-view` 注册了 `lower-threshold`） |
| **无 secure enclave** | 见「存储差异」 |
| **无「清空浏览器缓存」入口（刻意不做）** | Flutter 版 Web 端有该功能（清 Cache Storage + 注销 Service Worker + 对入口 `fetch(cache:'reload')` 强刷 HTTP 缓存），动机是 Flutter Web 默认 PWA 化后旧 `main.dart.js` 撞满 max-age。本仓库三个前提全不成立：宿主零 `caches.` 调用、无 SW 注册（后端 embed.go 注释明说）、两种部署的 app shell 一律 `Cache-Control: no-cache` + ETag 304（仅 canvaskit/fonts 长缓存）——「更新后页面异常」在部署层已根治，普通刷新即最新，该按钮能解决的问题集合为空。2026-08-26 评估，记录见 [Web 部署指南](../guides/web-deployment.md) |
| **虚拟列表内放不了弹出层** | `x-list` 带 `contain: layout`（成为 fixed 后代的包含块）+ `::part(content)` 是 `overflow: hidden scroll`（必然裁剪）。所以歌曲行的菜单只能挂在全局，见 [AGENTS.md §4](../../AGENTS.md) |

---

## 视频源判定的平台分叉

`resolveVideoSourceKind()`（[`src/core/network/video-source.ts`](../../src/core/network/video-source.ts)）三值判定 `'none' | 'direct' | 'hls'`：

- `'direct'` = 后端 `?media=video` 直出**原始容器**，设备自己 demux + decode。即时，但设备得认识里面的东西。
- `'hls'` = 后端 `/video-hls/playlist.m3u8` **重编码**为 H.264+AAC HLS。哪儿都能播，但首个请求会阻塞到整个转码结束，且需要 ffmpeg（缺失时 503）。

| 容器（`songs.format`） | Android | iOS | 理由 |
|---|---|---|---|
| `m4a` / `mp4` / `m4v` / `mov` / `qt` / `3gp` / `3g2` | `direct` | `direct` | MP4/QuickTime 家族两端都能开 |
| `mkv` / `matroska` / `webm` / `ts` | `direct` | **`hls`** | AVFoundation 完全不能 demux Matroska/WebM；独立 `.ts` 只在 HLS playlist 内受支持 |
| `avi` / `flv` / `wmv` / `rm` / `mpg` … | `hls` | `hls` | media3 有 extractor，但里面通常是 MPEG-2 / Xvid / Sorenson，设备**没有义务**解码。容器级放行会把「能播的流」换成「偶发的静默黑矩形」，后者更难上报 |
| `''`（空，远程歌元数据刷新前的常态） | `direct` | `direct` | 猜 `hls` 会对通常是普通 MP4 的文件强制服务端转码；猜错的另一头是可见且可恢复的 |
| 任意（Web） | — | — | 恒 `'none'`：Web 没有原生视频表面 |

另外 `isLive` / `type === 'radio'` 恒 `'none'` —— `/video-hls` 端点基于文件工作，直播流没有文件。

> **`'m4a'` 属于视频直出集合不是笔误。** 后端 `songs.format` 用 tag 库的**家族命名**：一个 H.264+AAC 的 `.mp4` 扫进来是 `format: 'm4a', is_video: true`（2026-08-16 实测）。其他容器保留自己的名字（`mkv` / `avi` / `webm`，同法实测）。纯音频的 `m4a` 永远到不了这个函数 —— `isVideo` 已经把它挡在外面。
>
> 同理，这个判定刻意读**原始** `song.format` 而非音频管线归一化后的值：`normalizeFormat` 会把 `mp4` / `mov` / `m4b` 全折成 `'m4a'`，那对「音频路径要哪个编解码器」是对的，在这里则是主动误导。

---

## 相关

- [构建与运行](../guides/build-and-run.md) —— 三平台的构建与启动命令
- [Web 部署](../guides/web-deployment.md) —— standalone / embedded 产物与 Web 限制清单
- [原生模块参考](../reference/native-modules.md) —— 各模块的方法表与调用约定
- [Lynx 平台约束](./lynx-constraints.md) —— 无 DOM、双线程、元素与事件层面的约束
- [AGENTS.md](../../AGENTS.md) —— §4「Web 平台」「平台判断」与 §5 原生模块表（本文档的上游）
