# 工作交接（2026-09-20 · Liquid Glass iOS26 重构 P0–P6）

> **2026-10-04 · songloft-org/songloft#493（代码与构建验证完成，待原生复验）**：补齐 Lynx Android 恢复前台 → 全局事件 → 插件 WebView `visibilitychange` 的通知链路，复用 MIoT 插件仓库的重连修复。已反向验证两项缺陷测试会失败；2026-10-04 18:53 启动的全量 **253 文件 / 2745 项测试**、类型检查、Lynx/Web 双产物构建与线程检查通过；新 bundle 同步后 Android `assembleDebug` 成功。当前 ADB 无连接设备，后台恢复行为待原生实测。iOS/HarmonyOS 宿主通知不在本批范围。详见 [progress.md](progress.md) 对应条目。

> **2026-10-02 · 弹窗布局统一修复（已完成，待原生复验）**：已检查全部 7 个直接弹窗组件及共享调用点，统一卡片宽度、单行按钮和长内容滚动；插件源改为上下分区，更新主操作独占一行，信息弹窗保留单个中性关闭按钮。2026-10-02 全量 **252 文件 / 2739 项测试**、类型检查和 Lynx/Web 双构建通过；浏览器完成 24 个中英/大字号/窄屏/宽屏布局状态及 7 个追加状态，源保存与警告关闭交互已验证。原生界面实测待补。详见 [progress.md](progress.md) 对应条目。

> **2026-10-02 · Android 通知栏歌词（已修复，待真机复验）**：已定位 `ca7a439` 漏改 Android 原生方法参数，导致 JS 双参数调用被 Lynx 拒绝；补齐 `inTitle` 桥接和标题/副标题 metadata 写入，并保留切歌后的用户偏好、恢复歌词空白段的歌曲信息。全量 2735 项 JS 测试、类型检查、双产物构建、APK 编译及 4 项 Android 元数据测试通过；旧行为的反向验证会失败。尚无连接的安卓设备，通知栏和后台实测待补。详见 [progress.md](progress.md) 对应条目。

> **2026-10-02 · songloft-org/songloft#489（已完成）**：已安装插件列表支持直接打开启用且有入口的插件；通过 `from=manager` 使插件页返回管理列表。实施阶段全量 2729 项测试通过；自审补齐更新期间的入口限制后，相关 99 项测试、类型检查与双产物构建通过。构建保留 3 条既有拖拽样式 `touch-action` 警告；原生设备/浏览器实测待补。改动与验证详见 [progress.md](progress.md) 对应日期条目。

