# 原生模块契约速查表

本文档列出全部自研 Lynx 原生模块的**方法签名、事件名、平台差异与闸门锁住的不变量**，供新增/修改原生能力时逐字对照。

> **权威清单是契约闸门 `src/__tests__/native-module-contract.test.ts`，本文档是它的可读版本；两者不一致时以闸门为准。**

---

## 1. 总表

闸门 `modules` 表锁定 **11 个原生宿主模块**（含 `SongloftPluginBridge` 与新接入三个原生端的 `SongloftUpdate`）；另有 `SongloftWebview` 与 `SongloftLynxFrame` 两个仅存在于 Web 部署的模块名，各由独立 `describe` 块覆盖。

| `NativeModules.X` | Android 实现 | iOS 实现 | TS facade | 职责 |
|---|---|---|---|---|
| `SongloftAudio` | `android/app/src/main/java/org/songloft/lynx/audio/SongloftAudioModule.kt`（引擎 `SongloftAudioEngine.kt`） | `ios/SongloftLynx/SongloftAudioModule.swift`（引擎 `SongloftAudioEngine.swift`） | `src/native/audio-facade.ts` → `src/native/native-audio.ts`（类型 `src/native/audio-types.ts`） | 播放引擎（ExoPlayer / AVPlayer）+ MediaSession + EQ |
| `SongloftStorage` | `storage/SongloftStorageModule.kt` | `SongloftStorageModule.swift` | `src/core/storage/native-storage.ts` | 键值持久化（`prefs` / `secure` 两区）+ 目录路径 |
| `SongloftPlatform` | `platform/SongloftPlatformModule.kt` | `SongloftPlatformModule.swift` | `src/native/native-platform.ts` | 打开 URL、文件选择上传、剪贴板、客户端日志、分享、日志导出打包、TLS 开关 |
| `SongloftDlna` | `dlna/SongloftDlnaModule.kt` | `SongloftDlnaModule.swift` | `src/native/dlna.ts` | DLNA/UPnP 设备发现与投屏控制 |
| `SongloftVideo` | `video/SongloftVideoModule.kt`（画面是 `MainActivity.kt` 里的 `SurfaceView`） | `SongloftVideoModule.swift` | `src/native/video.ts` | 全屏视频画面（借用同一个播放器，不新建） |
| `SongloftSongCache` | `cache/SongloftSongCacheModule.kt` | `SongloftSongCacheModule.swift` | `src/features/player/data/song-cache.ts` | 设备端歌曲缓存（下载 / 查询 / 删除 / 清空） |
| `SongloftUpdate` | `updater/SongloftUpdateModule.kt`（文件/网络核心 `BundleUpdateStore.kt`） | `SongloftUpdateModule.swift`（`BundleUpdateStore/Transfer.swift`） | `src/core/updater/native-updater.ts` | 独立 TLS 元数据、签名下载、冷启动确认/回退；关于页入口已接入，iOS 待编译 |
| `SongloftFloatingLyric` | `lyric/FloatingLyricModule.kt`（窗口 `FloatingLyricService.kt`） | **无（仅 Android）** | `src/native/floating-lyric.ts` | 悬浮歌词覆盖层 |
| `SongloftLiveActivity` | **无（仅 iOS）** | `LiveActivityModule.swift` | `src/native/live-activity.ts` | 灵动岛 / 锁屏 Live Activity |
| `SongloftNavigation` | `navigation/SongloftNavigationModule.kt`（+ `BackKeyState.kt`、`MainActivity.kt`） | **iOS 刻意不做** —— 没有返回键可拦（无 `UINavigationController`，连边缘滑动都没有），TS facade 降级为惰性桩 | `src/native/navigation.ts` | 硬件 / 浏览器返回键 |
| `SongloftPluginBridge` | `plugin/SongloftPluginBridgeModule.kt` | `SongloftPluginBridgeModule.swift` | 内联在 `src/features/jsplugin/widgets/LynxPluginFrame.tsx`（无独立 facade 文件） | 父页 ⇄ 子 `<frame>` 插件的双向桥（跨 `LynxContext` 通信，按 `frameId` 注册） |
| `SongloftWebview` | **无（仅 Web）** —— native 构建渲染真实 `<webview>` 元素 | **无（仅 Web）** | `src/native/web-webview.ts` | 插件页 iframe（worker 侧 `web/songloft-webview-module.js` + 主线程 `web/webview-host.js`） |
| `SongloftLynxFrame` | **无（仅 Web）** —— native 构建用 `<frame>` 元素渲染 Lynx 插件 | **无（仅 Web）** | `src/native/web-lynx-frame.ts` | Lynx 插件页的 Web 宿主（worker 侧 `web/songloft-lynx-frame-module.js` + 主线程 `web/lynx-frame-host.js`） |

Android 路径均省略前缀 `android/app/src/main/java/org/songloft/lynx/`；iOS 路径均省略前缀 `ios/SongloftLynx/`。

HarmonyOS 实现在 `harmony/entry/src/main/ets/modules/`，除 `SongloftFloatingLyric`、`SongloftLiveActivity` 外均按同名模块注册（`SongloftWebview` / `SongloftLynxFrame` 本就只有 Web 实现）。`SongloftUpdate` 实现在 `updater/`，根模板与 fatal lifecycle 同步接入，仍待 HAP 编译及设备验证。2026-10-06 源码复核：`Index.ets` 已注册 `SongloftVideo` 并挂载 XComponent，模块绑定共享 AVPlayer；源码与结构闸门存在，但编译和设备行为仍需验证。P6a 剪贴板已接 Pasteboard 与确认回调，设备粘贴待验；通知歌词仍需 P6b 补齐，不能以模块注册判断每个方法可用。

### 不是 NativeModules 模块

| 名称 | 实现 | 通道 |
|---|---|---|
| `SystemAppearance` | `system/SystemAppearance.kt` + `MainActivity.kt` / `SystemAppearance.swift` + `ViewController.swift` | **不注册为模块**，走两条通道：`lynx.__globalProps` 送初值（首帧正确）+ `sendGlobalEvent` 送变更。TS facade `src/native/system-appearance.ts` |
| `AppLifecycle` | Android `MainActivity.kt`（本批只接 Android） | **不注册为模块**，`onResume` 发出 `SongloftLifecycle.resumed`，TS facade `src/native/app-lifecycle.ts` 订阅。iOS/HarmonyOS 尚未接入；Web iframe 使用浏览器可见性事件 |

另有 `SongloftTestBridge`（`test/SongloftTestBridgeModule.kt` / `SongloftTestBridgeModule.swift`，事件 `TestBridge.eval`），仅 E2E 用，**不在契约闸门的 `modules` 表内**。

### Web 宿主注册了哪些模块

Web 通过 `<lynx-view>` 的 `nativeModulesMap` 注册 **7 个**模块：`SongloftAudio` / `SongloftPlatform` / `SongloftNavigation` / **`SongloftVideo`**（`web/audio-host.js` 注册，worker 侧各自是 `web/songloft-*-module.js`）、`SongloftWebview`（`web/webview-host.js`）、`SongloftPluginBridge` 与 `SongloftLynxFrame`（`web/lynx-frame-host.js`，前者另有 `web/lynx-plugin-bridge-shim.js`）。其余模块在 Web 上不存在，facade 降级为惰性桩。`SongloftVideo` 的 Web 半边是主线程一个 `<video>`（由 `web/audio-host.js` 持有、镜像正在播的音频流），worker 侧只负责转发方法名。

---

## 2. 各模块契约

### 2.1 `SongloftAudio`

