# Songloft Player：Flutter → Lynx 迁移路线图

> 本文档为迁移调研第 4 篇。分阶段路线，每阶段给出目标、范围、**可验证的退出判据**、以及「不通过则回退」的决策点。总览见 [lynx_migration_overview.md](./lynx_migration_overview.md)，能力对照见 [lynx_capability_matrix.md](./lynx_capability_matrix.md)，原生模块见 [lynx_native_modules_spec.md](./lynx_native_modules_spec.md)。
>
> **原则**：路线以 P0 技术验证闸门开局，**不预先承诺全量迁移**；每个决策点明确「通过则进入下阶段 / 不通过则回退或止损」。
>
> **确定性标注**（详见 [overview](./lynx_migration_overview.md) 头部）：`✅代码` / `✅官方` / `⚠️待核实` / `💭`。本文档的行数与规模为 `✅代码`（实测）；阶段划分、退出判据阈值、工作量档位均为 `💭 建议值`，须团队校准，非承诺。

---

## P0 · 技术验证（不承诺全量迁移）

**目标**：用最小闭环验证 Lynx 迁移的三大不确定性——音频、桌面宿主、核心 UI/数据流——是否成立。

**范围**：

1. **Android `SongloftAudio` 最小闭环**：网络流播放 + 后台播放 + 通知栏控制 + 进度事件。
2. **核心页面链路**：登录 + 歌曲列表（`<list>` 分页）+ 播放页。
3. **桌面 Lynxtron 预览版验证**：`npm create @lynx-js/lynxtron` 起工程 → `LynxWindow` 加载 bundle → 跑通登录/列表/播放页 → 用主进程 Node.js 网络能力跑通请求（含代理/自签证书）→ `SongloftAudio` 以 Node 原生模块或 Lynx 原生能力库接入并经 `bridge`+`sendGlobalEvent` 打通播放/进度 → `@lynx-js/lynxtron-builder` 产出可安装包。
4. **桌面元素覆盖清点**：在真实播放/列表界面上清点 clay 桌面 primitive 元素/属性缺口（官方定性「覆盖增长中」，具体缺口 `⚠️待核实`，勿用未证实的「~73%」数字），确认无阻断性缺失。（可用已装的 `lynx-check-css-support` skill 按 clay 后端 + Lynx 版本预查我们要用的 CSS 属性）
5. **前端栈 spike**：TanStack Router（memory + file-based）跑通页面跳转 + `beforeLoad` 鉴权守卫；TanStack Query 在 no-op `focusManager`/`onlineManager` 后跑通列表分页缓存/失效；lynx-ui 关键组件（Button/List/Dialog 等）在 Android + Web 各渲染确认可用。

**退出判据（可验证）**：

- [ ] Android 音频最小闭环稳定运行 ≥ 30 分钟无中断，锁屏/通知栏控制生效，进度事件延迟可接受。
- [ ] 登录 → 列表分页 → 播放页在 Android + 一个桌面端 + Web 三端跑通。
- [ ] Lynxtron 预览版能起 `LynxWindow`、网络请求（含代理/自签证书）与音频桥接均通，可产出安装包。
- [ ] 桌面元素属性清点无阻断性缺失（或缺失有明确 workaround）。
- [ ] 前端栈 spike 通过：TanStack Router 鉴权守卫 + 跳转可用；TanStack Query no-op 集成可用；lynx-ui 关键组件在 Android + Web 可渲染。

**决策点**：

- ✅ 全部通过 → 进入 P1。
- ⚠️ 桌面 Lynxtron 预览版不达标但其余通过 → 桌面回退自建 C++/CMake 宿主完成同等验证；仍不通过则桌面暂缓，先推进 Web + 移动端。
- ❌ 音频或核心链路不成立 → **终止迁移**，仅保留 Web/移动端局部试点，Flutter 版继续。

### P0 桌面 clay 元素实测验收清单（对应 R2；能力矩阵 §8 逐项落地）

> 为什么需要：`lynx-api-docs` 元素文档的平台矩阵**无 Desktop/clay 列**，元素/属性在桌面的可用性**只能实测**。以下每项须在 **macOS + Windows 两端**（Lynxtron 预览版）各验一次。判定：✅ 可用 / ⚠️ 有缺陷但有 workaround / ❌ 阻断（进风险登记并评估回退）。

