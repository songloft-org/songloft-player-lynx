# 文档索引

Songloft Player Lynx 客户端项目文档。按 [Diátaxis](https://diataxis.fr/) 组织 —— **按你此刻的意图找，而不是按主题猜**。

| 目录 | 象限 | 什么时候来这里 |
|---|---|---|
| [getting-started.md](./getting-started.md) | tutorial | 第一次跑这个项目 |
| [guides/](./guides/) | how-to | 我要完成一件具体的事（构建、测试、加原生能力、部署、调试） |
| [reference/](./reference/) | reference | 我要查一个规范或契约的准确形状 |
| [architecture/](./architecture/) | explanation | 我想搞明白**为什么**是这样 |
| [project/](./project/) | —— | 项目管理：进展、交接、缺陷、活跃计划 |
| [audit/Report.md](./audit/Report.md) | —— | 查看 2026-09-01 历史审计快照、当时未决项与证据入口 |
| [archive/](./archive/) | —— | 归档：已闭合的计划、项目启动前的迁移调研 |

根目录项目级入口：**[AGENTS.md](../AGENTS.md)**（开发规范与铁律）· **[ARCHITECTURE.md](../ARCHITECTURE.md)**（架构摘要）· **[HARNESS.md](../HARNESS.md)**（验证契约）· **[DESIGN.md](../DESIGN.md)**（Muse 设计语言）。

---

## 项目状态

这里不再复制测试数量、bundle 大小、提交数或平台验收日期。它们变化快，过去多次与代码脱节。

| 想确认什么 | 权威维护文档 |
|---|---|
| 当前做到哪、最近一次验证和剩余工作 | [project/handoff.md](./project/handoff.md) |
| 分批交付历史 | [project/progress.md](./project/progress.md) |
| 开放与已闭合缺陷 | [project/bugs.md](./project/bugs.md) |
| 平台最低版本、能力和降级路径 | [reference/platforms.md](./reference/platforms.md) |
| 原生模块方法、事件与注册矩阵 | [reference/native-modules.md](./reference/native-modules.md) |
| 2026-09-01 历史代码库审计快照 | [audit/Report.md](./audit/Report.md) |

---

## guides/ — 操作指南

| 文件 | 说明 |
|------|------|
| [build-and-run.md](./guides/build-and-run.md) | 四平台构建命令 + 每个平台真实踩过的环境坑（JDK 缺失、CocoaPods 被 gitconfig 打断、两次 xcodebuild 的原因） |
| [testing.md](./guides/testing.md) | 单元与 E2E 怎么跑、跑前四件环境检查、skip 数为什么要盯 |
| [native-development.md](./guides/native-development.md) | 加方法/加模块的四处（八处）同步清单，漏哪一处会怎样 |
| [web-deployment.md](./guides/web-deployment.md) | standalone 与 embedded 两种产物、Web 已知限制、宿主模块 |
| [debugging.md](./guides/debugging.md) | Android dumpsys、Web 无头浏览器实测、一次性探针 scenario |

## reference/ — 规范速查

| 文件 | 说明 |
|------|------|
| [api-conventions.md](./reference/api-conventions.md) | API/Store 设计规范（参数风格、数值范围、命名、E2E 暴露约定） |
| [native-modules.md](./reference/native-modules.md) | 全部原生模块的方法/事件/平台矩阵与闸门锁住的不变量 |
| [back-navigation.md](./reference/back-navigation.md) | 返回导航三层模型、`consumable` 契约、Web sentinel、新增页面/弹出层清单 |
| [platforms.md](./reference/platforms.md) | 支持平台矩阵与最低系统版本（Android minSdk 21 / iOS 15.0 / HarmonyOS NEXT / Web 常青浏览器），含 API 分级守卫清单 |

设计 token 的权威表在根目录 **[DESIGN.md](../DESIGN.md)**（刻意不在 docs 里复制一份——副本必然漂移）。

后端 API 契约（OpenAPI）**不在本仓库**：见后端仓库 `docs/swagger.json`，或 `http://localhost:58091/swagger/index.html`。同样是刻意不复制。

## architecture/ — 背景与解释

| 文件 | 说明 |
|------|------|
| [overview.md](./architecture/overview.md) | 分层、状态边界、一次播放请求的数据流、覆盖层为何都挂根上 |
| [lynx-constraints.md](./architecture/lynx-constraints.md) | 双线程与 realm 隔离、Web 的 Worker realm、无 DOM 的后果、布局反直觉处 —— **「为什么」的总入口** |
| [platform-differences.md](./architecture/platform-differences.md) | 四端能力与行为矩阵，含音频引擎差异与视频源判定 |
| [e2e-testing-design.md](./architecture/e2e-testing-design.md) | E2E 架构：Driver 接口、TestBridge 协议、场景分类 |

## project/ — 项目管理

| 文件 | 说明 |
|------|------|
| [handoff.md](./project/handoff.md) | **工作交接** —— 接手先读这篇：现状快照、闸门验证状态、剩余工作、明确不做 |
| [pitfalls.md](./project/pitfalls.md) | **踩坑实录** —— 按主题组织的根因案例（平台判断/Web 宿主/原生模块/闸门/布局/测试），附 SDK 源码、自签名环境、视频素材等操作性参考 |
| [progress.md](./project/progress.md) | 分批开发进展与历史验证记录；每批验收后更新 |
| [bugs.md](./project/bugs.md) | 开放与已闭合缺陷清单；新问题另起条目，别在已闭合条目上续写 |
| [plans/upstream-issues.md](./project/plans/upstream-issues.md) | 已提交给 Lynx 官方的 issue；修复合入后移除 `patches/` 下对应 patch（当前 2 个） |

## audit/ — 代码库审计

| 文件 | 说明 |
|---|---|
| [Report.md](./audit/Report.md) | 固定于 2026-09-01 基线的历史审计总览；Finding、任务证据与跨模块复核由该目录继续导航 |

## archive/ — 归档

已执行完或已闭合，保留作历史索引与根因查阅。**不要照抄里面的接口签名与状态判断** —— 见 [archive/migration/README.md](./archive/migration/README.md) 的订正表。

| 文件 | 说明 |
|------|------|
| [2026-08-14-audit-fix-plan.md](./archive/2026-08-14-audit-fix-plan.md) | 四路审计的修复排期（批41–48），含三类系统性根因与明确不做清单。**已闭合** |
| [harmony-integration-plan.md](./archive/harmony-integration-plan.md) | HarmonyOS 宿主集成计划。**已完成**（9 个原生模块实现，DevEco 工程就位） |
| [lynx-native-plugin-rendering.md](./archive/lynx-native-plugin-rendering.md) | Lynx 原生渲染插件设计（插件以 `<frame>` 子页渲染于原生容器）。**已落地**（`4f0060b`，批63 后续） |
| [migration/](./archive/migration/) | 项目启动前的 5 份迁移可行性调研 + **订正说明** |
| [web-support.md](./archive/web-support.md) | Web 支持原始计划 + 7 处「未经验证就写进设计的假设」及其后果 |

> 歌词设置、设置页排序、设置页分类三份执行计划已删除（2026-08-26）：内容已全部实现，且设置页其后又经历两轮重构（批50 下沉二级页、批59 主题包并入外观页），计划描述的目标状态不再是现状，无根因/决策记录价值。
