# 进展与交接（PROGRESS）

> **用途**：实时记录当前进展、每批交付与遗留/未完成事项，供随时工作交接。**每批验收后必须更新本文件**（见 `AGENTS.md` §4）。
> **最后更新**：2026-08-10 · 最近完成（**批7 home feature**）：`/` 占位换成真实首页 `src/features/home/`（镜像 data/domain/presentation）——**时段问候**（`greetingForHour` 纯函数）+ **「我的歌单」/「我的电台」两区块**（`useHomePlaylists(type)` **复用批6 `usePlaylistsInfiniteQuery({type})`** + 认证客户端单例 + 批2 zod，真实端点 `GET /playlists?type=normal|radio`；`HomeSection` **复用 `PlaylistCard`** 截断三列网格 + 区块内联错误 + 「View all」→ `/library?view=playlists`）+ **底部统计条**（`StatsStrip`，后端 `total`）+ **Log out**（`useAuthStore.getState().logout()`）；点歌单卡片 → `/playlists/$id`。首屏加载 / 整页错误 / 空态 / 单区块降级内联错误齐备；纯选择器 `homeSectionItems`/`homeSectionTotal`/`homeStats` 单测。**插件 Tab/WebView 全裁留 jsplugin 阶段**。clean build（946.4 kB，最长行 97636）+ tsc + **211 vitest 全绿**（新增 20：greeting 5 / home-select 8 / home-data 2 / home-page 5；`smoke.test` 的 `/` 用例改写为 HomePage）。此前（批6 UI 收尾修复）：**① 歌单详情返回回到 Playlists 视图**（Library 视图改 `?view=` URL 驱动：`libraryRoute` 加 `validateSearch`（view 可选，默认 songs）、`LibraryPage` 从 `useSearch` 读、切 tab `navigate` 写、详情返回带 `view:'playlists'`）；**② Categories 分类卡片可钻取**（新 `CategorySongsPage` + 路由 `/library/category/$field?value=&cover=`，`FacetsView` 给 `FacetCard` 接 `onTap`→navigate；按 `{[field]:value}` 过滤 `useSongsInfiniteQuery`，复用 `SongRow`/`VirtualList`+点歌 `playPlaylist`，返回回 `?view=facets&field=<来时字段>`——**facet field（Artist/Album/Genre）也改 URL 驱动**（`libraryRoute.validateSearch` 加可选 `field`，`FacetsView` 从 `useSearch` 读、chip tap 与详情返回都带 `field`），修复「从 Album 分类返回却回到 Artist」）；**③ 歌单加载报错修复**（后端发 `labels:null`/`song_count:null`，zod `.default()` 不兜 null → 改 `.catch()`+`z.coerce.number()`，见 AGENTS §2）。clean build + tsc + **190 vitest 全绿**（+category-songs 4 / playlist null 容错 1 等）。此前：**批6 playlist feature（歌单列表 + 详情 + Library「Playlists」视图）**——`src/features/playlist/`（api/data/widgets/pages 镜像 Flutter data/domain/presentation）：`PlaylistApi`（真实端点 `GET /playlists`、`GET /playlists/{id}`、`GET /playlists/{id}/songs`，query 拼接抽纯函数）+ 认证客户端单例（同批4 recipe）；`useInfiniteQuery`/`useQuery` 取数（歌单列表分页 + 详情 + 歌单内歌曲分页，getNextPageParam 纯函数）；Library「Playlists」占位换成 `PlaylistsView`（歌单网格→点卡片导航 `/playlists/$id`）；歌单详情页 `PlaylistDetailPage`（`/playlists/$id`，头部封面/名称/描述/歌数 + `SongRow`+`VirtualList` 触底分页 + 点歌 `playPlaylist`）。clean build（binary 容器，最长行 92259，`strings` 证 `/playlists`×23、`No playlists yet`/`No songs in this playlist`/`exclude_labels` 均入包）+ tsc + **183 vitest 全绿**（+24：playlist-api 9 / pagination 8 / playlists-view 4 / playlist-detail 3；`background-bundle-self`/`query-no-dom`/`router-no-dom` 对新鲜 dist 复跑绿）。下一步真机扫码验：登录→Library→Playlists 见歌单网格→点歌单→详情页头部 + 歌曲行→点歌 mini-player 出现。此前：**UI 修整——emoji 图标 → Lynx `<svg>` 矢量 Icon 组件**（`src/shared/ui/Icon.tsx` + `icons.ts`，16 图标集，颜色注入 markup；见「已交付明细 · UI 修整」）；进度条/音量条「双线」修复（`SliderIndicator` 加 `position:absolute`）；批5（player feature + TS mock 音频）本机自动验收全绿。

## 总览

Flutter 版 → Lynx 客户端的整体重写，按 `plan.md` / `docs/lynx_migration_roadmap.md` **分批实现**，每批本机自动验收（`pnpm build` + `tsc --noEmit` + `vitest`）+（涉及 UI 时）真机扫码目测。技术栈见 `AGENTS.md`。

## 批次状态

