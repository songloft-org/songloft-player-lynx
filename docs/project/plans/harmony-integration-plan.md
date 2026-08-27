# 鸿蒙（HarmonyOS NEXT）接入计划

> **状态：✅ 已完成**（2026-08-27）。`harmony/` 宿主工程已就位，8 个原生模块（Audio / Storage / Platform / SystemAppearance / Navigation / Video / Dlna / SongCache）全部实现，契约闸门已覆盖。FloatingLyric / LiveActivity 无等价 API，TS 侧降级为 no-op。构建需 DevEco Studio（CI 无 hvigor 环境），真机验证待补。

## 背景

Songloft Player Lynx 当前支持 Android（Kotlin）和 iOS（Swift）两个原生宿主。Lynx SDK 4.0.0 已将 `'Harmony'` 作为一等平台写入类型系统（`SystemInfo.platform === 'Harmony'`），CSS 兼容数据也包含 harmony 列，UI 组件均有 `@Harmony` 标注。JS bundle 跨平台共用，只需新增 ArkTS 原生宿主即可在鸿蒙上运行。

## 总体方案

```
songloft-player-lynx/
  harmony/                    ← 新增：鸿蒙宿主工程
    AppScope/                 ← 应用级资源与配置
    entry/                    ← 主入口模块（HAP）
      src/main/
        ets/                  ← ArkTS 源码
          entryability/       ← UIAbility 入口
          pages/              ← LynxView 承载页
          modules/            ← 原生模块实现
            audio/
            storage/
            platform/
            dlna/
            video/
            cache/
            navigation/
            system/
          net/                ← 宿主 HTTP 服务 + InsecureTls
        resources/            ← rawfile（含 main.lynx.bundle）
      module.json5            ← 模块配置（权限、后台任务等）
    oh-package.json5          ← 包依赖（Lynx SDK harmony 版）
    build-profile.json5       ← 构建配置
    hvigorfile.ts             ← hvigor 构建脚本
```

---

## 第一阶段：工程骨架与最小可运行

### 1.1 创建鸿蒙工程

- 使用 DevEco Studio 创建 Stage 模型的 Entry 模块
- 配置 `oh-package.json5` 引入 Lynx SDK 鸿蒙版依赖
- 工程结构参照 Android 的扁平目录，每个原生模块一个子目录

### 1.2 宿主 Ability + LynxView 承载

| 对应关系 | Android | HarmonyOS |
|---|---|---|
| 应用入口 | `SongloftApplication.kt` | `EntryAbility.ets`（UIAbility） |
| 页面承载 | `MainActivity.kt` + LynxView | `IndexPage.ets` + LynxView 组件 |
| Bundle 提供 | `DemoTemplateProvider` 从 assets 读 | 从 rawfile 读 `main.lynx.bundle` |

关键点：
- Lynx SDK 初始化与模块注册在 `EntryAbility.onCreate()` 中完成
- LynxView 加载 bundle 的 API 参照 SDK 鸿蒙文档（预计类似 Android 的 `LynxView.renderTemplateUrl`）
- 首帧全局属性注入（深浅色、语言）参照 `SystemAppearance` 模式

### 1.3 TS 侧适配

**`platform-target.ts`** — 增加 harmony 分支：
```ts
if (platform === 'harmony') return 'harmony'  // 新增
```

**`audio-format.ts`** — 增加 `'harmony'` 到 `AudioPlatform` 联合类型，并定义鸿蒙支持的音频格式集合：
```ts
// HarmonyOS AVPlayer 支持: mp3, flac, ogg, m4a, aac, wav, opus, amr
const HARMONY_FORMATS = new Set(['mp3', 'flac', 'ogg', 'm4a', 'aac', 'wav', 'opus'])
```

**`platform-capabilities.ts`** — 无需修改（已基于模块探测，不做平台硬编码）。

---

## 第二阶段：原生模块逐一实现

按依赖关系和优先级排序：

### P0：核心功能（必须有才能启动使用）

| 模块 | JS 名 | 鸿蒙 API | 说明 |
|---|---|---|---|
| **Storage** | `SongloftStorage` | `@ohos.data.preferences` + `@ohos.security.huks`（密钥库） | 对应 SharedPreferences + Keystore |
| **Platform** | `SongloftPlatform` | `@ohos.file.picker` / `@ohos.want` / `@ohos.net.http` | 文件选取、URL 打开、TLS 开关 |
| **HTTP Service** | （宿主 fetch） | `@ohos.net.http` + 自定义 TLS 校验 | 替换 SDK 默认 HTTP，支持自签名 |
| **SystemAppearance** | （globalProps） | `@ohos.app.ability.Configuration` | 深浅色/语言注入+事件 |
| **Audio** | `SongloftAudio` | `@ohos.multimedia.media.AVPlayer` + `@ohos.avSession` + Background Tasks Kit | 最重功能模块 |

