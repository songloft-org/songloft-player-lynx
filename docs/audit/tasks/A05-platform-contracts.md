# 审计任务 A05 — 四端原生模块与宿主契约

## 快照与状态

`20260901-main-982291d` · `main@982291d` · Context `9cd06e…a37eae` · 待开始。

## 范围与问题

- 范围：`src/native/` 与 Android/iOS/HarmonyOS/Web 注册、方法、callback、事件、globalProps、权限及宿主生命周期。
- 问题：TS facade 与四端实现是否在支持矩阵内逐项配对，事件参数与能力降级是否一致，注册/manifest/pbxproj 是否完整。
- 排除：设备实测在当前环境不可用；第三方依赖实现不审计。

## 分区依据与入口

Context 指定 `src/native/native-modules.ts` 为宿主访问边界，并要求新增方法同步 TS/Kotlin/iOS、显式注册、事件名逐字一致；项目实际还包含 HarmonyOS 与 Web host 分支。

入口：`docs/reference/native-modules.md`、`src/native/native-modules.ts`、各平台 application/view controller/ability/web host 注册点。

## 边界与证据策略

从 TS facade 生成方法/事件/模块台账并反向核对四端；抽查 callback Promise 化、事件数组参数、permission 与 cleanup；用已有静态测试和构建配置寻找反证。与 A01/A02/A04 复核实际 caller 可达性。
