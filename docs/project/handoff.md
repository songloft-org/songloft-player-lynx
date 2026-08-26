# 工作交接（2026-08-26 · 批62）

> 本文件是**给接手 AI 的交接说明**，只回答三件事：现在在哪、还剩什么、怎么验证。
>
> **读文档顺序**：① [AGENTS.md](../../AGENTS.md) §4–§6（铁律，必读）→ ② 本文 §3「剩余工作」→ ③ [pitfalls.md](pitfalls.md)（踩坑实录：每条铁律背后的证据）。细节按需查 [progress.md](progress.md)（逐批交付）与 [bugs.md](bugs.md)（逐条缺陷根因）。
>
> **一句话现状**：批41–62 完成并全部推送（批49 收口后共 **144 个提交**）。**JS 侧闸门全绿**：**1981 vitest / 189 文件**（2026-08-26 复核）+ `tsc -b` + `build` 双产物 + `build:web`。⚠️ **原生构建（`gradlew` / `ios:build`）与 e2e 自批49 后没再跑过**——见 §1 闸门快照表，别把「build 绿」当成「能出包」（批41 三条 P0 全是「闸门全绿而产物是坏的」，案例见 pitfalls §4）。

---

## 1. 现在在哪、做到哪了

### 已提交

**全部已推送**，`main` 与 `origin/main` 同步差 2 个待推送提交（见下）。分支 `feat/song-dialogs` 已由 `16aefb6` 合回 `main`（本地分支仍在，可删）。

**批41–49**（三条 P0 阻断 → 审计五波 → 结构性重构 → 功能缺口 15 项 → iOS 编译收口 → 自签名 → 悬浮歌词 → 全屏视频）已全部交付并推送，逐条根因在 [`progress.md`](progress.md)，提交清单用 `git log 93de19e..27ee23b` 取。

**批49 收口（`27ee23b`）之后的 144 个提交**按交付线归纳。**批号与提交信息不总是对得上**（撞号说明见 [progress.md](progress.md) 顶部），所以这里按主题组织：