写方法为 **fire-and-forget（`void`）**；`getSourceLoadVersion(callback)` 是 Callback 读方法，当前四端返回 `1`。TS facade 的 `load()` 只确认命令已发出；`src/native/source-load.ts` 用匹配源标识的准备事件确认真实加载与初始 seek，默认超时 30 秒，换源/停止会取消等待。旧壳无准备契约时保持普通播放，音轨选择提示升级，不发送新增 load 字段。

| 方法 | Kotlin 签名 | iOS `methodLookup` 选择器 |
|---|---|---|
| `load` | `load(url: String, opts: ReadableMap?)` | `load(_:opts:)` |
| `getSourceLoadVersion` | `getSourceLoadVersion(callback: Callback)` | `getSourceLoadVersion(_:)` |
| `play` / `pause` / `stop` | 无参 | 同名无参 |
| `seek` | `seek(positionMs: Double)` | `seek(_:)` |
| `setVolume` | `setVolume(volume: Double)` | `setVolume(_:)` |
| `setSpeed` | `setSpeed(rate: Double)` | `setSpeed(_:)` |
| `setQueue` | `setQueue(items: ReadableArray?, startIndex: Double)` | `setQueue(_:startIndex:)` |
| `next` / `previous` | 无参 | 同名无参 |
| `setRepeatMode` | `setRepeatMode(mode: String)` | `setRepeatMode(_:)` |
| `setShuffle` | `setShuffle(on: Boolean)` | `setShuffle(_:)` |
| `setFavorite` | `setFavorite(isFavorite: Boolean)` | `setFavorite(_:)` |
| `getVolume` | 无参，回报 `volumeChanged` | 同名无参 |
| `updateNotificationLyric` | `lyric: String?, inTitle: Boolean` | 旧 `updateNotificationLyric(_:)` 单参数 |
| `updateNotificationLyricWithLayout` | `lyric: String?, inTitle: Boolean` | 新 `updateNotificationLyricWithLayout(_:inTitle:)` |
| `setEqualizerEnabled` | `setEqualizerEnabled(on: Boolean)` | `setEqualizerEnabled(_:)` |
| `setEqualizerBand` | `setEqualizerBand(index: Double, gainDb: Double)` | `setEqualizerBand(_:gainDb:)` |
| `dispose` | 无参 | 同名无参 |

**事件（宿主 → JS）**，常量在 `src/native/native-audio.ts` 的 `NATIVE_EVENT`、Kotlin `SongloftAudioEngine.EVENT_*`、Swift `SongloftAudioEngine`：

| 事件名 | payload |
|---|---|
| `SongloftAudio.stateChanged` | `{ state }` |
| `SongloftAudio.progress` | `{ positionMs, bufferedMs, durationMs }` |
| `SongloftAudio.error` | `{ code, message }` |
| `SongloftAudio.remoteCommand` | `{ command }` |
| `SongloftAudio.sourceReady` | `{ sourceId, positionMs }`，对应新源准备并完成初始 seek 后的实际位置 |
| `SongloftAudio.volumeChanged` | `{ volume }`，系统查询回报 0–100 整数，设置仍传 0–1 |

版本 1 的 `load` 可选字段为 `sourceId / initialPositionMs / autoplay`；状态、进度、错误与准备事件带对应 `sourceId`。facade 丢弃过期源事件，不能将旧源回调标记成新源。没有选定音轨时也为支持该契约的宿主分配源标识。队列、音量与速度不随换源清空。

词表：

- `state` 共 **7 个**：`idle` / `loading` / `ready` / `playing` / `paused` / `completed` / `error`。`mapGlobalEvent` 丢弃表外值 ⇒ 宿主发 `"buffering"` 会让播放器永远停在上一状态。
- `command` 共 **4 个**：`next` / `previous` / `toggleFavorite` / `stop`（iOS 尚无 stop 远端命令）。HarmonyOS 的 play/pause/seek/setSpeed 直接控制引擎，不传无法解码的 Worker 命令。
- facade 的 `AudioEvent` 还含 `queueIndexChanged`，**只有 mock 与 Web 实现发**（`src/native/mock-audio.ts` / `src/native/web-audio.ts`），原生宿主不发。

**闸门锁住的不变量**

- 基础事件名与 7 个 state 核对三端；准备契约的事件、版本读取与 load 字段同时核对 Android/iOS/HarmonyOS/Web。
- TS 原生接口方法在 Kotlin 有 `@LynxMethod`、在 Swift 同时有 `func` 与 `methodLookup` 条目，在 HarmonyOS 有 public 方法；除明确禁用的 EQ 外，HarmonyOS 音频方法拒绝空实现。Node 转译源码适配器验证毫秒定位、音量比例、命令参数与元数据时序，不能替代 HAP 编译和设备验证。
- iOS 后台播放两半必须都在：`Info.plist` 的 `UIBackgroundModes` 含 `<string>audio</string>`，且引擎调 `setCategory(.playback`。
- `load` 的 `opts` **永远传对象、不传 `null`**：iOS 按方法签名构造 ObjC 调用，对象参数为 nil 会每次换歌打一条 `LynxError`。
- 音量只在 store 层从 0–100 整数换算一次为 0–1 浮点；四端 facade / module / engine 均透传 0–1。HarmonyOS 不得再次 `/ 100`，契约闸门直接锁住该调用形状。
- Android 的**通知位（notification id 1001）只能有一个主人**：`SongloftPlaybackService` 的 FGS 占位通知与 media3 `DefaultMediaNotificationProvider` 共用该 id，占位只允许在 media3 未持有时发（`mediaNotificationOwnsSlot`，在 `onUpdateNotification` 里先赋值再 `super`）。闸门 `src/__tests__/android-media-notification.test.ts`；机制与实测判据见 [pitfalls §3](../project/pitfalls.md)。

