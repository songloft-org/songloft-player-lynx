# 工作交接（2026-09-07 · Issue #4 队列抽屉虚拟化，未提交）

> 本文件是**给接手 AI 的交接说明**，只回答三件事：现在在哪、还剩什么、怎么验证。
>
> **读文档顺序**：① [AGENTS.md](../../AGENTS.md) §4–§6（铁律，必读）→ ② 本文 §3「剩余工作」→ ③ [pitfalls.md](pitfalls.md)（踩坑实录：每条铁律背后的证据）。细节按需查 [progress.md](progress.md)（逐批交付）与 [bugs.md](bugs.md)（逐条缺陷根因）。
>
> **最新代码批次（`b08ae1a`、`54233ac`、`40e7cf9`）**：HarmonyOS 三个 P1 已完成代码修复：音量删除二次 `/ 100`；删除恒失败的 `SongloftVideo` 占位注册，让能力位诚实返回 `false`；DLNA 持久保存发现结果、解析 AVTransport `controlUrl` 并按设备 id 控制。相关 209 项 Vitest、`tsc -b`、Lynx/Web 双环境 build 均通过。本机无 hvigor/DevEco，发包前必须补 HarmonyOS HAP 编译；音量与 DLNA 仍需真机验证。全套测试的剩余失败由既有 Android CRLF 工作树改动与 `/mnt/d` 默认超时造成，证据见 [progress.md](progress.md) 最新条目。
>
> **未提交的工作树改动（Issue #4 · 播放列表歌曲很多时打开卡死）**：`PlaylistDrawer` 从 `SortableRoot`（ScrollView 全量挂载，每行一个主线程 DraggableRoot + 拖拽 overlay）改为项目既有 `VirtualList`（原生 `<list>`）；按用户决定（方案 A）移除队列内拖拽排序，级联删除 store `reorderPlaylist`、`queue.ts` `moveItem`/`indexAfterMove`/`reorder`、8 个对应用例、mock 行与死 CSS —— 共 7 个代码文件 + 3 个项目文档。已过 `tsc -b --force`、`pnpm test` **2285 全绿（212 文件，重写的 drawer 测试反向验证 6/6 全咬）**、`pnpm run build` 双产物（lynx 2251.9 kB、web 2344.8 kB）、`build:web`；Docker Chrome 500 首队列同一脚本 A/B：打开 **6246ms → 387ms**、节点 **13017 → 5513**、帧延迟 1ms、滚动/点击播放/console 全干净。**接手要补的**：三端真机验证（Issue 报告者平台未知；web-core `<list>` 不虚拟化尚且 16× 快，原生虚拟化结构性更优）；若恢复拖拽排序，从 git 历史找回 `moveItem`/`reorder`（`queue.ts` 头注有 duplicate-song pinning 算术的说明）。上一批 Issue #3（导出日志下移原生）已提交为 `1cf992f`。
>
> **一句话现状**：Apple HIG 重构全部 11 阶段已提交；玻璃材质优化三批（批B 播放器页背景层 / 批C 伪玻璃精致化 / 批A `<blur-view>` 真背景模糊）已全部完成并提交，另有批A-fix 修掉 Web 上 `blur-view` 标签映射缺失导致的静默无效、批A-fix2 补齐批A 漏掉的 6 个弹窗并给 popover / 底部导航胶囊 / mini-player 加上面板模式模糊、批A-fix3 修掉全应用最后一个仍是不透明 `--paper` 的浮层（全局菜单），并把面板模式清单改为从表面反推而非手写。最新一批按用户决定把 **HIG 44px 触控目标全量落地**（24 个控件直接放大 + 5 个圆片用 `__*-hit` 包裹层只撑命中盒不改绘制），同步修掉 `CARD_CHROME_PX` 与弹窗按钮高度的耦合（AGENTS.md 警告的「卡片钳制与 body 钳制不自洽」），并把 `a11y-tap-target.test.ts` 从手写模式改为按用法反推。随后按用户报障修掉**玻璃面板里的列表行背景**（`.song-row` 的 `background-color: var(--canvas)` 在播放历史面板上盖掉整片玻璃，顺带盖掉歌单详情的整行选中高亮），并把「面板内可达元素不许有无界不透明填充」写成从用法反推的闸门（复查确认播放列表面板无此问题）。接着按用户决定（「符合 Apple HIG 设计规范就行」）修掉**玻璃上的行状态填充**：`.drawer__row--active` / `.popover-menu__item--selected` 的满幅不透明板改为 accent wash `--primary-faint`，两个看不见的多选高亮（`--paper` 叠 `--canvas`，比值 1.04/1.07）同改；新增中性通道 `--fill-faint` 收走插件弹窗 6 处内嵌块与 mini-player 进度槽（后者此前用分隔线令牌 `--line` 当背景）；并把 wash 在暗色下提亮表面带来的三级文字缺口一起付掉（被 wash 行的元数据抬到 `--content-2`，light `--content-2` 加深到 `#67676f`）。**JS 侧闸门**：`tsc -b` 绿 / **2201 vitest 全绿（198 文件）** / build:web 绿 / Docker Chrome 运行时验证通过。近期重点：后台播放稳定性、Lynx 原生渲染插件、自定义标签、记住密码、HarmonyOS 宿主修复、文件夹浏览视图、**Apple HIG 重构（11 阶段）**。

