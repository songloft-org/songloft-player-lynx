# 审计任务 A06 — 构建、测试与交付可复现性

## 快照与状态

`20260901-main-982291d` · `main@982291d` · Context `9cd06e…a37eae` · 待开始。

## 范围与问题

- 范围：package scripts、pnpm/Corepack 元数据、Rspeedy environments、copy/assert 脚本、CI workflows、Vitest/tsconfig、平台工程解析入口及文档命令。
- 问题：声明的验证入口是否在目标环境可复现，是否真正读取对应产物/宿主，并能阻止陈旧 bundle、失效测试与配置漂移进入交付。
- 排除：修复测试或工具链；设备/外部服务不可用时记录证据缺口。

## 分区依据与入口

HARNESS 明确 JS 构建不覆盖宿主，并要求 build 同时产出 Lynx/Web；Context 将 `package.json`、workflows、测试与 copy/patch 脚本列为验证入口和高风险区域。

入口：`package.json`、`lynx.config.ts`、`vitest.config.js`、`scripts/`、`.github/workflows/`、各平台工程清单。

## 边界与证据策略

核对命令链与实际读取边界，复查已运行的 typecheck/build/full test 证据，隔离稳定失败与环境偶发失败；检查包管理器版本固定、CI 覆盖与产物 freshness 保护。与 A02/A04 判断测试失败影响，与 A05 复核宿主闸门。