> 本文件是**给接手 AI 的交接说明**，只回答三件事：现在在哪、还剩什么、怎么验证。**逐批交付细节一律不进本文件**——按日期倒序存放在 [progress.md](progress.md) 顶部，缺陷根因在 [bugs.md](bugs.md)，踩坑证据在 [pitfalls.md](pitfalls.md)。
>
> **读文档顺序**：① [AGENTS.md](../../AGENTS.md) §3–§6（铁律，必读）→ ② 本文 §3「剩余工作」→ ③ [pitfalls.md](pitfalls.md)（每条铁律背后的证据）。细节按需查 [progress.md](progress.md) 与 [bugs.md](bugs.md)。
>
> **未提交（工作树，本次 Liquid Glass P0–P6 批 · 2026-09-20）**：
>
> ① **Liquid Glass 重构 P0–P5（代码）**——`--glass-*` 全部重命名为 `--material-*`；`--glass-fill-strong` → `--material-fill-elevated`；静态质感重推（sheen/镜面/lensing）；新增底栏与分段控件「选中指示器流动动画」+ `--ease-spring-bounce`；四档材质模型闸门 `material-model.test.ts`；toast 保持实心。
>
> ② **P6（文档与归档）**——`DESIGN.md` 更新材质令牌体系、质感、动效说明；`AGENTS.md` §3.4 令牌重命名与新约束（`--material-glow-faint`、`--tint-fill`、`--quaternary-system-fill`、流动指示器、模糊层不动画、toast 实心）；`docs/architecture/lynx-constraints.md` 同步 `--material-*`；四份旧方案加 Superseded 标记；`progress.md` 追加 P0–P6 快照。
>
> **前一次未提交（工作树，文档批 · 2026-09-15）**：
>
> ① **文档与代码一致性整顿（方案 A）**——出发点是一批「文档在描述一个已经不存在的世界」的断言。**归档**：`docs/audit/`（含 `tasks/`、`results/`）→ `docs/archive/2026-09-01-codebase-audit/`；4 份已交付计划 → `docs/archive/plans/`；每份归档件头部写明冻结基线与现状权威位置。
>
> ② **订正的事实**（均以源码复核过，不是照抄旧文）：HarmonyOS **模块注册在 `pages/Index.ets`**（逐 LynxView），`EntryAbility.ets` 只接 HTTP service —— 这条同时修了 **AGENTS.md §4.1** 与 native-modules / native-development / build-and-run；Web 视频能力位 **false → true**（批73 起 `web/audio-host.js` 持有主线程 `<video>`）；能力位 **10 → 12**（补 `fastLogExport`、`backgroundKeepAlive`）；契约模块 **9 → 10**；e2e 场景 **33 → 34**（TEST_PLAN.md 同步）；iOS 部署目标误写 16.0 → **15.0**；`PACK_OVERRIDABLE_BASELINE` **11 → 17** token；`SongloftVideoActivity` 已删 → 返回导航/调试判据改为「`MainActivity` 在栈顶且不含独立 Activity」；`Uri.base.path` 是 **Dart 残留**（前端实为 `self.location.origin` + `deployMode` global prop）；`web:dev` 与 `build:web` **已是同一条命令**（旧文称两者静态资源目录不同）；Web 存储探测顺序 native → **IndexedDB** → localStorage → 内存；`AddProfileParams` **不存在**（`addProfile` 是内联对象类型且含 `username`/`password`）；「Muse 设计语言」已被 Apple 语义色取代（`tokens.css` 头注释即声明），README / docs 索引 / `src/index.tsx` 注释同步。
>
> ③ **缺陷迁移**：2026-09-01 审计里**仍开放的 4 条**（AUD-002/003/005/009）迁入 [bugs.md](bugs.md)。
>
> ④ **`android-video-fullscreen` 场景订正**：`e2e/scenarios/android-video-fullscreen.scenario.ts:127` 还在断言 `SongloftVideoActivity` 处于 resumed，而该 Activity 已被批73（`1cc08e0`）删除，真机跑必失败 —— 改为双向断言（画面挂在 `MainActivity` 内、且不得再出现独立 Activity）。
>
> **本轮未能验证的**：④ 只在静态层面复核（manifest 只剩 `MainActivity` 与 `platform.FilePickerActivity`，视频路径无 `startActivity`），**没有在设备上跑过** —— 本机 Android 验证通道不可用（SDK 无系统镜像、`~/.android/avd` 为空、`emulator` 包是半下载状态）。①②③ 是文档，由 `tsc -b` / `pnpm test`（2585 全绿）与链接可达性扫描兜底。
>
> **最近代码批次（细节见 [progress.md](progress.md) 顶部）**：**Liquid Glass iOS26 重构 P0–P5**（令牌重命名 `--material-*` + 静态质感 + 流动指示器动效 + 四档材质闸门 + toast 实心）· **批76 Web 鼠标拖拽修复**（`setPointerCapture`）· **批73 视频控制层上移 JS**（`1bccdf8`+`1cc08e0`+`4b850c5`+`aec01ea`）· **批74 歌曲编辑多歌手分行**（`d75c14a`）· **批75 平板曲库三列**（`36ae832`）· 附：CI 工作流 `dev-build.yml` → `dev-build-android.yml`（`6a374da`）。
>
> **上一段批次（细节见 [progress.md](progress.md)）**：批69–72 视频档 A/B/C；批64–68 UI/UX 评审 D1–D6（按压态、对比度开关、图标阻尼、无障碍名称、`--shadow-focus` 与孤儿样式表清理）；Apple HIG 11 阶段 + 玻璃材质六批。

---

## 1. 现在在哪、做到哪了

### 交付线（近期，按主题）

