# Songloft Player：Lynx 自研原生能力规范

> **⚠️ 文档性质：预研阶段参考**
> 本文档产出于迁移启动前。以下模块已实现（Android + iOS）：
> - **SongloftAudio** ✅ — ExoPlayer/AVPlayer + MediaSession + EQ DSP（10段），TS 侧 `src/native/audio-facade.ts`
> - **SongloftStorage** ✅ — prefs(SharedPreferences/UserDefaults) + secure(Keystore/Keychain)，TS 侧 `src/core/storage/`
> - **SongloftPlatform** 🔶 — 文件选择/URL打开已实现；DLNA/Live Activity/悬浮歌词未实现
> - **SongloftBackend** ⬜ — 当前 standalone 模式直连后端，embedded 模式未实现
>
> 当前实际接口以代码为准，草案仅作历史参考。见 [README.md](./README.md)。

> 本文档为迁移调研第 3 篇，是**迁移工作量的核心**：列出 Lynx 缺失、须自研的原生能力清单与接口草案。总览见 [lynx_migration_overview.md](./lynx_migration_overview.md)，能力对照见 [lynx_capability_matrix.md](./lynx_capability_matrix.md)，路线见 [lynx_migration_roadmap.md](./lynx_migration_roadmap.md)。
>
> **组织方式**：移动端（A/I）按 Lynx Autolink 库形态组织（`lynx.lib.json`）；桌面端（M/Win）按 Lynxtron 两条路径组织（Node.js 原生模块 / Lynx 原生能力库，AutoLink `--platforms lynxtron` + `pluginLynxtron()`）；Web 走纯 TS + 浏览器 API。
>
> 接口签名为**草案**，用于估算与对齐，非最终 API。Lynxtron 侧 API 出自官方 `/next/`（canary）文档，正式版前可能变动。
>
> **确定性标注**（详见 [overview](./lynx_migration_overview.md) 头部）：`✅代码`=源码实测 / `✅官方`=官方文档 / `⚠️待核实` / `💭`=假设。本文档中：所有 TS `interface` 均为 `💭 草案`；「可复用的现有原生代码」路径为 `✅代码`；Lynxtron 机制（`LynxWindow`/`lynxBridge`/`contextBridge`/`lynxtron-rebuild`/`pluginLynxtron` 等）为 `✅官方 canary`；各平台原生 SDK 选型（ExoPlayer/AVPlayer/Media Foundation 等）为 `💭` 经验选型，非官方指定。

---

## 0. Autolink / 平台前提

**移动端 Autolink 前提**：`create-lynx-library` 脚手架 + `@lynx-js/autolink-codegen` + Gradle 插件（Android）+ CocoaPods 插件（iOS）`⚠️待核实`（工具包名与可用性须按当前官方 `guide/autolink` 复核）。**Autolink 不生成 Web / HarmonyOS 代码，Web 须手写 TS 实现** `⚠️待核实`。桌面 Lynxtron 的 AutoLink（`--platforms lynxtron` + `pluginLynxtron()`）为 `✅官方 canary`。

**桌面端（Lynxtron）两条路径**：

| 路径 | 形态 | 适用 | 接入 |
|---|---|---|---|
| **Node.js 原生模块** | `.node`（Node-API/node-gyp），如 `better-sqlite3` | 纯 Node 逻辑：存储、后端子进程、文件、网络、代理 | `@lynx-js/lynxtron-rebuild` 重编 → 主进程 `require` → `contextBridge.exposeInLynxBTS()` / `lynxBridge.handle()` 暴露给 UI |
| **Lynx 原生能力库** | C++ `LYNX_REGISTER_NATIVE_MODULE`/`LYNX_REGISTER_ELEMENT` | 性能敏感、需注册为 `NativeModules.<X>` 或 Lynx 元素（如音频、自定义视图） | `npm create lynx-library --platforms lynxtron` → `pluginLynxtron()` AutoLink（覆盖桌面）→ `NativeModules.<ModuleName>` |

**Lynxtron 通信通道（草案统一约定）**：

- Node→UI 推送：`LynxWindow.sendGlobalEvent(name, payload)` → UI `GlobalEventEmitter.addListener`。
- UI→Node 调用（带返回）：`NativeModules.bridge.call(method, args)` → `lynxBridge.handle(method, handler)`。
- UI→Node 单向：`NativeModules.bridge.send(channel, args)` → `lynxBridge.on(channel, listener)`。
- preload 直接暴露 JS 对象：`contextBridge.exposeInLynxBTS(obj)` → UI `NativeModules.nodejs.exposed`。

---

## 1. SongloftAudio

**最重要、跨端工作量最大的模块。** 对应现有 `lib/core/audio/`（20 文件）+ `just_audio`/`audio_service`/`media_kit`/`smtc_windows` 等。