**元素渲染与交互**
- [ ] `<list>`：1000+ 项虚拟滚动不掉帧；`bindscrolltolower` 触发分页加载；`scroll-into-view` 定位生效；给定高度下正常测量。
- [ ] `<scroll-view>`：`scrollTo/scrollBy` 生效；边缘事件（`bindscrolltolower/upper`）在桌面触发。
- [ ] `<image>`：`mode` 四种拟合（scaleToFill/aspectFit/aspectFill/center）正确；`placeholder` 生效；封面加载/缓存正常；预取属性行为（若桌面无则记缺口）。
- [ ] `<text>`：`text-maxline` 截断/省略号在桌面生效；字体/字重/行高渲染正常。
- [ ] `<blur-view>`：`blur-radius` 在 macOS/Windows 是否真正渲染毛玻璃（**重点存疑项**）；不可用则回退「`<image>`+`filter: blur()`」或 Lynxtron macOS `vibrancy`。
- [ ] `<overlay>`：播放 sheet / 歌词浮层能弹出；`events-pass-through` / `mode` 行为符合预期。
- [ ] `<viewpager>`：分页/轮播切换与 `selectTab` 生效（若用于播放页横滑）。
- [ ] `<webview>`：`@lynx-js/cef-webview` 在桌面加载页面成功（`initialize()` 后）；jsplugin 页可承载。
- [ ] `<input>`/`<textarea>`：搜索/表单输入、`maxlength`、焦点/键盘行为在桌面正常。
- [ ] `<svg>`：`src`/`content` 渲染；确认桌面所需图标集在 17 标签/40+ 属性范围内。

**CSS workaround 实测（css-defines 已确认属性支持，但组合效果需眼看）**
- [ ] 毛玻璃：`<blur-view>` 或 `filter: blur()` 叠层方案在桌面观感达标。
- [ ] 专辑取色背景：`conic/linear/radial-gradient` + 动态色在桌面渲染正常。
- [ ] 转场动画：`transform` + `transition` / `@lynx-js/motion` 在桌面帧率达标。
- [ ] 响应式：`bindlayoutchange` 断点切换在桌面窗口缩放时正确触发。

**桌面窗口/系统（Lynxtron）**
- [ ] 多窗口歌词：第二个 `LynxWindow` 能开、`sendGlobalEvent` 歌词推送生效。
- [ ] 无边框/自定义标题栏：`-x-app-region: drag` + `<title-bar-view>` 生效。
- [ ] 托盘/单实例：`Tray` 显示、Node 主进程单实例锁生效。

> 清单为 `💭 建议检查点`，团队可据实际 UI 增删；任一 ❌ 项进 R2/相关风险并触发决策点评估。

---

## P1 · 基础设施

**目标**：五端可运行的工程骨架 + 通用能力。

**范围**：

- **五端宿主工程**：Android / iOS（自建宿主或 Sparkling）、macOS / Windows（Lynxtron，`lynxtron-builder` 打包；兜底才回退自建 C++ 宿主）、Web（`<lynx-view>` 宿主页，对齐现有 embedded 子路径部署模型）。
- **CI 产物矩阵**：含 Lynxtron 桌面 `lynxtron-builder` 打包/签名/公证/分发流程、原生模块 `@lynx-js/lynxtron-rebuild` ABI 兼容、移动端 Autolink 产物。
- **网络与鉴权**：fetch 封装 + TanStack Query + JWT 双 Token 拦截层（桌面走 Node 网络）。
- **存储**：`SongloftStorage` 三端形态落地。
- **i18n**：`.arb` → i18next JSON 转换脚本 + i18next 接入。
- **主题与响应式**：LUNA tokens + `rpx`/CSS 变量 + `bindlayoutchange` 断点（是否配 main-thread script 视性能定）。
- **路由骨架**：react-router memory router。

**退出判据**：五端均能启动到「已登录空壳主界面」，语言切换、主题、断点、网络鉴权可用；CI 能产出五端安装/部署产物。

**决策点**：产物矩阵或某端宿主不通过 → 该端延后，不阻塞其余端进入 P2。

---

## P2 · 核心业务

**目标**：按依赖顺序迁移核心 feature。

**顺序与规模**（行数为现有 Flutter 实测，作为工作量输入）：