---

## 1. 现在在哪、做到哪了

### 已提交

**文件夹浏览视图已推送**（`908448e` feat + `5c481c3` fix，2026-09-01）。

**批63 后提交**按主题组织（含文件夹浏览视图）：

| 交付线 | 关键提交 | 说明 |
|---|---|---|
| **文件夹浏览视图** | `908448e`、`5c481c3` | 曲库新增文件夹浏览视图（songloft#430）：目录层级下钻、网格/列表切换、搜索、播放全部、根目录文件夹+歌曲混合显示 |
| **后台播放稳定性** | `6e67cb9`、`1edd44b`、`5cd5687` | Android 后台切歌 AudioFocus 竞争修复 · 自动连播拦截系统 MEDIA_BUTTON stop intent · 通知栏点击打开播放器页面 |
| **后台播放诊断** | `1089235`、`693ea24` | `ClientFileLog` 追踪 ExoPlayer/MediaSession/AudioFocus 事件；media3 升级 1.6.0 |
| **Lynx 原生渲染插件** | `4f0060b` | JS 插件 `renderEngine: "lynx"` 选项，`<frame>` 子页面原生渲染。父子通信走 `SongloftPluginBridge`（三端）。`demo-frame-plugin/` 演示工程 |
| **自定义标签** | `11f37da`、`116bb60` | 标签管理 CRUD + 歌曲关联。歌单转标签迁移至 tagger 插件 |
| **记住密码** | `a78d023`、`e51801a`、`28c821e` | secure 存储 + 登出停播 + 密码框不预填 dev 默认 |
| **悬浮歌词改进** | `da889ec` | 首次授权返回后立即显示，无需关-开 |
| **通知栏修复** | `49a66de`、`72e8d0f` | FGS 占位通知顶掉播放器控件 · 歌词链路诊断 + 残留修复 |
| **歌词滚动** | `a1665e0` | 改用命令式 `invoke('scrollIntoView')` 统一两端（属性式在 Web 上 no-op） |
| **诊断日志全平台** | `81be80d` | iOS/鸿蒙 `ClientFileLog` 补齐 + 鸿蒙日志导出 |
| **底部面板高度** | `6e79ea5` | 播放队列/睡眠定时器面板改固定高度（修 shrink-to-fit 塌陷） |
| **HarmonyOS 修复** | `ddc6339`、`8fce004` | ArkTS 编译错误 + 图片/SVG 资源渲染 |
| **Android 自动连播** | `06c9233` | 歌曲播完后 ExoPlayer 未推进到下一首 |

> handoff 之后另有 2 个 docs 提交（`1f02383` 文档全量更新、`92c67cb` docs 目录整理），代码无变更。

历史交付线（批41–63）见 [`progress.md`](progress.md)。

### 闸门快照