### 方法（草案）

```ts
interface SongloftAudio {
  // 源与传输
  load(url: string, opts?: { hls?: boolean; headers?: Record<string,string> }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(v: number): Promise<void>;      // 0..1
  setSpeed(rate: number): Promise<void>;     // 0.5..3.0

  // 队列
  setQueue(items: AudioItem[], startIndex?: number): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  setRepeatMode(mode: 'off'|'one'|'all'): Promise<void>;
  setShuffle(on: boolean): Promise<void>;

  // 均衡器（10 段，31Hz–16kHz）
  setEqualizerEnabled(on: boolean): Promise<void>;
  setEqualizerBand(index: number, gainDb: number): Promise<void>; // index 0..9
  getEqualizerBands(): Promise<{ centerHz: number; gainDb: number }[]>;
}
```

### 事件（草案）

```ts
type AudioEvent =
  | { type: 'stateChanged'; state: 'idle'|'loading'|'ready'|'playing'|'paused'|'completed'|'error' }
  | { type: 'progress'; positionMs: number; bufferedMs: number; durationMs: number }
  | { type: 'queueIndexChanged'; index: number }
  | { type: 'error'; code: string; message: string };
```

### 逐端实现路径

| 平台 | 播放核心 | 后台/系统集成 | EQ | 可复用现有代码 |
|---|---|---|---|---|
| **Android** | ExoPlayer | MediaSessionService + 前台服务 + 通知 | `Equalizer`(AudioEffect) | `songloft_mediakit_player.dart` 逻辑参考 |
| **iOS** | AVPlayer + AVAudioSession | MPNowPlayingInfoCenter + MPRemoteCommandCenter | AVAudioUnitEQ | 现有 Swift 音频集成 |
| **Web** | HTMLAudioElement + hls.js | MediaSession API | Web Audio BiquadFilter | **可直接复用 `web/hls_bridge.js`、`web/equalizer.js` 的算法与 EQ 参数** |
| **macOS**（Lynxtron） | AVFoundation 或 libmpv（Lynx 原生能力库 C++，或 Node 原生模块） | 系统媒体控件 + `MPNowPlayingInfoCenter` | libmpv af 或 AVAudioUnitEQ | `songloft_mediakit_player.dart`（libmpv 参数） |
| **Windows**（Lynxtron） | Media Foundation 或 libmpv | SystemMediaTransportControls（对应 `smtc_windows`） | libmpv af 或 XAudio2 | `smtc_service_native.dart`、libmpv 参数 |

- **覆盖平台**：全部 5 端。
- **形态**：移动端 Autolink 原生模块；桌面端优先 Lynx 原生能力库（`NativeModules.SongloftAudio`），进度/状态事件经 `sendGlobalEvent`；Web 纯 TS。
- **风险**：🔴（跨端后台播放策略差异大，尤其 iOS 后台会话与 Android 厂商省电策略）。

---

## 2. SongloftStorage

对应 `shared_preferences`、自研 `secure_storage.dart`、`path_provider`。

```ts
interface SongloftStorage {
  // 偏好设置（键值，非敏感）
  prefs: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };
  // 安全存储（敏感：token 等）
  secure: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  // 应用目录路径
  paths: {
    appData(): Promise<string>;
    cache(): Promise<string>;
    documents(): Promise<string>;
  };
}
```

| 平台 | prefs | secure | paths |
|---|---|---|---|
| Android | SharedPreferences | Keystore | Context 目录 |
| iOS | UserDefaults | Keychain | NSSearchPath |
| Web | localStorage | localStorage（受限，敏感数据风险，待决降级策略） | 虚拟/IndexedDB |
| macOS（Lynxtron） | Node fs / better-sqlite3 | Keychain（原生）或 keytar | `app.getPath('userData')` |
| Windows（Lynxtron） | Node fs / better-sqlite3 | DPAPI / Credential Locker | `app.getPath('userData')` |

- **覆盖平台**：全部 5 端。桌面可直接用 Node.js 原生模块（`better-sqlite3` 参考官方 todolist 示例）。
- **风险**：🟡（Web 安全存储无真正安全区，须产品确认）。官方 Lynx Native Modules 教程正是本地持久化示例，移动端有官方范式可循。

---

## 3. SongloftBackend

内嵌 Go 后端生命周期与**后端热更**。对应 `com.songloft/backend` 通道、`lib/core/backend/embedded_backend_service.dart`、`native_contract_service.dart`、`lib/core/updater/backend_patch_service.dart`、`patch_update_service.dart`。

```ts
interface SongloftBackend {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
  getPort(): Promise<number>;
  // 后端热更
  stageBackendPatch(patchPath: string): Promise<void>;
  confirmBackendPatch(): Promise<void>;
  restartProcess(): Promise<void>;
}
```

