# 进展与交接（PROGRESS）

> **用途**：实时记录当前进展、每批交付与遗留/未完成事项，供随时工作交接。**每批验收后必须更新本文件**（见 `AGENTS.md` §4）。
> **最后更新**：2026-08-09 · 当前在做：批4（library：歌曲列表 + 分页）本机自动验收已全绿（clean build 压缩产物 + tsc + 99 vitest），首次把 `QueryClientProvider` 挂进 bootstrap、`useInfiniteQuery` 真正入包；下一步真机扫码验列表拉取，再进批5。

## 总览

Flutter 版 → Lynx 客户端的整体重写，按 `plan.md` / `docs/lynx_migration_roadmap.md` **分批实现**，每批本机自动验收（`pnpm build` + `tsc --noEmit` + `vitest`）+（涉及 UI 时）真机扫码目测。技术栈见 `AGENTS.md`。

## 批次状态

| 批 | 内容 | 状态 | 自动验收 | 真机验收 |
|---|---|---|---|---|
| 1 | 脚手架 + 路由壳 + 主题地基 | ✅ 完成 | build/tsc/vitest 绿 | ✅ 已扫码通过 |
| 2 | 核心基础设施（models/网络/存储/Query/Zustand）| ✅ 完成 | build/tsc/vitest 绿（53 测试）| — 纯基建，无 UI，免 |
| 3 | auth feature（登录页 + 鉴权守卫 + token 持久化）| ✅ 完成 | build/tsc/vitest 绿（70 测试）| ✅ 真机登录通（admin/admin + LAN IP → 跳主界面）|
| 4 | library feature（列表 + 分页）| ✅ 完成 | clean build/tsc/vitest 绿（99 测试）| ✅ 真机拉列表通（真实后端歌曲+封面+分页）；顶部安全区已修，待复扫 |
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

### 批3 · auth feature（登录页 + 鉴权守卫 + token 持久化）
- **登录页**（`src/features/auth/pages/LoginPage.tsx`）：标题/副标题 + Username/Password（lynx-ui `Input`）+ lynx-ui `Button`（render-prop）；**standalone** 追加 API 地址字段 + 不安全 TLS 开关（lynx-ui `Switch`），`appConfig.isEmbedded` 时隐藏；全部走 LUNA tokens。
- **鉴权守卫**：`evaluateAuthGuard` 纯函数（`unknown` 不重定向、`unauthenticated`→`/login`、`authenticated`@`/login`→`/`），在 rootRoute `beforeLoad` 读 vanilla `useAuthStore.getState()`。
- **store**：zustand `useAuthStore`（status/isLoading/error + hydrate/checkAuth/login/logout/reset），登录走 `createPublicClient` + `TokenStore` secure 持久化。

#### ⚠️ 测试约定：lynx-ui 组件 + zustand 订阅在 Vitest 需 mock（原生运行时不可用，真机正常）
渲染测试（`smoke.test.tsx`、`login-page.test.tsx`）在 ReactLynx testing-library 环境下有**两类**运行期设施不可用，均需 mock 成纯 `<view>/<text>` / 静态桩，否则会崩 `Cannot read properties of undefined (reading 'isListHolder' / 'parentNode')` 并**污染共享 elementTree** 连累后续用例：
1. **lynx-ui 原生叶子**：`Input`（mount effect 调 native `NodesRef.invoke`→`not implemented`）、`Switch`（native gesture 运行时）。
2. **zustand `useAuthStore` 订阅**：经 `useSyncExternalStore`，其挂载后一致性检查会在初始双线程 lifecycle flush 未完成时**强制第二次 commit**，该 patch 读到 `__snapshot_def` 尚未定型的快照 → `isListHolder` 崩溃。仅 `LoginPage` 用订阅式 store，故只有它崩（list/player 页只用 Button，安全）。
- 修复：共享桩工厂 `src/__tests__/_render-mocks.tsx`（`mockLynxUiInput` / `mockLynxUiSwitch` / `makeAuthStoreMock`——后者仅覆盖 `useAuthStore` 为静态 `status:'unknown'` 非订阅读取器，其余 store 导出经 `vi.importActual` 保留，守卫仍真实）。**真实组件与真实 store 用于 build/dev/device**（真机批1 已证 lynx-ui 可渲染）。断言仍实质校验页面结构（Songloft / Sign in to continue / Username / Password / Log in；standalone 下 API base URL + Allow insecure TLS）。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（产物压缩，最长行 172415；`__TSR_ROUTER__` 写入仍被 `void 0!==S&&(...)` 守卫）、`tsc --noEmit` 绿、`pnpm test` 69/69 绿。