| 批 | 内容 | 状态 | 自动验收 | 真机验收 |
|---|---|---|---|---|
| 1 | 脚手架 + 路由壳 + 主题地基 | ✅ 完成 | build/tsc/vitest 绿 | ✅ 已扫码通过 |
| 2 | 核心基础设施（models/网络/存储/Query/Zustand）| ✅ 完成 | build/tsc/vitest 绿（53 测试）| — 纯基建，无 UI，免 |
| 3 | auth feature（登录页 + 鉴权守卫 + token 持久化）| ✅ 完成 | build/tsc/vitest 绿（70 测试）| ✅ 真机登录通（admin/admin + LAN IP → 跳主界面）|
| 4 | library feature（列表 + 分页）| ✅ 完成 | clean build/tsc/vitest 绿（99 测试）| ✅ 真机拉列表通（真实后端歌曲+封面+分页）；顶部安全区已修，待复扫 |
| 5 | player feature + TS mock 音频 | ✅ 完成 | clean build/tsc/vitest 绿（159 测试）| ⏳ 待扫码（点歌→mini→全屏，mock 进度自动前进）|
| 6 | playlist feature（歌单列表 + 详情 + Library Playlists 视图）| ✅ 完成 | clean build/tsc/vitest 绿（183 测试）| ⏳ 待扫码（Library→Playlists→点歌单→详情→点歌播放）|
| 7 | home feature（首页内容：问候 + 我的歌单/电台区块 + 统计条）| ✅ 完成 | clean build/tsc/vitest 绿（211 测试）| ⏳ 待扫码（登录→首页见问候+两区块+统计，点歌单进详情，"View all"进 Library）|
| 后续 | settings → 真原生模块（含真机音频）→ Lynxtron 桌面 → jsplugin/webview（含首页插件 Tab）→ DLNA → i18n → CI | ⛔ 未开始（真机/桌面绑定，本机不能自动验收）| | |

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

### 批5 · player feature + TS mock 音频
- **SongloftAudio TS mock**（`src/native/`）：`audio-types.ts`（facade 接口 + `AudioEvent` 事件契约，mirror `docs/lynx_native_modules_spec.md#1`）、`mock-audio.ts`（`MockSongloftAudio`：`play` 后每 250ms 递增 position 并 emit `progress`，到 duration emit `completed`；`load/play/pause/stop/seek/setVolume/setSpeed/setQueue/next/previous/setRepeatMode/setShuffle` + EQ 占位；`on/off` 订阅）、`audio-facade.ts`（`getAudio()` 单例返 mock；`createNativeAudio()` 抛错 stub，真机批接 `NativeModules.SongloftAudio`）。**定时器严格性**：`safe-timers.ts` 的 `safeClearInterval/safeClearTimeout` 只在 `id != null` 时调宿主 clear——比 `typeof===number` 更正确（Lynx 句柄是 Number、node 句柄是对象，都放行；只挡 `undefined/null` 这个真正会让 Lynx 抛 `param 0 should be Number` 的情形），并有单测模拟「Lynx 严格 clear 抛错」证明不崩、以及「completed 后 interval 真停」。
- **playerState store**（`src/features/player/store/player-store.ts`，zustand，对应 `playerStateProvider`+`PlayerNotifier`）：状态 mirror `player_state.dart`（ms 计时、volume 0-100），桥接 mock 音频事件（`progress`→currentTime/duration + 驱动歌词定位；`stateChanged`→isPlaying/isBuffering；`completed`→按 playMode 路由）。控制面 `playSong(song,queue?)`/`playPlaylist`/`togglePlay`/`playNext`/`playPrev`/`seek`/`seekBy`/`setVolume`/`toggleMute`/`setPlayMode`/`cyclePlayMode`/`addToPlaylist`/`removeFromPlaylist`/`reorderPlaylist`/`clearPlaylist`/`toggleFullPlayer`/`closeFullPlayer`/`togglePlaylistDrawer`/`closePlaylistDrawer`/`clearError`/`setSleepTimer*`/`cancelSleepTimer`。**状态机抽纯函数**（`domain/`）：`play-mode.ts`（`resolveNext/resolvePrev` order 到底/loop 环绕/single 停留/random 边界；`hasNext/hasPrev`；`cyclePlayMode`）、`sleep-timer.ts`（`tickSleepTimer`/`sleepTimerOnSongCompleted` 纯 reducer，store 管 1s interval）、`queue.ts`（`removeAt`/`moveItem`/`reorder` 保持当前曲锁定）、`derive.ts`（`hasSong/hasNext/hasPrev/progressOf/isMuted/nextSongOf` 派生选择器）。全部单独单测。
- **歌词**（`src/features/player/`）：`domain/lyric-parser.ts` port（`parseLrc`/`parsePlain`/`findCurrentLine` 纯函数，ms 计时）；`store/lyric-store.ts`（`lyrics/currentIndex/isLoading/synced` + `loadForSong(song, fetcher?)` + `syncPosition(ms)`）。歌词来源 `data/lyric-source.ts` 复用 library 的**认证客户端**（新增 `SongsApi.getLyric(lyricUrl)`）——best-effort，无 lyricUrl 直接空态、失败不崩。逐字/翻译/罗马音解析本批未 port。
- **UI**（`src/features/player/{pages,widgets}`）：全屏播放页 `FullPlayerPage`（`/player`，chrome-less，CSS transform slide-in）——封面 + 标题/艺人 + **lynx-ui `Slider` 进度条**（拖动 `onValueCommit`→seek）+ 时间 + 播放控制（上一首/播放暂停/下一首 + 播放模式切换）+ **`Slider` 音量** + 静音 + 打开抽屉 + 歌词视图（当前行高亮）；窄屏封面/歌词用 **lynx-ui `Swiper`** 两页横滑，宽屏并排。`MiniPlayer`（纯 `<view>`，无手势叶子）挂进 `ShellLayout`（narrow 底栏之上、wide 内容列底部，含安全区），仅 `hasSong` 显示，点开 `/player`。播放列表抽屉 `PlaylistDrawer`（**lynx-ui `Sheet`**，ref 命令式 open/close 跟随 `showPlaylistDrawer`，点选切歌/移除）。**接线**：Library `SongRow` 点击→`playPlaylist(当前列表, index)`→mini-player 出现；`/player` 空态（无歌）有占位 + 去 library。全走 LUNA tokens。
- **新增 lynx-ui 组件包**：`@lynx-js/lynx-ui-slider`/`-sheet`/`-swiper`（按组件包导入，非桶入口）。
- **测试约定（沿用 `_render-mocks` 模式）**：新增桩工厂 `mockLynxUiSlider/Sheet/Swiper`（原生手势叶子）+ `makePlayerStoreMock/makeLyricStoreMock`（`useSyncExternalStore` 订阅→静态非订阅读取器）。渲染冒烟 `full-player.test.tsx`（断言「Now Playing」/标题/艺人/▶/播放模式/`00:30`·`03:20` 时长）、`mini-player.test.tsx`（标题/副标题/播放键）。**router 现会 eager import `/player`→FullPlayerPage→lynx-ui 手势叶子**（import 期即污染 reconciler），故凡经 router 渲染的既有测试（`smoke.test`、`login-page.test`）也补上 slider/sheet/swiper 桩。真组件/真 store 用于 build/dev/device。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（压缩，最长行 85540，产物含 `Now Playing`/`Up next`/`setInterval` 计时；`background-bundle-self`/`query-no-dom`/`router-no-dom` 对新鲜 dist 复跑绿）、`tsc --noEmit` 绿、`pnpm test` 159/159 绿。

