# 代码库审计看板

> **已归档（2026-09-15）**。本看板固定在 `main@982291d`（2026-08-31 基线 / 2026-09-01 运行）的任务状态，**不是现状**：9 条 finding 里 5 条此后已修，仍开放的 4 条（AUD-002/003/005/009）已迁出到 [`../../project/bugs.md`](../../project/bugs.md)。总览见 [Report.md](Report.md)，问题正文见 [Findings.md](Findings.md)。

> 本看板记录当前审计快照、任务状态和验证门禁。问题正文见 [Findings.md](Findings.md)，总览见 [Report.md](Report.md)。

## 审计快照

| 字段 | 值 |
|---|---|
| 运行 ID | `20260901-main-982291d` |
| 状态 | 已完成 |
| 基线 | `main` / `982291d54231a832de48ee0d50322fc7fed0ddf3` |
| 审计前工作区指纹 | `004428fc558e1e6b5927c1617585e434ea82663a82c68371efa5793eacfed59a` |
| Context 指纹 | `9cd06eb40f62b52227e50fee5776233520fbf8d72b11caaf7bbb73c304a37eae` |
| 输出 | `docs/audit/**` |
| 私有状态 | `.git/dev-harness/codebase-audit/20260901-main-982291d/` |

范围包括共享业务代码、Web 宿主、Android/iOS/HarmonyOS 原生契约、构建与验证链路。排除依赖与构建产物、IDE/生成资源、只读 Flutter 参考和外部后端实现。

## 输出与可发现性

| 字段 | 值 |
|---|---|
| 文档语言 | `zh-CN` |
| 文档中心 | `docs/README.md` |
| 固定入口 | `docs/audit/Report.md` |
| 状态 | 已链接（`linked`） |

## 任务状态

| 任务 | 行为域 | 状态 | 结果 |
|---|---|---|---|
| [A01](tasks/A01-startup-session-network.md) | 启动、会话、存储与网络鉴权 | 已完成 | [结果](results/A01-startup-session-network.md) |
| [A02](tasks/A02-player-native-lifecycle.md) | 播放器状态与原生音频生命周期 | 已完成 | [结果](results/A02-player-native-lifecycle.md) |
| [A03](tasks/A03-library-playlist-data.md) | 曲库、歌单与破坏性数据操作 | 已完成 | [结果](results/A03-library-playlist-data.md) |
| [A04](tasks/A04-navigation-overlay-web.md) | 路由、覆盖层、响应式与 Web realm | 已完成 | [结果](results/A04-navigation-overlay-web.md) |
| [A05](tasks/A05-platform-contracts.md) | 四端原生模块与宿主契约 | 已完成 | [结果](results/A05-platform-contracts.md) |
| [A06](tasks/A06-build-verification.md) | 构建、测试与交付可复现性 | 已完成 | [结果](results/A06-build-verification.md) |

## 问题计数

| P0 | P1 | P2 | P3 | 待验证 | 已排除 | 已失效 | 已解决 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 3 | 6 | 0 | 0 | 2 | 0 | 0 |

## 当前焦点

- 任务：A01–A06 均已完成。
- 优先修复：AUD-001、AUD-006、AUD-007。
- 跨模块复核：已完成，见 [Report](Report.md#跨模块复核)。

## 阻塞项

- iOS 与 HarmonyOS 完整构建、四端设备行为不在当前 Linux 环境直接可执行；静态契约与仓库已有测试仍在范围内。

## 证据

- Canonical Context：[README](../../../README.md)、[AGENTS](../../../AGENTS.md)、[ARCHITECTURE](../../../ARCHITECTURE.md)、[HARNESS](../../../HARNESS.md)
- 最近漂移校验：任务完成前复核有效；审计输出与业务工作区隔离。
