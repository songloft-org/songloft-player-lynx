# 鸿蒙 miot 插件白屏排查（2026-11-17）

## 结论与修复

基线为 `songloft-org/songloft-player-lynx@173fa140c70ba80998cb8f49960619306986ef86`，父仓库为 `songloft-org/songloft@caf3729128ff85dbd5280b861ea9eace439b0efa`。既有桌面候选工作树保留。用户随后授权本批提交、推送及同步父指针；实际提交和同 SHA CI 记录于 `/tmp/songloft-harmony-miot/delivery.json`。不创建正式版本，真机仍未验收。

`LynxPluginFrame` 原生分支统一输出 `<frame>`，但所用 HarmonyOS Lynx 4.0.1 没有对应实现，`Index.ets` 也没有注册 Behavior。只有模板 fetcher 和桥接模块不足以创建子页面；SDK 对未知 UI 回落为空 UIView。这是当前源码中可证实的白屏原因，报告人的版本和设备尚未提供，不能声称已完成其原机复现。

证据包括锁文件对应的 `@lynx/lynx@4.0.1` HAR 源码，以及官方 [Harmony UIOwner](https://github.com/lynx-family/lynx/blob/4.0.1/platform/harmony/lynx_harmony/src/main/cpp/ui/ui_owner.cc)、[XElement 注册](https://github.com/lynx-family/lynx/blob/4.0.1/platform/harmony/lynx_xelement/registry.cc)和 [FrameElement](https://github.com/lynx-family/lynx/blob/4.0.1/core/renderer/dom/fiber/frame_element.cc)。内置 frame 有独立的核心模板与数据管线，不能仅添加同名 UI 就假定 Harmony 已实现整条链路。

修复为鸿蒙使用专用 `songloft-plugin-frame`，由 `SongloftPluginFrameUI` 创建独立 LynxView。显式接入模板/通用/媒体 fetcher、组件表和独立 `SongloftPluginBridge`，首帧携带服务器子路径、frameId、主题、令牌和播放器快照。晚到的令牌及后续 props 合并到已有上下文，不重建页面。换 URL/身份或销毁时释放 BuilderNode，并按上下文身份清理子桥；迟到的加载回调失效。子引擎接收窗口前后台通知，不注册根页面的更新失败或外观/生命周期单例。错误日志只记录错误码，不记录 URL/凭据。Android/iOS 与 Web 沿用各自现有分支。

必须重新构建并安装包含本次 ArkTS 和共享 JS 的 HAP；单独更新服务器、miot 包或 JS 热更新不能为旧壳增加原生组件。

## 验证

环境：Linux x86_64、共享 JS 使用 Node 22.17.1，HAP 工具链内置 Node 24.14.1、Lynx Harmony SDK 4.0.1。日志和工作树摘要目录：`/tmp/songloft-harmony-miot/`。验证对象为上述基线加本批工作树，具体文件 SHA-256 见该目录 `verification.json`。

- ArkTS 生产类的 Node 适配器回归：六项通过，覆盖注册/初始参数、延迟创建与令牌、真实桥接 RPC/推送、替代实例/迟到回调、窗口前后台和按身份清理。适配器替代 ArkUI builder，不是设备渲染证据。
- 完整组件定向回归：十二项通过，含鸿蒙专用标签、原生 bundle URL、初始 props 和桥接清理，以及既有 Web/Android 分支。
- 隔离旧实现回归因没有创建子页面（实际 0，预期 1）失败，见 `frame-before-final.log`；组件旧实现因缺少专用节点失败，见 `component-before-allowed.log`。后者第一次受隔离目录的 Vite 文件白名单限制未执行测试，补充临时白名单后才取得行为失败证据，没有修改工作区测试配置。
- `pnpm exec tsc -b`、`pnpm run build`（两种产物）和 `pnpm test --maxWorkers=4`（368 文件/3848 项）通过；日志为 `types-package.log`、`build-package.log`、`tests-final.log`。`pnpm run test:release` 最终 95 项通过（`release-package.log`）。首次发布检查与构建并行，因 Web 产物尚未生成失败；随后按正确顺序复跑通过。
- HAP：隔离副本执行 CI 同款依赖安装及两项 SDK 补丁后，`hvigorw clean assembleHap --mode module -p product=default -p buildMode=release --no-daemon` **34 个任务全部执行成功**（`hap-build.log`）。工具链为仓库 CI 使用的第三方 `ErBWs/ohos-sdk` 镜像 `26.0.0.821`，内置 SDK `26.0.0.105 / API 26`；归档 SHA-256 `0cbdf7ac5c1be1e42694d448ffaee0c0be0ba9a948197e2bc5b61ca5bdc481f2` 与既有记录及下载校验文件一致，不描述为验证过官方分发签名。SDK 模块注册的 class-as-object、旧 API 等告警保留。
- `python3 scripts/verify-package.py harmony <HAP> .build/version.json` 通过（`package-verify-final.log`）；初次缺少隔离副本的 `.build/native-host.json`，补齐与包内相同的元数据后重跑，未改校验器。包内编译 ArkTS 包含组件与注册，bundle 与该轮工作树产物字节相同。首轮产物摘要保留在 `verification.json`；当前提交候选包另见下文。dev 元数据中的源码标识为 `unknown`，实际源码以验证快照绑定，不是正式发行包。

### 提交候选隔离验证

用户授权提交推送后，将暂存树 `ece9e45f57404f33336e2ccb1dda009a02d6cdc0` 导出至 `commit-check/`，排除既有桌面改动；七个源码/测试文件与首轮验证快照逐字节一致。共享文档仅暂存本次鸿蒙段落。随后只补充交付文档，代码保持不变。

隔离执行 `node node_modules/typescript/bin/tsc -b`、`node_modules/.bin/rspeedy build`（Lynx/Web 双产物）、`node node_modules/vitest/vitest.mjs run --config vitest.delivery.config.js --maxWorkers=4`，**366 文件/3843 项通过**；直接执行发布脚本测试 **95 项通过**。临时测试配置只放行隔离副本对原工作区依赖的读取，不改变已提交测试逻辑。日志为 `delivery-{types,build,tests,release-tests}.log`；此前 368/3848 是包含未提交桌面测试的工作树结果，不能混用为提交候选计数。

候选 JS 重新写入隔离 HAP，clean 编译 **34 项任务全部执行成功**，包校验通过，包内 bundle 与候选产物字节一致，编入本次组件与注册。日志为 `delivery-hap.log`、`delivery-package-verify.log`，摘要为 `delivery-artifact.json`。当前未签名包单独保存为 `/tmp/songloft-harmony-miot/delivery-unsigned.hap`，SHA-256 `deb7aeaffba2a856c78e0eff518c74488a697a862f588d011f0a0636aaab8e9f`；bundle SHA-256 `5934b0944b41cfc9a4dd99a418ef0416545080f511bcfbc11331851aa5bf8768`。提交、推送、父指针及同 SHA CI 状态写入 `delivery.json`。

Not run：HarmonyOS 真机/模拟器的 miot 首屏、输入、页签切换、后台恢复和音箱交互；当前没有连接的鸿蒙设备。未读取签名私钥或生成正式签名发行包。Android/iOS 宿主源码未修改，其原生重编译与设备交互未运行。

[English](../en/project/harmony-plugin-frame.md)
