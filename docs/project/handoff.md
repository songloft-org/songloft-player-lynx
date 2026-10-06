# 工作交接（2026-10-06）

本文维护当前范围和验证边界；逐批证据见 [progress.md](progress.md)，已知问题见 [bugs.md](bugs.md)。旧记录中的「未提交」和验数仅代表当时快照。[English](../en/project/handoff.md)。

## 1. 当前完成度

定位为预览版。核心播放、曲库/歌单、歌词、插件、主题、多服务器和管理设置已有实现，四端都有宿主代码。**没有原生桌面客户端、Bundle 本地后端和客户端内检查更新**；关于页的后端更新升级服务器。未消费的 `bundleMode/systemTray` 能力探测不代表功能完成。

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
6. 桌面端、Bundle 本地后端、客户端内下载升级属于后续功能。

### 现状核查（2026-10-06）

P1 已改用 `/songs/{id}/audio-tracks` 的 `{tracks: [...]}` 完整契约，播放器更多菜单提供多音轨面板；按真实 index 切换并保留进度和播放意图。四端源准备契约已同步源码，旧壳禁用切轨并提示升级。Android 双音轨设备测试与 Web 真浏览器播放已通过；iOS/HarmonyOS 编译和设备验收仍开放，视频仍按用户要求暂缓。详细证据与剩余项见 [progress.md](progress.md)。

P2a 已加入独立 bundle/清单签名、兼容模型和 prepare 阶段的不可变壳快照，见 [客户端更新协议](../reference/client-updates.md)。全量 JS 与 Node/Java 协议回归通过；真实发布密钥尚未配置。原生加载器/下载/回退和更新界面继续由 P2b/P2c 实施，当前仍没有可用的客户端内更新入口。

80% 进度处已有下一曲 Range GET 预取，不能再列为完全缺失。Web 文件桥接已存在，但 `dataTransfer` 仍显式禁用。HarmonyOS `Index.ets` 已注册视频模块并创建 XComponent，iOS 视频已使用 AVPlayerLayer 下层表面；源码存在不代表设备验收完成。

## 5. 接手与验证

先读 [AGENTS.md](../../AGENTS.md)、[pitfalls.md](pitfalls.md)，再按 [构建](../guides/build-and-run.md)、[测试](../guides/testing.md) 执行。

```bash
pnpm run typecheck
pnpm run prepare:build
SONGLOFT_BUILD_METADATA="$PWD/.build/version.json" pnpm run build
pnpm test
pnpm run test:release
```

原生改动需同步新 bundle 后真编译。Debug E2E 显式启用 JS 桥并通过 adb forward/iproxy 连接；发布检查使用无桥 bundle，不能混用。