| 平台 | 实现 | 复用 |
|---|---|---|
| Android | **gomobile bind 生成的 `.aar`**，反射调用 `mobile.Mobile`；后端热更=替换 `libgojni.so` `✅代码`（`android/app/build.gradle.kts`、`SongloftBackendPlugin.kt`、`BackendPatchManager.kt`） | 现有 gomobile 产物 + `BackendPatchManager` 逻辑 |
| iOS | gomobile framework（`SongloftBackendPlugin.swift`）`✅代码` | 现有 gomobile 产物 |
| macOS/Windows（Lynxtron） | **Node.js `child_process` 拉起 Go 后端子进程** `💭`；端口/状态经 `lynxBridge` + `sendGlobalEvent` 通知 UI `✅官方 canary`（通信机制） | 现有桌面子进程模型 |
| Web | 后端为远程服务，无内嵌 | — |

- **覆盖平台**：A/I/M/Win（Web 不适用）。
- **风险**：🟡（后端热更流程需与 Lynx bundle 热更协调，见路线图 P4）。

---

## 4. SongloftPlatform

平台特性聚合。对应 `com.songloft/floating_lyric`、`liveActivity`、`widget_action`、`songloft.desktop_lyric`、DLNA、权限。

```ts
interface SongloftPlatform {
  liveActivity?: {  // iOS
    start(attrs: LyricAttrs): Promise<string>;
    update(id: string, state: LyricState): Promise<void>;
    end(id: string): Promise<void>;
  };
  floatingLyric?: {  // Android overlay
    requestPermission(): Promise<boolean>;
    show(): Promise<void>;
    update(line: string): Promise<void>;
    hide(): Promise<void>;
  };
  desktopLyric?: {  // Lynxtron 多窗口
    openWindow(): Promise<void>;      // 新建独立 LynxWindow
    updateLyric(state: LyricState): Promise<void>; // 经 sendGlobalEvent 推给歌词窗
    setFontSize(px: number): Promise<void>;
    closeWindow(): Promise<void>;
  };
  widget?: { update(state: WidgetState): Promise<void> };  // A/I home widget
  dlna?: {
    startDiscovery(): Promise<void>;
    stopDiscovery(): Promise<void>;
    cast(deviceId: string, mediaUrl: string): Promise<void>;
    control(action: 'play'|'pause'|'stop'|'seek', arg?: number): Promise<void>;
  };
  permissions?: {
    request(name: 'notification'|'overlay'|'mediaLibrary'): Promise<boolean>;
    status(name: string): Promise<'granted'|'denied'|'undetermined'>;
  };
}
```

**逐能力实现与复用**：

| 能力 | 平台 | 实现 | 复用现有原生代码 |
|---|---|---|---|
| Live Activity | I | Swift ActivityKit + Widget Extension | 现有 `liveActivity` Swift 侧 |
| 悬浮歌词 | A | Kotlin WindowManager overlay + `SYSTEM_ALERT_WINDOW` | `android_floating_lyric_controller.dart` 对应 Kotlin |
| 桌面多窗口歌词 | M/Win | Lynxtron 独立 `LynxWindow` + `lynxBridge` IPC | `desktop_lyric_ipc.dart` / `desktop_lyric_main.dart` IPC 协议参考 |
| home widget | A/I | 原生 widget provider | 现有 widget Kotlin/Swift |
| DLNA | A/I/M/Win | SSDP + SOAP 控制点（移动端原生模块，桌面 Node） | `lib/features/dlna/`（715 行）业务逻辑参考 |
| 权限 | A/I | 原生权限 API | 现有权限调用 |

- **覆盖平台**：按能力分端（见表）。
- **风险**：🟡（各能力独立，无单点阻断，但总量大）。

---

## 5. 模块-平台-形态矩阵（汇总）

| 模块 | A | I | W | M(Lynxtron) | Win(Lynxtron) | 主要风险 |
|---|---|---|---|---|---|---|
| SongloftAudio | Autolink | Autolink | TS | Lynx 原生能力库 | Lynx 原生能力库 | 🔴 后台播放 |
| SongloftStorage | Autolink | Autolink | TS | Node 原生模块 | Node 原生模块 | 🟡 Web 安全存储 |
| SongloftBackend | gomobile | gomobile | — | Node child_process | Node child_process | 🟡 热更协调 |
| SongloftPlatform | Autolink | Autolink | 部分 | Lynxtron API | Lynxtron API | 🟡 总量大 |

**每个模块须在实施时补全**：需覆盖的平台、可复用的现有 Swift/Kotlin 文件路径、Autolink/Lynxtron 接入前提、以及 Web 侧手写 TS 的能力边界。
