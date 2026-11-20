# Songloft Player (Lynx)

Songloft Player 的 Lynx 客户端，从 Flutter 版整体重写为 ReactLynx + TypeScript。支持 Android / iOS / HarmonyOS / Web 四端。

了解底层技术：[Lynx 官网](https://lynxjs.org/) · [ReactLynx 官方文档](https://lynxjs.org/react/)。

「设置 → 播放设置 → 歌词页屏幕常亮」默认关闭、仅保存到本机。开启后在歌词可见时保持亮屏（宽屏为并列歌词），暂停播放仍生效；返回封面、离开播放器或切到后台后恢复自动熄屏。Android/iOS/HarmonyOS 需要包含新亮屏接口的原生安装包，旧壳安全降级；Web 取决于浏览器 Screen Wake Lock 支持与权限，拒绝请求不影响播放。

## 当前状态

当前定位为**预览版**。核心播放、曲库/歌单、歌词、插件、主题、多服务器和管理设置已有实现。关于页已分开提供客户端检查更新和服务器更新：dev 仅检查 dev，正式版仅检查最新正式发布；三端原生 bundle 更新器已接入源码，Android 已完成本地界面下载/取消/冷启动验证，iOS/HarmonyOS 编译与设备验收仍开放。Windows/macOS 桌面宿主、Bundle、播放、两类插件和完整应用更新已实现，并通过共享 Build and Release 发布桌面包；正式签名、公证和最终设备矩阵仍开放，详见[实施记录](docs/project/desktop-implementation.md)。

原生设备缓存已有身份/音轨变体索引、整歌单/多选批量任务和本地管理/断网播放入口；过期登录保留仅本地访问，显式退出隐藏旧身份，详见[设备缓存](docs/reference/device-cache.md)。Android 有实际文件/界面验证，iOS/HarmonyOS 的编译与设备验收仍开放。

Web 已提供歌单 JSON 导入/导出，支持选择文件、认证刷新、下载和取消；浏览器点击权限过期时提供主线程控件。Chrome standalone/embedded 根路径已实测，Firefox/Safari 待验，见 [Web 部署](docs/guides/web-deployment.md#歌单-json-导入与导出)。

Web 播放设置另有可持久保存的键盘快捷键开关，支持空格播放/暂停、Ctrl/⌘ + 方向键切歌及音量调整。输入/覆盖层/插件焦点保护和 Chrome 实测范围见 [快捷键说明](docs/guides/web-deployment.md#播放键盘快捷键)。

曲库支持组合筛选本地歌曲、网络歌曲与电台。多选电台后可批量设置自动、HLS、HTTP-FLV 或仅音频播放模式。曲库的「播放全部」排除电台和隐藏、有声书歌单中的歌曲。

| 平台                     | 发布产物                     | 使用边界                                                   |
| ------------------------ | ---------------------------- | ---------------------------------------------------------- |
| Android                  | 签名标准版或 Bundle APK      | 标准版需 Android 5.0+，Bundle 需 Android 6.0+            |
| iOS 15+                  | 未签名 IPA                   | 安装前需自行重签；Live Activity 需 iOS 16.2+               |
| HarmonyOS NEXT / API 13+ | 签名 HAP                     | 实验性；已有视频模块与 XComponent 表面，编译和设备行为待验证 |
| Web                      | standalone / embedded 压缩包 | 无 Bundle、DLNA 与单曲离线缓存；兼容性以实际浏览器验证为准 |
| Windows / macOS           | 标准版或 Bundle 桌面包        | Windows 10 22H2+ x64，macOS 13+ 支持 Apple 芯片和 Intel    |

## 安装与下载

- [标准版正式版本](https://github.com/songloft-org/songloft-player-lynx/releases/latest) 与 [标准版开发版本](https://github.com/songloft-org/songloft-player-lynx/releases/tag/dev)。
- [Bundle 正式版本](https://github.com/songloft-org/songloft/releases/latest) 与 [Bundle 开发版本](https://github.com/songloft-org/songloft/releases/tag/dev)。
- [安装指南](docs/guides/installation.md)：包名、签名限制、服务器连接和校验方法。
- [Windows/macOS 桌面构建](desktop/README.md)：标准版桌面资产在 Lynx Release，Bundle 桌面资产在后端 Release。文件名不含 dev 或 stable，按 `win32-x64`、`darwin-arm64`、`darwin-x64` 选择。
- [English](README.en.md)

下载以 GitHub Releases 中实际发布的资产为准；四平台 CI 仅在七个移动、Web 包全部构建和校验成功后更新 dev，桌面 variant 另外按配置发布。维护自己的 fork 时需配置签名 Secrets，详见[发版指南](docs/guides/releasing.md)。

Android 和 iOS 的 Bundle 包内嵌了由后端 Release 流水线从固定主仓库 SHA 构建的 Go 后端，也可连接远程服务器。标准包只连接远程服务器。用户在 Bundle 包的登录页或设置页切换本地/远程模式；首次启用本地模式时选择音乐目录，不会在首次启动时额外弹出模式选择框。Android 使用系统文件夹选择器并授予读取权限；iOS 使用应用 Documents 目录，可通过“文件”应用放入音乐。HarmonyOS 与 Web 包不包含后端，需连接已运行的 [Songloft 服务器](https://github.com/songloft-org/songloft)。在对应 Release 页的 **Assets** 中按平台选包：

| 平台 | 下载文件 | 安装 / 部署方式 |
| --- | --- | --- |
| Android | `songloft-lynx-android.apk` / `songloft-lynx-bundled-android.apk` | 前者为标准版，后者内嵌 Go 后端；下载并打开 APK，按系统提示允许安装。安装包使用维护者的发布签名。 |
| iOS | `songloft-lynx-ios-nosign.ipa` / `songloft-lynx-bundled-ios-nosign.ipa` | 前者为标准版，后者内嵌 Go 后端；均为未签名设备包，需使用自己的开发者证书和适用于目标设备的 provisioning profile 重签后安装。 |
| HarmonyOS | `songloft-lynx-harmony.hap` | 标准版，不含本地 Go 后端；使用 DevEco Studio 或 `hdc install songloft-lynx-harmony.hap` 安装。 |
| Web（独立部署） | `songloft-lynx-web-standalone.tar.gz` | 解压到静态服务器，打开站点后填写 Songloft API 地址。 |
| Web（同源部署） | `songloft-lynx-web-embedded.tar.gz` | 解压并配置同源静态服务，使用同源后端；不会自动替换服务器现有的内嵌前端。 |

Android Bundle 包含三个 ABI 的 FFmpeg 和 FFprobe。iOS Bundle 将 FFmpeg 静态链接进 Go 后端，探测与转码在应用进程内运行。Windows 和 macOS Bundle 同样使用主仓库发布流水线校验过的 FFmpeg 资产。

Web 部署的响应头、MIME 和浏览器要求见 [Web 部署指南](docs/guides/web-deployment.md)。

**下载校验：** 将安装包与 `checksums.txt` 放在同一目录，Linux 可运行 `sha256sum -c checksums.txt --ignore-missing`；macOS 使用 `shasum -a 256 <文件名>`，Windows 使用 PowerShell `Get-FileHash <文件名> -Algorithm SHA256`，对照清单中的 SHA-256。`version.json` 提供版本、提交、构建时间和包信息。

Bundle 模式的后端启动、登录和切换行为见主仓库[Bundle 模式说明](https://github.com/songloft-org/songloft/blob/main/docs/bundle-mode.md)。Release 正文展示分类变更记录，并保留本节的安装说明链接。

## 技术栈

| 层        | 选型                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 构建/框架 | Rspeedy + ReactLynx + TypeScript                                                                                                            |
| 状态      | Zustand（客户端态）· TanStack Query（服务端态）                                                                                             |
| 路由      | TanStack Router（memory history，code-based）                                                                                               |
| UI        | lynx-ui 按组件包导入 + Apple 语义色 design tokens（`src/shared/theme/tokens.css`）+ @lynx-js/motion                                         |
| 数据模型  | zod（snake→camelCase transform）                                                                                                            |
| i18n      | i18next + react-i18next（en / zh）                                                                                                          |
| 测试      | Vitest + @testing-library（单元）· TestBridge + Vitest（E2E）                                                                               |
| 原生      | 10 个自研模块在契约闸门内（Audio/Storage/Platform/Dlna/Video/SongCache/Navigation/PluginBridge + Android FloatingLyric + iOS LiveActivity） |
| Web       | `@lynx-js/web-core`（`<lynx-view>` 在浏览器渲染 Lynx bundle）                                                                               |

## 快速开始

需要 Node `^20.19 || >=22.12`、pnpm，以及跑在 `http://localhost:58091` 的 Songloft 后端（账号 `admin/admin`）。

```bash
pnpm install
pnpm run web:sync && pnpm run web:dev   # 最快看到界面的路径
```

验收命令：

```bash
pnpm run build        # 必须列出两个产物：File (lynx) 与 File (web)
pnpm run typecheck    # = tsc -b（必须 -b，--noEmit 是空跑）
pnpm test             # Vitest 单元测试与契约闸门
pnpm run test:release # 发版脚本、版本与真实 Web 产物回归（先 build）
```

> 以上覆盖 JS 与发版工具检查；不替代 Kotlin/Swift/ArkTS 真编译或浏览器渲染。改了 `ios/`、`android/`、`harmony/`、`web/` 必须另跑对应平台验证。

**完整步骤 → [docs/getting-started.md](./docs/getting-started.md)** · **四平台构建与环境坑 → [docs/guides/build-and-run.md](./docs/guides/build-and-run.md)**

## 项目结构

```
src/              Lynx 客户端源码
  core/           网络、存储、配置
  features/       8 个功能模块（auth/home/library/library-ops/player/playlist/settings/jsplugin）
  models/         zod 数据模型
  native/         原生模块 TS 层
  shared/         共享组件、主题、布局、导航策略
  store/          Zustand 状态
  i18n/           多语言（en/zh）
android/          Android 宿主 + 原生模块（Kotlin）
ios/              iOS 宿主 + 原生模块（Swift）
harmony/          HarmonyOS 宿主 + 原生模块（ArkTS）
web/              Web 宿主页 + 宿主模块 + 本地静态服务
demo-frame-plugin/ Lynx 原生渲染插件演示工程
e2e/              E2E 测试（driver + 跨平台 scenario）
scripts/          构建脚本（bundle 拷贝、闸门、i18n 转换）
patches/          上游本地补丁（必须提交）
docs/             项目文档
```

## 文档

**入口：[docs/README.md](./docs/README.md)** —— 按 Diátaxis 组织（上手 / 操作指南 / 规范速查 / 背景解释 / 项目管理 / 归档）。

常用直达：

| 我想…            | 去                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| 从零跑起来       | [快速上手](./docs/getting-started.md)                                                                 |
| 构建某个平台     | [构建与运行](./docs/guides/build-and-run.md)                                                          |
| 写/跑测试        | [测试](./docs/guides/testing.md)                                                                      |
| 加原生能力       | [原生模块开发](./docs/guides/native-development.md) · [模块契约](./docs/reference/native-modules.md)  |
| 查规范           | [API 与 Store](./docs/reference/api-conventions.md) · [返回导航](./docs/reference/back-navigation.md) |
| 理解某个诡异行为 | [Lynx 约束](./docs/architecture/lynx-constraints.md) · [调试](./docs/guides/debugging.md)             |
| **接手项目**     | [交接文档](./docs/project/handoff.md)                                                                 |

根目录另有四份项目级文档：

- **[AGENTS.md](./AGENTS.md)** —— 开发规范与铁律（给 AI agent 与贡献者）：目录边界、Lynx 约束、验收闸门、原生模块调用约定、测试闸门原则
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** —— 面向代码探索的架构摘要；详细解释仍以 `docs/architecture/` 为准
- **[HARNESS.md](./HARNESS.md)** —— 构建、测试和平台验证入口及其覆盖边界
- **[DESIGN.md](./DESIGN.md)** —— Apple Human Interface Guidelines 总结（颜色/排版/布局/材质与 Liquid Glass/无障碍/Menus/组件规格），并附本仓库的落地注记

后端 API 契约（OpenAPI）**不在本仓库**：见后端仓库的 `docs/swagger.json`，或 `http://localhost:58091/swagger/index.html`。

## 状态

当前交付状态、最近一次验证结果和未完成事项统一维护在[交接文档](./docs/project/handoff.md)；逐批历史见[进展记录](./docs/project/progress.md)，平台能力与降级边界见[平台参考](./docs/reference/platforms.md)。根 README 不再复制易漂移的测试数量、产物大小和平台验收快照。

## 发版与贡献

```bash
./scripts/bump-version.sh patch --dry-run
./scripts/bump-version.sh patch
```

发版脚本同步版本、提交到 `main`、创建 `v*` tag 并推送。也可使用等价的 `pnpm run release patch`；Shell 入口复用现有 Node 发版逻辑，支持全部相同参数。详见[发版指南](docs/guides/releasing.md)。开发约定和验证要求见 [CONTRIBUTING.md](CONTRIBUTING.md)。

版本变更见根目录的中文 [CHANGELOG.md](CHANGELOG.md)；版本 Release 发布成功后自动更新，滚动 dev 的提交记录见对应 Release 页面。

## 许可证

本项目使用 [Apache-2.0](LICENSE)，与 Songloft 后端及 Flutter 客户端一致。第三方依赖保留各自许可证。