| 闸门 | 结果 | 何时验的 |
|---|---|---|
| `pnpm test` | **2285 全绿 / 212 文件** | ✅ **2026-09-07**（Issue #4 队列抽屉虚拟化；此前 Issue #3 为 2289，本批删除 8 个 reorder 用例） |
| `pnpm exec tsc -b` | 绿（`--force` 全量重建） | 2026-09-07 |
| `pnpm run build` | 绿（main.lynx.bundle 2251.9 kB） | 2026-09-07 |
| `pnpm run build:web` | 绿（main.web.bundle 2344.8 kB）+ Docker Chrome 运行时 500 首队列 A/B | 2026-09-07 |
| 新增 `tokens-hig.test.ts` | 6/6 绿 | 2026-09-02 |
| `gradlew assembleDebug` | 绿 | ✅ **2026-09-06**（Issue #3，`compileDebugKotlin` 实际执行） |
| `xcodebuild` / hvigor（HAP） | **未验** | 本机是 Linux，无 Xcode、无 DevEco；iOS 与 HarmonyOS 的原生改动只有契约与结构闸门覆盖 |
| `ios:build` | `BUILD SUCCEEDED` | **批49 时代** |
| HarmonyOS CI | GitHub Actions `dev-build-harmony.yml` | 有流水线；本地需 DevEco Studio |
| HarmonyOS 本批定向契约 | 相关 209 项 Vitest 全绿 | 2026-09-04；HAP / 真机待验 |
| Android e2e | 112 passed / 8 skipped (120) | **批49 时代（2026-08-16）** |
| iOS e2e | 110 passed / 10 skipped (120) | **批49 时代（2026-08-16）** |

> ⚠️ ~~14 个 failing test 全在 `full-player-responsive.test.tsx`~~ —— **已修复**（2026-09-01 复跑 2039/2039 全绿，含文件夹浏览视图新增测试）。详见 [bugs.md](bugs.md)。
>
> ⚠️ **e2e 与原生构建自批49 之后没有全量跑过**。**接手后若要改原生或发包，先补跑一遍**——vitest 读不到 Xcode 工程、Gradle、hvigor 或真机行为。

## 2. 铁律在哪

完整论述在 [AGENTS.md](../../AGENTS.md) §4（Lynx 约束：平台判断 / Web 平台 / 锚定弹出层 / 全局覆盖层 / 底部导航胶囊 / 返回导航）、§5（原生模块调用约定）、§6（测试与闸门原则）；**每条铁律背后的真实案例与实测数据在 [pitfalls.md](pitfalls.md)**。最致命的五条一句话版：

1. DOM 探测不是平台判断（Web 业务代码跑在 Worker 里，已踩三次）。
2. 原生方法不返回 Promise，强转即开屏崩。
3. 闸门只证明它真正读过的东西——「build 绿」不等于「能出包」。
4. 全局覆盖层必须挂在 root route 的 `ThemeProvider` 内。
5. 弹出层用自研 `PopoverMenu`/`PopoverPanel`，不要装回 `lynx-ui-popover`。

## 3. 剩余工作

**A. 开发**

1. **Apple HIG UI 重构（11 阶段）** —— 按 `docs/project/plans/apple-hig-redesign.md` 分批推进。**Apple HIG 11 阶段全部完成并提交**（设计令牌/标准材质/导航/共享组件/播放器/曲库/歌单/设置/首页+杂项/动效/无障碍）。其后按用户反馈「玻璃材质和 Apple 官方应用差很多」做了三批玻璃材质优化（批B/批C/批A + 批A-fix + 批A-fix2 + 批A-fix3 + 全局复查，见 `progress.md`），随后按用户决定把 §11.2 的 44px 触控目标全量落地（31 个欠尺寸控件），随后修掉玻璃面板里的不透明列表行，最新一批按 HIG 修掉**玻璃上的行状态填充**并新增中性填充通道 `--fill-faint`（见 `progress.md` 最新一批）。**JS 侧闸门**：`tsc -b` 绿 / **2201 vitest 全绿（198 文件）** / build:web 绿 / Docker Chrome 运行时验证通过。
2. ~~**build 工具链修复**~~ —— **已修复**（`270f347`）。根因：`lyric-store.ts` 的 dynamic `import()` 改变 chunk 图导致 template-webpack-plugin 空 manifest 解构失败，改静态 import 解决。
3. **Lynxtron 桌面** —— P3 唯一未开始项，剩余最大单块能力（迁移调研里的桌面验收清单在 [`../archive/migration/lynx_migration_roadmap.md`](../archive/migration/lynx_migration_roadmap.md) L47–74，可直接拿来用）。
2. ~~**修复 14 个 failing test**（`full-player-responsive.test.tsx`，2026-08-31 复跑确认仍 14 失败）—— 近期 UI 改动导致断言不匹配。详见 [bugs.md](bugs.md)「待修复」。~~ —— **已修复**（2026-09-01 复跑全绿）。

