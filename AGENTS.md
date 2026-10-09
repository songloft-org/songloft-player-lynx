# AGENTS.md — Songloft Player (Lynx)

本文件只保留会直接影响代码修改、验证范围和探索顺序的约束。事故经过、测量数据和历史批次统一放在 [`docs/project/pitfalls.md`](docs/project/pitfalls.md) 与 [`docs/project/progress.md`](docs/project/progress.md)，不要在这里复制第二份。

## 1. 先读什么

| 任务 | 权威入口 |
|---|---|
| 项目概览 | [`README.md`](README.md) |
| 架构和调用链 | [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| 构建、测试与平台闸门 | [`HARNESS.md`](HARNESS.md) · [`docs/guides/build-and-run.md`](docs/guides/build-and-run.md) · [`docs/guides/testing.md`](docs/guides/testing.md) |
| Lynx 双线程、元素和 Web 限制 | [`docs/architecture/lynx-constraints.md`](docs/architecture/lynx-constraints.md) |
| Store / API 设计 | [`docs/reference/api-conventions.md`](docs/reference/api-conventions.md) |
| 原生模块方法、事件和注册矩阵 | [`docs/reference/native-modules.md`](docs/reference/native-modules.md) |
| HarmonyOS / ArkTS 开发约束 | [`docs/reference/arkts/README.md`](docs/reference/arkts/README.md) · [`docs/reference/arkts/ArkTS约束速查.md`](docs/reference/arkts/ArkTS约束速查.md) |
| 返回导航 | [`docs/reference/back-navigation.md`](docs/reference/back-navigation.md) |
| 平台能力与最低版本 | [`docs/reference/platforms.md`](docs/reference/platforms.md) |
| 设计 token 与组件语言 | [`DESIGN.md`](DESIGN.md) |
| 当前状态、开放问题和交接 | [`docs/project/handoff.md`](docs/project/handoff.md) · [`docs/project/bugs.md`](docs/project/bugs.md) |

后端 API 契约不在本仓库。权威来源是后端仓库的 `docs/swagger.json` 或开发服务器 `http://localhost:58091/swagger/index.html`；不要在本仓库维护副本。

## 2. 项目边界与调用链

```text
src/router.tsx
  -> src/features/<feature>/ pages/widgets
  -> store 或 TanStack Query
  -> src/core/network 或 src/native facade
  -> 后端 / Android / iOS / HarmonyOS / Web 宿主
  -> 响应或 global event
  -> store/query 更新并重渲染
```

- `src/features/` 按 `auth/home/library/library-ops/player/playlist/settings/jsplugin` 分域；共享能力放 `src/core/`、`src/models/`、`src/native/`、`src/shared/`、`src/store/`。
- Zustand 只放客户端态；来自后端的数据由 TanStack Query 管理。新增 store 方法或改签名前先读 API conventions。
- 1–2 个标量参数使用位置参数；≥3 个参数或含可选参数时使用对象参数。
- 音量在 store 层为 0–100 整数、native 层为 0–1 浮点，转换由 store action 完成。
- Flutter 目录 `songloft-player/` 是只读参考，不得修改（本工作副本未 checkout，存在时适用）。

## 3. Lynx 与 Web 约束

### 3.1 Realm 和平台判断

- Lynx 没有通用 DOM；业务代码不得假定存在 `window`、`document`、`self`、`navigator`、`localStorage` 或 HTML 元素类。
- Web 业务组件运行在 web-core 的 Worker realm。`typeof document !== 'undefined'` 只能判断当前 realm 能否调用 DOM，不能判断平台。
- 选择平台实现时使用 `isWebPlatform()`；`isWebEnvironment()` 只守卫紧随其后的 DOM 调用。
- Web 主线程 API（`Audio`、`AudioContext`、`window.open`、`document.createElement`、MediaSession 等）只能由 `nativeModulesMap` 注册宿主模块，再通过 `NativeModules` 从 Worker 调用。
- Lynx 裸全局用 `typeof fetch !== 'undefined'` 读取；确需补齐的缺失全局在 `lynx.config.ts` banner 注入，不要伪造 `globalThis.self`。

### 3.2 元素、CSS 和资源

- 新用 Lynx 元素前查 web-core 的标签映射。未映射标签会成为 `HTMLUnknownElement`，属性开关无效；Web 分支应整段不渲染不支持的元素。
- 已知 Web no-op：`enable-nested-scroll`、属性式 `scroll-into-view`、`<list>` 的 px `lower-threshold`。歌词滚动使用命令式 invoke。
- `<svg src={url}>` 的远程加载在本宿主不可用；先取 SVG 文本，再用 `<svg content>`。
- web-elements 的 `::part()` 默认值可能覆盖 host 继承，且外部规则穿不透 `<lynx-view>` shadow root。需要全局修复时改 `scripts/patch-web-core-client.mjs`，并让 pattern 缺失时失败。
- Web 宿主入口必须以 `<script type="module">` 加载；修改 `web/` 后必须运行 `build:web` 并实际打开产物。
- 使用 lynx-ui 时按组件包导入；不要恢复 `@lynx-js/lynx-ui` 桶入口或 `@lynx-js/lynx-ui-popover`。Switch 统一使用 `src/shared/ui/AppSwitch.tsx`。

### 3.3 覆盖层、列表和弹窗

- 全局覆盖层挂在 `src/router.tsx` 的 root route `ThemeProvider` 内，与 `ToastHost` 同层；放到 `App.tsx` 或主题树外会同时丢 CSS 变量和 Router context。
- 锚定菜单/面板使用 `PopoverMenu`、`PopoverPanel`、`PopoverSurface` 和 `anchored-overlay.ts`。坐标来自同一次 `exec` 中的 trigger + `.theme-root` 测量；每轴只设置一个边缘偏移。
- 虚拟 `<list>` 会建立 fixed 包含块并裁剪后代。歌曲行菜单只能使用 `GlobalMenu` + `song-row-overlays.ts` 挂到根级；菜单项统一由 `buildSongMenuItems` 构造。
- `DialogBackdrop` 的 fixed 定位通过 `style` prop 提供完整四边偏移；点外取消挂 `DialogContent`，卡片用 `catchtap` 阻止确认点击冒泡。
- 弹窗卡片钳制常量必须与 action row 高度同步；调整 `CARD_CHROME_ABOVE_ACTIONS_PX`、`ACTION_ROW_PX` 或对应 CSS 时同步更新结构闸门。
- 高度受限的 column flex 卡片中，标题和 action 等固定 chrome 设置 `flex-shrink: 0`，滚动 body 承担收缩。
- absolute bottom sheet 若没有明确 `height`，body 不得使用 zero-basis `flex: 1`；固定高度或内容贴合两种形态二选一。

### 3.4 导航、系统跟随与返回

- 底部导航是 fixed 胶囊：nav `z-index: 90`、mini player `91`、sheet/popover `100`、dialog `200/201`。新 fixed 层不得插入 90–91。
- 新增滚动页必须消费 `--nav-inset`；原生 `<list>` 页面用 footer spacer，不依赖 CSS padding。
- rail 选中态只变色，不改尺寸；底栏图标选中色使用 `activeAccentIconColor()`，SVG 不吃 CSS 级联。
- Liquid Glass 表面复用 `BackdropBlur` 与材质 token（统一 `--material-*` 前缀）；底栏选中态背景使用 `--tint-fill`，`--material-glow-faint` 仅作光晕装饰；玻璃上的强调/中性状态分别使用 `--tint-fill` / `--quaternary-system-fill`，不得换成不透明 surface。
- 底栏 `LiquidTabIndicator` 对齐 Flutter 的 350ms snappy spring（bounce .15），主线程关键帧共用位移和速度驱动的压缩/拉伸；连点从当前姿态与速度转向，reduce-motion 订阅实时取消并落位。分段控件仍用 `translateX` + `--ease-spring-bounce` 和归零的 `--duration-*`。宽屏 rail 仅变色，文字/命中区/模糊层永不跟着指示器缩放或位移。Toast 保持实心。
- 系统主题/语言初值由宿主 globalProps 在首帧前注入，运行中变化走 global event。`sendGlobalEvent(name, params)` 的第二参必须是数组。
- reduce-motion：宿主经 `systemReduceMotion` 字段推送；iOS 使用 UIAccessibility 通知，Android 监听 `ANIMATOR_DURATION_SCALE`，HarmonyOS API 23+ 读取并监听公开接口，旧 API 保持未知。Web 在主线程读媒体偏好并推送给 Worker；`.reduce-motion` 零化动效 token。订阅随宿主生命周期清理。
- 玻璃能力由宿主首帧 globalProps 上报（SDK、注册与 OS 门控）；未知能力使用实心材质，iOS 26+ 才选择 glass。`surface-policy.ts` 将系统辅助功能与本机偏好合并，系统开启时不能被应用开关关闭；降低透明度时卸载 blur。Android capture target 必须有稳定 id、`flatten={false}`，并排除玻璃层自身。
- Android 13+ 胶囊经 `androidGlassSupported` 门控，用 AGSL 对实时 blur 输入做边缘折射；显式圆角透明裁剪，不能依赖输入 alpha（RenderEffect 会 clamp 越界输入）。普通菜单和 scrim 不启用此透镜。胶囊仅有一层有效填色，不铺全表面渐变或定时 shimmer；增强对比度关闭透镜，降低透明度卸载 blur。
- 移动 Tab 的选中填色始终可见，不能与透镜作整面透明度交接。共享弹簧同时驱动形变、轻微隆起与边缘光，光学激活连续变化，连点保留姿态、速度和激活度。`songloft-tab-backdrop` 仅采样底栏材质，须 `flatten={false}` 和 `z-index:0`；指示器、光学层、图标及文字均在采样根外，防止反馈和前景重影。Android 用固定全栏硬件 RenderNode + AGSL，要求独立 `androidTabGlassSupported`；零半径 SDK bitmap、BlurViewCanvas、软件 Canvas 均不能替代已渲染材质。Web 透镜直接挂在移动胶囊内，浏览器动画调制位移图强度，禁止逐帧 PNG 编码或第二套 RAF 几何；SVG backdrop 位移用于 Chromium；WebKit 18.2+（含同内核的 iOS 浏览器）与 Firefox 134+ 使用浏览器主线程的有界实际背景镜像，经 SVG 模糊/位移绘制；SVG 文字按实际基线和换行复制。镜像只随源变化刷新，移动透镜在实际胶囊内用同一动画时钟逆变换背景，不复制前景控件。遇到可见 iframe/video/canvas 等无法忠实采样的内容，明确退回原生 blur，不能算完整折射验收。HarmonyOS API 20+ 的独立宿主能力启用异步小区域采样 + GPU 网格，排除自身、限制一个在途采样，并在后台/销毁取消；实际光学与性能仍须设备验收。iOS 26 使用系统玻璃。未知能力、降低透明度、增强对比度保留可见填色；各端静态画面和动画均须单独验证。
- 根节点和 blur 叶节点复用 `useSurfaceAppearance`，避免每层重复订阅外观源。无 className 的全屏 scrim 使用 themed blur；紧凑 chrome 才使用 regular glass，装饰叶节点不启用 glass-interactive。未调暗的菜单使用 `--material-fill-menu` 和边缘高光，不铺整面 sheen/ramp；文字对比度须计入选中态 wash 与未知背景。
- iOS 移动透镜由 `SongloftTabGlassUI` 注册 `songloft-tab-glass`，编译 SDK、iOS 26 与实际注册共同门控 `iosTabGlassSupported`。`UIVisualEffectView` 及祖先 alpha 必须保持 1；原生暂停的 `UIViewPropertyAnimator` 按共享激活度插值 `effect`，不通过 opacity 淡入淡出玻璃。选中 wash 在效果上方；连续转向复用材质动画，减少动画/透明度、增强对比度、后台和销毁取消效果及有限帧时钟。C 时钟验证与源码接线检查不能替代 Apple 编译和画面验收。
- 返回顺序为：覆盖层 LIFO 栈 → `resolveRouteBack` 父级 → tab 首页退出策略。新增覆盖层挂载时必须先让 `useBackHandler(active, handler)` 的 `active` 为 `false`，新增叶子路由同步登记 `route-back.ts`。
- 不使用 `router.history.back()`；`SubPageShell` 不维护第二份父级信息。完整契约见 back-navigation reference。

## 4. 原生模块契约

### 4.1 调用与注册

- Lynx 原生方法不返回 Promise。写操作是 fire-and-forget，读操作用 Callback；Promise 化只在 TS facade 完成。
- 不得把 `NativeModules.X` 直接强转成 Promise 接口。原生返回 `undefined`，调用 `.then()` 会在运行时崩溃。
- 新增或修改方法时同步核对 TS facade、Kotlin `@LynxMethod`、iOS `methodLookup`、HarmonyOS 模块实现，以及 Web 宿主降级路径。
- 新模块还要同步注册：Android `SongloftApplication`、iOS `ViewController.buildConfig()` 与 pbxproj、HarmonyOS `pages/Index.ets`（逐 LynxView 注册，`EntryAbility.ets` 只接 HTTP service）；事件名逐字一致。
- 原生模块权威清单和平台差异只维护在 `docs/reference/native-modules.md`，不要在本文件复制模块计数表。

### 4.2 高风险共享能力

- 全屏视频借用现有播放器实例，不另建播放器。退出时 Android 必须 detach video output；iOS 先清 `vc.player` 再 dismiss，并禁止覆盖 Now Playing 信息。
- Android `AndroidManifest.xml`、iOS `project.pbxproj`/`Info.plist`、HarmonyOS `module.json5` 都是契约面；子串存在不能证明结构有效。
- Android 原生模块方法不保证在主线程；修改 View 时切回主线程，避免异常被宽泛 `catch` 静默吞掉。
- Android/iOS 的宿主 HTTP service 是替换 SDK 默认实现，不是并存覆盖。`InsecureTls` 同时约束 fetch、媒体与模块出站路径；修改时按 native-modules reference 检查连接复用、range streaming 和线程要求。
- `SongloftSongCache` 使用持久文件目录、`.part` 原子写、统一 `limit_exceeded` 哨兵，并复用 TLS 开关；三端契约必须一致。

## 5. 验证契约

### 5.1 共享 JS 闸门

```bash
pnpm run build          # 必须同时列出 File (lynx) 与 File (web)
pnpm exec tsc -b        # 必须 -b；--noEmit 对本仓库无效
pnpm test               # Vitest 单元测试与契约闸门
```

`pnpm run build` 只证明它实际读取的 JS 配置和源码。它不编译 Kotlin、Swift、ArkTS，也不证明 Web 产物能在浏览器打开。

### 5.2 按改动路径追加闸门

| 改动 | 追加验证 |
|---|---|
| `android/` | `cd android && ./gradlew --no-daemon assembleDebug`；涉及行为时跑 Android E2E/真机 |
| `ios/` | `xcodebuild -list -project ios/SongloftLynx.xcodeproj`；可用 macOS 环境再跑 `pnpm run ios:build` |
| `harmony/` | GitHub Actions `build-and-release.yml` 的 HarmonyOS job 或 DevEco Studio Build Hap；涉及行为时真机/模拟器 |
| `web/` | `pnpm run build:web`，检查 `index.html` 本地引用并实际打开产物 |
| 原生模块契约 | `src/__tests__/native-module-contract.test.ts` 与对应宿主编译 |
| 路由/覆盖层 | route-back、root-overlay、overlay back、CSS 契约测试 |

E2E 通过 TestBridge（TCP 9230）驱动设备，运行入口和环境检查见 `docs/guides/testing.md`。修改 bundle 或宿主后确认设备上安装的是新产物，避免测旧进程。

发布产物必须关闭 TestBridge 与 JS devtools。桥只在原生 Debug 注册并监听 loopback；测试 JS 通过 `SONGLOFT_TEST_BRIDGE=true` 构建。发布入口、签名材料与统一版本见 `docs/guides/releasing.md`；生产构建后运行 `pnpm run test:release`。

### 5.3 测试原则

- 闸门验证语义和结构，不只查子串。
- Mock 保留真实实现的前置条件、未知态和状态到 className/事件的映射。
- 新断言应先反向验证缺陷存在时会失败。
- 能力探测器与首个消费点同批落地；静态存在但无调用点不算功能完成。
- i18n 字面量扫描覆盖不到模板动态 key；动态前缀需要显式登记或独立测试。
- 源码编码闸门必须扫描 U+FFFD 与无效 UTF-8；被打碎的非空字符串不能靠类型检查或 key 集合测试发现。
- Vitest 文件正文不得出现字面量 `@vitest-environment`。

## 6. 工作流、文件和 Git

- 新批次先查 `docs/project/handoff.md`、开放 bugs 和相关 reference；完成后更新 `docs/project/progress.md` 与交接快照。
- 使用 `apply_patch` 编辑文本；保留用户已有 dirty changes，不重置、不覆盖无关文件。
- `patches/` 与 `pnpm-lock.yaml` 属于源码契约；`node_modules/`、`dist/`、`songloft-player/`、`.codegraph/` 不提交。
- 分支为 `main`，远程为 `origin`。提交使用 `type(scope): 简体中文描述`，禁止 `Co-Authored-By`；Issue 引用使用 `songloft-org/songloft#NNN`。
- 未获得明确确认时不提交、不推送、不操作 Issue。每个聚焦批次验收后暂停等待确认。

## 7. 项目 Skills

- `dev-flow`：分阶段处理 Issue、Bug、功能和优化，阶段间等待确认。
- `lynx-api-docs`：写页面、元素、布局或排查 Lynx 渲染前查询官方 API 文档。
- `lynx-ui`：选择组件和核对公开 API。
- `lynx-check-css-support`：按 Lynx 版本与渲染后端确认 CSS 支持。
- `lynx-devtool`：运行中 DOM/CSS、日志、截图、CDP 与设备调试。
- `reactlynx-best-practices`：ReactLynx 双线程、worklet、生命周期和组件库约束。
