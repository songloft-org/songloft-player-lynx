# 插件客户端 SDK

HTML 插件使用 `@songloft/client-sdk` / `window.SongloftPlugin`；原生 Lynx 插件使用 `@songloft/lynx-plugin-sdk` 的 `invokeHost`。两种渲染方式共用 `src/features/jsplugin/domain/plugin-host-dispatch.ts`，对齐 Flutter 的 `PluginHostDispatcher`。

## 接口与行为

| namespace | method | 行为 / 返回值 |
|---|---|---|
| `host` | `getInfo` | 真实客户端版本、`android/ios/harmony/macos/windows/web` 平台和能力列表 |
| `player` | `getState` | 完整歌曲的 snake_case JSON；进度、时长以秒计，音量 0–100 |
| `player` | `setQueue` | 解析 `ids`，跳过不存在歌曲，按 `startIndex` 开始，保留可选 `sourcePlaylistId` |
| `player` | `addToQueue` | 按歌曲 ID 与类型去重追加，不切歌 |
| `player` | `insertToQueue` | 在 `index` 插入 `id`，保留当前播放条目的身份和进度；空队列插入不自动播放 |
| `player` | `removeFromQueue` | 按下标删除，复用播放器现有切歌 / 停止行为 |
| `player` | `reorderQueue` | `oldIndex/newIndex` 使用 Flutter 的移除前插入位置；向后移动时减一，重复歌曲按实际条目保留当前索引 |
| `player` | `clearQueue` | 清空并停止，取消旧的后台补队列 |
| `player` | `play` | 有 `id` 时选择已有条目或追加；无参数恢复播放 |
| `player` | `pause/togglePlay/next/prev` | 复用当前播放器动作 |
| `player` | `seek/setVolume/setPlayMode` | 秒 / 0–100；模式支持 `order/loop/single/random/singlePlay`，未知模式回退 `order` |
| `player` | `playPlaylistById` | 按歌单保存的排序先播 10 首，后台分页补齐；返回总数，空歌单返回 0，加载失败返回 -1 |
| `favorite` | `refresh` | 带 `songId/isFavorited` 时更新已有收藏缓存，无缓存或无完整参数时重新加载；不重复写服务端 |
| `cookies` | `get` | 原生 Cookie store 的 name→value 映射，含 HttpOnly；Web 明确拒绝，旧原生壳缺方法时明确拒绝 |

`singlePlay` 在自然结束时停止，手动上一曲 / 下一曲仍按队列移动。播放状态首帧、重入与后续推送使用同一序列化函数；音量、时长、来源及等长队列重排也触发推送，单纯进度变化不推送。

收藏增量通知先取消旧查询，避免旧 GET 覆盖新状态；冷缓存先加载完整集合，不能把一首歌的通知当成完整收藏列表。

## Lynx 平台支持

| 平台 | 打开外链 | 全屏播放曲库 MV | 查询、应用和清除 EQ | 验收状态 |
|---|---|---|---|---|
| Android | 支持 | 支持 | 支持，使用系统均衡器 | Android 14 模拟器已验证 |
| iOS | 支持 | 支持 | 支持文件媒体，HLS 不支持 | 原生包待验收 |
| HarmonyOS | 支持 | 支持 | 不支持 EQ，查询返回 `supported: {}` | 原生包待验收 |
| macOS | 支持 | 支持 | 支持，使用 libmpv | 共享桌面宿主的 EQ 测试已通过，原生包待验收 |
| Windows | 支持 | 支持 | 支持，使用 libmpv | 共享桌面宿主的 EQ 测试已通过，原生包待验收 |
| Web | 支持，从用户点击发起 | 支持，使用宿主视频页 | 支持，当前输出需经过 Web Audio | Chromium 已验证 |

插件以 `host.getInfo().capabilities` 判断当前宿主是否提供接口，再以 `getAudioEffects().supported` 判断当前音频输出可用的预设。投屏期间无可用 EQ，也不能从插件打开宿主全屏视频。所有平台的插件混响都待接入。

## 插件外链和全屏视频

通过 `host.getInfo().capabilities` 检查宿主是否提供对应能力。

| 能力 | WebView SDK | 原生 Lynx SDK |
|---|---|---|
| `plugin.openUrl` | `host.openExternalUrl(url)` | `invokeHost('plugin', 'openUrl', { url })` |
| `player.openVideo` | `player.openVideo({ id })` | `invokeHost('player', 'openVideo', { id })` |