| 交付线 | 关键提交 | 说明 |
|---|---|---|
| **视频播放** | `ad8dd68` `517796b` `af5b1cf` `895aa97` `1bccdf8` `1cc08e0` `4b850c5` `aec01ea` | 档 A 纯 JS 入口 / 档 B iOS 生命周期 + `open` 三态原因 / 档 C Android 关闭按钮与删死事件 / **批73 控制层上移 JS：全屏只做播放**。档 D 未动 |
| **Apple HIG + 玻璃材质** | `4fff54c` `f311705` `3f03f15` `d71c431` `fa0314f` `a69272f` `af9cb15` `d2f23f5` `0def575` `0a17ceb` | 11 阶段全部完成；玻璃材质六批；reduce-motion 三端接通（iOS 原生信号 + Android 推送） |
| **Liquid Glass iOS26 重构 P0–P6** | （未提交） | `--glass-*` → `--material-*` 令牌重命名；静态质感重推（sheen/镜面/lensing）；流动指示器动效 + `--ease-spring-bounce`；四档材质闸门；toast 实心；文档与归档 |
| **UI/UX 评审 D1–D6** | `4fff54c` `f311705` `3f03f15` `d71c431` `b0f09ec` `00dde50` | 按压态、对比度开关、图标阻尼、无障碍名称、只报不改 spike、死令牌与孤儿样式表清理。**D2 经用户 2026-09-11 定案不做** |
| **曲库** | `f804df2` `8f90866` `dc8555e` `d75c14a` `36ae832` | UI/UX 系统优化、封面对齐、多歌手分行编辑、平板三列断点 |
| **首页 / 播放器** | `14545e6` `4d26fb3` `e6b40b7` `6372f14` `bf17197` | 封面播放按钮与宽屏 bento、全屏界面打磨、mini 条、队列分页补全 |
| **HarmonyOS 宿主** | `5f05619` `aac1a46` `a1ab8ca` `77e02e3` `8fac620` | webview 插件渲染、全屏布局与安全区、插件认证、DOM storage patch |
| **后台播放 / 通知** | `6abbca4` `7d153b9` `e7e0852` `3ad3504` | 通知栏暂停保持可见 + 退出按钮、停止按钮显示、通知归属断言订正 |

更早的交付线（批1–63，含文件夹浏览视图、Lynx 原生渲染插件、自定义标签、记住密码、后台播放稳定性诊断等）见 [progress.md](progress.md)。

### 闸门快照

| 闸门 | 结果 | 何时验的 |
|---|---|---|
| `pnpm test` | **2585 全绿 / 242 文件** | ✅ **2026-09-15**（本批复跑） |
| `pnpm exec tsc -b` | 绿 | ✅ **2026-09-15**（本批复跑） |
| `pnpm run build` | 绿（lynx 2354.7 kB + web 2466.3 kB 双产物均列出） | ✅ **2026-09-15**（本批复跑） |
| `pnpm run build:web` | 绿 | ✅ **2026-09-15**（本批复跑） |
| `gradlew assembleDebug` | 绿（仅历史 `args` 未用告警） | ✅ 2026-09-14（批72 改 `android/` 后重跑） |
| `xcodebuild -list` / `ios:build` | 可跑 / `BUILD SUCCEEDED` | ✅ 2026-09-14（批72 改 `ios/` 后重跑） |
| iOS 模拟器（视频 `open` 三态） | 3/3：无 item→`failed` / audio-only→`noTrack` / video→`opened` | ✅ 2026-09-14（批71 TestBridge） |
| Android 模拟器（关闭按钮 + 三态） | 空→`failed` / video→`opened` / tap ✕→`isOpen` false + 音频继续 | ✅ 2026-09-14（批72，`emulator-5554`） |
| Android 全屏视频（`1cc08e0` 之后） | **未跑** —— 本机已无 AVD / 系统镜像 |  待补 |
| HarmonyOS CI | GitHub Actions `dev-build-harmony.yml` | 有流水线；本地需 DevEco Studio |
| HarmonyOS 定向契约 | 相关 209 项 Vitest 全绿 | 2026-09-04；HAP / 真机待验 |
| Android e2e | 112 passed / 8 skipped (120) | **批49 时代（2026-08-16）** |
| iOS e2e | 110 passed / 10 skipped (120) | **批49 时代（2026-08-16）** |

