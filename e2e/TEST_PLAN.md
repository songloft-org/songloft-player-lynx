# E2E 行为测试计划

## 概述

本计划覆盖 Songloft Player Lynx 的所有页面和核心交互流程，基于现有 TestBridge 架构（TCP 9230 端口 + JS eval），通过 zustand store 直接驱动和验证应用状态。

**测试原则：**
- 每个 scenario 文件对应一个功能域
- 通过 `evaluateJS` 读写 store 状态，而非依赖 DOM（Lynx 无 DOM）
- 通过 `navigate()` 驱动页面切换
- 关键步骤截图，报告中文输出
- Android/iOS 双平台复用同一 scenario

---

## 已完成的场景（6 个文件，21 个测试）

| 文件 | 覆盖内容 |
|------|----------|
| `audio-playback.scenario.ts` | 播放、暂停、恢复、拖动进度 |
| `audio-completion.scenario.ts` | 顺序/循环/随机模式下播完行为 |
| `audio-queue.scenario.ts` | 队列追加、插入下一首、移除、清空 |
| `audio-speed.scenario.ts` | 倍速播放（0.5x-2x）+ 持久化 |
| `audio-error.scenario.ts` | 无效 URL 错误处理 |
| `ios-appearance.scenario.ts` | iOS 系统主题切换 |

---

## 待新增场景

### 1. 登录页 (`auth-login.scenario.ts`)

**路由：** `/login`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 正确账号登录 → 跳转首页 | auth status = authenticated, 路由 = `/` |
| 2 | 错误密码 → 显示错误 | auth status = unauthenticated, error 非空 |
| 3 | 空表单提交 → 不触发请求 | isLoading 始终 false |
| 4 | 登录成功后 token 持久化 | secure storage 有 access_token |
| 5 | 未登录访问 `/` → 重定向 `/login` | auth guard 拦截 |

**驱动方式：** 直接调用 `__E2E_AUTH_STORE__.getState().login(...)` / `.logout()`

---

### 2. 首页 (`home-page.scenario.ts`)

**路由：** `/`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 登录后加载首页 → 显示问候语 | 根据时间段返回对应 greeting key |
| 2 | 播放列表数据加载 | evaluateJS 查询 react-query cache 有 playlists 数据 |
| 3 | 曲库统计数据展示 | stats API 返回 songCount > 0 |
| 4 | 点击播放列表卡片 → 导航到详情 | 路由切换到 `/playlists/$id` |
| 5 | 下拉刷新 | 触发 refetch，数据更新 |

**驱动方式：** `navigate('/')`, 读取 react-query cache 或 DOM 状态

---

### 3. 曲库 - 歌曲列表 (`library-songs.scenario.ts`)

**路由：** `/library` 或 `/library?view=songs`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 加载歌曲列表 | 查询 songs query 数据长度 > 0 |
| 2 | 搜索过滤 | keyword 过滤后结果集变小 |
| 3 | 排序切换（最近/标题/艺术家） | sort 字段变更，列表重新加载 |
| 4 | 点击歌曲 → 开始播放 | player store 的 currentSong 匹配 |
| 5 | 无限滚动加载更多 | fetchNextPage 触发后列表变长 |
| 6 | 分类筛选（genre/artist/album） | filters 生效，列表内容变化 |

**驱动方式：** `navigate('/library')`, 通过 evaluateJS 模拟搜索/排序状态变更

---

### 4. 曲库 - 分类浏览 (`library-facets.scenario.ts`)

**路由：** `/library?view=facets`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 加载艺术家分类 | facets query 返回列表 |
| 2 | 切换到专辑维度 | field 切换为 album，数据重新加载 |
| 3 | 切换到流派维度 | field 切换为 genre |
| 4 | 点击分类卡片 → 进入分类歌曲页 | 路由 = `/library/category/$field` |

**驱动方式：** `navigate('/library?view=facets')`, 切换 field 参数

---

### 5. 分类歌曲页 (`library-category-songs.scenario.ts`)

**路由：** `/library/category/$field?value=X`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 按艺术家加载歌曲列表 | 该艺术家下歌曲数 > 0 |
| 2 | 点击歌曲播放 | player store 匹配选中歌曲 |
| 3 | 返回分类列表 | 路由回到 /library?view=facets |

