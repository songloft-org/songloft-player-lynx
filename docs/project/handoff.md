# 工作交接（2026-10-06）

本文维护当前范围和验证边界；逐批证据见 [progress.md](progress.md)，已知问题见 [bugs.md](bugs.md)。旧记录中的「未提交」和验数仅代表当时快照。[English](../en/project/handoff.md)。

## 1. 当前完成度

定位为预览版。核心播放、曲库/歌单、歌词、插件、主题、多服务器和管理设置已有实现，四端都有宿主代码。关于页已分开提供客户端和服务器更新；客户端严格按壳通道检查 dev 或最新正式发布，三端更新器源码已接入，Android/Web 有本地流程证据，iOS/HarmonyOS 编译和设备验收开放，正式更新签名未配置。**原生桌面客户端与 Bundle 本地后端不在本轮范围**。未消费的 `bundleMode/systemTray` 能力探测不代表功能完成。

Android 有最近的编译记录；iOS 旧 CI 成功与 HarmonyOS 旧 CI 失败不能证明当前代码可发布。后台播放、投屏、通知与视频需要设备验证，不能从 JS 测试推断。

## 2. 开源与发布准备

已补 Apache-2.0 许可证和双语 README、贡献、安装、构建、测试、发版指南。中文历史审计保留原文，英文索引标明。入口见 [文档索引](../README.md)。

统一 [build-and-release.yml](../../.github/workflows/build-and-release.yml)：

- main 代码推送自动更新 dev；dispatch 可重跑；v\* tag 发布正式版或预览版。
- APK、未签名 IPA、HAP、standalone/embedded Web 压缩包共用版本与构建元数据。
- JS、签名、版本和包内容检查、五个产物全部成功后才发布。
- `pnpm release patch --dry-run` 审核计划；实际发版同步版本、提交、打 tag 并原子推送。见 [发版指南](../guides/releasing.md)。
- Android/iOS TCP 测试桥仅 Debug 注册且绑定 loopback；JS E2E 需显式 `SONGLOFT_TEST_BRIDGE=true`，发布包禁止包含。
- Web 打包先清理再复制，修复 embedded 复制后删除 bundle/引擎的问题。

本批实现与本地验证已完成。推送后的云端构建和下载资产以 GitHub Actions/Release 为准；仓库可见性需独立管理。Android/HarmonyOS 签名 secret 名称已配置，实际签名需 CI 验证；iOS IPA 需自行签名，不能直接安装。

## 3. 本次验证

Linux 可验证 JS、脚本与 Android；iOS/HarmonyOS 需各自工具链。最终验证记录见 [progress.md](progress.md) 本次条目。工作流静态校验不能替代真实云端签名与编译。

投屏诊断已接入现有客户端日志，覆盖设备、媒体 URL/MIME、操作、原生 SOAP 错误码及播放状态变化，token 脱敏、轮询去重。全量 JS 258 文件 / 2786 项、类型检查及 Lynx/Web 双产物通过；未新增原生方法。直接测试电视时，Flutter 内嵌 DIDL 触发 716，转义后的同一 HTTPS MP3 请求被接受，Flutter 已修正；电视随后仍持续 TRANSITIONING，无鉴权的 HTTP MP3 也没有被拉取。用户确认电视提示「当前场景不能投屏」，需处理电视接收端的场景限制。真实客户端日志导出与成功播放尚未验证，改动尚未推送或发布。

## 4. 剩余工作

1. 配置签名并运行全平台 CI，真机检查 APK/HAP 安装升级、iOS 重签安装。
2. Android/iOS 全量 E2E，以及通知歌词、后台连播、插件恢复前台、长请求与 DLNA 实测。
3. HarmonyOS 缺失通知歌词方法、剪贴板占位及契约覆盖不足，见 [bugs.md](bugs.md)。
4. iOS 字体大小、HLS 自签名地址等开放问题仍以 bugs 为准。
5. Web 子路径部署未验证；插件排序需要支持 `/settings/plugin-order` 的新后端，旧后端返回 404。
6. 桌面端和 Bundle 本地后端不在本轮范围；设备批量缓存、离线列表、Web 数据传输/快捷键及剩余原生能力按批准计划继续。

### 现状核查（2026-10-06）

P1 已改用 `/songs/{id}/audio-tracks` 的 `{tracks: [...]}` 完整契约，播放器更多菜单提供多音轨面板；按真实 index 切换并保留进度和播放意图。四端源准备契约已同步源码，旧壳禁用切轨并提示升级。Android 双音轨设备测试与 Web 真浏览器播放已通过；iOS/HarmonyOS 编译和设备验收仍开放，视频仍按用户要求暂缓。详细证据与剩余项见 [progress.md](progress.md)。