> ⚠️ **e2e 与设备行为验证自批49 之后没有全量跑过**，而场景数已从 29 涨到 **34**。vitest 读不到 Xcode 工程、Gradle、hvigor 或真机行为——**接手后若要改原生或发包，先补跑一遍**。
>
> ⚠️ **本机目前跑不了 Android 设备验证**：`/opt/homebrew/share/android-commandlinetools` 下没有 `system-images`，`~/.android/avd` 为空，`emulator` 包只有一个半下载的 zip。要恢复这条通道需重新装 emulator + 系统镜像并建 AVD。

## 2. 铁律在哪

完整论述在 [AGENTS.md](../../AGENTS.md) §3（Lynx 与 Web 约束：realm 与平台判断 / 元素与 CSS / 覆盖层与列表 / 导航与返回）、§4（原生模块契约）、§5（验证契约与测试原则）、§6（工作流、文件与 Git）；**每条铁律背后的真实案例与实测数据在 [pitfalls.md](pitfalls.md)**。最致命的五条一句话版：

1. DOM 探测不是平台判断（Web 业务代码跑在 Worker 里，已踩三次）。
2. 原生方法不返回 Promise，强转即开屏崩。
3. 闸门只证明它真正读过的东西——「build 绿」不等于「能出包」。
4. 全局覆盖层必须挂在 root route 的 `ThemeProvider` 内。
5. 弹出层用自研 `PopoverMenu`/`PopoverPanel`，不要装回 `lynx-ui-popover`。

## 3. 剩余工作

**A. 开发**

1. **视频播放的收尾**（档 D 未动）：① 「视频歌在蜂窝下默认仍带视频轨、点视频歌直接全屏」这两个取舍未决策；② 更彻底的「在 `load` 阶段就把 HTTP 失败 reject」未做（影响三端媒体加载语义，未拍板）；③ `hls` 的真进度条 / 转码取消需要**后端仓库**把转码异步化。
2. **Lynxtron 桌面** —— P3 唯一未开始项，剩余最大单块能力。迁移调研里的桌面验收清单在 [`../archive/migration/lynx_migration_roadmap.md`](../archive/migration/lynx_migration_roadmap.md) L47–74，可直接拿来用。
3. **Android 全屏视频真机复核**：`1cc08e0` 把画面从独立 Activity 搬进 `MainActivity` 的视图树，此后没在设备上跑过（见 §1 快照）。同批订正的 `android-video-fullscreen` 场景也未跑过。

**B. 验证欠账（不写代码，但欠着）**

1. **e2e 全量复跑**（Android + iOS，34 个场景）——自批49 后未跑。
2. **原生改动的真机目视待验**：后台播放稳定性（AudioFocus / MEDIA_BUTTON / 通知栏点击）、悬浮歌词首次授权即显、HarmonyOS 图片 / SVG 渲染、**Issue #2 的通知看护**（HyperOS 连播到无歌词曲目）、Issue #3 的导出耗时改善（两端）、Issue #4 的 500 首队列开抽屉、Issue #7 冷启动直接落歌词页。
3. **HarmonyOS 三项 P1 修复**（音量二次除法 / 视频假能力 / DLNA 发现与控制）待 HAP 编译与真机验证，详见 [bugs.md](bugs.md)。
4. **待拍板的小项**：iOS 引擎的 `videoOutputAttached` 只被写、从不被读（`detachVideoOutput()` 因此没有实质副作用），清理还是接线未定。
5. **Web MV 产物**：`build:web` 闸门绿，但没有在真实浏览器里打开过（批73 改了主线程 `<video>` 表面）。

## 4. 已知缺陷

**完整清单与根因见 [bugs.md](bugs.md)**（开放项：HLS 绝对 https URI 自签名缺口、Android `open→isOpen` 竞态待复核、iOS 字体大小设置无效、HarmonyOS 三条、以及 2026-09-01 审计迁移过来的 AUD-002/003/005/009）。本文件只留两个需要**真机验收**的活跃 Issue 的验收判据：