---

### 6. 曲库 - 播放列表视图 (`library-playlists.scenario.ts`)

**路由：** `/library?view=playlists`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 加载播放列表 | playlists query 返回 ≥ 1 个列表 |
| 2 | 创建新播放列表 | API 调用成功，列表数 +1 |
| 3 | 点击进入播放列表详情 | 路由 = `/playlists/$id` |

---

### 7. 播放列表详情 (`playlist-detail.scenario.ts`)

**路由：** `/playlists/$id`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 加载列表详情（名称、歌曲数） | playlist query 数据完整 |
| 2 | 点击歌曲播放整个列表 | player playlist 匹配，`playbackContext` 为 `{type:'playlist',key:'<id>'}`（`sourcePlaylistId` 由它派生） |
| 3 | 搜索列表内歌曲 | keyword 过滤生效 |
| 4 | 排序切换（位置/标题/艺术家/最近） | sortBy 字段变化 |
| 5 | 编辑列表名称 | mutation 成功，名称更新 |
| 6 | 删除播放列表（二次确认） | 列表从 query cache 消失，路由回到 library |
| 7 | 移除单曲 | 歌曲从列表中消失 |
| 8 | 隐藏/显示播放列表 | isHidden 状态切换 |

**驱动方式：** 先通过 API 获取一个真实 playlist id，然后 `navigate('/playlists/${id}')`

---

### 8. 歌曲详情 (`song-detail.scenario.ts`)

**路由：** `/library/song/$songId`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 加载歌曲元信息（标题/艺术家/专辑/时长） | 数据字段非空 |
| 2 | 播放当前歌曲 | player currentSong.id = songId |
| 3 | 收藏/取消收藏 | favorite state 切换 |

---

### 9. 播放历史 (`play-history.scenario.ts`)

**入口：** 歌单详情页 / 分类歌曲页的历史按钮打开的面板（**没有**独立路由，也没有设置页入口 —— 历史按播放上下文分桶，脱离上下文无从查询）

历史的读取从 **Node 侧**发 HTTP，不走 `evaluateJS`（Lynx BTS 无 `fetch`）。断言落在服务端状态上：只断言"歌在播"会让一个完全不落库的客户端照样绿灯，这正是之前发生过的事。

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 带 playlist 上下文起播 | `GET /play-history?context_type=playlist&context_key=1` 出现该歌 |
| 2 | 不带上下文起播 | 该桶仍为空，且 store 的 `playbackContext` 为 null |

---

### 10. 全屏播放器 (`full-player.scenario.ts`)

**路由：** `/player`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 打开全屏播放器显示当前歌曲 | song title/artist 匹配 player store |
| 2 | 播放/暂停控制 | isPlaying 状态切换 |
| 3 | 上一首/下一首 | currentIndex 变化 |
| 4 | 进度条拖动 | currentTime 跳转 |
| 5 | 倍速循环切换 | speed 在 [0.5, 0.75, 1, 1.25, 1.5, 2] 间循环 |
| 6 | 播放模式切换 | playMode 在 order/repeat/shuffle 间循环 |
| 7 | 音量调节 | volume 值变化 |
| 8 | 静音/取消静音 | volume ↔ 0, previousVolume 保存恢复 |
| 9 | 定时关闭（按时长） | sleepTimer 设置，倒计时后暂停 |
| 10 | 定时关闭（按曲数） | sleepTimer.remainingSongs 递减 |
| 11 | 关闭播放器回到之前页面 | 路由恢复 |

**驱动方式：** 先加载歌曲，再 `navigate('/player')`

---

### 11. 歌词功能 (`lyrics.scenario.ts`)

**路由：** `/player`（歌词面板）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 播放歌曲后加载歌词 | lyric store lyrics.length > 0 |
| 2 | 歌词跟随进度同步 | currentIndex 随 positionMs 推进 |
| 3 | 无歌词歌曲处理 | lyrics = [], loadFailed 或空态 |
| 4 | 翻译歌词加载 | hasTranslation = true |

**驱动方式：** 通过 `useLyricStore.getState()` 读取状态

