# 进展与交接（PROGRESS）

> **用途**：实时记录当前进展、每批交付与遗留/未完成事项，供随时工作交接。**每批验收后必须更新本文件**（见 `AGENTS.md` §4）。
> **最后更新**：2026-08-07 · 当前在做：批2 已完成，待启动批3。

## 总览

Flutter 版 → Lynx 客户端的整体重写，按 `plan.md` / `docs/lynx_migration_roadmap.md` **分批实现**，每批本机自动验收（`pnpm build` + `tsc --noEmit` + `vitest`）+（涉及 UI 时）真机扫码目测。技术栈见 `AGENTS.md`。

## 批次状态

| 批 | 内容 | 状态 | 自动验收 | 真机验收 |
|---|---|---|---|---|
| 1 | 脚手架 + 路由壳 + 主题地基 | ✅ 完成 | build/tsc/vitest 绿 | ✅ 已扫码通过 |
| 2 | 核心基础设施（models/网络/存储/Query/Zustand）| ✅ 完成 | build/tsc/vitest 绿（53 测试）| — 纯基建，无 UI，免 |
| 3 | auth feature（登录页 + 鉴权守卫 + token 持久化）| ⏳ 待启动 | — | — |
| 4 | library feature（列表 + 分页）| ⛔ 未开始 | | |
| 5 | player feature + TS mock 音频 | ⛔ 未开始 | | |
| 后续 | playlist/home/settings → 真原生模块 → Lynxtron 桌面 → jsplugin/webview → DLNA → i18n → CI | ⛔ 未开始（真机/桌面绑定，本机不能自动验收）| | |

## 已交付明细

### 批1 · 行走骨架
- Rspeedy + ReactLynx + TS 脚手架；TanStack Router（code-based + memory history）；LUNA tokens 主题 + `useBreakpoint`（四级断点）；lynx-ui Button（按组件包导入）。
- 路由：`/login`、`/player` 无壳；`/`、`/library`、`/settings` 挂自适应 `ShellLayout`。
- **关键修复**：真机 `self.__TSR_ROUTER__` 崩溃 → `pnpm patch @tanstack/router-core` 加 `typeof self` 守卫（`patches/` + `pnpm-workspace.yaml`）。

### 批2 · 核心基础设施（无 UI）
- **模型**（`src/models/`）：Song/Playlist/AuthTokens/TokenInfo/分页/ApiResponse，zod schema（snake_case↔camelCase transform）+ parse 封装。
- **网络**（`src/core/network/`）：transport-agnostic `HttpClient`（fetch 依赖注入）；`AuthInterceptor`——Bearer 注入、公开路径跳过、**401 单飞刷新**（并发共享一次 refresh、失败清 token→onTokenExpired）；`createPublicClient`；`TokenStore`（内存缓存 + secure 持久化）。
- **UrlHelper**（`src/core/network/url-helper.ts`）：资源/歌曲/封面/视频 URL + access_token + 转码参数。
- **存储**（`src/core/storage/`）：`SongloftStorage` facade（prefs/secure/paths），web（localStorage）/ memory（测试）/ native（stub 报错）三实现。
- **TanStack Query**（`src/lib/query/`）：`createQueryClient` + `configureQueryGlobals()`（no-op focus/online manager + **AbortController 存在性 polyfill**）。
- **Zustand**（`src/store/`）：`useAppSessionStore` 确立 create+selector 约定。

## 未完成 / 遗留事项（TODO & 风险）

- [ ] **Lynx `fetch` 实际绑定未接**：`HttpClient` 传输层现为注入式（默认 `globalThis.fetch`，缺失则抛错）。真机/桌面的实际 fetch 绑定待 P0/P1 接入并验证。
- [ ] **AbortController 真机核实**：批2 加了存在性守卫 polyfill（Lynx 引擎若无则用兜底）。需真机确认引擎到底有没有 `AbortController`，以及 polyfill 语义是否够用。
- [ ] **QueryClientProvider 尚未接入 bootstrap**：Query 真正入包发生在后续接 `useQuery` 的 feature 批（批2 仅验证无 DOM 可用性，未挂到 `src/index.tsx`）。
- [ ] **standalone/embedded 部署模式**：批3 登录页需保留 standalone 的 API 地址配置 + 不安全 TLS 开关分支（见 `AGENTS.md`）。
- [ ] **native 原生模块全部待做**：SongloftAudio（批5 先 TS mock）、SongloftStorage 原生形态、SongloftBackend、SongloftPlatform——真机/桌面批次。
- [ ] **i18n**：arb → i18next 转换脚本与接入未开始。
- [ ] **风险登记**（详见 roadmap）：R2 桌面 clay 元素实测、R11 Query 无 DOM（本机已验证，真机待确认）、R13 lynx-ui Web/Desktop 覆盖、R5 音频后台播放各端差异。

## 如何恢复工作 / 交接

```
pnpm install
pnpm run build          # 构建
pnpm exec tsc --noEmit  # 类型检查
pnpm test               # vitest（含无 DOM 与压缩产物回归测试）
pnpm run dev            # dev server + 二维码，LynxExplorer 扫码目测
```
- 协作规则、目录边界、无 DOM 铁律、提交约定：见根目录 `AGENTS.md`。
- 分批计划：`plan.md`；调研依据：`docs/` 四篇。
- 只读参考快照：`songloft-player/`（禁改）。
- Git：`origin` = `git@github.com:songloft-org/songloft-player-lynx.git`，分支 `main`，Conventional Commits，禁 `Co-Authored-By`。