外链只接收绝对 HTTP 或 HTTPS URL。系统接受打开请求后调用成功，浏览器拦截弹窗或系统无法打开时返回错误。浏览器插件应从用户点击发起。视频接收带视频轨的曲库条目 ID。当前条目已加载时保持进度并在暂停时继续播放。切换到另一条目使用宿主的「观看 MV」流程，关闭视频回到发起调用的插件页。宿主先交付受理回执再切换页面。视频页负责显示转码和媒体错误。浏览器系统全屏由视频页内的全屏按钮触发。

WebView 全屏需要提供新版 `common.js` 的服务端，原生 Lynx 插件需用支持新回执的 SDK 重新构建。

## 插件播放音效

检测 `host.getInfo().capabilities` 是否包含 `player.audioEffects`。浏览器禁止启动 AudioContext 时，应用预设会失败。调用参数使用服务端曲库歌曲 ID。

| `player` 方法 | 参数及结果 |
|---|---|
| `getAudioEffects` | 返回 `{ playbackId, supported, applied }`。`playbackId` 只对发起此会话的插件可见，其他情况为 `null`。预设列表位于 `supported.equalizer.presets`，未应用插件音效时 `applied` 为 `null`。 |
| `applyAudioEffects` | 传 `{ playbackId, effects: { equalizer: { preset: "vocal" } } }`，一次替换插件音效，返回应用成功的配置。不支持的效果或预设使整个请求失败。 |
| `clearAudioEffects` | 传 `{ playbackId }`，恢复用户原有音效并继续播放。同一有效会话内可以重复调用。 |

插件通过 `play(id)`、`setQueue` 或 `playPlaylistById` 发起播放会话。同一会话内切歌、暂停、离开插件页或后台播放时保留音效。宿主另行播放、停止、队列结束、切换投屏或账号、禁用该插件或手动调宿主 EQ 时，临时音效会清除。修改请求需要当前有效的 `playbackId` 和处于活动状态的插件页面。临时音效不会保存到用户设置。

WebView 使用 `@songloft/client-sdk` 的 `player`，也可以使用 `window.SongloftPlugin.player`。Lynx 原生插件能通过 `invokeHost('player', 'getAudioEffects')` 等方法调用，检查返回的 `ok`、`data` 和 `error`。

Android 14 模拟器和 WebView 113 的调试包验证了插件启动播放、应用 EQ、切歌保留、清除后继续播放以及宿主 EQ 接管。AudioFlinger 在同一输出会话中报告均衡器依次关闭、启用、关闭。

外链和全屏接口在 Android 14 模拟器和 Chromium 中验证。Android 打开系统浏览器，从 12 秒处切入全屏并返回原插件，播放继续。Chromium 验证了插件点击打开浏览器标签页、应用与清除 EQ、打开曲库 MV 和返回插件页。桌面宿主测试覆盖了插件临时预设及恢复用户设置。

## 传输和平台

- Web HTML 插件使用 iframe `postMessage`；原生 WebView URL 携带 `songloft_host=lynx`，公共 `common.js` 选择 Android `LynxWebViewBridge`、iOS `webkit.messageHandlers.nativeApp` 或 HarmonyOS `LynxJSBridge`。外部浏览器 URL 不携带该参数。
- 原生请求经 `bindmessage` 到分发器，`eval` 派发 `MessageEvent` 返回对应的 `songloft-host-reply`。组件卸载或 URL 切换后丢弃旧回执；文档重载后的未知请求 ID 由 SDK 忽略。加载完成事件不取消启动期间的请求。公共资源仍保留 Flutter `callHandler` 与 iframe 传输。
- Lynx frame 保持 `SongloftPluginBridge` 的现有 RPC；WebView 和 frame 共用同一歌曲解析、分发与状态推送语义。
- Cookie 读取通过 `SongloftPlatform.getCookies(origin, callback)`，回调为 `(error, cookiesJson)`；Android/iOS 切到主线程，HarmonyOS 使用 ArkWeb store。无 Cookie 返回 `{}`，不读取 `document.cookie`。
- 原生 HTML 插件需要包含该传输的服务器 `common.js`；Cookie 读取还需要包含新方法的原生壳。只热更新 JS 不能给旧壳增加原生方法。