---

### 12. 播放队列抽屉 (`playlist-drawer.scenario.ts`)

**路由：** `/player`（队列抽屉）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 打开队列抽屉 | showPlaylistDrawer = true |
| 2 | 队列内歌曲列表与 playlist 一致 | 长度/内容匹配 |
| 3 | 关闭抽屉 | showPlaylistDrawer = false |

---

### 13. 设置页 (`settings-general.scenario.ts`)

**路由：** `/settings`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 加载设置页 | 路由到达 /settings |
| 2 | 切换语言（中/英/系统） | pref 持久化，i18n 生效 |
| 3 | 切换主题（亮/暗/系统） | theme pref 持久化 |
| 4 | 切换音频质量 | audioQuality pref 变更 |
| 5 | 开关自动恢复播放 | autoResume pref 切换 |
| 6 | 登出（确认弹窗） | auth status = unauthenticated, 路由 = /login |

**驱动方式：** `navigate('/settings')`, 通过 evaluateJS 模拟 store 操作

---

### 14. 均衡器 (`player-equalizer.scenario.ts`)

**路由：** `/player/eq`（入口只在播放器 `⋯` 菜单）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 开启均衡器 | eq store enabled = true |
| 2 | 选择预设 | activePreset 切换, bands 更新 |
| 3 | 手动调节频段 | adjustBand → activePreset = 'custom' |
| 4 | 重置均衡器 | enabled = false, bands 归零 |
| 5 | 持久化 → 重新 hydrate | prefs 中有数据，hydrate 后恢复 |

**驱动方式：** 直接操作 `useEqStore`（需在 e2e-bridge 中暴露）

---

### 15. 多服务器管理 (`settings-servers.scenario.ts`)

**路由：** `/settings/servers`, `/settings/servers/add`, `/settings/servers/edit/$id`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 加载服务器列表 | profiles 数组非空 |
| 2 | 添加新服务器 | profiles.length +1 |
| 3 | 编辑服务器 | name/url 更新 |
| 4 | 删除服务器 | profiles.length -1 |
| 5 | 切换活跃服务器 | activeProfileId 变更, appConfig.resolvedBaseUrl 更新 |

**驱动方式：** 操作 `useServerStore`（需在 e2e-bridge 中暴露）

---

### 16. 缓存管理 (`settings-cache.scenario.ts`)

**路由：** `/settings/cache`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 查看缓存用量 | 能读取到 cache size 数据 |
| 2 | 清除缓存 | cache size 降为 0 或显著减少 |

---

### 17. 代理设置 (`settings-proxy.scenario.ts`)

**路由：** `/settings/proxy`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 无代理状态（默认） | proxy pref 为空/none |
| 2 | 设置 HTTP 代理 | proxy pref 持久化 |
| 3 | 清除代理 | proxy pref 恢复空 |

---

### 18. 曲库管理 (`library-ops.scenario.ts`)

**路由：** `/settings/library`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 加载曲库管理页 | 路由到达 |
| 2 | 触发扫描 | 扫描状态变为进行中 |
| 3 | 扫描完成 | 状态恢复空闲，歌曲数可能变化 |

---

### 19. 重复检测 (`duplicate-check.scenario.ts`)

**路由：** `/settings/duplicates`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 触发重复检测 | 返回重复组数据（可能为空） |
| 2 | 处理重复项（保留/删除） | 若有重复，操作后组数减少 |

---

### 20. 导航与路由守卫 (`navigation.scenario.ts`)

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 未登录 → 所有页面重定向到 /login | auth guard 生效 |
| 2 | Shell 底部导航切换 (/, /library, /settings) | 路由正确切换 |
| 3 | 深层页面返回 | 回到上一级 |
| 4 | 播放器 mini bar 点击 → 全屏 | 路由到 /player |

---

### 21. 收藏功能 (`favorites.scenario.ts`)

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 收藏一首歌 | favorites API 调用成功 |
| 2 | 取消收藏 | 移除成功 |
| 3 | 收藏列表包含已收藏歌曲 | favorites query 返回收藏的歌曲 |

---

