# 文档索引

Songloft Player Lynx 客户端项目文档。

> **数据截至 2026-08-14**。下方「项目状态」含具体数字，改动后请一并更新——本文件此前的数字停留在批32 时代（测试数、产物体积、批次范围全部过期），是审计时发现的问题之一。

文档按类别分目录组织：

```
docs/
├── reference/     规范与参考资料（API/Store 设计规范）
├── migration/     迁移调研历史（项目启动前的可行性研究）
├── plans/         待执行的开发/修复计划（archive/ 存已归档的历史计划）
├── testing/       测试设计（E2E 行为测试架构）
└── tracking/      进度与缺陷跟踪（开发进展、bug 清单）
```

## 项目状态

| 指标 | 值 |
|------|-----|
| 源码规模 | 342 文件 / ~41.8K 行（ts + tsx + css） |
| 特性模块 | auth · home · library · library-ops · player · playlist · settings · jsplugin |
| 测试 | **858** vitest（93 文件）+ 27 个 E2E 场景 |
| 构建产物 | ~1.8 MB（未压缩） |
| 目标平台 | Android · iOS · Web（桌面 Lynxtron 未开始） |

### 平台可用性（2026-08-14 审计后的真实状态）

| 平台 | 状态 |
|------|------|
| Android | ✅ 真机验证通过（播放 / 通知栏 / 扫描 / 重复检测全链路） |
| iOS | ✅ 可构建（批41 修复了批39 引入的 `project.pbxproj` 损坏，`BUILD SUCCEEDED`）。原生模块中 Live Activity 仍未注册，见下方 P3 分解 |
| Web | ⚠️ 产物可正常加载并渲染（批41 修复黑屏），但**没有音频** —— `web-audio.ts` 实际是 dead code，见 `plans/2026-08-14-audit-fix-plan.md` P0-2 |

## reference/ — 规范与参考

| 文件 | 说明 |
|------|------|
| [api-design-conventions.md](./reference/api-design-conventions.md) | API/Store 设计规范（参数风格、数值范围、命名、E2E 约定） |

后端 API 契约（OpenAPI）**不在本仓库**：见后端仓库的 `docs/swagger.json`，或开发模式下的 `http://localhost:58091/swagger/index.html`。刻意不复制副本以免漂移。

另有两份文档在**仓库根目录**（不在 `docs/` 下，因为它们是项目级入口文档）：

| 文件 | 说明 |
|------|------|
| [AGENTS.md](../AGENTS.md) | 开发规范：目录边界、Lynx 约束与铁律、验收闸门、原生模块调用约定、测试闸门原则 |
| [DESIGN.md](../DESIGN.md) | Muse 设计语言：色彩/间距/圆角 token、图标规范、WCAG AA 对比度要求 |

## plans/ — 开发与修复计划

| 文件 | 说明 |
|------|------|
| [2026-08-14-audit-fix-plan.md](./plans/2026-08-14-audit-fix-plan.md) | **当前主计划**：四路审计的修复与开发排期（批41–44+），含三类系统性根因、验收闸门、明确不做清单 |
| [archive/web-support.md](./plans/archive/web-support.md) | Web 平台支持的原始计划（已执行完毕）+ 订正表：记录了 7 处「未经验证就写进设计的假设」及其后果 |

## migration/ — 迁移调研历史

以下文档产出于项目启动前，用于论证迁移可行性与规划路线。项目启动后已按实际推进，部分结论已被实践验证或超越。当前作为历史参考。

| 文件 | 说明 | 当前状态 |
|------|------|----------|
| [lynx_migration_overview.md](./migration/lynx_migration_overview.md) | 迁移动机、平台矩阵、技术栈决策 | P0/P1/P2 已完成验证并落地 |
| [lynx_capability_matrix.md](./migration/lynx_capability_matrix.md) | Flutter vs Lynx 逐项能力对照 | 核心能力已实现，剩桌面/视频播放 |
| [lynx_native_modules_spec.md](./migration/lynx_native_modules_spec.md) | 自研原生模块接口草案 | Audio/Storage/Platform 已实现（A/I） |
| [lynx_migration_roadmap.md](./migration/lynx_migration_roadmap.md) | P0–P4 分阶段路线与风险登记 | P0✅ P1✅ P2✅ P3部分 P4未开始 |
| [plan.md](./migration/plan.md) | 原始迁移调研母本（4 篇子文档的母本） | 历史参考 |

## testing/ — 测试设计

| 文件 | 说明 |
|------|------|
| [behavior-testing-design.md](./testing/behavior-testing-design.md) | E2E 行为测试架构设计（Driver 接口、场景分类、TestBridge 协议） |

## tracking/ — 进度与缺陷跟踪

| 文件 | 说明 |
|------|------|
| [PROGRESS.md](./tracking/PROGRESS.md) | 分批开发进展记录（批1–40 + 批40 后修），每批交付内容与遗留事项 |
| [bug.md](./tracking/bug.md) | 手动测试与代码审计发现的 bug 跟踪清单 |

## 迁移路线完成度

```
P0 技术验证     ████████████████████ 100%  — 音频/路由/Query/UI 全部验证通过
P1 基础设施     ████████████████████ 100%  — 网络/鉴权/存储/i18n/主题/路由
P2 核心业务     ████████████████████ 100%  — auth/library/player/playlist/home/settings
P3 平台特性     ███████████░░░░░░░░░  55%  — 见下方分解
P4 双轨发布     ░░░░░░░░░░░░░░░░░░░░   0%  — 未开始
```

**P3 分解**（2026-08-14 审计订正——此前记为 60% 并把三项已「完成」的能力算了进去，实际它们从未跑通）：

| 能力 | 状态 |
|---|---|
| EQ（Android DSP + iOS DSP） | ✅ 已完成 |
| 数据导入导出 · 主题包 · 歌词编辑 · 服务端自升级 · 音量归一化 | ✅ 已完成 |
| 播放历史 | ⚠️ 页面能读能删，但客户端**从不上报播放**（`POST /songs/{id}/played` 未接），列表永远是空的 |
| DLNA 投屏 | ❌ 原生 SSDP/SOAP 已就绪，但 TS 侧调用约定错（把 callback 式模块当 Promise 用），**页面一进去就崩** |
| 悬浮歌词（Android） | ❌ 模块未注册 + 方法无 `@LynxMethod` + 清单缺权限/service，走 stub 静默失败 |
| Live Activity（iOS） | ❌ 不是 Lynx 模块（无 `@objc`/`methodLookup`，未进 `buildConfig()`），走 stub |
| Web 平台 | ⚠️ 见上方平台可用性表 |
| 视频播放（`is_video`） | ⛔ 未开始（剩余最大单块能力） |
| 桌面（Lynxtron） | ⛔ 未开始 |
