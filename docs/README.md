# 文档索引

Songloft Player Lynx 客户端项目文档。按 [Diátaxis](https://diataxis.fr/) 组织 —— **按你此刻的意图找，而不是按主题猜**。

| 目录 | 象限 | 什么时候来这里 |
|---|---|---|
| [getting-started.md](./getting-started.md) | tutorial | 第一次跑这个项目 |
| [guides/](./guides/) | how-to | 我要完成一件具体的事（构建、测试、加原生能力、部署、调试） |
| [reference/](./reference/) | reference | 我要查一个规范或契约的准确形状 |
| [architecture/](./architecture/) | explanation | 我想搞明白**为什么**是这样 |
| [project/](./project/) | —— | 项目管理：进展、交接、缺陷、活跃计划 |
| [archive/](./archive/) | —— | 归档：已闭合的计划、项目启动前的迁移调研 |

根目录另有两份项目级入口文档：**[AGENTS.md](../AGENTS.md)**（开发规范与铁律）· **[DESIGN.md](../DESIGN.md)**（Muse 设计语言）。

---

## 项目状态

> **数据截至 2026-08-26（批60c）**，改动后请一并更新。
>
> ⚠️ 这份数字腐烂过两次（先停在批32，订正后又停在批42 整 18 个批次）。**根因是没有闸门读它** —— `AGENTS.md` §6 的原则同样适用于文档本身。

| 指标 | 值 |
|------|-----|
| 源码规模 | 560 文件 / ~78.5K 行（ts + tsx + css） |
| 特性模块 | auth · home · library · library-ops · player · playlist · settings · jsplugin |
| 测试 | **1947** vitest（186 文件）+ 33 个 E2E 场景 |
| 构建产物 | lynx 2194.4 kB / web 2261.4 kB（未压缩，双产物） |
| 原生模块 | 9 个跨平台模块在契约闸门的 `modules` 表内，另有 Web 独有 `SongloftWebview`（独立 describe 覆盖） |
| 目标平台 | Android · iOS · Web（桌面 Lynxtron 未开始） |

### 平台可用性

| 平台 | 状态 |
|------|------|
| Android | ✅ 真机验证通过（播放 / 通知栏 / 扫描 / 重复检测 / 悬浮歌词 / 全屏视频全链路） |
| iOS | ✅ 可构建可运行（`ios:build BUILD SUCCEEDED`，e2e 110/110）。7 个原生模块全部注册（`SongloftNavigation` 刻意不做——没有返回键可拦） |
| Web | ✅ 可加载渲染、**有音频**。几条已知限制（无 longpress、占位符色、文件选择器 user activation）见 [Web 部署](./guides/web-deployment.md) |
| 桌面 | ⛔ 未开始（P3 唯一未开始项，剩余最大单块能力） |

### 迁移路线

```
P0 技术验证     ████████████████████ 100%  — 移动端 + Web 部分；桌面判据未执行
P1 基础设施     ████████████████████ 100%
P2 核心业务     ████████████████████ 100%
P3 平台特性     ██████████████████░░  90%  — 仅剩 Lynxtron 桌面
P4 双轨发布     ░░░░░░░░░░░░░░░░░░░░   0%  — 未开始
```

**P3 已完成**：EQ 双端 DSP · 数据导入导出 · 主题包 · 歌词编辑 · 服务端自升级 · 音量归一化 · 播放历史（批50）· DLNA（批42）· 悬浮歌词（批48）· Live Activity（批43+45）· 全屏视频（批49）· 单曲离线缓存 · Web 平台。
**P3 未开始**：桌面 Lynxtron。

> 上一版这张表有 5 项与事实不符（把已完成的能力标成 ❌/⛔）。逐项修复批次见 [progress.md](./project/progress.md)。

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

设计 token 的权威表在根目录 **[DESIGN.md](../DESIGN.md)**（刻意不在 docs 里复制一份——副本必然漂移）。

后端 API 契约（OpenAPI）**不在本仓库**：见后端仓库 `docs/swagger.json`，或 `http://localhost:58091/swagger/index.html`。同样是刻意不复制。

## architecture/ — 背景与解释

| 文件 | 说明 |
|------|------|
| [overview.md](./architecture/overview.md) | 分层、状态边界、一次播放请求的数据流、覆盖层为何都挂根上 |
| [lynx-constraints.md](./architecture/lynx-constraints.md) | 双线程与 realm 隔离、Web 的 Worker realm、无 DOM 的后果、布局反直觉处 —— **「为什么」的总入口** |
| [platform-differences.md](./architecture/platform-differences.md) | 三端能力与行为矩阵（34 条），含音频引擎两条实测差异与视频源判定 |
| [e2e-testing-design.md](./architecture/e2e-testing-design.md) | E2E 架构：Driver 接口、TestBridge 协议、场景分类 |

## project/ — 项目管理

| 文件 | 说明 |
|------|------|
| [handoff.md](./project/handoff.md) | **工作交接（批60c）** —— 接手先读这篇：现状、铁律、剩余工作、验证欠账 |
| [progress.md](./project/progress.md) | 分批开发进展（批1–60c）。**每批验收后必须更新**（`AGENTS.md` §3 工作流） |
| [bugs.md](./project/bugs.md) | 缺陷清单。当前 **8 条未修**，每条写明「为什么没修」 |
| [plans/upstream-issues.md](./project/plans/upstream-issues.md) | 已提交给 Lynx 官方的 issue；修复合入后移除 `patches/` 下对应 patch（当前 2 个） |

## archive/ — 归档

已执行完或已闭合，保留作历史索引与根因查阅。**不要照抄里面的接口签名与状态判断** —— 见 [archive/migration/README.md](./archive/migration/README.md) 的订正表。

| 文件 | 说明 |
|------|------|
| [2026-08-14-audit-fix-plan.md](./archive/2026-08-14-audit-fix-plan.md) | 四路审计的修复排期（批41–48），含三类系统性根因与明确不做清单。**已闭合** |
| [migration/](./archive/migration/) | 项目启动前的 5 份迁移可行性调研 + **订正说明** |
| [web-support.md](./archive/web-support.md) | Web 支持原始计划 + 7 处「未经验证就写进设计的假设」及其后果 |
| [lyrics-settings-plan.md](./archive/lyrics-settings-plan.md) · [settings-category-refactor-plan.md](./archive/settings-category-refactor-plan.md) · [settings-refactor-plan.md](./archive/settings-refactor-plan.md) | 已执行的歌词/设置页重构计划 |