### UI 修整 · emoji 图标 → Lynx `<svg>` 矢量 Icon 组件
- **动机**：原 UI 用 emoji 当图标（`⌂♪⚙ ⏮⏭⏸▶ 🔀🔁🔂➡ 🔊🔇 ☰⌄`），跨端字体渲染不一致、无法主题着色、观感差。改为统一走原生 `<svg>` 矢量图标。
- **Icon 组件**（`src/shared/ui/`）：`icons.ts` = 图标 registry（24×24 viewBox，Feather/Lucide 风格自绘 path，未抄版权资源；线性图标 `stroke`+`fill=none`+`stroke-width=2`+round cap/join，实心 transport 用 `fill`）+ `buildSvg(name,color)` 生成完整内联 SVG 串；`Icon.tsx` = `<Icon name size=24 color />` → `<svg content={buildSvg(...)} style={{width,height}} data-icon data-testid=icon-<name> />`（用 `content` 传内联串、给已解析 px 尺寸，符合 svg.md 契约）。**图标集（16 个）**：`home`/`library`/`music`/`settings`/`play`/`pause`/`skip-prev`/`skip-next`/`shuffle`/`repeat`/`repeat-one`/`order`/`volume`/`volume-mute`/`chevron-down`/`menu`。
- **着色方案结论**：**采用「颜色注入 markup」**——`Icon` 接 `color` prop，`buildSvg` 把该颜色直接写进每个元素的 `fill`/`stroke`。原因：`<svg content>` 由原生渲染、**不经 CSS 级联**，故 CSS `var(--…)` / `currentColor` **对 markup 内的 `fill/stroke` 不生效**。`@lynx-js/types` 的 `SVGProps` 确有文档化 `current-color` 属性（iOS/Android/Harmony，用于解析 markup 里字面量 `currentColor`，且不覆盖显式 `fill/stroke`），但**未在本次真机验证**，且不覆盖桌面/clay——故选注入这条可移植、可测的路径。图标色常量 `ICON_COLORS`（`Icon.tsx` 导出，取 `tokens.css` 的 hex：primary `#7c5cff`/primaryContent `#ffffff`/content `#f5f5f7`/content2 `#c7c7d1`/contentMuted `#8b8b98`/danger `#ff6b6b`），需与 `tokens.css` 手动保持同步。
- **替换的使用点**：`shared/nav/destinations.ts`（`icon` 字段类型 `string`→`IconName`，值 `home`/`library`/`settings`）；`shared/layouts/ShellLayout.tsx`（nav 图标：激活 `ICON_COLORS.primary`、非激活 `contentMuted`）；`features/player/widgets/PlayControls.tsx`（模式 order/loop/single/random → `order`/`repeat`/`repeat-one`/`shuffle`；上一首/下一首；play/pause 按 `isPlaying` 切换，buffering 仍显 `…` 文本）；`VolumeControl.tsx`（`volume`/`volume-mute`）；`pages/FullPlayerPage.tsx`（collapse→`chevron-down`、菜单→`menu`、空封面占位→`music` note）；`widgets/MiniPlayer.tsx`（play/pause）；`widgets/LyricsView.tsx`（空歌词行 `♪` 占位→`music` Icon）。相关 CSS 里旧的 `*-glyph`/`*__icon` 文本样式改为 flex 居中容器；已删净空的死规则（`full-player__icon`/`__cover-glyph`/`mini-player__play-glyph`）。文本标签（nav「Home/Library/Settings」、模式「Shuffle」等）**保留**，只换图标 glyph。
- **测试改写（可测标识，不注水）**：`<svg>` 在 ReactLynx Vitest env 作普通原生节点渲染（不像 Input 走 native invoke，无需 mock）；已验 `queryByTestId('icon-<name>')` 命中。`mini-player.test.tsx` 由断言 `queryByText('▶')` 改为 `queryByTestId('icon-play')` 存在 **且** `icon-pause` 不存在（证明按 `isPlaying=false` 渲染 play 而非 pause）。`full-player.test.tsx` 由 `queryByText('▶')` 改为断言 `icon-play` 存在+`icon-pause` 不存在、`icon-skip-prev`/`icon-skip-next`/`icon-order`（order 模式）、topbar `icon-chevron-down`/`icon-menu` 均存在——覆盖切换态与各控件，仍是实质断言。
- **验收**：`rm -rf dist .rspeedy && pnpm run build` 绿（`main.lynx.bundle` 898.3 kB，含 `viewBox="0 0 24 24"` + 图标 path，确认矢量图标已入包）、`tsc --noEmit` 绿、`pnpm test` 159/159 绿。**已确认目标 emoji 图标字符（`⏮⏭⏸▶🔀🔁🔂➡🔊🔇☰⌄♪⚙⌂` 等）在源码与产物 bundle 中均为 0 命中**（散文注释里的 `→`/`⚠️`/`─` 非图标，保留）。
- **遗留/注意**：① `<svg>` 官方仅列原生 Android/iOS/Harmony（+ `SVGProps` 标 web/PC，但 svg.md 未把桌面/clay 列为已证实）——本次目标移动端，**桌面 clay 的 `<svg>` 渲染未验**（记入既有风险 R2）。② 真机图标目测待扫码（本机 vitest 只证节点存在，不证像素）。③ `PlaylistDrawer` 的移除按钮 `✕`（U+2715，非本次 emoji 图标清单/验收范围）暂保留为文本，后续如需可一并接 Icon。④ `ICON_COLORS` 与 `tokens.css` 是手动同步，改主题色需两处一起改。

