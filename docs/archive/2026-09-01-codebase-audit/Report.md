# 代码库审计报告

> **已归档（2026-09-15）**。这份快照固定在 `main@982291d`（2026-08-31 基线 / 2026-09-01 运行），**不是现状**：9 条 finding 中 5 条此后已修（AUD-001 `b08ae1a`、AUD-004 `6c8c46b`、AUD-006 `54233ac`、AUD-007 / AUD-008 `40e7cf9`），报告里的验数（18 failing / 185 契约 / bundle 大小）也已全面过期。
>
> **仍开放的 4 条已迁出**到 [`../../project/bugs.md`](../../project/bugs.md) 的「代码审计发现（2026-09-01）」一节：AUD-002、AUD-003、AUD-005、AUD-009（部分修复）。**要查还有什么没修，读 bugs.md，不要读本目录。**
>
> 问题正文见 [Findings.md](Findings.md)，任务状态见 [Dashboard.md](Dashboard.md)。

## 导航

- [审计看板](Dashboard.md)
- [问题登记表](Findings.md)
- [审计任务](tasks/)
- [任务结果](results/)

## 文档可发现性

`docs/README.md` 已链接固定入口 `docs/audit/Report.md`，状态为已链接（`linked`）。

## 审计快照

- 运行 ID：`20260901-main-982291d`
- 基线：`main@982291d54231a832de48ee0d50322fc7fed0ddf3`
- Context：`9cd06eb40f62b52227e50fee5776233520fbf8d72b11caaf7bbb73c304a37eae`
- AuditSnapshot：`004428fc558e1e6b5927c1617585e434ea82663a82c68371efa5793eacfed59a`
- 跨模块复核：已完成

## 结论

确认 9 个遗留问题：P1 3 个、P2 6 个。最优先的是 Harmony 音量被缩小 100 倍、Harmony 视频能力恒失败、Harmony DLNA 扫描结果恒丢失。另有一项全局歌曲删除缓存失效错误，以及一项稳定导致全量测试红灯的响应式测试门禁缺陷。

## 优先级摘要

| ID | 严重度 | 摘要 | 修复边界 |
|---|---|---|---|
| [AUD-001](Findings.md#aud-001-p1-harmonyos-音量被重复除以-100) | P1 | Harmony 音量重复换算 | Harmony audio module |
| [AUD-006](Findings.md#aud-006-p1-harmonyos-视频能力被错误暴露) | P1 | 视频模块注册但恒拒绝打开 | Harmony video / capability |
| [AUD-007](Findings.md#aud-007-p1-harmonyos-dlna-发现结果不会进入设备列表) | P1 | DLNA 发现结果未持久化 | Harmony DLNA state contract |
| AUD-002/003/004/005/008/009 | P2 | 歌词方法、缓存失效、测试门禁、剪贴板、DLNA endpoint、契约覆盖 | 见问题登记表 |

## 跨模块复核

### 边界覆盖台账

| 边界 | 生产/调用侧 | 消费/实现侧 | 任务 | 状态 |
|---|---|---|---|---|
| startup/session | index、auth、TokenStore | router、API interceptor | A01/A04 | 已覆盖，无确认问题 |
| data/cache | song/playlist mutation | API、QueryClient | A03/A01 | 已覆盖，AUD-003 |
| player/native | player/lyric store、facade | Android/iOS/Harmony engines | A02/A05 | 已覆盖，AUD-001/002 |
| platform capability | UI、capability table | registered native modules | A04/A05 | 已覆盖，AUD-005/006/007/008 |
| Web realm/overlay | ReactLynx UI | web host/main thread | A04/A05 | 静态覆盖，无新增确认问题 |
| build/test | scripts、Rspeedy、Vitest | CI 与平台工程 | A06/A05 | 部分覆盖，AUD-004/009 |

### 问题同一性

- AUD-001 与 AUD-002 都在 Harmony audio module，但根因分别是单位转换和方法面缺失，单个修复不能同时闭合，保持独立。
- AUD-007 与 AUD-008 都影响 Harmony DLNA，但前者是 discovery state 丢失，后者是 id→control URL 映射错误；只持久化数组不能修好 SOAP endpoint，保持独立。
- AUD-009 是验证 owner 的门禁缺口，不与它漏掉的六个生产问题合并。
- responsive 文件的 14 项失败归并为 AUD-004：首个 `NodesRef.invoke` 失败污染同一 element tree，根因、owner 和修复边界一致。

### 矛盾与决议

| 主张 | 支持证据 | 反驳证据 | 决议 |
|---|---|---|---|
| Harmony video/DLNA/clipboard 受支持 | capability 与 canonical 平台文档 | Harmony 实现是恒失败、空值或空方法 | 以可达实现为准，确认问题；文档构成反向证据而非降级说明 |
| 14 个 responsive 失败代表生产布局回归 | 全量和隔离测试稳定失败 | 首错是测试库未实现 invoke，build/layout 单测通过 | 只确认测试门禁失效，不确认生产布局错误 |
| 缺 `packageManager` 导致构建不可复现 | 本机 Corepack/pnpm 11 失败 | 三条 CI 都显式固定 pnpm 10，直接 CLI 构建通过 | 归为本机环境，不登记 |
| input CSS 测试有稳定缺陷 | 全量运行四项 timeout | 隔离运行 5/5 通过 | 归为资源竞争噪声，不登记 |

### 未覆盖边界

- 未运行 Harmony hvigor 构建与真机行为；未运行 Android Gradle、iOS Xcode 工程解析和三端 E2E。
- 未连接真实后端验证鉴权、删除和媒体 URL 行为。
- 审计没有修改业务代码；修复后应由相应宿主构建和设备验证闭环。

## 验证摘要

- TypeScript：通过。
- Rspeedy：通过，Lynx/Web 两个产物均生成。
- Vitest 全量：18 失败、2015 通过；稳定根因见 AUD-004，四个 input timeout 隔离不复现。
- native contract：185/185 通过，但存在 AUD-009 的 Harmony 覆盖缺口。
