# 支持平台与最低版本

**权威事实**：本仓构建脚本、宿主工程配置与依赖清单里各自声明的下限。改动时同步更新此表，闸门在各自宿主的构建（`assembleDebug` / `xcodebuild` / `hvigor`）。

| 平台 | 最低版本 | 目标版本 | 声明处 |
|---|---|---|---|
| Android | **API 21**（Android 5.0 Lollipop） | API 34（Android 14） | [android/app/build.gradle.kts](../../android/app/build.gradle.kts) `minSdk` / `targetSdk` |
| iOS | **iOS 15.0** | 系统当前版本 | [ios/Podfile](../../ios/Podfile) `platform :ios, '15.0'` · [ios/SongloftLynx.xcodeproj/project.pbxproj](../../ios/SongloftLynx.xcodeproj/project.pbxproj) `IPHONEOS_DEPLOYMENT_TARGET` |
| HarmonyOS | HarmonyOS NEXT / **API 13**（`compatibleSdkVersion` = `5.0.1(13)`） | 同左 | [harmony/build-profile.json5](../../harmony/build-profile.json5) `compatibleSdkVersion` |
| Web | 常青浏览器（Chrome/Edge/Firefox/Safari 近两版） | —— | 由 web-core / rspeedy targets 决定，无独立配置 |

> Web 侧受 web-core 使用的 `import.meta`、`Worker`、`OffscreenCanvas`、`AudioContext` 等特性约束；未做低版本浏览器矩阵。

## Android

**minSdk = 21** 的复合下限来自依赖：

| 依赖 | 自声明最低 API |
|---|---|
| Lynx SDK 4.0.0（`lynx` / `lynx-jssdk` / `primjs` / xelement 全家桶 / `lynx-service-*`） | 16 |
| androidx.core 1.13.1 / lifecycle 2.6.x | 19 |
| androidx.media3 1.4.0（`exoplayer` / `exoplayer-hls` / `session`） | 19 |
| OkHttp 4.9.0 | **21** |
| Fresco 2.3.0 / androidx.viewpager2 1.0.0 | ≤ 14 |

`OkHttp 4.9.0` + `androidx.core 1.13` 一起把复合下限钉在 21，就是当前 `minSdk` 的实际来源。继续下探需换掉这两个之一（OkHttp 3.x 支持到 API 21 之前，但要放弃 kotlin coroutines 与 TLS 1.3 特性）。

代码侧全部 API 分级调用都有 `Build.VERSION.SDK_INT` 守卫，21–33 各段行为分支：

- `POST_NOTIFICATIONS` 运行时授权（TIRAMISU / API 33+）：`MainActivity.requestNotificationPermissionIfNeeded()` 早退到 33，21–32 走安装期授权。
- `startForegroundService()`（O / API 26+）：`SongloftAudioModule.startPlaybackService()` 在 O- 走 `startService()`。
- 前台服务类型 `FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK`（Q / API 29+）：`SongloftPlaybackService.startForegroundPlaceholder()` 在 Q- 走无类型形态。
- `NotificationChannel`（O / API 26+）：`ensureNotificationChannel()` 早退到 O。
- `Settings.canDrawOverlays()`（M / API 23+）：`FloatingLyricModule.requestPermission()` 在 M- 直接返回已授权（`SYSTEM_ALERT_WINDOW` 在 API 21/22 是安装期权限）。
- 悬浮窗类型 `TYPE_APPLICATION_OVERLAY`（O / API 26+）：`FloatingLyricService.showOverlay()` 在 O- 用 `TYPE_PHONE`。

**未在 CI/真机覆盖到的档位**：API 21/22/23 目前没有回归通道。历史真机验证跑在 API 33 模拟器上（见 [progress.md](../project/progress.md) 批20 之后各批的验证记录），23 以下需在功能改动后手动补一轮。

### `usesCleartextTraffic` 与 `networkSecurityConfig`

`networkSecurityConfig` 是 API 24 才生效的机制。**API 21–23 上明文流量本就允许**，`AndroidManifest.xml` 里的 `usesCleartextTraffic="true"` 与 `networkSecurityConfig` 引用在这几个 API 级别被系统忽略，无副作用；无需额外分支。

## iOS

**iOS 15.0** 是 pods 与 Xcode 项目双端声明的下限。上一版是 16.0（对齐 Live Activity 的 ActivityKit），15.0 靠 `@available(iOS 16.2, *)` 守卫住 `LiveActivityModule` 的注册（见 [native-modules.md](./native-modules.md) §2.8 与 [AGENTS.md](../../AGENTS.md) §4）。iOS 15.0/15.x/16.0/16.1 上 Live Activity 特性静默降级为 no-op，其他能力不受影响。

`SongloftNavigation` 刻意不在 iOS 注册——iOS 没有系统返回键可拦。

## HarmonyOS

工程实际声明 `compatibleSdkVersion` = `5.0.1(13)`（HarmonyOS NEXT 起步）。`FloatingLyric` / `LiveActivity` 当前没有宿主实现，TS 侧降级 no-op。`pages/Index.ets` 已注册 `SongloftVideo`，并用 XComponent 表面绑定共享 AVPlayer；视频不是完全缺失。2026-10-07 已用 Linux CLI `26.0.0.821` / SDK `26.0.0.105` 完成整个宿主的未签名 release HAP 编译和包内容校验，最低兼容声明保持不变，compile/target 为新 SDK；不证明 API 13 设备行为或视频验收。签名和设备行为仍开放，视频按用户要求暂缓。详细证据见 [progress](../project/progress.md)；旧[集成计划](../archive/harmony-integration-plan.md) 是历史资料，不能替代源码与验收记录。

## Web

无独立最低版本声明。已知硬约束：

- **web-core 宿主脚本必须以 `<script type="module">` 加载**（入口用 `import.meta`）。不支持 ES modules 的浏览器无法启动。
- Worker realm、`AudioContext`、`IndexedDB` 是运行时刚需——见 [architecture/lynx-constraints.md](../architecture/lynx-constraints.md) 与 [guides/web-deployment.md](../guides/web-deployment.md)。
- 没有 longpress、文件选择器 user activation 限制、web-elements `::part()` 的样式坑，见 [AGENTS.md](../../AGENTS.md) §3.2。

构建产物是常规 ES modules + WebWorker，实际能跑的下限等同于 Chrome/Edge 88+ / Safari 15+ / Firefox 89+（未做正式矩阵测试；这几版是 `OffscreenCanvas` + module worker + top-level `await` 的合并下限，供参考）。