| 交付线 | 关键提交 | 说明 |
|---|---|---|
| **上一版 HANDOFF 的「后续功能方向」7 项** | `e4b2660`–`99e5d54`、`bbb9608` | Web 音频 EQ/HLS/MediaSession · Web `openURL`/文件选择 · 渐进式队列（`QUEUE_WINDOW = 5`，只传当前 ±5 首到原生层）· 歌词时间轴校准页 · 音轨选择器 · 下一曲 prefetch（进度 80% 时 HEAD 预热）· 单曲离线缓存（**新原生模块 `SongloftSongCache` 双端**）。PROGRESS.md 无对应批次条目（补记为批49b） |
| **Web 平台整体失联（最值得读的一条）** | `571eb08` | `audio-host.js` 把模块以**普通对象**塞进 `nativeModulesMap`，web-core 对每个 value 做 `import(url)` ⇒ 强转成 `"[object Object]"`、worker 里一个自定义模块都没有。**同时静默杀死三件事**：文件选择器、剪贴板、批43 的 Web 音频修复（从未生效过）。改为 ESM URL 工厂 + `call` 转发。详见 pitfalls §2 |
| **设置页两轮重构** | `ea2f818`、`7497275`–`d8d723c`、`a75b02b`、`dbdf3ca`、`6d261b9` | 主页下沉为纯入口清单 + 新增 6 个二级页 + `SubPageShell` 骨架（四波迁移共 12 页）→ 对齐 Flutter 的 9 分类结构 → 批59 主题包并入外观页、主题商店独立成页 |
| **曲库深度重构（批51 A–D）** | `cee5cbd`、`491b1f5`、`6d5029c`、`d5cb551` | 「自定义显示分类」**从未生效过**（PUT 契约不符 ⇒ 恒 400 被静默吞掉）→ 单页 14 视图 + 三路分发 + 排序上提持久化 + 页内视图编辑器 |
| **播放器** | `b9846c8`（批52）、`8551e74`（批50）、`3872bb1`、`fca9c94`、`5d588e9`、`9eb72b1` | 全屏播放器对齐 Flutter + 多分辨率四档 + 修 4 个历史 bug · 播放历史改按上下文面板并**修通从未生效的打点** · 均衡器迁 `/player/eq` · 睡眠定时双分组芯片 · 歌词时间轴调整页 |
| **弹出层与覆盖层** | `78428cf`（批53）、`350ef07`、`3600e6b`、`b8519b0` | 定位自研、**退役 `lynx-ui-popover`**（无头 Chrome 实测 6 处错位，歌单详情排序菜单 `x = -122` 一直在屏外）· 歌曲菜单改全局顶层 · 新增全局 Toast 统一 7 处手写提示 |
| **导航** | `1b59ebf`、`215c4a2`（批55）、`afaa010`+`d8f534d`（批58）、`fbfe464` | 返回键三层模型（覆盖层 LIFO → 路由父级 → 双击退出）· tab 超 5 个折叠为「更多」· 底部导航改 iOS-26 悬浮胶囊 + iPadOS 侧栏 + `--nav-inset` 两档避让 |
| **插件与主题** | `ce853c8`（批56/57）、`ba8764b`、`28b2f11`、`899bded` | 插件管理页/商店页对齐 Flutter（含**修 `conflict` 建模为 string 致冲突流程一直是死的**）· 主题商店契约修复 + 主题包真正应用到 UI · Web 插件 tab 以 iframe 挂进 shadow root |
| **歌曲弹窗化（批60/60b/60c）** | `31726c6`、`ac9c292`、`c833f32` | 详情/编辑两路由退役为全局挂载弹窗 + 五路互斥；两轮修弹窗被 flex 压扁（标题裁半、按钮溢出） |
| **歌曲菜单按视口裁剪（批62）** | `92e5863` | 宽屏 ⋯ 菜单裁掉与行内按钮重复的 信息/加歌单/删除（歌单详情保留删除——其行内 × 是「从歌单移除」另一动作）；`openMenu` 转对象参数携带 `menuRow` 行上下文快照 |
| **批62 后收口** | `dc1cc22`、`abef131`、`5097122`、`54001b1` | 安卓通知栏歌词/更新、蓝牙断开暂停、系统媒体音量同步（**两侧原生代码未过任何编译闸门**）；Web 输入框占位符颜色跟随主题（patch web-core 默认值）；AGENTS §4 补 part 样式铁律；歌单封面改进（**待推送**） |

> ⚠️ 是否 `git push` 由用户决定，**不要自行推送**。（`git rev-list --left-right --count origin/main...main` = `0 2`：`5097122` 与 `54001b1` 待推送。）

### 工作树状态

**工作树干净**（`git status --short` 无输出）。

### 闸门快照——分清哪些是刚实测的、哪些是上次记录的

| 闸门 | 结果 | 何时验的 |
|---|---|---|
| `pnpm test` | **1981 passed / 189 文件**（20.6s） | ✅ **2026-08-26 复核（批62 后的全部提交）** |
| `pnpm exec tsc -b` | 绿 | 批62 收口时（`92e5863`） |
| `pnpm run build` | 双产物 lynx 2197.1 kB / web 2264.2 kB | 批62 收口时（`92e5863`） |
| `pnpm run build:web` | 绿 | 批60c 收口时 |
| `gradlew assembleDebug` | 绿 | **批49 时代**，此后 144 个提交未复跑 |
| `ios:build` | `BUILD SUCCEEDED` | **批49 时代**，同上 |
| Android e2e | 112 passed / 8 skipped (120) | **批49 时代（2026-08-16）** |
| iOS e2e | 110 passed / 10 skipped (120) | **批49 时代（2026-08-16）** |