### P1：重要功能

| 模块 | JS 名 | 鸿蒙 API | 说明 |
|---|---|---|---|
| **Navigation** | `SongloftNavigation` | 系统返回事件拦截 | 鸿蒙手势返回/导航键 |
| **SongCache** | `SongloftSongCache` | `@ohos.file.fs` + `@ohos.request`（下载） | 单曲离线缓存 |
| **Video** | `SongloftVideo` | `@ohos.multimedia.media.AVPlayer` + `XComponent` | 全屏视频画面 |

### P2：增值功能

| 模块 | JS 名 | 鸿蒙 API | 说明 |
|---|---|---|---|
| **DLNA** | `SongloftDlna` | `@ohos.net.socket`（UDP multicast）+ SOAP | SSDP 发现 + 投播 |
| **FloatingLyric** | ❌ 暂不实现 | 鸿蒙无悬浮窗权限等效机制（NEXT 无 `TYPE_APPLICATION_OVERLAY`） | 后续评估用卡片/实况窗替代 |
| **LiveActivity** | ❌ 暂不实现 | 鸿蒙「实况窗」API（`liveView`） | 类 iOS Live Activity，后续单独评估 |

---

## 第三阶段：Audio 模块详细设计（最复杂模块）

### 架构

```
SongloftAudioModule.ets
├── SongloftAudioEngine.ets     ← AVPlayer 封装
├── AVSessionController.ets     ← 媒体会话（锁屏/播控中心）
├── BackgroundTaskManager.ets   ← 长时任务（audioPlayback）
└── AudioEqualizer.ets          ← EQ（AudioRenderer + AudioEffect）
```

### 关键实现点

1. **播放**：使用 `media.createAVPlayer()` + `fdSrc`/`url` 加载
2. **后台保活**：必须同时
   - 创建 AVSession（`avSession.createAVSession(context, 'PLAY_AUDIO', 'audio')`）
   - 申请长时任务（`backgroundTaskManager.startBackgroundRunning`，type `AUDIO_PLAYBACK`）
   - 在 `module.json5` 声明 `"backgroundModes": ["audioPlayback"]`
3. **媒体会话**：注册命令监听（play/pause/next/prev/seek），上报 metadata + playbackState
4. **TLS**：自签名服务器的音频 URL 需走 `InsecureTls` 的自定义 `http.createHttp()` 拉流后喂给 AVPlayer 的 `dataSrc`
5. **事件**：通过 Lynx 的 `sendGlobalEvent` 推送 progress/state/duration/error 到 JS
6. **EQ**：HarmonyOS 提供 `audio.createAudioEffect()` 或低级 `AudioRenderer` + PCM 处理

### 契约对齐

所有方法名、事件名、回调参数格式必须与 Android/iOS **逐字一致**（闸门 `native-module-contract.test.ts` 会校验）：
- `play(url, startMs)` / `pause()` / `resume()` / `stop()` / `seek(ms)` / `setVolume(0-100)` / `setSpeed(float)` / ...
- 事件：`audio:progress` / `audio:state` / `audio:duration` / `audio:error` / `audio:trackEnd`

---

## 第四阶段：宿主 HTTP 服务（InsecureTls）

与 Android/iOS 同理——Lynx SDK 默认 HTTP 实现无法注入 TLS 策略，需自行注册。

### 鸿蒙实现

```ts
// net/SongloftHttpService.ets
import http from '@ohos.net.http'

// 注册为 Lynx 的 HTTP 服务实现（替换 SDK 默认）
// 关键：可配置 TLS 验证策略
// InsecureTls.enabled → httpRequest.request(url, { 
//   usingProtocol: http.HttpProtocol.HTTP2,
//   extraData: ...,
//   caPath: '/dev/null'  // 或自定义 TLS 校验
// })
```

鸿蒙 `@ohos.net.http` 支持 `certificatePinning` 和自定义证书链，或通过 `connection.createHttpResponseCache` 控制。对自签名证书，设置 `tlsVersion` 和关闭验证。

### `InsecureTls` 切换需重建连接

与 iOS 侧同理——鸿蒙的 `http.createHttp()` 实例创建后 TLS 策略不可变更，关闭开关时必须销毁旧实例重建。

---

## 第五阶段：Navigation 模块

鸿蒙 NEXT 的返回行为：
- **手势返回**：系统侧滑手势触发 `onBackPress()` 回调
- **导航键返回**：同上