### 批6 · playlist feature（歌单列表 + 详情 + Library Playlists 视图）
- **playlist API**（`src/features/playlist/api/playlist-api.ts`）：包 batch-2 `HttpClient`，port Flutter `PlaylistApi` 的**读端点**（前缀 `/api/v1`，batch-2 zod 解析）——`getPlaylists`（`GET /playlists`，query `limit/offset` + 可选 `type`/`exclude_labels`/`keyword`，`parsePlaylistListResponse`）、`getPlaylist(id)`（`GET /playlists/{id}`，`parsePlaylist`）、`getPlaylistSongs(id)`（`GET /playlists/{id}/songs`，query `limit/offset` + 可选 `sort`/`order`/`keyword`，复用 `parseSongListResponse`）。query 拼接抽纯函数 `buildPlaylistsQuery`/`buildPlaylistSongsQuery`（默认 `limit=defaultPageSize=20`/`offset=0`，空串剪除，mirror Flutter `PlaylistApi`）单独单测。`api/index.ts` 懒建**认证客户端单例**（同批4 recipe：batch-2 `createApiClient`，Bearer + 单飞 401 refresh，`onTokenExpired → useAuthStore.logout()`）——与 library bundle 是同款 peer（共享同一 `TokenStore`，401 恢复跨 feature 一致）。
- **取数与分页**（`src/features/playlist/data/`）：`usePlaylistsInfiniteQuery`（歌单列表分页，`getNextPageParam=playlistsNextPageParam` 纯函数）、`usePlaylistQuery(id)`（`useQuery` 详情，`enabled: id>0`）、`usePlaylistSongsInfiniteQuery(id)`（歌单内歌曲分页，**复用 library `songsNextPageParam`/`flattenSongs`**——歌单内歌曲即 `SongListResponse`）。新增纯函数 `playlistsLoadedCount`/`playlistsNextPageParam`/`flattenPlaylists`（复用 library `nextOffset`）单独单测（累计推进 / 到底停 / 空页 / flatten）。
- **Library「Playlists」视图落地**（`src/features/playlist/widgets/PlaylistsView.tsx`，替换批4「Playlists coming soon」占位）：`<scroll-view>` 网格（同 facets 网格模式，非 `<list>`——子节点在测试可查）+ `PlaylistCard`（封面 or `music` Icon 占位 + 名称 + `<n> song(s)` 单复数）；点卡片 `navigate({ to: '/playlists/$id', params:{id} })`；加载/空（「No playlists yet」）/错误态齐备。`LibraryPage` 仅改 import + 分支渲染。
- **歌单详情页**（`src/features/playlist/pages/PlaylistDetailPage.tsx`，路由 `/playlists/$id`，shell 内）：`useParams({strict:false})` 取 id；头部（返回键 `chevron-down`→`/library`、封面 or `music` 占位、名称/描述/`<n> song(s)`）+ 歌曲列表（**复用 library `SongRow` + `VirtualList`** + `bindscrolltolower` 触底 `fetchNextPage`）；点歌 `usePlayerStore.getState().playPlaylist(songs, index)`（直接 import store，不经 player 桶入口，避免 eager 拉 lynx-ui 手势叶子）；加载/空/错误态齐备。`.song-row` 规则在 `PlaylistDetailPage.css` 重声明（与 `LibraryPage.css` 相同）——详情路由可能在 library 页从未挂载时进入，Lynx CSS 全局作用域，重复同规则无害。**路由**：`router.tsx` 加 `playlistDetailRoute`（shell 子路由，`path:'/playlists/$id'`，typed param）。
- **测试约定（沿用 `_render-mocks` 模式）**：渲染冒烟里 `useInfiniteQuery`/`useQuery` hooks（`useSyncExternalStore` 订阅→崩 `isListHolder` 类 + 需 live QueryClient/网络）用 `vi.fn()` 桩返静态形；`useNavigate`/`useParams` 桩；`<list>` 封装 `VirtualList` mock 成 plain `<view>`（`_render-mocks.mockVirtualList`）。真 hooks/组件/`<list>` 用于 build/dev/device。断言实质结构：PlaylistsView 卡片名 + 单复数歌数 + 空/加载/错误态；详情页头部（名称/描述/`2 songs`）+ 歌曲行（标题/`artist · album`/`05:27`·`09:05` 时长）+ 空/加载态；playlist-api query 拼接 + zod 解析（mock transport，验 URL 含参 + snake→camel + `isBuiltIn` 派生）。**批4 `library-page.test` 的 playlists 占位用例改为**：切 Playlists tab 断言 `PlaylistsView` 空态（并补 mock playlist-query hook + `useNavigate`）。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（`main.lynx.bundle` 920.8 kB binary 容器，最长行 92259=已压缩；`strings` 证 `/playlists`×23 / `No playlists yet` / `No songs in this playlist` / `Loading playlists` / `exclude_labels` 均入包）、`tsc --noEmit` 绿、`pnpm test` **183/183 绿**（新增 24：playlist-api 9 / pagination 8 / playlists-view 4 / playlist-detail 3；`background-bundle-self`/`query-no-dom`/`router-no-dom` 对新鲜 dist 复跑绿——无新增未守卫全局）。
- **遗留/注意**：① 歌单 **CRUD**（创建/更新/删除/封面上传/批量删除）、**收藏歌单**（`favoritePlaylistId='1'`/`radioFavoritePlaylistId='2'` 已在 constants，本批未做特殊处理/入口）、**排序**（歌单排序 / 歌单内歌曲 reorder）、**可见性切换**、**touch 访问时间**、**song-ids 定位**、**搜索/多选** 均未 port（Flutter `PlaylistApi` 全端点 + 详情页有，本批裁到只读浏览）——记入下方 TODO。② 详情页在 shell 内渲染（底栏 nav 常驻），返回键固定回 `/library`（Flutter 是独立 appbar 页 + `context.pop()`）。③ 封面缓存刷新参数 `?_t=<updatedAt ms>`（Flutter `coverImageUrl`）未加，仅 `buildCoverUrl(coverUrl)`。④ 真机图标/网格/详情目测待扫码。