接口来源是仓库中的 Flutter 分发器和工具链 SDK；XElement 接线依据 [Lynx 官方 WebView 文档](https://lynxjs.org/api/elements/built-in/webview.html) 及 [4.0.1 源码](https://github.com/lynx-family/lynx/tree/4.0.1/platform)。

## 验证

### 后续渲染环境对照（2026-10-20）

保持同一 APK、SDK 与官方插件不变，Android 34 / Emulator 35.6.11 改用 Xvfb + Mesa llvmpipe：开启“减少透明度”时 19 项功能断言再次通过，但原生导航图标仍出现过缺失；默认效果运行无响应，未完成验收。测试首次在音频异步准备完成前立即断言失败，诊断快照已显示队列与播放恢复；改为最多 5 秒等待实际播放/分页完成后重跑通过，没有放宽结果断言。

页面临时诊断中，普通文字和 SVG 图形可见，而按钮部分符号消失；调整文字渲染并停止 WebGL 后符号恢复。这不是严格的单变量因果证明，不据此添加生产样式补丁。新建 Android 35 / 16 KB 镜像在尚未安装客户端时，Emulator 37.2.12 的 OpenGL 路径即退出 139；Vulkan 对照退出 137，内核确认 qemu 被 OOM 杀死。因此存在独立于客户端的环境失败，但插件缺字仍未定位。

证据 `/tmp/songloft-sdk-e2e/rendering-validation.json`；Mesa 结果/截图在 `mesa/`，临时页面探针在 `glyph/`。本轮未新增业务修改，没有完成新的视觉验收；仍需稳定设备验证默认效果和持续显示。测试临时 Xvfb 进程和系统链接已清理，未修改第三方插件文件。

### 最新：Android 图标补修（2026-10-20）

原生 SVG 图标缺失已定位到 `servalsvg:0.1.1` 未包含 x86_64 库，logcat 报 `libserval_svg.so` 加载失败。升级为官方 Maven `0.2.4` 后，APK 四种 ABI 都有该库，x86_64 实际日志确认加载成功；主页、导航及插件标题栏图标恢复。检查了 XElement 4.0 实际调用的 Java 方法兼容性，`assembleDebug` 通过。

同一 SDK 实现、未修改的官方「正在播放」1.0.31，在 Android 34 / Emulator 35.6.11 / WebView 113 环境再次通过 19 项断言，无 WebView JS 异常。刷新后截图 `official-now-playing-android.png` 的插件文字图标正常，但随后静置截图 `official-now-playing-android-settled.png` 再现缺字；宿主 SVG 仍正常，不能认定二者同因或视觉全部通过。证据和源码/产物指纹见 `/tmp/songloft-sdk-e2e/svg/validation.json`。

仍有条件：成功运行开启“减少透明度”。关闭后已确认策略为 `blur/androidGlass=true`，模拟器宿主再次以 139 退出，不能将 SVG 修复描述成默认玻璃效果修复。iOS/HarmonyOS 编译、真机、长后台仍为 Not run；其余三种 ABI 仅检查 APK 库存在，未做运行验收。生产 JS/资源已恢复，测试 APK 保留测试桥；未提交、推送或发布。下方保留历史快照。

共享回归：`plugin-host-dispatch.test.ts`、`favorites-non-react.test.ts`、`plugin-cookies.test.ts`、两种插件页面测试与 `native-module-contract.test.ts`。父仓库 `node --test scripts/tests/plugin-client-bridge.test.mjs` 执行真实 `common.js` 的三端传输、Flutter/iframe 兼容、回执、超时和状态订阅。

共享 JS、受控宿主回调和浏览器回归不替代 iOS/HarmonyOS 编译或三端真实 Cookie store 验收；本批实际结果与未跑项见 [开发进度](../project/progress.md)。

### 2026-10-20 本批结果

- 验证对象：`songloft-org/songloft-player-lynx@e41987c5b6f3f4a0315e0e54914207c45868a458` + 本次未提交工作树；父仓库基线 `32ca05ccab18a68133ab1ccb776460610c835726`。Linux amd64、Node 22.17.1、pnpm 11.15.1、Go 1.26.0；源码 SHA-256 清单和日志位于 `/tmp/songloft-sdk-e2e/validation.json`。
- 通过：`pnpm exec tsc -b`、`pnpm test --maxWorkers=2`（336 文件 / 3610 项）、`pnpm run build`（Lynx + Web）、`pnpm run build:web`、`pnpm run test:release`（87 项）、`android/./gradlew --no-daemon assembleDebug`。父仓库公共脚本 9 项与 `go test ./internal/jsplugin` 通过，格式差异与源码编码检查通过。首轮并行运行的构建退出 137、测试有超时；上述为限制并发后的最终结果。
- 反向验证：隔离旧分发器和播放器后新增 7 项失败；旧 `common.js` 的 3 个原生入口不可用，整组 5 项失败、Flutter/iframe 2 项保留通过。
- 官方插件：按[官方源](https://raw.githubusercontent.com/songloft-org/songloft-plugin-registry/main/registry.json)的[原始清单](https://raw.githubusercontent.com/charce526/songloft-now-playing/main/plugin.json)安装「正在播放」1.0.31，作者 charce526。发布 ZIP SHA-256 为 `e46fd19d0fe0351b41bd93c4b0944babbe439f1c8ff05969e096b693eb67821a`；未修改插件代码。
- 实际 Docker Chrome 中通过界面登录、播放合成测试歌单、打开该插件；16 项断言覆盖真实音频时间推进、卡片暂停/恢复、前后切歌、模式循环、音量滑块 55、后端收藏持久化及单独的 `favorite.refresh` SDK 调用、队列操作、分页补齐和 Web Cookie 拒绝。该版本插件自身的收藏按钮直接写 API，未调用 `favorite.refresh`；SDK 的增量刷新另行验证。页面错误为空；1440×1000 与 390×844 截图分别为 `/tmp/songloft-sdk-e2e/official-now-playing-playing.png`、`official-now-playing-mobile.png`，完整结果 `plugin-check-final.json`。
- Not run：iOS / HarmonyOS 编译、三端原生设备 / Cookie store、原生插件长后台。开发机无连接的 Android 设备和 Apple 工具链。未提交、推送、更新父 gitlink 或发布。

### 同日审核补修

审核发现并修复三处问题：原生加载完成事件误取消启动期间尚未完成的 SDK 回执；回执 `eval` 同步抛错导致未处理 Promise 拒绝；HarmonyOS 用普通对象保存 Cookie，丢失 `__proto__` 名称。前两项补页面时序/销毁回归，第三项改用 Map 并执行真实 ArkTS 方法的受控 store 测试。加载时序和 Cookie 新断言在补修前均失败。

补修后相关 22 文件 / 575 项测试通过，日志 `/tmp/songloft-sdk-review-tests.log`；类型与双产物构建另见 `/tmp/songloft-sdk-review-build.log`。本轮改动限原生路径，前述 Web 截图属于上一验证快照；原生设备、iOS/HarmonyOS 编译仍为 Not run，JS 转译测试不能替代 HAP 编译。

### 审核后完整复验

- 同一客户端基线加当前未提交实现，全量 336 文件 / 3611 项、类型、生产双产物和 87 项发布检查通过；父仓库公共脚本 9 项通过。日志前缀 `/tmp/songloft-sdk-continued-`；验证指纹和具体命令见 `/tmp/songloft-sdk-e2e/continued-validation.json`。
- 使用当前服务器公共资源和审核后 Web 产物，官方「正在播放」1.0.31 再次通过 16 项真实浏览器断言，页面错误为空。结果 `plugin-check-current.json`；新截图 `official-now-playing-current-playing.png`、`official-now-playing-current-mobile.png`，均在 `/tmp/songloft-sdk-e2e/`。
- Android 测试 JS 已重新复制进 APK，`assembleDebug` 和安装通过。原生验收尝试受环境阻塞：独立 Android 34 x86_64 模拟器首次被宿主 OOM 终止；串行重试的两个软件渲染后端出现宿主 `RenderThread` 段错误，禁用 GPU 后仍在启动应用后退出。未进入插件交互，不声称原生 SDK/Cookie 已通过。证据 `/tmp/songloft-sdk-emulator*.log`、`/tmp/songloft-sdk-native-{bundle,assemble}.log`。
- iOS/HarmonyOS 编译、真实设备 Cookie store 和长后台仍为 Not run。没有提交、推送或发布；测试后恢复不含测试桥的生产 bundle。

### Android 原生补验（有条件通过）

使用同一 Debug APK，在官方 Emulator 35.6.11 / Android 34 x86_64 / WebView 113.0.5672.136 上开启应用“减少透明度”，官方「正在播放」1.0.31 的 19 项原生断言通过：宿主身份、真实音频时间、前后切歌、卡片暂停/恢复、模式、音量、收藏后端持久化与刷新、队列编辑/清空/分页、读取真实 HttpOnly Cookie，以及 `DOMContentLoaded` 发出的 SDK 请求在重载后获得回执。WebView JS 异常为零。

证据在 `/tmp/songloft-sdk-e2e/android-sdk-final.json`、`android-sdk-environment.json`、`native-validation.json` 和 `official-now-playing-android.png`。自动点击先前因软件 WebGL 中卡片尚未移动到中央而选中旧卡片；等待动画后通过，没有修改第三方插件或业务实现。原生测试 APK 与此前构建记录的 SHA-256 对齐。

边界：37.2.12 的多种渲染模式、35.6.11 的默认效果和独立 `/dev/shm` 均曾退出，不能只归因于版本或共享内存。“减少透明度”条件下本轮稳定完成；默认玻璃效果未验收。截图仍有部分控制符号未绘制，DOM 中字符/颜色/尺寸存在，原因未确认，不能宣称原生视觉完全正常。iOS/HarmonyOS 编译、真机、长后台仍为 Not run。没有提交、推送或发布。