**B. 验证欠账（不写代码，但欠着）**

3. **e2e + `gradlew assembleDebug` + `ios:build` 自批49 后没跑过**，中间大量提交、e2e 场景 33 个。见 §1 闸门快照的警示。
4. **近期原生改动的真机目视待验**：后台播放稳定性（AudioFocus / MEDIA_BUTTON / 通知栏点击）、悬浮歌词首次授权即显、HarmonyOS 图片/SVG 渲染、**Issue #2 的通知看护**（HyperOS 连播到无歌词曲目，见 §4「Issue #2」）。

## 4. 已知缺陷

开放缺陷（HLS 绝对 https URI 自签名缺口）已迁入 [`bugs.md`](bugs.md)「待修复」。下两条已于 2026-08-26 核实关闭，留此备查：

- **Android 上 HLS 电台落到 `ProgressiveMediaSource`** — 已修：`isHlsPlaylistPath()` 剥 query 看扩展名，Android/Web 同修，另修跨协议重定向被拒。
- **偶发全屏灰层** — 仅批29 那次偶发，此后再未复现，按「无法复现」关闭（重开指引在 [`bugs.md`](bugs.md)）。

### Issue #1：后台自动连播 stop intent（2026-08-31）

最新 Issue 附件 `songloft-logs-20260831-203401.zip` 的关键顺序：

`20:32:38.695 ENDED` → `20:32:38.793 load next` → `20:32:39.272 READY + playWhenReady=true` → `20:32:39.304 ACTION_MEDIA_BUTTON` → `20:32:39.312 IDLE`。

前一版 `1edd44b` 只在 `BUFFERING + playWhenReady` 时拦截，因此 stop intent 到达时已经漏掉。当前工作树的修复在 `ENDED -> load` 过渡上设置 2 秒单次 guard；服务解析 `EXTRA_KEY_EVENT`，只拦截 `KEYCODE_MEDIA_STOP` 且 guard 有效的 intent，其他媒体按键不受影响。guard 在显式 `stop()` / `release()` 清理。

已验证：`./gradlew --no-daemon compileDebugKotlin`、定向 Vitest 2/2、`pnpm exec tsc -b --force`。尚未验证：新 APK 真机后台连续播放。验收日志应包含 `mediaButtonKey=86`、`suppressed stale MEDIA_STOP during auto-advance`，且该事件后不能有 `playback state changed state=IDLE`。

### 共享 JSX 扫描器吞标签（2026-09-06 已修）

`shared/testing/jsx-classes.ts` 的 `openingTags` 跟踪引号状态却不认 JSX 注释：标签属性之间的 `/* … */` 里只要有一个撇号（`SongInfoDialog.tsx` 的 `the stylesheet's calc/vh`），引号状态就翻转，后面整片标签被吞进同一个「开标签」。全库 187 个 TSX 里 **45 个的标签边界是错的**。

已改为注释感知，并且把注释段从返回的标签文本里**抹掉**（否则注释里写的类名与 `bindtap` 会被当成真实用法——`BackdropBlur.tsx` 就有一个这样的幽灵类）。新增 `src/shared/testing/__tests__/jsx-classes.test.ts` 10 条（这个解析器此前没有任何直接单测），6 个变异反向验证会红；`text-clamp` 那段本地剥注释已删，改读共享实现。