> ⚠️ **e2e 与两个原生构建自批49 之后没有再全量跑过**，而这期间有 144 个提交、e2e 场景从 29 个涨到 **33 个**（新增 `library-views` / `play-history` / `playlist-pin` / `song-cache` / `theme-packs` 等，并重写了 `song-detail`）。**接手后若要改原生或发包，先把这四条补跑一遍**——vitest 读不到 Xcode 工程、Gradle 或真机行为。
>
> **两侧 skip 的构成**（skip 数变了就说明有东西被静默关掉了，值得查）：Android = 3 例 `ios-appearance` + 5 例 `android-video-fullscreen`（缺视频素材）；iOS = 5 例 `android-floating-lyric` + 5 例 `android-video-fullscreen`（都是平台门控）。

## 2. 铁律在哪

完整论述在 [AGENTS.md](../../AGENTS.md) §4（Lynx 约束：平台判断 / Web 平台 / 锚定弹出层 / 全局覆盖层 / 底部导航胶囊 / 返回导航）、§5（原生模块调用约定）、§6（测试与闸门原则）；**每条铁律背后的真实案例与实测数据在 [pitfalls.md](pitfalls.md)**。最致命的五条一句话版：

1. DOM 探测不是平台判断（Web 业务代码跑在 Worker 里，已踩三次）。
2. 原生方法不返回 Promise，强转即开屏崩。
3. 闸门只证明它真正读过的东西——「build 绿」不等于「能出包」。
4. 全局覆盖层必须挂在 root route 的 `ThemeProvider` 内。
5. 弹出层用自研 `PopoverMenu`/`PopoverPanel`，不要装回 `lynx-ui-popover`。

## 3. 剩余工作（批61+）

### 先看这个：上一版列的 7 项「后续功能方向」已经全部做完了

上一版 HANDOFF 在本节末尾列了 7 项待做，**它们已由 `e4b2660`–`99e5d54` + `bbb9608` 全部实现**（提交信息自称「批50」，但 PROGRESS.md 的批50 是另一批工作，所以按批号查不到）。逐项已核实到代码：Web 音频 EQ/HLS/MediaSession ✅ `web/audio-host.js` · Web openURL/文件选择 ✅ `web/songloft-platform-module.js` · 渐进式队列 ✅ `QUEUE_WINDOW = 5` · 歌词校准页 ✅ `LyricAdjustPage.tsx` · 音轨选择器 ✅ · 下一曲 prefetch ✅ · 单曲离线缓存 ✅ `SongloftSongCache` 双端。

### 真正剩下的

**A. 开发**

1. **Lynxtron 桌面** —— P3 唯一未开始项，剩余最大单块能力（迁移调研里的桌面验收清单在 [`../archive/migration/lynx_migration_roadmap.md`](../archive/migration/lynx_migration_roadmap.md) L47–74，可直接拿来用）。
2. ~~bug.md 的 8 条未修项~~ —— **已全部闭合（2026-08-26 复核）**，见 [`bugs.md`](bugs.md) 顶部声明。
3. ~~`ProxySettingsPage` 迁到 query 层~~ —— **已完成**（`92e5f7b`）。

**B. 验证欠账（不写代码，但欠着）**

4. **e2e + `gradlew assembleDebug` + `ios:build` 自批49 后没跑过**，中间 144 个提交、e2e 场景 29→33。见 §1 闸门快照的警示。
5. **批58/59/60 系列的真机目视待验**：批58 的悬浮胶囊观感与 `--nav-inset` 实际遮挡量（148px 是预估值）、批59 设置页合并、批60 三个弹窗批次。Web 侧都已用无头浏览器实测过，native 侧没有。另：批62 后的音量同步/通知栏歌词改动（`dc1cc22`）两侧原生代码未过任何编译闸门。

**C. 文档欠账** —— 已于 2026-08-26 两轮清理完毕：AGENTS §5 模块表补齐、PROGRESS 补批49b 条目、3 份被超越的计划删除（说明见 [`../README.md`](../README.md) 归档节）、乱码全部修复（progress.md 乱码史注记）、踩坑实录独立成 [pitfalls.md](pitfalls.md)。

## 4. 已知缺陷