| 顺序 | feature | 现有行数 | 档位 | 备注 |
|---|---|---|---|---|
| 1 | auth | 1,261 | M | 依赖 P1 鉴权层 |
| 2 | library | 5,178 | L | 依赖 `<list>` |
| 3 | player | 13,093 | XL | 依赖 `SongloftAudio`（P0 已验证） |
| 4 | playlist | 5,685 | L | |
| 5 | home | 5,329 | L | |
| 6 | settings | 16,134 | XL | 体量最大，含大量偏好项 |

**退出判据**：上述 6 feature 在移动端 + Web + 桌面达到功能对等（核心路径），关键回归用例通过。

**决策点**：单 feature 迁移后若发现 Lynx 能力硬缺口，回到能力矩阵登记为待决项并评估 workaround。

---

## P3 · 平台特性与长尾

**目标**：迁移平台专属与长尾能力。

**范围**：均衡器、歌词（含 Android 悬浮歌词 / 桌面多窗口歌词）、iOS Live Activity、home widget、桌面托盘与多窗口、DLNA（`dlna` 715 行）、jsplugin（3,918 行，含 Web iframe 分支）。

**退出判据**：各平台特性在其目标端可用；jsplugin 在原生端（`<webview>`）与 Web 端（iframe）均可加载插件页。

**决策点**：Web 端 jsplugin/代理类能力若确认不可行，产品侧确认降级或 Web 端功能收敛。

---

## P4 · 双轨发布与下线

**目标**：Lynx 版与 Flutter 版并轨，最终收敛。

**范围**：