P6b：HarmonyOS `setQueue` 按播放 URL 保存 id/歌曲/歌手/封面/时长，加载时写入 AVSession；歌词标题模式以歌词作 title、歌曲作 subtitle，副标题模式保留歌曲 title、歌词作 subtitle，artist/封面/时长不变。清空、停止和切源恢复歌曲信息，暂停保留当前歌词；元数据/播放状态串行写入，旧源进度不改新歌时长，SDK 卡片失败不阻止音频播放。API 依据见 [OpenHarmony 5.0 AVSession 声明](https://github.com/openharmony/interface_sdk-js/blob/OpenHarmony-5.0.0-Release/api/%40ohos.multimedia.avsession.d.ts)。不把当前行伪装成要求 LRC 格式的 `lyric` 字段。

共享 facade 优先探测可选 `updateNotificationLyricWithLayout`，否则守卫调用旧方法；缺失或同步拒绝安全降级，不改变 bridge 3 / schema 2 必需能力。Android 保持既有通知布局。iOS 新双参数选择器与旧单参数选择器并存：标题模式改 Now Playing title，第二行使用 artist 展示字段组合原歌曲名/歌词与原歌手，清空后恢复原信息；旧方法仍只设置 comments，避免旧 bundle 的参数绑定变更。Web 保持既有无通知歌词降级。iOS/HarmonyOS 编译与真实卡片/锁屏布局验收仍开放，新布局需要安装本通道新原生壳。

HarmonyOS 的两个 EQ 方法仍无 DSP 实现：新增 `equalizer` 能力位为 false，更多菜单隐藏入口，直接进入页面只显示不支持，facade 不发送 EQ 写操作；不将方法注册当功能支持。

### 2.2 `SongloftStorage`（5 方法）

| 方法 | Kotlin 签名 | iOS 选择器 | 形状 |
|---|---|---|---|
| `setItem` | `setItem(area: String, key: String, value: String)` | `setItem(_:key:value:)` | 写，fire-and-forget |
| `getItem` | `getItem(area: String, key: String, callback: Callback)` | `getItem(_:key:callback:)` | 读，Callback |
| `removeItem` | `removeItem(area: String, key: String)` | `removeItem(_:key:)` | 写，fire-and-forget |
| `getKeys` | `getKeys(area: String, callback: Callback)` | `getKeys(_:callback:)` | 读，Callback |
| `getPath` | `getPath(name: String, callback: Callback)` | `getPath(_:callback:)` | 读，Callback |

- `area` 取值：`prefs` / `secure`。两个宿主都只与 `"secure"` 做一次比较，**其余一切值都落到 `prefs`**，所以 `"prefs"` 这个字符串在两侧源码里都不出现。
- Android 后端：`songloft_prefs` / `songloft_secure` 两个普通 SharedPreferences 文件；当前 `secure` 仅隔离命名空间，未使用 Keystore 或加密存储。iOS：UserDefaults + Keychain。
- `getPath(name)` 取值：`cache` / `documents` / 其他（= `appData`）。Android 依次为 `cacheDir` / `getExternalFilesDir(null) ?: filesDir` / `filesDir`；iOS 依次为 `.cachesDirectory` / `.documentDirectory` / `.applicationSupportDirectory`（不存在时先创建）。
- TS facade 的 `getPath` 声明为**可选**（`getPath?`），缺失时回落到虚拟路径 `/songloft/<name>`。
- **平台差异**：Web 无 secure enclave，`secure` 只是命名空间；会话持久化走 `src/core/storage/idb-storage.ts`（IndexedDB）。

**闸门锁住的不变量**：5 个方法两侧齐备；`"secure"` 拼写在两个宿主里逐字一致（写错会让 token 落进非敏感区，而 `secure.get` 一直读空的那个）。

### 2.3 `SongloftPlatform`（9 方法）

| 方法 | Kotlin 签名 | iOS 选择器 | 形状 |
|---|---|---|---|
| `openURL` | `openURL(url: String)` | `openURL(_:)` | 写 |
| `setClipboard` | `setClipboard(text: String)` | `setClipboard(_:)` | 写 |
| `setClipboardWithResult` | `setClipboardWithResult(text: String, callback: Callback)` | `setClipboardWithResult(_:callback:)` | Callback `(error)`，仅 null 确认成功 |
| `pickAndUploadFile` | `pickAndUploadFile(uploadUrl: String, fieldName: String, mimeType: String, callback: Callback)` | `pickAndUploadFile(_:fieldName:mimeType:callback:)` | Callback `(error, responseBody)` |
| `setInsecureTls` | `setInsecureTls(enabled: Boolean)` | `setInsecureTls(_:)` | 写 |
| `logWrite` | `logWrite(line: String)` | `logWrite(_:)` | 写 |
| `logRead` | `logRead(callback: Callback)` | `logRead(_:)` | Callback `(error, content)` |
| `shareFile` | `shareFile(base64: String, fileName: String, mimeType: String, callback: Callback)` | `shareFile(_:fileName:mimeType:callback:)` | Callback `(error)` |
| `shareLogArchive` | `shareLogArchive(backendLogUrl: String, authHeader: String, fileName: String, callback: Callback)` | `shareLogArchive(_:authHeader:fileName:callback:)` | Callback `(error, resultJson)` |

- **平台差异**：Web 的 worker 侧模块（`web/songloft-platform-module.js`）实现 `openURL` / `setClipboard` / `setInsecureTls`（no-op，浏览器自己管证书信任）/ `pickAndUploadFile` / `shareFile`（走浏览器下载而非分享面板）；另有 Web 专属 `pickTextFile(options, callback)`、`saveTextFile(options, callback)` 与 `cancelTextFile()`，由 `src/native/web-files.ts` Promise 化并委托主线程 `web/file-transfer-host.js`。新文本桥只负责选择/保存，不传服务器地址或 token；歌单 JSON 认证 HTTP 在 Worker 复用共享客户端。三个方法齐备才开放 Web 数据管理，未改变原生 ABI。**没有 `logWrite` / `logRead` / `shareLogArchive`**，所以 `appendClientLog()` 在 Web 返回 `false`（调用方回落到内存缓冲），日志导出也留在 JS 打包路径上。文件上限、用户激活降级和验证边界见 [Web 部署](../guides/web-deployment.md#歌单-json-导入与导出)。

Web 另提供 `setPlaybackShortcuts(state)`：共享 facade 在确认 Web 与该方法存在后配置主线程监听，主线程通过 `SongloftKeyboard.action` 的 `[{action}]` 事件传回 Worker，播放器沿原有 store 执行动作。`SongloftAudio.getVolume()` 回报实际音量的 `SongloftAudio.volumeChanged` 事件。按键脚本随 Web 发布资源复制，原生 ABI 未改变；焦点/覆盖层/重复监听保护与验证边界见 [快捷键](../guides/web-deployment.md#播放键盘快捷键)。

P6a 新增四端 `setClipboardWithResult`，共享 `copyToClipboard` 返回 Promise：只在成功回调后显示复制提示，拒绝/缺方法/空回调/15 秒超时均失败。旧 `setClipboard` 保留并复用同一写入路径。Android/iOS 在主线程写入后回调；HarmonyOS 使用 API 13 可用的 `pasteboard.createData` / `getSystemPasteboard().setData`，等待 Promise 成功；Web 等待 `writeText`，降级 `execCommand('copy')` 必须返回 true。临时 textarea 与焦点在 finally 清理。该方法按运行时探测兼容旧壳，不改变必需热更新能力清单；旧壳需安装同通道新包才能确认复制。HarmonyOS 系统粘贴与 Apple 编译/设备回归仍开放。SDK 依据见 [OpenHarmony 5.0 Pasteboard 声明](https://github.com/openharmony/interface_sdk-js/blob/OpenHarmony-5.0.0-Release/api/%40ohos.pasteboard.d.ts)。

#### `shareLogArchive` —— 日志导出快路径

存在的理由是**工作发生在哪一侧**。JS 打包路径要把后端日志（≤10 MiB）和本机客户端日志（≤20 MB）读进 JS 字符串、用纯 JS zipper 压缩、再手写 base64，全部跑在无 JIT 的 JS 线程上，然后把整个 payload 推回原生；这就是 songloft-player-lynx#3「导出日志很慢」。快路径只跨桥三个短字符串，其余全在原生流式完成。

- **参数**：`backendLogUrl` 为空表示跳过后端日志；`authHeader` 原样作为 `Authorization` 头发送（为空则不带头，用头而不是 `?access_token=`，避免 token 落进访问日志）。
- **`resultJson`**：`{"hasBackend":bool,"hasFrontend":bool}`，驱动成功提示文案。三端各自手写这段 JSON，键名与 `native-platform.ts` 的解析逐字对齐，由契约闸门锁住。
- **归档条目**：`backend.log` / `backend-error.txt` / `frontend.log`。后端拉取失败写 `backend-error.txt` 而**不**中断导出；某一侧为空则整条省略；两侧都空时 callback 返回 `no logs to export`（与 JS 路径同一字符串，提示文案不因路径而异）。
- **平台差异（zip 内部布局）**：Android 用 `ZipOutputStream` 精确控制条目名，条目在归档根部；iOS 用 `NSFileCoordinator` 的 `.forUploading`、HarmonyOS 用 `zlib.compressFile`，两者都是「把一个目录打成 zip」，条目会嵌在一层以归档名命名的目录下。要做到字节级一致就得在 iOS 手写 ZIP writer（本地头 + 中央目录 + CRC32），风险不值当，这里接受差异。
- **顺序保证**：客户端日志由 `ClientFileLog.copyTo` 在**日志线程**上拷贝，所以导出前排队的日志行已经落盘。ArkTS 单线程天然满足，Android/iOS 各自 hop 到自己的日志 executor/queue。
- **旧壳兼容**：`getPlatformCapabilities().fastLogExport` 是方法级探测。热更新的 JS bundle 落在没有该方法的原生壳上时自动回退 JS 打包路径，不会调用一个不存在的方法。
- `setInsecureTls` 在 TS 接口里是**必填**（此前是可选，可选链把「iOS 根本没实现」整个吞掉了），但运行时仍保留 `typeof` 守卫 —— JS bundle 可能热更到旧原生壳上。
- `setInsecureTls` 是三条出站路径（`fetch` / 媒体流 / 模块自己的上传与 SOAP）的唯一开关，见 [`../../AGENTS.md`](../../AGENTS.md) §5「宿主 HTTP service 是我们自己的」。

**插件长请求超时（songloft-org/songloft#497）**：`HttpClient` 支持单次 `receiveTimeoutMs`，认证重试沿用该值，普通请求仍为 15 秒。检查更新为 45 秒、插件源刷新为 60 秒、安装/单个更新为 4 分钟、批量更新为 30 分钟；弹窗使用 API 的期限，不再另设 20 秒检查、120 秒更新或 5 分钟批量计时器。JS 的期限覆盖响应头与正文读取。

- 原生 `fetch` 使用内部头 `X-Songloft-Request-Timeout-Ms` 将期限传到宿主；Android/iOS/HarmonyOS **消费并移除**该头，不转发服务器。接受 1–1800000 的整数毫秒值，缺失或无效时保留宿主默认期限。Web 不添加该头。
- Android 每请求派生 OkHttp client，复用连接池和 TLS 策略，设置读写与整次调用期限；iOS 设置 `URLRequest.timeoutInterval`；HarmonyOS 设置 `readTimeout`。JS 层仍负责整次请求的等待期限。
- `pickAndUploadFile` 的桥接签名保持原样；三端对 `/api/v1/jsplugins/upload` 的文件上传单独允许 4 分钟，其他上传沿用原策略。Web 上传原本没有较短的宿主超时。
- 原生超时修复需要重新构建客户端壳；只替换 JS bundle 无法修复旧壳的底层期限。

**闸门锁住的不变量**：8 个方法**三端**齐备（HarmonyOS 此前整个不在这个循环里，正是 `logWrite`/`logRead`/`shareFile` 在那端以桩形式发布的原因）；`setInsecureTls` 已纳入主循环，不再豁免。另有一组只在设备上才会暴露的不变量：三端都不为归档做 base64、都用原生 zip、都用 `ClientFileLog.copyTo` 而不是 `logRead`、后端日志流式落盘、后端下载尊重 InsecureTls、staging 目录每次运行前清空、`resultJson` 键名与 TS 解析一致。

### 2.4 `SongloftDlna`（5 方法）

全部 Callback 形状，参数以**单个 JSON 字符串**传递，Callback 收到 JSON 字符串。

| 方法 | Kotlin 签名 | iOS 选择器 |
|---|---|---|
| `startDiscovery` | `startDiscovery(callback: Callback)` | `startDiscovery(_:)` |
| `stopDiscovery` | `stopDiscovery(callback: Callback)` | `stopDiscovery(_:)` |
| `getDevices` | `getDevices(callback: Callback)` | `getDevices(_:)` |
| `cast` | `cast(args: String, callback: Callback)` | `cast(_:callback:)` |
| `control` | `control(args: String, callback: Callback)` | `control(_:callback:)` |

- TS facade：`cast({deviceId, url, title, mimeType?})`；原生 `args`：`{deviceId, url, title, metadata?}`。facade 生成转义后的 DIDL-Lite，`res.protocolInfo` 声明实际输出 MIME，兼容没有文件后缀的歌曲 API URL。未知格式不冒充 MP3。
- `control` 的 `args`：`{action, deviceId?, value?}`，`action ∈ play | pause | stop | seek | volume | status`。`seek.value` 单位为秒，`volume.value` 为 0–100，使用 RenderingControl 的 `SetVolume`。
- facade `getPlaybackState(deviceId)` 通过 `control({action:'status'})` 查询 GetTransportInfo / GetPositionInfo，返回 `{state, positionMs, durationMs}`；查询仅发送 `InstanceID`。旧宿主没有状态结果时返回 null。
- 无事件。
- Callback payload 带 `error` 字段时 facade reject；`getDevices` 返回 `{id, name, location}` 数组。
- SOAP HTTP 失败或 Fault 必须 reject；SetAVTransportURI 被拒绝后不发送 Play，避免继续播放上一个客户端留下的歌曲。重新发现设备保留正在投屏的设备记录。
- `src/features/player/store/dlna-store.ts` 持有跨页面的投屏会话、串行控制和状态轮询。主播放器控制远端暂停/继续、切歌、进度与音量；完成事件复用播放器的播放模式推进队列，本地音频事件不覆盖远端状态。断开成功后停止远端并恢复本地控制。
- HarmonyOS 与 Android/iOS 一样，发现阶段先解析设备描述中的 AVTransport `controlURL`，按设备 `id` 持久保存；`getDevices` 直接返回设备数组，`cast` / `control` 必须先以 `deviceId` 查表再向 `controlUrl` 发 SOAP，不能把设备 id 或描述页 URL 当控制端点。
- **反面教材**：`dlna.ts` 曾把原生 bag 直接 `as DlnaModule`（声称返回 Promise），`startDiscovery()` 实际返回 `undefined`，`DlnaPage` 的 `.then()` 在 effect 挂载瞬间抛 TypeError，投屏页对所有 Android 用户开屏即崩。

### 2.5 `SongloftVideo`（3 方法）

Callback 形状，参数为单个 JSON 字符串（facade 一律传 `'{}'`）。**API 里没有 `url`**，这是设计：宿主只把画面借给正在播的那个播放器。

| 方法 | Kotlin 签名 | iOS 选择器 | 返回 |
|---|---|---|---|
| `open` | `open(args: String, callback: Callback)` | `open(_:callback:)` | `{result: "opened" \| "noTrack" \| "failed"}` —— `"noTrack"` = 流已就绪但确实无视频轨；`"failed"` = 流本身加载失败（转码被拒 / HLS playlist 404）；旧宿主的布尔 `true`/`false` 仍按 `opened`/`noTrack` 兼容 |
| `close` | `close(args: String, callback: Callback)` | `close(_:callback:)` | `{}` |
| `isOpen` | `isOpen(args: String, callback: Callback)` | `isOpen(_:callback:)` | `{result: boolean}` |

**事件**：无。历史上两端发过 `SongloftVideo.closed`（Android `EVENT_CLOSED` / iOS `eventClosed`），但 JS 零监听、是个死线，批72（`895aa97`）已删——真要通知 JS 时再按「能力探测器与首个消费点同批落地」重新加。

**平台边界（2026-10-06 源码复核）**：四端都有视频宿主代码。**画面归宿主、控件归 JS**：Android 是 `MainActivity` 视图树里、Lynx 视图之下的 `SurfaceView`（`setZOrderMediaOverlay(true)`），iOS 是下层 UIView 内的 `AVPlayerLayer`，HarmonyOS 是 `Index.ets` 的 XComponent，Web 是主线程 `<video>`。输运控件（播放/暂停/进度/标题）由 Lynx `/player/video` 页绘制。HarmonyOS 已注册模块，因此存在性探测会返回 `true`；这不代表其编译、表面生命周期与真实播放已验收。

**闸门锁住的不变量**

| 不变量 | 为什么 |
|---|---|
| 引擎有 `attachVideoOutput` **和** `detachVideoOutput`（两侧），且视频侧真的调了 `detachVideoOutput` | 缺 attach = 开出一个黑矩形只有声音；缺 detach = ExoPlayer 继续往已销毁窗口画，**下一首纯音频歌**在 video renderer 里静默死掉 |
| 两侧都有 `hasVideoTrack`（引擎 `fun`/`func`，且模块经 `videoTrackState` 读取） | `songs.is_video` 是扫描时按原文件记的，远端歌可能来自 `-vn` 转码的缓存，只有宿主能判断 |
| `videoTrackState` 先于轨道判断读取失败态（item status / `playerError`），`open` 转发 `"noTrack"` 与 `"failed"` | 转码失败会让 item 报 `.failed`：只问「有没有视频轨」会把「流加载失败」误报成「文件没有视频轨」 |
| Android 的 Module 出现 `runOnMain`，且 `MainActivity.kt` 出现 `setZOrderMediaOverlay(true)` 与 `addView(`；`buildCloseButton` 不得回来 | `@LynxMethod` 跑在 BTS 线程，ExoPlayer 与 View 层级都只能主线程碰；surface 不在窗口内容之上时画面会被窗口盖住（`1bccdf8` 修的就是这个） |
| iOS `updatesNowPlayingInfoCenter = false` | 否则 `AVPlayerViewController` 会用自己那套信息覆盖引擎写的锁屏 title/artist/artwork |
| iOS **`vc.player = nil` 必须出现在 `dismiss(animated:` 之前** | 否则 `AVPlayerViewController` 在 dismiss 时把播放暂停 |

视频源的 direct/转码判定在 `src/core/network/video-source.ts`。

### 2.6 `SongloftSongCache`（三个原生端均 14 方法）

Callback 形状，Callback 收到 JSON 字符串。

| 方法 | Kotlin 签名 | iOS 选择器 | 返回 |
|---|---|---|---|
| `download` | `download(songId: String, url: String, ext: String, maxBytes: Double, callback: Callback)` | `download(_:url:ext:maxBytes:callback:)` | 成功 `{}`，失败 `{error}` |
| `getCacheInfo` | `getCacheInfo(songId: String, callback: Callback)` | `getCacheInfo(_:callback:)` | `{cached, url?, sizeBytes?}` |
| `remove` | `remove(songId: String, callback: Callback)` | `remove(_:callback:)` | `{}` |
| `getCacheSize` | `getCacheSize(callback: Callback)` | `getCacheSize(_:)` | `{bytes}` |
| `clearAll` | `clearAll(callback: Callback)` | `clearAll(_:)` | `{}` |

- 能力探测**刻意用 `getCacheInfo` 而不是 `download`**（`platform-capabilities.ts` 的 `songCache`）：`download` 的入参个数变过，旧壳上探它会报「可用」然后被喂进绑不上的参数。
- 哨兵 `limit_exceeded`（常量 `SONG_CACHE_LIMIT_ERROR`，`src/features/player/data/song-cache.ts`）：下载会超字节上限时原生侧中止并报这个字符串，facade reject 出的 `Error.message` 就等于它。
- 三端 P3a 增加 `getCacheContract/cacheEntry/getEntry/listEntries/removeEntry/clearNamespace/clearLegacy/getTasks/cancelTask`，单例 `SongCacheStore` 与旧入口共用串行调度、总容量和真实取消；共享 TS 在方法齐全且版本为 2 时采用身份索引，否则沿用旧 ABI。iOS 改为 `LynxContextModule` 发送数组进度事件，URLSessionDataDelegate 流式写入；HarmonyOS 用 RCP 响应头/数据回调、真实 request 取消及 statfs 空间检查。两端编译/设备行为尚未验证，Node 适配器执行 HarmonyOS 源码不能替代 HAP 编译。发布契约为 bridge 3 / schema 2 / `songCache.v2`；身份、快照、分页、任务和事件契约见[设备歌曲缓存](device-cache.md)。

**闸门锁住的不变量**

| 不变量 | Android | iOS | HarmonyOS |
|---|---|---|---|
| 下载遵守 insecure-TLS 开关 | `clientFor(InsecureTls.enabled)` | 独立流式 delegate 调用 `InsecureTls.shared.handle` | RCP `remoteValidation`，切换策略取消当前 session |
| 缓存不放在 OS 可回收目录 | 用 `.filesDir`，**禁止** `ctx.cacheDir` | 用 `.documentDirectory`，**禁止** `.cachesDirectory` | 用 ability `.filesDir` |
| 回调返回可播放的 `file://` URL，且不是手拼的 | `java.net.URI` 编码 | `absoluteString` | `fileUri.getUriFromPath` |
| 下载原子提交（崩溃不留半截「可播放」文件） | `renameTo` | `moveItem` | `fileIo.renameSync` |
| 字节上限哨兵与 TS facade 逐字共享 | 含 `limit_exceeded` | 含 `limit_exceeded` | 含 `limit_exceeded` |
| 新旧方法的桥接注册 | `@LynxMethod` + Callback | `methodLookup` + Callback | public 方法 + Callback |

### 2.7 `SongloftFloatingLyric`（10 方法，仅 Android）

统一签名 `fun <name>(args: String, callback: Callback)`，`args` 是 JSON 字符串。

| 方法 | `args` | 返回 |
|---|---|---|
| `hasPermission` | `{}` | `{result: boolean}` |
| `requestPermission` | `{}` | `{result: boolean}` |
| `show` | `{}` | — |
| `updateLyric` | `{line, nextLine}` | — |
| `hide` | `{}` | — |
| `isShowing` | `{}` | `{result: boolean}` |
| `setFontSize` | `{size}`，`size ∈ small \| medium \| large` | — |
| `setLocked` | `{locked}` | — |
| `setOpacity` | `{opacity}` | — |
| `setTwoLine` | `{twoLine}` | — |

- 无事件。iOS / Web 上 facade 返回全惰性桩（`hasPermission`/`requestPermission`/`isShowing` 恒 `false`）。
- **`requestPermission` 只答一次，且答在「用户从系统页回来」之后**（`lyric/OverlayPermission.kt`）。`Settings.ACTION_MANAGE_OVERLAY_PERMISSION` 不能 `startActivityForResult`、不回传任何结果，授权唯一可观测的时机是 App 重回前台（`MainActivity.onResume` → `OverlayPermission.onAppForegrounded`）。旧实现在 `startActivity` 之后立刻答 `false`，等于对每一次「用户正要去授权」都回答「拒绝」：开关拨上去了、pref 写成 true、`show()` 永不发生，只有「再关再开」才碰上「已授权」的早返回分支（2026-08-28 真机报障）。**因此「只想恢复上次状态」的调用点必须用 `hasPermission`**（只读、不开界面）—— 尤其启动链：`requestPermission` 会等到前台恢复才 resolve，留在 `await` 链上会把 `auth.hydrate()` 一起卡死。
- **pref 与系统授权是两个真相源**，协调逻辑只有一处：`src/features/settings/domain/floating-lyric-overlay.ts`（`syncFloatingLyricOverlay` 用于启动与进页，`enableFloatingLyricOverlay` / `disableFloatingLyricOverlay` 用于开关）。授权没了就把 pref 落回 false，否则开关显示「开」而屏幕上什么都没有。
- 窗口实现在 `lyric/FloatingLyricService.kt`。**`showOverlay()` 必须自己再查一遍授权**：未授权时 `WindowManager.addView` 抛 `BadTokenException: permission denied for window type 2038`，而它抛在 `onStartCommand` 里 ⇒ 未捕获就是**杀进程**（实测到过 `FATAL EXCEPTION: main`）。调用方查过不代表此刻仍成立：用户可以随时在系统设置里收回授权，`START_STICKY` 还会在那之后重发 SHOW。
- `updateText` 必须经 `Handler(Looper.getMainLooper())` post —— 原生模块方法跑在 Lynx JS 线程，碰主线程创建的 View 会抛 `CalledFromWrongThreadException`，而模块里的 `catch (_: Exception) {}` 会把它整个吞掉（表现：窗口浮出来了、一行歌词也不显示、logcat 干净）。
- **悬浮窗生命周期跟随服务**：窗口要熬过的是退后台（双击返回走 `moveTaskToBack`，不移除任务 → 不停服务，歌词常驻，设计如此）；但**移除任务**（最近任务划卡片杀后台）时，推 `updateLyric` 的 JS 已随任务死亡，而进程被前台媒体服务钉住不灭，幸存的窗口只是一块冻结残影 —— `android:stopWithTask="true"` 让系统在该时刻停掉服务，`onDestroy` 摘窗。此属性缺失导致过真机报障：杀后台后歌词冻在最后一行，无任何入口能关掉。

**闸门锁住的不变量**：10 个方法各自有 `@LynxMethod`，且签名里的回调参数是 `callback: Callback`（Kotlin lambda 不是注册类型，会静默失败）；授权链的形状另有 5 例（模块不得自己开系统页、`onResume` 必须接 `onAppForegrounded`、开不了系统页要答复而非停等、等待者被清空、`src/index.tsx` 不得出现 `requestPermission`）。另由 `src/__tests__/android-manifest-contract.test.ts` 锁住 `AndroidManifest.xml` 必须声明 `SYSTEM_ALERT_WINDOW` 权限与 `FloatingLyricService`，且该 `<service>` 元素必须声明 `android:stopWithTask="true"`、服务 `onDestroy` 必须摘窗 —— **都是静默失败**，缺了要么整个功能死掉、要么杀后台后残留冻结窗口，而无任何报错。

### 2.8 `SongloftLiveActivity`（3 方法，仅 iOS）

统一签名 `func <name>(_ args: String, callback: @escaping (String) -> Void)`，`args` 是 JSON 字符串。

| 方法 | iOS 选择器 | `args` | 返回 |
|---|---|---|---|
| `start` | `start(_:callback:)` | `{title, artist}` | activity id 字符串 |
| `update` | `update(_:callback:)` | `{id, title, artist, isPlaying}` | — |
| `end` | `end(_:callback:)` | `{id}` | — |

- 无事件。Android / Web 上 facade 返回惰性桩（`start` 恒返回 `''`）。
- 注册被 `if #available(iOS 16.2, *)` 包住：`LiveActivityModule` 标了 `@available(iOS 16.2, *)`（ActivityKit 下限）而部署目标是 16.0，守卫外引用该类是**硬编译错误**。

**闸门锁住的不变量**：必须是 `class LiveActivityModule`（**不是 enum** —— enum 无法注册为 Lynx 模块）、conform `LynxModule`、有 `@objc`、有 `static var name`、有 `methodLookup` 且含 `start`/`update`/`end` 三条。

### 2.9 `SongloftNavigation`（3 方法，Android + Web；iOS 刻意不做）

全部 fire-and-forget，位置参数，无 Callback。

| 方法 | Kotlin 签名 | 语义 |
|---|---|---|
| `setBackConsumable` | `setBackConsumable(consumable: Boolean)` | JS 把「下一次返回是否归我」镜像给宿主 |
| `notifyBackHandled` | `notifyBackHandled(seq: Int)` | 看门狗 ack；宿主连续 3 次无 ack 就不再信任 flag |
| `exitApp` | `exitApp()` | 退出（Post 到主 looper） |

**事件**：`SongloftNavigation.backPressed`，payload `{seq}`（`seq` 缺失/非法降级为 0 = 「无 ack」，安全方向）。常量：TS `BACK_PRESSED_EVENT`（`src/native/navigation.ts`）、Kotlin `SongloftNavigationModule.EVENT_BACK_PRESSED`；由 `MainActivity` 发出（LynxView 在那里）。

- **为什么是 flag 而不是问 JS**：`onBackPressed()` 必须**同步**决定是否消费，Lynx 没有同步进 JS 的调用，原生也绝不能阻塞等 Promise。
- **双击退出的第二次按键由宿主本地 `moveTaskToBack(true)` 执行**（JS 在提示武装时主动把 flag 降为 false），所以快速连击无竞态、JS 卡死在 tab 首页也能退出。
- **平台差异**：iOS 无返回键可拦，facade 走 `createUnavailableStub()`（`available === false`）；Web 恒 `consumable=false`，靠主线程一个 sentinel history entry 实现，`notifyBackHandled` 在 Web 是合法 no-op 但**必须存在**（facade 的完整性探测会因缺一个方法而拒收整个模块）。
- **只有真实 adapter 被 memoize**，stub 不 memoize：返回控制器在首帧前就启动，那时 `NativeModules` 可能还没填好，latch 成「不可用」会让返回键整个 session 失效。

**闸门锁住的不变量**：3 个方法在 Kotlin 有 `@LynxMethod`、在 `web/songloft-navigation-module.js`（worker 侧）与 `web/audio-host.js`（主线程 handler，形如 `<name>: function`）都存在；事件名逐字出现在 Android 与 Web 宿主里。

完整规范见 [`back-navigation.md`](back-navigation.md)。

### 2.10 `SongloftWebview`（3 方法，仅 Web）

全部 fire-and-forget，位置参数，无 Callback。契约跑在三个文件之间：facade `src/native/web-webview.ts`、worker 侧 `web/songloft-webview-module.js`、主线程 `web/webview-host.js`。

| 方法 | 签名 |
|---|---|
| `open` | `open(url: string, selector: string)` |
| `postMessage` | `postMessage(json: string)` |
| `close` | `close()` |

**事件**

| 事件名 | 说明 |
|---|---|
| `SongloftWebview.message` | iframe 转发上来的插件宿主调用 |
| `SongloftWebview.openFailed` | 主线程按 selector 找不到占位元素（短轮询后），页面回落到「不可用」提示 |
| `SongloftWebview.load` | 主线程会发，但**当前无 worker 侧监听者**（诊断 / 未来的内部 history 支持）；刻意不在 facade 里声明 |

**闸门锁住的不变量**

- 3 个方法在 worker 侧模块与主线程 handler 两半都存在（`close` 缺失会让每次离开插件页都漏一个覆盖全 App 的 iframe）。
- `SongloftWebview.message` / `.openFailed` 两个名字在 facade 与主线程逐字一致。
- 占位元素 id 两处一致：`src/features/jsplugin/pages/PluginWebViewPage.tsx` 同时含 `id='plugin-webview-frame'` 与 `'#plugin-webview-frame'`。
- **iframe 必须挂进 `lynxView.shadowRoot`**（`lynx-view` 的 `contain: strict` 使其成为层叠上下文，body 级的 frame 会盖过所有 App 覆盖层），且 `z-index` 必须是 `'50'`（页面内容 auto < frame 50 < 导航胶囊 90 / mini-player 91 / sheet 100 / dialog 200-201）；`ToastHost.css` 的 `.toast-wrap` z-index 必须是三位数以越过 frame。

### 2.11 `SongloftPluginBridge`（6 方法）

全部位置参数、fire-and-forget（无 Callback）。注册在 application 级：每个 `LynxContext`（父页 / 子 `<frame>`）各拿一个模块实例，但 `hostRegistry` / `childRegistry` 按 `frameId` 共享 —— 这是跨 LynxContext 通信的唯一通道。

| 方法 | 调用方 | Kotlin 签名 | iOS `methodLookup` 选择器 |
|---|---|---|---|
| `registerHost` | 父页 | `registerHost(frameId: String)` | `registerHost(_:)` |
| `unregisterHost` | 父页 | `unregisterHost(frameId: String)` | `unregisterHost(_:)` |
| `hostReply` | 父页 | `hostReply(frameId: String, callId: String, resultJson: String)` | `hostReply(_:callId:resultJson:)` |
| `pushToChild` | 父页 | `pushToChild(frameId: String, eventName: String, dataJson: String)` | `pushToChild(_:eventName:dataJson:)` |
| `registerChild` | 子 frame | `registerChild(frameId: String)` | `registerChild(_:)` |
| `hostCall` | 子 frame | `hostCall(frameId: String, callId: String, ns: String, method: String, paramsJson: String)` | `hostCall(_:callId:ns:method:paramsJson:)` |

**事件（3 个）**：`SongloftPluginBridge.hostCall`（送给**父页**上下文）、`.hostReply`（送给**子 frame**上下文）、`.push`。常量在 Kotlin `SongloftPluginBridgeModule.EVENT_*`；TS 侧唯一消费点是 `src/features/jsplugin/widgets/LynxPluginFrame.tsx`（**facade 内联在那里**，没有独立的 `src/native/*.ts`）。`frameId` 由父页经 global-props 传给子 frame。

**闸门锁住的不变量**：**只有 `modules` 表那一行**（三端的注册调用都在）。**6 个方法面没有逐方法断言** —— 它既不在 `hosts` 表里，也没有专属 `describe`，属于 AUD-009 同一类缺口：改坏签名不会有任何测试变红。

### 2.12 `SongloftLynxFrame`（6 方法，仅 Web）

Web 上渲染 Lynx 插件的宿主（native 构建用真实 `<frame>` 元素，不需要这个模块）。契约跑在三个文件之间：facade `src/native/web-lynx-frame.ts`、worker 侧 `web/songloft-lynx-frame-module.js`、主线程 `web/lynx-frame-host.js`。

| 方法 | 签名 |
|---|---|
| `open` | `open(bundleUrl: string, selector: string, globalPropsJson: string, key: string)` |
| `updateGlobalProps` | `updateGlobalProps(json: string)` |
| `sendEvent` | `sendEvent(name: string, dataJson: string)` |
| `hostReply` | `hostReply(callId: string, resultJson: string)` |
| `hide` | `hide(key: string)` |
| `close` | `close(key: string)` |

**事件**

| 事件名 | 说明 |
|---|---|
| `SongloftLynxFrame.message` | 子 frame 转发上来的插件宿主调用 |
| `SongloftLynxFrame.openFailed` | 主线程按 selector 找不到占位元素，页面回落到「不可用」提示 |

- `key` 是插件的 `entryPath`，宿主靠它保活子 frame；空 `key` 的 `close` 释放全部（登出）。
- 离页必须 `hide()`、**不得** `close()`（`PluginWebViewPage` / `LynxPluginFrame` 两处都由闸门锁死）：关掉会让每次切 tab 都重建插件页。
- `open` / `updateGlobalProps` 等在 facade 里都被 `try/catch` 包住：宿主页过期时最坏是丢一次推送，不能抛在卸载路径上。

**闸门锁住的不变量**：6 个方法在 worker 侧模块与主线程 handler 两半都存在；两个事件名在 facade 与主线程逐字一致；两个插件页都不得在 unmount 调 `close()`。这个模块的两个 URL 与它的主线程脚本一度整块漏在部署清单外（`copy-bundle-web.mjs` 漏拷 = 线上 404，脚本 tag 存在也没用），如今由 `web-host-page.test.ts` 覆盖。

### 2.13 `SystemAppearance`（不是 NativeModules 模块）

| 通道 | 载荷 | 用途 |
|---|---|---|
| `lynx.__globalProps` | key `systemTheme` / `systemLocale` | **初值**，宿主在 `renderTemplateUrl` 之前写好 ⇒ 首帧就知道系统主题，不闪错主题。原生模块的 `getAppearance()` 做不到这点（异步，首帧已画完） |
| `sendGlobalEvent` | 事件 `SongloftSystem.appearanceChanged`，payload 同两个 key | **变更**推送 |

常量三处：TS `GLOBAL_PROP_THEME` / `GLOBAL_PROP_LOCALE` / `SYSTEM_APPEARANCE_EVENT`（`src/native/system-appearance.ts`）、Kotlin `SystemAppearance.PROP_THEME` / `PROP_LOCALE` / `EVENT_CHANGED`、Swift `SystemAppearance.propTheme` / `propLocale` / `eventChanged`。

- `theme` 取值 `light` / `dark`，未知值一律降级为 `null`（= 「宿主没说」），由各消费方自己兜默认，本模块不发明默认值。
- `android:configChanges` 必须含 `uiMode|locale|layoutDirection`，否则切换时 Activity 重建（由 manifest 闸门锁住）。

**闸门锁住的不变量**：2 个 globalProps key + 1 个事件名 + `light`/`dark` 两个值逐字出现在两个宿主里。

### 2.14 `AppLifecycle`（不是 NativeModules 模块，三端源码接入）

- `MainActivity.onResume` 通过 `sendGlobalEvent('SongloftLifecycle.resumed', [{}])` 通知根 LynxView，事件名必须与 TS `APP_RESUMED_EVENT` 一致。
- `PluginWebViewPage` 在后台线程的 `useEffect` 中订阅；原生 `<webview>` 通过现有 [eval](https://lynxjs.org/next/api/elements/built-in/webview.html) 在其浏览器下一帧派发 `visibilitychange`，让 MIoT 等插件恢复连接与状态。不重载页面，也不新增原生方法。
- 卸载或更换页面 URL 时取消订阅，已排队的回调也会因订阅失效而跳过。缺少完整事件接口时降级为无操作。
- P6c：iOS SceneDelegate 的 active/inactive 回调送到所属 ViewController，根 LynxView 首屏就绪前保留待发通知、离开活跃取消待发，重复 active 不重发；首屏回调弱捕获并核对当前 view，scene 断开清窗口。HarmonyOS Ability 进入前台/后台驱动 AppLifecycle，Index 的 onCreate 绑定上下文、LynxViewClient.onFirstScreen 放行通知，onDestroy/aboutToDisappear 按实例移除，旧 view 的迟到 ready/detach 不影响新 view。
- 原生 WebView 与 Lynx frame 消费点分开：WebView 下一浏览器帧派发 visibilitychange；LynxPluginFrame 通过 `native-plugin-host.ts` 注册/注销四方法父桥、过滤 frameId、回复宿主 RPC 并推送 `SongloftPluginBridge.push` 的 `event: 'lifecycle', data: '{"state":"resumed"}'`。播放器/主题提供首帧快照和后续推送，迟到 RPC 回复与卸载回调被抑制，不重载插件。
- 子插件 SDK 的事件订阅独立注册子 frame，并在 push listener 就绪后以已有 hostCall 通道发送 `lifecycle.ready`；父桥合并准备前的最新快照/恢复通知，就绪后提供初始恢复通知，此后恢复前台继续推送。旧插件要用更新的 `@songloft/lynx-plugin-sdk` 重新构建才能获得 ready 逻辑；源码在 `plugins/toolchain` 独立仓库，未发布 npm 包，不改变必需热更新能力清单。
- Web iframe 继续浏览器可见性；嵌套 Lynx frame 由主线程 `lynx-frame-host.js` 在 document 从 hidden 回 visible、保活插件重新进入时推送同义 lifecycle 事件，只送当前活跃且 ready 的子 frame。隐藏的保活子 frame 不收到恢复通知，切页保持已有 worker/state，不 detach。
- 闸门覆盖三端生命周期注册、四方法父桥、实际 HOS 控制器适配器、订阅/清理、WebView 执行脚本、native frame 消费点和 Web 保活恢复。SDK 另有独立事件/RPC 注册回归。iOS/HarmonyOS 编译与真实前后台、MIoT 断网重连/快照仍开放，不以源码/夹具替代设备验证。依据：[Apple scene lifecycle](https://developer.apple.com/documentation/uikit/uiscenedelegate)、[OpenHarmony UIAbility](https://github.com/openharmony/interface_sdk-js/blob/OpenHarmony-5.0.0-Release/api/%40ohos.app.ability.UIAbility.d.ts)、[Lynx 4.0.1 ViewClient](https://github.com/lynx-family/lynx/blob/4.0.1/platform/harmony/lynx_harmony/src/main/ets/tasm/LynxViewClient.ets)。

---

### 2.15 `SongloftUpdate`（9 方法，三端源码接入；iOS/HarmonyOS 待编译）

读方法 `getInfo(callback)`、`getState(callback)`、`inspectManifest(raw, signature, callback)`、`fetchMetadata(requestJson, callback)`；异步写入 `download(requestJson, callback)` 与 `restoreBuiltin(callback)` 在持久化完成后回调；void 命令 `cancel(taskId)`、`confirmStartup(bundleId)`、`reportStartupFailure()`。元数据请求 `{url, max_bytes}` 返回 `{status, body}`，独立系统 TLS、12 秒网络期限、有界 UTF-8 读取和 HTTPS 跳转，不继承业务证书跳过设置。进度事件 `SongloftUpdate.progress` 的数组参数含 `{task_id, bytes, total}`。任何出错回调只含机器错误码，不转发带 URL/凭据的网络异常文本。

旧壳逐方法探测：原有八方法是状态/下载/启动能力，新 `fetchMetadata` 单独探测，缺失时关于页只提供本通道发版页。原生信息来自内置 `native-host.json`，签名/hash/兼容及新旧判断由壳执行；当前发布契约为 bridge 3 / schema 2，含 `updater.metadata.v1` 与 `songCache.v2`。下载只准备下次冷启动，根模板加载器重新验证磁盘并持久化 trial；RouteErrorBoundary 内的 `UpdateStartup` 确认真实路由启动，未确认下次回退。Web 无该原生模块；完整协议与开放项见 [client-updates.md](client-updates.md)。

## 3. 调用约定

完整论述见 [`../../AGENTS.md`](../../AGENTS.md) §4「原生模块契约」。要点：

1. **原生方法不返回 Promise**。写是 fire-and-forget，读靠 `com.lynx.react.bridge.Callback`（iOS 同构 `@escaping (String) -> Void`）。
2. **Promise 化必须在 TS 适配层逐方法完成**。参考 `src/core/storage/native-storage.ts`、`src/native/dlna.ts`。
3. **禁止把原生模块强转成 Promise 接口**（`nm.X as XModule`）。原生返回 `undefined`，`.then()` 直接 TypeError。
4. **部分可用的模块要整体当没有**。facade 逐个探测必需方法，缺一个就返回 `null` / 惰性桩 —— `mod?.method?.()` 会把缺失的那半变成静默 no-op，而缺失的那半往往正是关键能力（例：navigation 缺 `exitApp` = 用户永远退不出）。
5. **事件名逐字一致**：TS 订阅名 vs 原生 `sendGlobalEvent` 发出名。
6. **`sendGlobalEvent(name, params)` 第二参必须是数组**。worker 侧最终走 `listener.apply(ctx, params)`，普通对象没有 `length` ⇒ 传零个参数、listener 收到 `undefined`（闸门对 `web/` 三个文件做行级检查）。
7. **只 memoize 真实 adapter，不 memoize 惰性桩**（首帧前 `NativeModules` 可能还没填好）。

---

## 4. 新增方法的同步清单

一个新方法要在**五处**落地，少任一处都是静默 no-op：

| # | 位置 | 具体做什么 |
|---|---|---|
| 1 | **TS** | facade 的原生 interface 加方法声明（保持原生真实形状：`void` + Callback），并写 promisify 包装；若它是新能力的探测键，同步 `src/native/platform-capabilities.ts` **并在同一次改动里加消费点** |
| 2 | **Kotlin** | 方法上必须有 `@LynxMethod`；回调参数写 `callback: Callback`（不要 Kotlin lambda） |
| 3 | **iOS** | `func` **和** `methodLookup` 条目两者都要 —— 不在 lookup 表里的方法对 JS 等于不存在 |
| 4 | **HarmonyOS** | ArkTS 侧同名方法 + 装饰器标注（`harmony/entry/src/main/ets/modules/`）；缺了同样是可选链吞掉的 no-op |
| 5 | **闸门** | `src/__tests__/native-module-contract.test.ts`：新模块要扩 `hosts` 表 + `modules` 表 + 一段 `describe`；新方法通常由 `interfaceMethods()` 自动枚举，确认它被解析到（各 describe 都有一条「the interface was parsed」防空列表）。**注意各模块的通用方法循环未必都含 Harmony** —— AUD-002 就是在这种「全绿」下漏出来的 |

**新模块还要注册**：Android 在 `SongloftApplication.kt` 的 `LynxEnv.inst().registerModule("<Name>", <Class>::class.java)`；iOS 在 `ViewController.swift` 的 `buildConfig()` 里 `config.register(<Class>.self)`，**并且**新的 `.swift` 文件要在 `ios/SongloftLynx.xcodeproj/project.pbxproj` 的**四个 section** 登记（`PBXFileReference` / `PBXBuildFile` / `PBXGroup` / `PBXSourcesBuildPhase`）。新增 Kotlin `Service` / `Activity` 还要在 `AndroidManifest.xml` 声明（由 manifest 闸门从 Kotlin 源码反推，双向校验）；HarmonyOS 在 `harmony/entry/src/main/ets/pages/Index.ets` 用 `this.modules.set("<Name>", { moduleClass: ... })` 注册（按 LynxView 逐实例接线，不是全局 `registerModule`；`EntryAbility.ets` 只接 HTTP service），新权限 / `backgroundModes` 还要写进 `module.json5`。

**同时更新文档**：本文件的总表与对应小节（平台模块表的权威副本就在这里），以及 [`native-development.md`](../guides/native-development.md) 的同步清单。

---

## 相关

- [原生开发指南](../guides/native-development.md)
- [AGENTS.md](../../AGENTS.md) —— §3 Lynx 与 Web 约束、§4 原生模块契约、§5 验证契约
- [平台差异](../architecture/platform-differences.md)