**订正一条我先前写错并已推送的判断**：那时写成「a11y 44px 与玻璃面板两个闸门同样失明」。量化后不是——`fileClasses` 整文件求并集、a11y 的 `direct` 判定跑在合并后的 blob 上，两者都丢不掉类；实测 `handler` 桶 255 → 211、`viaProp` 31 → 35、**修复后零新增**，即它们此前是清单过宽/归属错（偏严），没有被这个通道藏住的真实缺陷。真正失明的是按标签元素类型过滤的 `text-clamp`。详见 pitfalls §6。

### Issue #2：后台播放通知栏偶现消失（2026-09-06）

Issue 附件 `songloft-logs-20260903-083706.zip` 的关键顺序：

`08:34:28.351 ENDED` → `.412 released the foreground slot` → `.519 placeholder foreground started` → `.545 owns the foreground slot`（真卡片重发）→ `08:34:29.181 mediaButtonKey=86` + `suppressed stale MEDIA_STOP`。

media3 通知的 deleteIntent 只在通知真的离开通知栏时才发，而它晚于 `.545` ⇒ 被 HyperOS 清掉的是刚重发的那张卡片。守卫保住了播放，但 `mediaNotificationOwnsSlot` 与 media3 的 `startedInForeground` 都还记着「已发出」，此前没有任何一处校验通知是否还在 ⇒ 无人重发；下一首无歌词、不产生 metadata 变化，通知栏空了 77 秒。

当前工作树的修复：`SongloftPlaybackService` 通知看护——`getActiveNotifications()` 读 id 1001 + channel 作判据，播放中每 10 秒一拍、抑制 stale MEDIA_STOP 时另排 400ms 快检查，缺失则 `onUpdateNotification(session, true)` 经 media3 漏斗重发；判据不可用报「在」，连续 3 次盲发熔断，只在 `isPlaying` 为真时动作。

已验证：`pnpm test` 2243 项、`./gradlew --no-daemon assembleDebug`、闸门 14 条 + 变异 9/9。尚未验证：HyperOS 真机。验收日志应出现 `media notification missing from the shade (reason=...)` 且通知栏在 0.4–10 秒内恢复；旁证 `dumpsys notification` 的 `channel=default_channel_id`。

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
# HarmonyOS: DevEco Studio 中 Build > Build Hap(s)/APP(s)   # 改 harmony/ 后真编译
```

**「build 绿」不等于「能出包 / 能跑」**——批41 三条 P0 全是「闸门全绿而产物是坏的」（pitfalls §4）。改 `ios/`/`web/`/`android/`/`harmony/` 务必跑对应那条。

E2E 运行方式、跑前四件环境检查、store 把手清单 → [测试指南](../guides/testing.md)；真机 logcat / 无头浏览器实测方法 → [调试指南](../guides/debugging.md)。

## 7. 文档地图

| 文件 | 用途 |
|---|---|
| [`../../AGENTS.md`](../../AGENTS.md) | 开发规范 + 铁律（接手先读 §4–§6） |
| [`../README.md`](../README.md) | 文档索引 + 项目指标 + 平台可用性 + P3 分解 |
| [`pitfalls.md`](pitfalls.md) | **踩坑实录**：按主题组织的根因案例 + 操作性参考（SDK 源码 / 自签名环境 / 视频素材） |
| [`progress.md`](progress.md) | 分批进展（批1–63+）。**每批验收后必须更新** |
| [`bugs.md`](bugs.md) | 缺陷清单。新问题另起条目 |
| [`../audit/Report.md`](../audit/Report.md) | 2026-09-01 基线的历史代码审计快照；结论需结合后续提交重新核验 |
| [`plans/upstream-issues.md`](plans/upstream-issues.md) | 已提交给 Lynx 官方的 issue；修复合入后移除 `patches/` 下对应 patch（当前 2 个） |
| [`../reference/back-navigation.md`](../reference/back-navigation.md) | 返回导航三层模型 + `consumable` 契约 |
| [`../reference/native-modules.md`](../reference/native-modules.md) | 原生模块契约速查（以契约闸门为准的可读版） |
| [`../archive/`](../archive/) | 归档：审计修复计划、Web 支持原始计划、迁移调研 + 订正表 |