### 批7 · home feature（首页内容）
- **参考首页实际展示**（`songloft-player/lib/features/home/presentation/home_page.dart`）：① 顶部**时段问候**（早/午/晚/深夜，`_getGreeting` 按 `DateTime.now().hour`）；② **「我的歌单」区块**（`playlistListProvider('normal')`）——窄屏横向轮播 / 宽屏可配置网格，标题带「查看全部」→ `/library?view=playlist`；③ **「我的电台」区块**（`playlistListProvider('radio')`，同结构，「查看全部」→ `/library?view=playlist_radio`）；④ **JSPluginGrid**（插件入口）；⑤ 底部 **StatsStrip**（歌单数 / 电台数 / 总计）。数据即「按 `type` 过滤的歌单列表」，无独立歌曲 feed。
- **本批实现**（`src/features/home/`，镜像 data/domain/presentation）：
  - **domain**（`domain/greeting.ts`）：`greetingForHour(hour)` 纯函数（4 段：<6 深夜 / <12 早 / <18 午后 / 晚）+ `currentGreeting(now?)`。
  - **data**：`data/home-query.ts` 的 `useHomePlaylists(type)` **复用批6 `usePlaylistsInfiniteQuery({type})`**（不新增端点，直接吃批6 认证客户端单例 + `PlaylistApi.getPlaylists`（真实端点 `GET /api/v1/playlists?type=normal|radio`）+ 批2 zod）；`data/home-select.ts` 纯选择器 `homeSectionItems(pages, limit=6)`（flatten + 截断预览）/ `homeSectionTotal(pages)`（取后端 `total`，缺失回落已载长度）/ `homeStats(n,r)`（三项计数）。
  - **widgets**：`HomeSection`（区块头 icon + 标题 + 「View all」+ 截断网格，**复用 `PlaylistCard`**——其 `.playlist-card{width:33.33%}` 全局 CSS 使卡片三列平铺；含区块内联加载失败 + Retry，mirror `_SectionLoadError`）；`StatsStrip`（primary 底色三统计条，`Icon` 图标）。
  - **presentation**：`pages/HomePage.tsx`（替换批1 `/` 占位）——问候顶栏（含 **Log out** 入口）+ 竖向 `<scroll-view>`（我的歌单区块 + 我的电台区块 + 统计条）；首屏加载 / 整页错误（两区块皆错且无数据）/ 空态（两区块皆空 → 「No playlists yet」+ Browse library）/ 单区块降级内联错误 齐备。全走 LUNA tokens，走 shell 安全区（`shell__body` 已加 top inset，页面不再顶格），Icon 无 emoji。