| 条目 | 严重度 | 状态 |
|---|---|---|
| **HLS 播放列表内的绝对 https URI（自签名下）** | P3 | 批47 修完 iOS 自签名媒体流后剩下的唯一缺口：播放列表里的**相对** URI 会继续带自定义 scheme 回到 `InsecureMediaLoader`（Songloft 自己的 HLS 反代产出的正是相对 URL，所以按构造是通的），但**绝对** `https://` URI 由 AVFoundation 自行加载、撞同一道证书墙。**没有可测的自签名 HLS 源，未实测**。复现环境见 [pitfalls.md](pitfalls.md) 附录 |

已关闭的两条（原列于此表，2026-08-26 核实后移出）：「Android 上 HLS 电台落到 `ProgressiveMediaSource`」已证实并修复（`isHlsPlaylistPath()` 剥 query 后看扩展名，Android/Web 同修，另修跨协议重定向被拒）；「偶发全屏灰层」仅批29 那次偶发、此后再未复现，按「无法复现」关闭（重开指引在 [`bugs.md`](bugs.md)）。

## 5. 明确不做（避免被当成缺陷重开）

键盘快捷键、HomeGridConfig、/configs KV 编辑器、完整 GPL 全文许可页、升级的版本选择/手动上传/回退、客户端下载页、Web 调试控制台、热更、桌面歌词独立窗口、深目录树虚拟化、Settings 主从九分类 IA、黑胶唱片环动画、「清空浏览器缓存」（部署层已根治，见 [Web 部署](../guides/web-deployment.md)）。

视频播放的刻意边界：画面不在 Lynx 布局里（无法与歌词混排 / mini 小窗）、Android 侧只有裸 surface 没有原生控件、PiP 两端都不做、`avi/flv/mpg` 依赖服务端转码、mkv 里的 AC-3/DTS 音轨在很多 Android 设备上无授权。

## 6. 常用命令与验证

```bash
pnpm run build        # 必须同时列出 File (lynx) 与 File (web) 两个产物
pnpm exec tsc -b      # 类型检查（必须 -b，--noEmit 是空跑）
pnpm test             # vitest
pnpm run ios:build    # 改 ios/ 后验工程真能编译（需 macOS）
pnpm run build:web    # 改 web/ 后验产物，且要真的用浏览器打开

cd android && ./gradlew --no-daemon assembleDebug   # 改 android/ 后真编译（环境见 build-and-run.md）
```

**「build 绿」不等于「能出包 / 能跑」**——批41 三条 P0 全是「闸门全绿而产物是坏的」（pitfalls §4）。改 `ios/`/`web/`/`android/` 务必跑对应那条。

E2E 运行方式、跑前四件环境检查、store 把手清单 → [测试指南](../guides/testing.md)；真机 logcat / 无头浏览器实测方法 → [调试指南](../guides/debugging.md)。

## 7. 文档地图

| 文件 | 用途 |
|---|---|
| [`../../AGENTS.md`](../../AGENTS.md) | 开发规范 + 铁律（接手先读 §4–§6） |
| [`../README.md`](../README.md) | 文档索引 + 项目指标 + 平台可用性 + P3 分解 |
| [`pitfalls.md`](pitfalls.md) | **踩坑实录**：按主题组织的根因案例 + 操作性参考（SDK 源码 / 自签名环境 / 视频素材） |
| [`progress.md`](progress.md) | 分批进展（批1–62）。**每批验收后必须更新** |
| [`bugs.md`](bugs.md) | 缺陷清单。**截至 2026-08-26 所有条目均已闭合**；新问题另起条目 |
| [`plans/upstream-issues.md`](plans/upstream-issues.md) | 已提交给 Lynx 官方的 issue；修复合入后移除 `patches/` 下对应 patch（当前 2 个） |
| [`../reference/back-navigation.md`](../reference/back-navigation.md) | 返回导航三层模型 + `consumable` 契约 |
| [`../reference/native-modules.md`](../reference/native-modules.md) | 原生模块契约速查（以契约闸门为准的可读版） |
| [`../archive/`](../archive/) | 归档：审计修复计划、Web 支持原始计划、迁移调研 + 订正表 |