### Issue #1：后台自动连播 stop intent（Android）

`ENDED → load next` 过渡上挂 2 秒单次 guard；服务解析 `EXTRA_KEY_EVENT`，只拦截 `KEYCODE_MEDIA_STOP` 且 guard 有效的 intent。**验收日志应包含** `mediaButtonKey=86`、`suppressed stale MEDIA_STOP during auto-advance`，且该事件之后**不能**再出现 `playback state changed state=IDLE`。已过 Kotlin 编译与定向 Vitest，**待真机连续后台播放确认**。

### Issue #2：后台播放通知栏偶现消失（Android）

`SongloftPlaybackService` 通知看护：`getActiveNotifications()` 读 id 1001 + channel 作判据，播放中每 10 秒一拍、抑制 stale MEDIA_STOP 时另排 400ms 快检查，缺失则经 media3 漏斗重发；判据不可用报「在」，连续 3 次盲发熔断，只在 `isPlaying` 为真时动作。**验收日志应出现** `media notification missing from the shade (reason=...)`，且通知栏在 0.4–10 秒内恢复；旁证 `dumpsys notification` 的 `channel=default_channel_id`。**待 HyperOS 真机连播到无歌词曲目确认**。

> 已闭合的两条历史结论（留此备查）：**Android HLS 电台落到 `ProgressiveMediaSource`** 已修（`isHlsPlaylistPath()` 剥 query 看扩展名）；**偶发全屏灰层**仅批29 一次、此后再未复现，按「无法复现」关闭（重开指引在 [bugs.md](bugs.md)）。

## 5. 明确不做（避免被当成缺陷重开）

键盘快捷键、HomeGridConfig、/configs KV 编辑器、完整 GPL 全文许可页、升级的版本选择 / 手动上传 / 回退、客户端下载页、Web 调试控制台、热更、桌面歌词独立窗口、深目录树虚拟化、Settings 主从九分类 IA、黑胶唱片环动画、**曲库视图默认可见集（D2，「不要改父仓库 `library_browse_setting.go` 的默认集」）**、「清空浏览器缓存」（部署层已根治，见 [Web 部署](../guides/web-deployment.md)）。

**视频播放的刻意边界**（2026-09-14 批73 后重新界定）：画面不在 Lynx 布局里，因此无法与歌词混排、也做不了 mini 小窗；全屏**只做播放**，输运（播放/暂停/进度）由 JS 在 Lynx 层自绘（`/player/video` 透明底 + 宿主 SurfaceView 当背板），原生不再提供播放控件；PiP 两端都不做；`avi/flv/mpg` 依赖服务端转码；mkv 里的 AC-3/DTS 音轨在很多 Android 设备上无授权。

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
| [`../../AGENTS.md`](../../AGENTS.md) | 开发规范 + 铁律（接手先读 §3–§6） |
| [`../README.md`](../README.md) | 文档索引（Diátaxis 分区导航 + 项目状态指向） |
| [`pitfalls.md`](pitfalls.md) | **踩坑实录**：按主题组织的根因案例 + 操作性参考（SDK 源码 / 自签名环境 / 视频素材） |
| [`progress.md`](progress.md) | 分批进展（顶部为倒序摘要日志）。**每批验收后必须更新** |
| [`bugs.md`](bugs.md) | 缺陷清单（含 2026-09-01 审计迁入的开放项）。新问题另起条目 |
| [`plans/upstream-issues.md`](plans/upstream-issues.md) | 已提交给 Lynx 官方的 issue；修复合入后移除 `patches/` 下对应 patch（当前 2 个） |
| [`../reference/native-modules.md`](../reference/native-modules.md) | 原生模块契约速查（以契约闸门为准的可读版） |
| [`../reference/back-navigation.md`](../reference/back-navigation.md) | 返回导航三层模型 + `consumable` 契约 |
| [`../archive/`](../archive/) | 归档：审计快照（2026-08-14 / 2026-09-01）、已交付的实施计划、迁移调研 + 订正表 |