- **数据/取数/交互**：数据 = 按 `type` 过滤的歌单列表（`normal`/`radio`），复用批6 `usePlaylistsInfiniteQuery` + 认证客户端单例 + 批2 zod 模型（无新增端点/模型）；取数 `useHomePlaylists(type)` 只预览首页（截断 6 张），统计条用后端 `total`；交互——点歌单卡片 → `navigate('/playlists/$id')`（**复用 `PlaylistCard`**，详情页点歌 `playPlaylist` → mini-player），「View all」→ `/library?view=playlists`（**复用批6 Library Playlists 视图**），「Log out」→ `useAuthStore.getState().logout()`（非订阅读取，同 LibraryPage 用 `getState()` 模式）+ `navigate('/login')`。
- **路由**：`router.tsx` 的 `/` 组件由占位 `ListPage` 换成 `HomePage`；`ListPage.tsx` 已删（`pages.css` 仍被 `SettingsPage` 用，保留）。
- **测试约定（沿用 `_render-mocks` / 批6 模式）**：`greeting` + `home-select` 纯函数单测（8+5）；`home-data` 用 **mock transport** 验首页两区块的取数契约（`type=normal|radio` 进 query + zod snake→camel + null/字符串 int 容错）；`home-page` 渲染冒烟——`useHomePlaylists`（`useSyncExternalStore` 订阅 + 需 live QueryClient）按 `type` 分派 `vi.fn()` 桩返静态 infinite-query 形、`useNavigate` 桩，真 `HomeSection`/`PlaylistCard`/`StatsStrip`/纯选择器跑注入数据，实质断言问候 testid + 两区块标题 + 卡片名 + 各区块「View all」×2 + 统计条标签与后端 total（10/4/14）+ 首屏加载态 / 空态 / 整页错误 / 单区块降级内联错误。**`smoke.test` 的 `/` 用例改写**：`/` 现是 HomePage → 补 mock `home-query`（静态 infinite-query 形）、bindtap→navigate 证明由「Open player」改为点区块「View all」→ 断言路由转 `/library`，渲染断言改问候 testid + 两区块标题 + 卡片名。
- 验收：`rm -rf dist .rspeedy && pnpm run build`（`main.lynx.bundle` 946.4 kB binary 容器，最长行 97636=已压缩；`strings` 证 `My Playlists`/`My Radios`/`No playlists yet`/`Good morning`/`Good evening`/`Browse library`/`View all` 均入包）、`tsc --noEmit` 绿、`pnpm test` **211/211 绿**（新增 20：greeting 5 / home-select 8 / home-data 2 / home-page 5；`background-bundle-self`/`query-no-dom`/`router-no-dom` 对新鲜 dist 复跑绿——无新增未守卫全局）。
- **遗留/注意**：① **首页 JS 插件 Tab / WebView（`JSPluginGrid` + plugin_tab/webview）全裁**——留 **jsplugin 阶段**（首页插件区块与 jsplugin feature 深耦合，本批只做非插件核心内容）。② **区块布局裁为「截断网格」**：Flutter 窄屏是横向轮播、宽屏是可配置行列网格（`HomeGridConfig` 列数/行数、`homeGridConfigProvider` 本地偏好、宽屏「不限行数」自动续拉 `kHomeAutoLoadAllMaxItems`）——Lynx 本批统一用截断到 6 张的三列平铺网格（复用 `PlaylistCard` 全局 CSS），未做轮播/网格配置/自动续拉，超出靠「View all」入口去 Library。③ **两区块「View all」都去 `/library?view=playlists`**：Lynx Library 无独立「电台」子视图（Flutter 电台用 `?view=playlist_radio`），电台区块暂映射到同一 Playlists 视图。④ **Hero 推荐卡（`HeroCard`）未 port**（Flutter 有「取第一个歌单大图推荐 + 播放按钮」，本批未做）。⑤ 下拉刷新（`RefreshIndicator`）、加载慢提示（`homeLoadingSlowRetrying`）、正在播放的歌单高亮（`currentPlaylistId`/`isPlaying` 边框 + equalizer 遮罩）未 port。⑥ 问候仅英文 4 段（Flutter 5 段 + i18n）；统计条图标用现有 Icon 集（`library`/`music`/`home`）近似。⑦ 真机图标/网格/首页目测待扫码（本机 vitest 只证节点存在，不证像素）。