### 批4 · library feature（歌曲列表 + 分页）
- **songs API**（`src/features/library/api/songs-api.ts`）：包 batch-2 `HttpClient`，`getSongs`/`getFacets`/`getSongIds`/`getSong`（前缀 `/api/v1`），经 batch-2 zod（`parseSongListResponse`/`parseSongFacetResponse`/`parseSong`）解析。query 拼接抽成纯函数 `buildSongsQuery`/`buildSongIdsQuery`/`buildFacetsQuery`（默认 `limit=defaultPageSize=20`/`offset=0`，空串与 `year/decade<=0` 剪除，mirror Flutter `SongsApi._applyTagFilters`）单独单测。`api/index.ts` 懒建**认证客户端单例**（batch-2 `createApiClient`：Bearer + 单飞 401 refresh），`onTokenExpired → useAuthStore.logout()`。
- **取数与分页**（`src/features/library/data/`）：`useInfiniteQuery`（`@tanstack/react-query`）——`useSongsInfiniteQuery`/`useFacetsInfiniteQuery`，`queryKey` 含过滤条件/字段，`queryFn` 按 `offset/limit` 取页；`getNextPageParam`（纯函数 `songsNextPageParam`/`facetsNextPageParam`）依「累计 < total」推进 offset、到底返 `undefined`（`hasNextPage→false`）；`flattenSongs`/`flattenFacets` 扁平化 pages。全部纯函数单独单测（累计推进 / 到底停 / 空页）。`formatDuration`（mm:ss / hh:mm:ss）ported。
- **QueryClientProvider 首次挂进 bootstrap**（`src/App.tsx`）：`configureQueryGlobals()`（batch-2）→ `getQueryClient()` → `<QueryClientProvider>` 包住 `<RouterProvider>`。这是 roadmap R11 的 Query 集成在渲染树的落地；**Query 真入包**（产物含 `QueryClient`/`fetchNextPage`/`getNextPageParam`）。
- **LibraryPage**（`src/features/library/pages/LibraryPage.tsx`，替换 `/library` 占位）：视图切换器 songs / **Categories(facets)** / **Playlists(占位)**（本地 `useState` 驱动）。songs 用原生 Lynx `<list>` + `bindscrolltolower`（经 `VirtualList` 封装）触底 `fetchNextPage()`；facet 用 `<scroll-view>` 网格。歌曲行 `SongRow`（`buildCoverUrl` 封面 + 标题 + `artist · album` + `mm:ss`）、`FacetCard`（封面 + 值 + 计数）。加载/空/错误态齐备；全走 LUNA tokens（无硬编码色；移除 Lynx 不支持的 `text-transform`）。
- **测试约定（沿用批3 `_render-mocks` 模式）**：`useInfiniteQuery` hooks 经 `useSyncExternalStore`（同批3 崩 `isListHolder` 类）→ 渲染冒烟里 `vi.fn()` 桩返静态 infinite-query 形；且 `<list>/<list-item>` 在 ReactLynx Vitest env **虚拟化不挂子节点**（`<scroll-view>` 子节点可查），故把 `<list>` 封装成 `VirtualList` 并在测试 mock 成 plain `<view>`（`_render-mocks.mockVirtualList`）。真实 `<list>` + 真 hooks 用于 build/dev/device。断言实质结构：songs 行（标题/副标题/`05:27`/`09:05` 时长）、空态「No songs yet」、加载态、facets 网格（`Artist` chip + `Miles Davis` + `12 songs`）、playlists 占位。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（压缩，最长行 66408；产物含 `QueryClient`/`fetchNextPage`/`getNextPageParam`/`scrolltolower`，AbortController polyfill offset 18137 早于首个 `new AbortController` offset 110209，`__TSR_ROUTER__` 守卫仍在——`background-bundle-self`/`query-no-dom`/`router-no-dom` 全绿）、`tsc --noEmit` 绿、`pnpm test` 99/99 绿。**真机验证**：登录后进 Library 真实拉到后端歌曲（封面/标题/artist·album/时长）+ 触底分页——R11（Query 无 DOM 集成）真机确认可用。
- **安全区修复**（真机暴露）：narrow 下页面顶到状态栏/刘海、底栏顶 home indicator。在 `ShellLayout.css` 全局加 `.shell__body { padding-top: env(safe-area-inset-top) }`（wide 置 0，rail 顶部含 inset）与 `.shell__bottombar { padding-bottom: env(safe-area-inset-bottom) }`（Lynx 支持 `env(safe-area-inset-*)`）。影响 Home/Library/Settings 全部 shell 页。