- **灰度策略**：按渠道/比例灰度 Lynx 版。
- **版本与渠道口径**：对齐现有 dev/stable 渠道。
- **热更新流程**：**Lynx bundle 热更新替代 `flutter_patcher`** 的新发布流程（含后端热更与 bundle 热更的协调，见 [lynx_native_modules_spec.md](./lynx_native_modules_spec.md#3-songloftbackend)）。
- **Flutter 版收敛**：明确 Flutter 版收敛为 **Linux-only 维护分支**的时间点与判据（见 [lynx_migration_overview.md](./lynx_migration_overview.md#3-linux-版处置方案)）。

**退出判据**：Lynx 版在全部 5 端达到 stable 发布质量，热更流程验证通过，Flutter 版正式收敛为 Linux-only。

**决策点**：灰度期关键指标（崩溃率、留存、播放成功率）劣化超阈值 → 回滚灰度，定位后重试。

---

## 风险登记

| # | 风险 | 等级 | 缓解 / 归属 |
|---|---|---|---|
| R1 | **Lynxtron 预览版成熟度**：已有开发版但正式版仍「Coming soon」，含正式发布时点、API 稳定性（`/next/` canary 可能变动）、`lynxtron-builder` 签名/公证/分发链路、`lynxtron-rebuild` ABI 兼容完备度 | 🔴 | P0 在预览版跑通最小闭环 + 全程保留自建 C++/CMake 宿主兜底 |
| R2 | **桌面 clay 覆盖**：CSS 属性轴**已核实无阻断**（css-defines@0.0.16，clay_macos/windows@4.0 我们所需属性几乎全 1.0，仅 backdrop-filter/object-fit 非 CSS 属性、有 workaround）`✅官方`；剩余=**element/元素属性轴**——`lynx-api-docs` 元素文档平台矩阵**无 Desktop/clay 列**，无文档可查 `⚠️待核实（须实测）` | 🟡（原 🔴 下调） | **P0 真机(clay)实测是唯一路径**：把速查表（能力矩阵 §8）中的元素逐个在 macOS/Windows 跑一遍确认 |
| R3 | **Web 无 `<webview>`**：jsplugin 须走 iframe，能力对齐待评估 | 🔴 | P3；能力矩阵 §5/§7 待决项 |
| R4 | **无 Linux**：Linux 版不迁移 | 🟢 | overview §3 处置方案（已定） |
| R5 | **音频后台播放各端策略差异**（尤其 iOS 后台会话与 Android 厂商省电策略） | 🔴 | P0 验证 Android，P2 逐端验证 iOS |
| R6 | **l10n 迁移**：只迁 arb 源 **5,523 行** `✅代码`（生成的 16,618 行 Dart 不迁）→ i18next | 🟡 | P1 转换脚本 + 校对 |
| R7 | **Lynx 较快发布节奏**带来的 `engineVersion` 兼容负担（2026 起转向更快发布节奏 `✅官方`；「月度」为早期表述 `⚠️待核实`） | 🟡 | 固定 engineVersion，按季度评估升级 |
| R8 | **桌面代理/自签证书能力重建**（对应 `insecure_media_proxy`、`dio_insecure`、`github_proxy_fallback`） | 🟡 | 桌面已明确在 Lynxtron 主进程 Node.js 侧实现，风险降为工程量而非可行性 |
| R9 | **Web 端代理/不安全 TLS** 受浏览器安全模型限制 | 🟡 | P3 产品侧确认降级策略 |
| R10 | **封面取色 / 复杂 SVG** Lynx 能力缺口 | 🟡 | 能力矩阵 §7；原生模块或资源替换 |
| R11 | **状态/路由栈已定**（Zustand + TanStack Query + TanStack Router）；剩余风险=**TanStack Query 在 Lynx 无 DOM 下的集成**：`focusManager`/`onlineManager` 触碰 `window`/`document`/`navigator`，须 no-op；无官方 Lynx×Query 专页 `⚠️待核实` | 🟡 | **P0 必做 spike**：验证 Query no-op 集成；不通过则回退自研 fetch 缓存层 |
| R13 | **lynx-ui 的 Web/Desktop 覆盖**：官方称 iOS/Android 全面支持、Harmony/Web/Desktop「持续完善」中 `✅官方`；我们的 Web + macOS/Windows 三端组件覆盖度未知 | 🟡 | P1 逐组件核实；缺口用按组件包或 `<view>/<text>` 原语自组合兜底 |
| R12 | **路由能力缺口**（两篇官方路由文档未覆盖）：无 `<Link>`/声明式导航、嵌套/持久化 tab 外壳、鉴权重定向、深链→初始路由、硬件返回/手势返回、Web URL 同步、路由级转场动画 | 🟡 | P0/P1 逐项验证范式（详见 overview 路由取舍与本次 gap 报告） |

---

## 工作量量化

**方法说明**：以现有 Flutter `features/` 实测行数为规模输入，按「Lynx 属整体重写、无代码复用」的前提分档估算重写规模区间。**不给单点工期承诺**——行数仅反映相对规模，实际工时受团队规模、Lynx 熟练度、原生模块自研难度影响。

**规模输入（已核实，`features/` 共 52,407 行）：**

| 档位 | feature（行数） | 说明 |
|---|---|---|
| XL | settings（16,134）、player（13,093） | 体量最大；player 叠加 `SongloftAudio` 原生自研 |
| L | playlist（5,685）、home（5,329）、library（5,178）、jsplugin（3,918） | 中大型；jsplugin 叠加 Web iframe 分支 |
| M | auth（1,261）、dlna（715）、desktop_lyric（690）、startup（404） | 中小型；dlna/desktop_lyric 叠加原生自研 |

**额外的非 feature 重写量**：`core/`（11,579 行，含音频 20 文件 + 网络 18 文件 + 存储 6 文件等，多为原生模块自研输入）、`shared/`（5,894 行）、l10n（arb 源 5,523 行走转换脚本；生成的 16,618 行 Dart 不迁）。

**估算区间口径**：

- UI/业务重写：features 52,407 行 + shared 5,894 行按「重写而非移植」计，通常 TS 重写行数与 Dart 同量级或略少（UI 声明式 + 状态管理相近），但需叠加 Lynx 特有适配（双线程、事件模型、无 DOM）。
- 原生模块自研：`SongloftAudio`（XL，5 端）为最大单点；`SongloftStorage`/`SongloftBackend`/`SongloftPlatform` 合计 L–XL。这部分**不能用 Dart 行数折算**，须按各端原生实现独立估算。
- l10n：脚本化转换，工作量以脚本 + 校对计，按 arb 源 5,523 行估，非按生成的 16,618 行折算。

**结论**：总量属**大型整体重写 + 多端原生自研**级别。建议以 P0 实测「Android 音频闭环 + 核心三页」的实际投入，反推后续阶段的团队速度基线，再据此给出承诺工期——而非在调研阶段给出单点数字。