## 未完成 / 遗留事项（TODO & 风险）

- [x] **Lynx `fetch` 是裸全局**（批3 真机修复）：Lynx 的 `fetch` 是宿主提供的 HTTP service（Android/iOS 2.18+），以**裸全局**暴露而非 `globalThis.fetch`（与 `self` 同）。`createFetchTransport` 已改为先取裸 `fetch`（`typeof fetch !== 'undefined'`）再回落 `globalThis.fetch`/注入。⚠️ 但**真机整登录 E2E 仍需后端可达**：手机上 `http://localhost:58091` 指向手机自身，须填开发机 LAN IP 且后端在跑；Lynx fetch 不支持 CORS/redirect/keepalive/FormData/Blob。
- [x] **AbortController 真机缺失**（批3 真机修复）：Lynx 引擎**无** `AbortController`（`ReferenceError`），而 **TanStack Router `loadClientRoute` 与 Query 都无条件 `new AbortController()`**。已在 `lynx.config` banner 注入存在性守卫的全局 polyfill（覆盖 main-thread + background 两个 bundle、最先执行）；`AbortController` 是未声明标识符，故 `globalThis.AbortController=` 能让裸读解析（不同于 `self`）。回归测试断言产物里 polyfill 定义早于任何 `new AbortController`。批2 `configureQueryGlobals` 里的同类 polyfill 保留但非主修复。
- [x] **Lynx `clearTimeout` 严格要 Number**（批3 真机修复）：`clearTimeout(undefined)` 在浏览器/node 是 no-op，Lynx 却抛 `param 0 should be Number`；TanStack Router `load-client.js` 的 `offerPending` 有 6 处 `clearTimeout(session?.[3])`（可为 undefined）。已扩展 `patches/@tanstack__router-core@*.patch`：模块顶层捕获真实 `clearTimeout`（typeof 守卫）并包一层「仅 Number 才调」的 `__safeClearTimeout`，替换 6 个调用点。
- [x] **SongloftStorage 在 Lynx 降级为内存**（批3 真机修复）：设备无 `localStorage`，原选择落到**抛错的 native stub**（阻断登录）。改为降级到 `createMemoryStorage`（**in-session、非持久，重启丢 token**）并 `console.warn`；`createNativeStorage` 保留待原生 JSB 模块（后续批）接入时在 `createSongloftStorage` 里改回。⚠️ 当前登录仅会话内有效。
- [x] **QueryClientProvider 已接入 bootstrap**（批4）：`src/App.tsx` 用 `<QueryClientProvider>`（`@tanstack/react-query`）包住 `<RouterProvider>`，`configureQueryGlobals()` 先于 `getQueryClient()`。Query 真正入包（`useInfiniteQuery`）；产物守卫（AbortController polyfill / `__TSR_ROUTER__`）经 `background-bundle-self` 回归测试确认仍在，无新增未守卫全局。⚠️ 真机整链路（列表拉取）待扫码验证（需后端可达 + LAN IP）。
- [ ] **批4 遗留（library）**：
  - [x] **playlists 视图**（批6 落地）：占位换成 `PlaylistsView`（歌单网格 + 点卡片→`/playlists/$id`）。
  - **收藏 / 多选 / 搜索 / 排序菜单 / 自定义视图编辑器 / 单曲点击进播放器**未做（Flutter `LibraryPage` 有，本批裁掉）——`SongRow.onTap` 已留钩子，接播放器批时接上。
  - **facet 卡片点击**未跳到「该分类下歌曲列表」（Flutter `CategorySongsPage`），本批仅展示网格。
  - **真机待扫码验列表拉取**：登录后进 `/library`，songs 视图应见分页歌曲行，触底加载下一页；facets 视图切 Artist/Album/Genre 见网格。