## 未完成 / 遗留事项（TODO & 风险）

- [x] **Lynx `fetch` 是裸全局**（批3 真机修复）：Lynx 的 `fetch` 是宿主提供的 HTTP service（Android/iOS 2.18+），以**裸全局**暴露而非 `globalThis.fetch`（与 `self` 同）。`createFetchTransport` 已改为先取裸 `fetch`（`typeof fetch !== 'undefined'`）再回落 `globalThis.fetch`/注入。⚠️ 但**真机整登录 E2E 仍需后端可达**：手机上 `http://localhost:58091` 指向手机自身，须填开发机 LAN IP 且后端在跑；Lynx fetch 不支持 CORS/redirect/keepalive/FormData/Blob。
- [x] **AbortController 真机缺失**（批3 真机修复）：Lynx 引擎**无** `AbortController`（`ReferenceError`），而 **TanStack Router `loadClientRoute` 与 Query 都无条件 `new AbortController()`**。已在 `lynx.config` banner 注入存在性守卫的全局 polyfill（覆盖 main-thread + background 两个 bundle、最先执行）；`AbortController` 是未声明标识符，故 `globalThis.AbortController=` 能让裸读解析（不同于 `self`）。回归测试断言产物里 polyfill 定义早于任何 `new AbortController`。批2 `configureQueryGlobals` 里的同类 polyfill 保留但非主修复。
- [x] **Lynx `clearTimeout` 严格要 Number**（批3 真机修复）：`clearTimeout(undefined)` 在浏览器/node 是 no-op，Lynx 却抛 `param 0 should be Number`；TanStack Router `load-client.js` 的 `offerPending` 有 6 处 `clearTimeout(session?.[3])`（可为 undefined）。已扩展 `patches/@tanstack__router-core@*.patch`：模块顶层捕获真实 `clearTimeout`（typeof 守卫）并包一层「仅 Number 才调」的 `__safeClearTimeout`，替换 6 个调用点。
- [x] **SongloftStorage 在 Lynx 降级为内存**（批3 真机修复）：设备无 `localStorage`，原选择落到**抛错的 native stub**（阻断登录）。改为降级到 `createMemoryStorage`（**in-session、非持久，重启丢 token**）并 `console.warn`；`createNativeStorage` 保留待原生 JSB 模块（后续批）接入时在 `createSongloftStorage` 里改回。⚠️ 当前登录仅会话内有效。
- [x] **QueryClientProvider 已接入 bootstrap**（批4）：`src/App.tsx` 用 `<QueryClientProvider>`（`@tanstack/react-query`）包住 `<RouterProvider>`，`configureQueryGlobals()` 先于 `getQueryClient()`。Query 真正入包（`useInfiniteQuery`）；产物守卫（AbortController polyfill / `__TSR_ROUTER__`）经 `background-bundle-self` 回归测试确认仍在，无新增未守卫全局。⚠️ 真机整链路（列表拉取）待扫码验证（需后端可达 + LAN IP）。
- [ ] **批4 遗留（library）**：
  - **playlists 视图**仅占位（「Playlists coming soon」），歌单是后续批。
  - **收藏 / 多选 / 搜索 / 排序菜单 / 自定义视图编辑器 / 单曲点击进播放器**未做（Flutter `LibraryPage` 有，本批裁掉）——`SongRow.onTap` 已留钩子，接播放器批时接上。
  - **facet 卡片点击**未跳到「该分类下歌曲列表」（Flutter `CategorySongsPage`），本批仅展示网格。
  - **真机待扫码验列表拉取**：登录后进 `/library`，songs 视图应见分页歌曲行，触底加载下一页；facets 视图切 Artist/Album/Genre 见网格。
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