P2a 已加入独立 bundle/清单签名、兼容模型和 prepare 阶段的不可变壳快照，见 [客户端更新协议](../reference/client-updates.md)。全量 JS 与 Node/Java 协议回归通过；真实发布密钥尚未配置。该阶段尚无客户端内更新入口，后续 P2b/P2c 的证据如下。

P2b 第一批已接入 Android 模块、APK 不可变信息与根模板加载器；共享 TS facade 有超时/取消、真实路由启动确认与错误边界。Android JVM 用真实 TLS/文件测试 11 项通过，包含取消、磁盘篡改、未确认回退、通道新旧和安装新壳；全量 JS **263 文件 / 2849 项通过**，Node 发布工具 **19 项通过**。iOS/HarmonyOS 模块和 P2c 界面继续实施，尚不能声称三端热更新完成；本地模拟器证据与最终编译见 progress 本批条目。

P2b 第二批已接入 iOS 验签、流式下载、磁盘状态机、根模板和 fatal 启动错误回调，并加入 Xcode 源文件/资源与模块注册。Apple CI 新增直接执行原生核心的验证程序，但本机 Linux 没有 Xcode/swiftc，**尚未编译或执行，设备验收仍开放**。CI 漏传 bundle 宿主快照已修复，三端 copy 和包内身份/公钥回归已补齐；共享契约 298 项、Node 发布工具 20 项通过。HarmonyOS 和 P2c 继续实施，证据见 progress。

P2b 第三批已接入 HarmonyOS 8 方法、不可变 rawfile 身份、公钥验签、独立系统 TLS 流式下载、根模板选择和 fatal 回调；关闭自动重定向后逐跳验证 HTTPS，支持取消、下次冷启动确认/回退及恢复内置。转译后的实际源码在 Node 真实 RSA/HTTPS/文件系统适配器下 **5 项核心回归通过**，原生结构闸门 286 项、发布工具 25 项通过；**不等于 ArkTS/HAP 编译或设备 SDK 验证**，相关环境仍缺失。三端源码接入后继续 P2c 页面，P2b 的未验收项仍保留。

80% 进度处已有下一曲 Range GET 预取，不能再列为完全缺失。Web 文件桥接已存在，但 `dataTransfer` 仍显式禁用。HarmonyOS `Index.ets` 已注册视频模块并创建 XComponent，iOS 视频已使用 AVPlayerLayer 下层表面；源码存在不代表设备验收完成。

P2c 关于页入口已接入客户端通道检查、壳/bundle 版本、原生验签后下载、进度/取消、下次冷启动/恢复内置提示及 APK/IPA/HAP/Web 部署包链接。bridge 2 新增 `fetchMetadata`，独立系统 TLS，不继承业务证书跳过设置；旧八方法壳只提供发版页。Android 本地签名夹具验证实际界面下载、播放不中断、取消清理、冷启动 B/壳 A 和恢复内置；Web Worker 检查使用无凭据请求，中英最大字号及三个宽度通过。正式签名、Apple/HarmonyOS 编译及设备验收仍开放。按用户批准的计划继续 P3 缓存，不 push；细节及回归计数见 progress。

## 5. 接手与验证

P3a 第一批已接入共享缓存身份/变体模型、Callback facade 和 Android v2 持久索引/任务调度。下载冻结身份及音轨/音质/归一化，索引快照不含凭据，旧文件保留并计入容量；取消真实连接且排队取消不开连接。恢复播放前读取身份，切换服务器使用 token 绑定的用户名。设备界面缓存默认/第 1 条音轨得到两个独立 MP3 文件；后端端口不可达时冷启动播放、暂停/继续通过，并修正了 HTTP 数据源无法打开本地文件的问题。iOS/HarmonyOS v2、批量与离线列表仍继续实施；详细契约见 [设备缓存](../reference/device-cache.md)，验证计数见 progress。仅本地提交，不 push。

先读 [AGENTS.md](../../AGENTS.md)、[pitfalls.md](pitfalls.md)，再按 [构建](../guides/build-and-run.md)、[测试](../guides/testing.md) 执行。

```bash
pnpm run typecheck
pnpm run prepare:build
SONGLOFT_BUILD_METADATA="$PWD/.build/version.json" pnpm run build
pnpm test
pnpm run test:release
```

原生改动需同步新 bundle 后真编译。Debug E2E 显式启用 JS 桥并通过 adb forward/iproxy 连接；发布检查使用无桥 bundle，不能混用。