实现方式：在承载 LynxView 的页面组件中拦截 `onBackPress()`，通过 `sendGlobalEvent('backPressed', [{}])` 通知 JS 侧的 `back-controller`。JS 决定是否消费后，通过 `SongloftNavigation.setConsumable(boolean)` 更新状态。

与 Android 的区别：鸿蒙无 `moveTaskToBack(true)`，退出应用使用 `terminateSelf()`（但用户体验上应尽量挂后台而非退出）。

---

## 第六阶段：构建流程与 CI

### Bundle 拷贝

与 Android 相同——`pnpm run build` 产出 `dist/main.lynx.bundle`，通过脚本拷贝到 `harmony/entry/src/main/resources/rawfile/`。

新增 npm script：
```json
"harmony:sync": "node scripts/copy-bundle-harmony.mjs",
"harmony:build": "pnpm run build && pnpm run harmony:sync"
```

### DevEco 构建

```bash
# 在 harmony/ 目录下
hvigorw assembleHap --mode module -p product=default
```

产出 `.hap` 文件用于真机安装。

### 闸门扩展

1. **`native-module-contract.test.ts`** — 新增 harmony `hosts` 表条目，列出每个模块的 ArkTS 源文件路径，验证方法名与事件名
2. **`android-manifest-contract.test.ts`** 的鸿蒙对应 — 验证 `module.json5` 声明了必要的权限和 backgroundModes
3. **`platform-target.test.ts`** — `{ platform: 'Harmony' }` 应返回 `'harmony'` 而非 `'web'`

---

## 第七阶段：平台差异与已知限制

| 特性 | Android | iOS | HarmonyOS | 备注 |
|---|---|---|---|---|
| 悬浮歌词 | ✅ SYSTEM_ALERT_WINDOW | ❌ | ❌ | 鸿蒙无等效 API |
| Live Activity | ❌ | ✅ iOS 16.2+ | ❌（后续用实况窗） | |
| EQ | ✅ ExoPlayer 内置 | ✅ MTAudioProcessingTap | 待验证 | AudioEffect API |
| 返回键 | ✅ 硬件键+手势 | ❌ | ✅ 手势+导航键 | |
| 后台播放 | MediaSession + 前台 Service | AVAudioSession | AVSession + 长时任务 | |
| TLS 自签名 | OkHttp TrustManager | URLSession delegate | http 模块证书配置 | |
| DLNA | UDP socket | NWConnection | @ohos.net.socket | |
| 文件选择 | SAF Intent | UIDocumentPickerVC | @ohos.file.picker | |
| 安全存储 | Android Keystore | iOS Keychain | HUKS（密钥管理） | |

---

## 实施节奏建议

| 批次 | 内容 | 预估工作量 |
|---|---|---|
| **批 A** | 工程骨架 + Storage + Platform + HTTP + SystemAppearance + TS 侧改动 | 1 周 |
| **批 B** | Audio 模块（播放+后台+会话） | 1.5 周 |
| **批 C** | Navigation + SongCache + Video | 1 周 |
| **批 D** | DLNA + 闸门完善 + E2E | 1 周 |
| **总计** | | ~4.5 周 |

---

## 前置条件 / 开始前需确认

1. **Lynx SDK 鸿蒙版本确认**：确认 `org.lynxsdk.lynx` 是否有对应的鸿蒙 ohpm 包（如 `@aspect/lynx` 或 `@aspect-build/lynx-harmony`），以及模块注册 API 的具体签名
2. **DevEco Studio 版本**：建议 5.0+ 以支持 HarmonyOS NEXT API 12+
3. **最低 API 版本**：建议 API 12（HarmonyOS NEXT 起步），对标 Android minSdk 24 / iOS 16.0
4. **真机设备**：需要 HarmonyOS NEXT 设备或模拟器进行调试
5. **Lynx SDK 鸿蒙侧的模块注册方式**：是类似 Android 的 `LynxEnv.registerModule()` + 装饰器标注方法，还是其他 pattern？需阅读 SDK 鸿蒙文档确认

---

## 风险点

| 风险 | 影响 | 缓解 |
|---|---|---|
| Lynx SDK 鸿蒙版 API 不完整或未发布 | 整个方案无法启动 | 开工前先跑通 hello-world 级 LynxView |
| AVPlayer 不支持所有格式或 seek 精度差 | 播放体验降级 | 按 Android 同策略走后端转码 |
| 鸿蒙 EQ 能力不足 | EQ 功能缺失 | 降级为 UI 可见但标注「暂不支持」 |
| 自签名 TLS 无法绕过 | 私有服务器不可用 | 走 dataSrc 自行拉流喂 AVPlayer |
| 后台播放被系统杀 | 音乐中断 | 严格遵循 AVSession + 长时任务双保险 |
