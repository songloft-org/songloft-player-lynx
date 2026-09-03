# 工作交接（2026-09-01 · 文件夹浏览视图）

> 本文件是**给接手 AI 的交接说明**，只回答三件事：现在在哪、还剩什么、怎么验证。
>
> **读文档顺序**：① [AGENTS.md](../../AGENTS.md) §4–§6（铁律，必读）→ ② 本文 §3「剩余工作」→ ③ [pitfalls.md](pitfalls.md)（踩坑实录：每条铁律背后的证据）。细节按需查 [progress.md](progress.md)（逐批交付）与 [bugs.md](bugs.md)（逐条缺陷根因）。
>
> **一句话现状**：Apple HIG 重构全部 11 阶段已提交；玻璃材质优化三批（批B 播放器页背景层 / 批C 伪玻璃精致化 / 批A `<blur-view>` 真背景模糊）已全部完成并提交，另有批A-fix 修掉 Web 上 `blur-view` 标签映射缺失导致的静默无效、批A-fix2 补齐批A 漏掉的 6 个弹窗并给 popover / 底部导航胶囊 / mini-player 加上面板模式模糊、批A-fix3 修掉全应用最后一个仍是不透明 `--paper` 的浮层（全局菜单）。**JS 侧闸门**：`tsc -b` 绿 / **2170 vitest 全绿（198 文件）** / build:web 绿 / Docker Chrome 运行时验证通过。近期重点：后台播放稳定性、Lynx 原生渲染插件、自定义标签、记住密码、HarmonyOS 宿主修复、文件夹浏览视图、**Apple HIG 重构（11 阶段）**。

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
| `pnpm test` | **2170 全绿 / 198 文件** | ✅ **2026-09-03**（HIG 全部 11 阶段 + 玻璃优化批B/批C/批A + 批A-fix + 批A-fix2 + 批A-fix3） |
| `pnpm exec tsc -b` | 绿 | 2026-09-03 |
| `pnpm run build` | 绿（main.lynx.bundle 2232.5 kB） | 2026-09-03 |
| `pnpm run build:web` | 绿（main.web.bundle 2286.1 kB）+ Docker Chrome 运行时 25/25 | 2026-09-03 |
| 新增 `tokens-hig.test.ts` | 6/6 绿 | 2026-09-02 |
| `gradlew assembleDebug` | 绿 | **批49 时代**，此后大量提交未复跑 |
| `ios:build` | `BUILD SUCCEEDED` | **批49 时代** |
| HarmonyOS CI | GitHub Actions `dev-build-harmony.yml` | 有流水线；本地需 DevEco Studio |
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

1. **Apple HIG UI 重构（11 阶段）** —— 按 `docs/project/plans/apple-hig-redesign.md` 分批推进。**Apple HIG 11 阶段全部完成并提交**（设计令牌/标准材质/导航/共享组件/播放器/曲库/歌单/设置/首页+杂项/动效/无障碍）。其后按用户反馈「玻璃材质和 Apple 官方应用差很多」做了三批玻璃材质优化（批B/批C/批A + 批A-fix + 批A-fix2 + 批A-fix3，见 `progress.md`）。**JS 侧闸门**：`tsc -b` 绿 / **2170 vitest 全绿（198 文件）** / build:web 绿 / Docker Chrome 运行时验证通过。
2. ~~**build 工具链修复**~~ —— **已修复**（`270f347`）。根因：`lyric-store.ts` 的 dynamic `import()` 改变 chunk 图导致 template-webpack-plugin 空 manifest 解构失败，改静态 import 解决。
3. **Lynxtron 桌面** —— P3 唯一未开始项，剩余最大单块能力（迁移调研里的桌面验收清单在 [`../archive/migration/lynx_migration_roadmap.md`](../archive/migration/lynx_migration_roadmap.md) L47–74，可直接拿来用）。
2. ~~**修复 14 个 failing test**（`full-player-responsive.test.tsx`，2026-08-31 复跑确认仍 14 失败）—— 近期 UI 改动导致断言不匹配。详见 [bugs.md](bugs.md)「待修复」。~~ —— **已修复**（2026-09-01 复跑全绿）。

**B. 验证欠账（不写代码，但欠着）**

3. **e2e + `gradlew assembleDebug` + `ios:build` 自批49 后没跑过**，中间大量提交、e2e 场景 33 个。见 §1 闸门快照的警示。
4. **近期原生改动的真机目视待验**：后台播放稳定性（AudioFocus / MEDIA_BUTTON / 通知栏点击）、悬浮歌词首次授权即显、HarmonyOS 图片/SVG 渲染。

## 4. 已知缺陷

开放缺陷（HLS 绝对 https URI 自签名缺口）已迁入 [`bugs.md`](bugs.md)「待修复」。下两条已于 2026-08-26 核实关闭，留此备查：

- **Android 上 HLS 电台落到 `ProgressiveMediaSource`** — 已修：`isHlsPlaylistPath()` 剥 query 看扩展名，Android/Web 同修，另修跨协议重定向被拒。
- **偶发全屏灰层** — 仅批29 那次偶发，此后再未复现，按「无法复现」关闭（重开指引在 [`bugs.md`](bugs.md)）。

### Issue #1：后台自动连播 stop intent（2026-08-31）

最新 Issue 附件 `songloft-logs-20260831-203401.zip` 的关键顺序：

`20:32:38.695 ENDED` → `20:32:38.793 load next` → `20:32:39.272 READY + playWhenReady=true` → `20:32:39.304 ACTION_MEDIA_BUTTON` → `20:32:39.312 IDLE`。

前一版 `1edd44b` 只在 `BUFFERING + playWhenReady` 时拦截，因此 stop intent 到达时已经漏掉。当前工作树的修复在 `ENDED -> load` 过渡上设置 2 秒单次 guard；服务解析 `EXTRA_KEY_EVENT`，只拦截 `KEYCODE_MEDIA_STOP` 且 guard 有效的 intent，其他媒体按键不受影响。guard 在显式 `stop()` / `release()` 清理。

已验证：`./gradlew --no-daemon compileDebugKotlin`、定向 Vitest 2/2、`pnpm exec tsc -b --force`。尚未验证：新 APK 真机后台连续播放。验收日志应包含 `mediaButtonKey=86`、`suppressed stale MEDIA_STOP during auto-advance`，且该事件后不能有 `playback state changed state=IDLE`。

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
| [`plans/upstream-issues.md`](plans/upstream-issues.md) | 已提交给 Lynx 官方的 issue；修复合入后移除 `patches/` 下对应 patch（当前 2 个） |
| [`../reference/back-navigation.md`](../reference/back-navigation.md) | 返回导航三层模型 + `consumable` 契约 |
| [`../reference/native-modules.md`](../reference/native-modules.md) | 原生模块契约速查（以契约闸门为准的可读版） |
| [`../archive/`](../archive/) | 归档：审计修复计划、Web 支持原始计划、迁移调研 + 订正表 |