- [ ] **standalone/embedded 部署模式**：批3 登录页需保留 standalone 的 API 地址配置 + 不安全 TLS 开关分支（见 `AGENTS.md`）。
- [ ] **批5 遗留（player）**：
  - **真原生音频**：本批仅 TS mock（定时器模拟进度，无真实解码/网络流/HLS/后台播放/系统媒体控件）。`createNativeAudio()` 为 stub，真机批接各端 `NativeModules.SongloftAudio`（ExoPlayer/AVPlayer/HTMLAudioElement+hls.js/libmpv）——facade 已就位，store 只依赖接口，替换透明。
  - **均衡器**：mock 的 `setEqualizerEnabled/Band/getBands` 为占位（无 DSP），**无均衡器面板 UI**。
  - **歌词拉取真机未验**：`SongsApi.getLyric` + `lyric-store.loadForSong` 已接认证客户端（best-effort），但需后端可达 + LAN IP 才能验；**逐字（lxlyric）/翻译（tlyric）/罗马音（rlyric）解析未 port**（仅普通 LRC + 纯文本降级）；本地歌词缓存（Flutter `LyricCacheService`）未做。歌词高亮在无后端歌词时无内容可高亮。
  - **睡眠定时无 UI**：store 逻辑（时长倒计时 + afterSongs）+ 纯函数 + 单测齐备，但**未接入设置菜单/入口**。
  - **播放队列拖拽排序无 UI**：`reorderPlaylist` action + `queue.reorder` 纯函数就位，但抽屉里仅「点选切歌 + 移除」，无 drag-reorder 手势（lynx-ui `sortable` 后续接）。
  - **Home「Open player」简化**：恒跳 `/player`（无歌时全屏页显空态），未做「无歌则播放示例」。
  - **Flutter player 其余能力裁掉**：播放状态持久化/恢复、失败重试策略、预加载 prefetch、通知栏/锁屏媒体控件与收藏回调、Live Activity/悬浮歌词/桌面歌词、视频播放（`is_video`）、音轨切换、播放历史、`setSpeed/setShuffle` 无 UI——均后续批（多数真机/桌面绑定）。
  - **真机待扫码**：登录→Library 点歌→mini-player 出现→点开 `/player`；mock 进度条应自动前进、上一首/下一首/播放模式切换/音量/抽屉可用；lynx-ui `Slider`/`Sheet`/`Swiper` 三个手势叶子首次上真机（本机无法验手势）。
- [ ] **批6 遗留（playlist）**：
  - **歌单 CRUD 全裁**：创建/更新/删除/封面上传（`MultipartFile`，Lynx fetch 不支持 FormData——需原生上传通道）/批量删除均未 port（Flutter `PlaylistApi` 有）。本批只读浏览。
  - **收藏歌单**：`favoritePlaylistId='1'`/`radioFavoritePlaylistId='2'` 常量已在 `constants.ts`，但**未做收藏入口 / 特殊处理**（内置歌单标识 `isBuiltIn` 已由 zod 派生，UI 未用）。
  - **排序**：歌单排序（`PUT /playlists/reorder`）+ 歌单内歌曲 reorder（`PUT /playlists/{id}/songs/reorder`）+ `PlaylistSort`（拼音比较器）未 port；详情页无排序/搜索/多选（Flutter 有）。
  - **其他端点**：`song-ids`（定位「某首歌排第几」）、`visibility`（隐藏切换）、`touch`（更新访问时间）、`addSongsToPlaylist`/`removeSongFromPlaylist` 未 port。
  - **详情页在 shell 内**（底栏 nav 常驻），返回键固定回 `/library`（Flutter 独立 appbar 页 + `pop()`）；封面缓存刷新参数 `?_t=<updatedAt>` 未加。
  - **真机待扫码**：登录→Library→切 Playlists 见歌单网格（封面/名称/歌数）→点歌单进 `/playlists/$id`（头部 + 歌曲行 + 触底分页）→点歌曲 `playPlaylist` → mini-player 出现。需后端可达 + LAN IP。
- [ ] **批7 遗留（home）**：
  - **首页 JS 插件 Tab / WebView 全裁**（`JSPluginGrid` + `plugin_tab_page`/`plugin_webview_page`/`plugin_render_*` + `PluginHostBridge`/`PluginRenderController`）——留 **jsplugin 阶段**（首页插件区块与 jsplugin feature 深耦合，需 WebView/iframe 宿主桥）。
  - **区块布局裁为截断网格**：未做窄屏横向轮播 / 宽屏可配置行列网格（`HomeGridConfig`、`homeGridConfigProvider`、宽屏「不限行数」自动续拉 `kHomeAutoLoadAllMaxItems`）；统一截断到 6 张三列平铺，超出靠「View all」。
  - **两区块「View all」共用 `/library?view=playlists`**：Lynx Library 无「电台」子视图（Flutter `?view=playlist_radio`），电台暂映射同一 Playlists 视图。
  - **HeroCard 推荐卡未 port**；下拉刷新 / 加载慢提示 / 正在播放歌单高亮（`currentPlaylistId` 边框 + equalizer 遮罩）未 port；问候仅英文 4 段（无 i18n / noon 折进午后）。
  - **真机待扫码**：登录→首页见问候 + 「我的歌单」「我的电台」两区块（封面/名称/歌数）+ 底部统计条 → 点歌单卡片进 `/playlists/$id` → 点「View all」到 Library Playlists → 点「Log out」回登录。需后端可达 + LAN IP。
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