### 22. 播放状态持久化 (`playback-persistence.scenario.ts`)

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 播放后关闭 → 重新打开恢复 | reset + restorePlaybackState 后 playlist/index/position 恢复 |
| 2 | autoResume=true 时自动播放 | restore 后 isPlaying = true |
| 3 | autoResume=false 时仅恢复不播放 | restore 后 isPlaying = false |

---

### 23. 添加歌曲 (`add-songs.scenario.ts`)

**路由：** `/library/add`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 加载添加歌曲页 | 路由到达 |
| 2 | 通过 URL 添加歌曲 | 歌曲入库成功 |

---

### 24. 主题包 (`theme-packs.scenario.ts`)

**路由：** `/settings/theme-packs`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 加载主题包列表 | 页面加载无报错 |
| 2 | 切换主题包 | 主题变量更新 |

---

### 25. 升级检查 (`upgrade.scenario.ts`)

**路由：** `/settings/upgrade`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 检查更新 | 请求 API 获取版本信息 |
| 2 | 当前已是最新版 | 无可用更新提示 |

---

## 实施优先级

### P0 — 核心路径（第一批实施）
1. `auth-login.scenario.ts` — 登录是所有功能的前提
2. `navigation.scenario.ts` — 路由守卫和导航
3. `full-player.scenario.ts` — 主功能界面
4. `library-songs.scenario.ts` — 曲库核心

### P1 — 重要功能（第二批）
5. `home-page.scenario.ts`
6. `playlist-detail.scenario.ts`
7. `lyrics.scenario.ts`
8. `settings-general.scenario.ts`
9. `playback-persistence.scenario.ts`
10. `favorites.scenario.ts`

### P2 — 辅助功能（第三批）
11. `library-facets.scenario.ts`
12. `library-category-songs.scenario.ts`
13. `library-playlists.scenario.ts`
14. `player-equalizer.scenario.ts`
15. `settings-servers.scenario.ts`
16. `playlist-drawer.scenario.ts`

### P3 — 补充覆盖（第四批）
17. `settings-cache.scenario.ts`
18. `settings-proxy.scenario.ts`
19. `library-ops.scenario.ts`
20. `duplicate-check.scenario.ts`
21. `song-detail.scenario.ts`
22. `play-history.scenario.ts`
23. `add-songs.scenario.ts`
24. `theme-packs.scenario.ts`
25. `upgrade.scenario.ts`

---

## 前置准备

### e2e-bridge 需额外暴露的 store

当前仅暴露了 `__E2E_PLAYER_STORE__`、`__E2E_AUTH_STORE__`、`__E2E_APP_CONFIG__`。新场景需要：

```typescript
// 需要在 src/e2e-bridge.ts 中追加
import { useLyricStore } from './features/player/store/lyric-store.js'
import { useEqStore } from './features/settings/store/eq-store.js'
import { useServerStore } from './features/settings/store/server-store.js'
import { router } from './router.js'

;(globalThis as any).__E2E_LYRIC_STORE__ = useLyricStore
;(globalThis as any).__E2E_EQ_STORE__ = useEqStore
;(globalThis as any).__E2E_SERVER_STORE__ = useServerStore
;(globalThis as any).__E2E_ROUTER__ = router
```

### Driver 扩展

`E2EDriver` interface 需新增：

```typescript
// 导航辅助
navigate(path: string): Promise<void>  // ← 已有

// 获取 react-query 缓存的辅助方法
getQueryData<T>(queryKey: string[]): Promise<T | null>
```

### 测试数据依赖

- 后端 API 需运行在 `localhost:58091`
- 需要至少 1 个用户账号 (admin/admin)
- 需要曲库中有歌曲数据（通过 `fetchRealSongs` 已解决）
- 需要至少 1 个播放列表（部分测试会动态创建）

---

## 预估

| 批次 | 场景数 | 测试用例数 | 预计耗时 |
|------|--------|-----------|---------|
| 已完成 | 6 | 21 | ✅ |
| P0 | 4 | ~20 | 2天 |
| P1 | 6 | ~30 | 3天 |
| P2 | 6 | ~20 | 2天 |
| P3 | 9 | ~20 | 2天 |
| **总计** | **31** | **~111** | — |
