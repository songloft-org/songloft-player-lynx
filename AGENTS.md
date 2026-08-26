# AGENTS.md — Songloft Player (Lynx)

Songloft Player 的 Lynx 客户端，从 Flutter 版整体重写。

## 1. 项目结构

```
src/                    Lynx 客户端源码（所有业务代码）
  core/                 网络(api-client/auth-interceptor)、存储、配置
  features/             按功能模块划分
    auth/               登录、JWT 鉴权、token 管理
    home/               首页（问候、统计、歌单/电台区块）
    library/            曲库（歌曲列表、分类、搜索、排序）
    library-ops/        音乐库管理（扫描、元数据、重复检测）
    player/             播放器（全屏/mini、队列、歌词、睡眠、速度、持久化）
    playlist/           歌单（CRUD、排序、拖拽）
    settings/           设置（服务器、外观、语言、缓存、代理、EQ、数据）
    jsplugin/           JS 插件（管理器、商店、WebView、Tab 配置）
  i18n/                 国际化（en/zh，i18next）
  models/               zod 数据模型（Song/Playlist/Category 等）
  native/               原生模块 TS 层（audio-facade/storage/platform）
  shared/               共享组件（theme/layouts/ui）
  shims/                环境兼容 polyfill
android/                Android 宿主 + 原生模块（Kotlin）
ios/                    iOS 宿主 + 原生模块（Swift）
web/                    Web 宿主页（index.html）+ 本地静态服务（serve.mjs）
docs/                   项目文档，按 Diátaxis 组织（索引见 docs/README.md）
  getting-started.md   从零跑起来
  guides/              操作指南（构建/测试/原生开发/Web 部署/调试）
  reference/           规范速查（api-conventions / native-modules / back-navigation）
  architecture/        背景与解释（overview / lynx-constraints / platform-differences / e2e-testing-design）
  project/             进展 progress.md · 交接 handoff.md · 缺陷 bugs.md · plans/
  archive/             归档：已闭合计划 + migration/ 迁移调研（含订正表）
patches/                依赖补丁（必须提交）
songloft-player/        Flutter 版只读参考（.gitignore 排除，禁止修改）
```

> **后端 API 契约不在本仓库**：权威来源是后端仓库的 `docs/swagger.json`（本机 `/Users/hanxi/toy/songloft/docs/swagger.json`），或开发模式下的 `http://localhost:58091/swagger/index.html`。**刻意不往本仓库复制副本**——复制品必然漂移，而后端是 121 个 path 的活契约。

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 构建/框架 | Rspeedy + ReactLynx + TypeScript |
| 状态 | Zustand（客户端态）· TanStack Query（服务端态） |
| 路由 | TanStack Router（memory history，code-based） |
| UI | lynx-ui 按组件包导入 + **Muse** design tokens（见根目录 [DESIGN.md](DESIGN.md)）+ @lynx-js/motion |
| 数据模型 | zod（snake→camelCase transform，`.catch()` 容错 null） |
| i18n | i18next + react-i18next |
| 测试 | Vitest + @testing-library |
| 包管理 | pnpm |

## 3. 开发约定

### 后端

- 默认 `http://localhost:58091`，账号 `admin/admin`，接口 `/api/v1`
- standalone 模式显示地址配置 UI；embedded 模式隐藏

### Store / API 设计

- 新增 store 方法、修改签名前先查 `docs/reference/api-conventions.md`（参数风格、数值范围、命名、E2E store 暴露约定）
- 参数风格：1–2 个标量用位置参数；≥3 个或含可选参数用对象参数
- 数值范围：音量 store 层 0-100 整数、native 层 0-1 浮点，转换由 store action 完成

### 验收命令

```bash
pnpm run build          # rspeedy 构建（含类型检查）
pnpm exec tsc -b        # 独立类型检查（必须 -b，--noEmit 无效）
pnpm test               # vitest
```

`pnpm run build` 必须列出**两个**产物 —— `File (lynx)` 与 `File (web)`。只有 web 那一行说明 `lynx.config.ts` 的 `environments` 里少了 `lynx: {}`：`environments` 是**替换**隐式默认环境而非扩展它，漏掉不会让构建失败，只会静默停止产出 `dist/main.lynx.bundle`，而 copy-bundle 脚本照拷 `dist/` 里的陈旧文件（`scripts/assert-bundle-fresh.mjs` 现在会拦住这种情况）。

**上面几条都只覆盖 JS 产物**，不覆盖两个宿主。改动 `ios/` 或 `web/` 时必须另加：

```bash
xcodebuild -list -project ios/SongloftLynx.xcodeproj   # iOS 工程可解析（见下方铁律）
pnpm run build:web                                      # Web 产物（产出后确认 index.html 引用的资源都在）
```

> ⚠️ **「build 全绿」不等于「能出包」**。三个实例：① 批39 写坏了 `project.pbxproj`（数组内多一行赋值语句），此后 iOS 整整两批完全无法构建，而 `pnpm run build` / `tsc -b` / `pnpm test` 全程绿灯——它们根本不读 Xcode 工程；② `web:dev` 能跑不代表 `build:web` 能跑（两者取的静态资源目录不同）；③ 上面那条——`build` 绿了，但它压根没构建原生 bundle。**闸门只证明它真正读过的东西。**

### 真机调试（Android）

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
pnpm run android:install
adb reverse tcp:58091 tcp:58091
adb logcat -s lynx:V LynxUISVG:E AndroidRuntime:E
```

### E2E 行为测试

```bash
# Android（需 adb 连接 + debug APK 已安装）
pnpm run test:e2e:android

# iOS（一键：自动 boot 模拟器 + 检查安装 + 运行场景）
pnpm run e2e:ios

# iOS 全流程（含构建：build → pod install → boot → install → test）
pnpm run e2e:ios:full

# 仅准备 iOS 环境（不运行测试）
pnpm run e2e:ios:setup
```

测试通过 TestBridge（native TCP 9230 → JS eval）驱动设备上的 App，store 经 `src/e2e-bridge.ts` 暴露到 `globalThis.__E2E_*__`。
场景跨平台复用（`e2e/scenarios/`），iOS 额外有系统外观测试。
测试报告输出到 `e2e/reports/`，截图在 `e2e/screenshots/`（均已 gitignore）。
详见 `docs/architecture/e2e-testing-design.md` 和 `e2e/` 目录。

### Git

- 分支：`main`，远程：`origin`（`git@github.com:songloft-org/songloft-player-lynx.git`）
- Conventional Commits：`type(scope): 简体中文描述`
- 禁止 `Co-Authored-By`；issue 引用用 `songloft-org/songloft#NNN`
- `patches/` / `pnpm-lock.yaml` 必须提交；`node_modules/` / `dist/` / `songloft-player/` / `.codegraph/` 禁止提交（末者是 CodeGraph 的机器本地索引，约 46 MB、可由索引器重建；它一度未被忽略，一次 `git add -A` 就会把它写进历史）

### 工作流

- 按 `docs/archive/migration/plan.md` 顺序分批实现，一批一个聚焦范围
- 每批验收后更新 `docs/project/progress.md`
- 每批验收后暂停等确认，再进下一批

## 4. Lynx 关键约束

### 无 DOM

Lynx 无 `window`/`document`/`self`，双线程（主线程/BTS），元素用 `<view>/<text>/<image>`。

- 第三方库引入前检查是否访问 `self`/`window`/`document`/`navigator`——真机崩溃但本地测试可能不报错
- 正确做法：patch 掉该访问或 `typeof` 守卫，不要注入 `globalThis.self = globalThis`（BTS 无效）
- Lynx 宿主全局（如 `fetch`）是裸全局而非 `globalThis.X`，用 `typeof fetch !== 'undefined'` 读取
- 缺失全局（如 `AbortController`）用 `globalThis.X = …` polyfill，注入点在 `lynx.config.ts` banner
- `dist/main.lynx.bundle` 含未压缩调试段，grep 产物时排除注释/字符串误匹配

### 平台判断（铁律 —— 同一个错误已踩三次）

**`typeof <DOM 全局> !== 'undefined'` 不是平台判断。** `@lynx-js/web-core` 把背景线程实现为**真正的 Web Worker**（`new Worker(…, { name: 'lynx-bg' })`），业务组件跑在那个 realm 里，那里没有 `document` / `localStorage` / `sessionStorage` / `HTMLAudioElement`（`window` 却是 `object`，别用它判断）。所以 DOM 探测**在 Web 平台上会回答「不是 Web」**。

| 判断「当前平台是不是 Web」 | 判断「当前 realm 有没有 DOM」 |
|---|---|
| `isWebPlatform()`（`src/native/web-platform.ts`）读 `SystemInfo.platform`，**两个 realm 都有** | `isWebEnvironment()` 仅用于守卫紧随其后的那几行 DOM 调用 |

**`isWebEnvironment()` 绝不可用来选择实现分支。** 三次事故：① 首页永久显示「下拉刷新…」（探 `window`+`document`）；② Web 刷新掉登录（探 `localStorage`，落到内存存储）；③ **Web 完全没声音**（`web-audio.ts:30` 探 `HTMLAudioElement`，落到 mock —— 而 mock 拿到真实时长，进度条照走、自动切歌，唯独不出声）。

推论：**主线程 API 不能在业务代码里直接调**。`new Audio()` / `new AudioContext()` / `navigator.mediaSession` / `window.open` / `document.createElement` 在 worker realm 全部抛 `ReferenceError`。Web 上需要它们，只能经 web-core 的 `nativeModulesMap` 在主线程注册宿主模块，让 worker 侧通过 `NativeModules.X` 拿到——这也顺带复用已有的 native 分支。

### Web 平台

```bash
pnpm run web:dev              # 本地静态服务（先跑一次 web:sync 产出 bundle）
pnpm run web:sync             # rspeedy build --environment web + 拷贝产物到 web/dist
pnpm run build:web            # 同上（standalone 部署用）
pnpm run build:web-embedded   # 产物给后端嵌入（songloft-player-build/web-embedded）
```

- **不是所有 Lynx 内置元素在 Web 上都有实现。** web-core 的 `LYNX_TAG_TO_HTML_TAG_MAP` 只映射 view/text/image/raw-text/scroll-view/wrapper/list/page/input/textarea/svg/frame。未映射的标签走**恒等回落**，作为 `HTMLUnknownElement` 原样落进 DOM——子节点当普通内容渲染、属性开关**完全无效**。`<refresh>`/`<refresh-header>`/`<webview>` 就是这样，`@lynx-js/web-elements` 注册的是 `x-` 前缀名（`x-refresh-view`/`x-webview`），对不上。**写跨平台页面时用了新标签，先查这张表**，Web 分支该整段不渲染而不是靠属性关掉。
- 已知**在 Web 上是 no-op 的属性**：`enable-nested-scroll`、`scroll-into-view`（web-elements 只认命令式 `__scrollIntoView`，故歌词自动滚动在 Web 上不工作）、`<list>` 的 px 形式 `lower-threshold`（它只认 `lower-threshold-item-count`；`scroll-view` 上的 px 形式**是**有效的）。
- **Web 无 secure enclave**：`SongloftStorage` 的 `secure` 命名空间在 Web 上只是命名空间，安全性等同任何同源脚本。
- 会话持久化走 `core/storage/idb-storage.ts`（IndexedDB）——worker realm 没有 `localStorage`，探测顺序是 native → localStorage → **IndexedDB** → 内存。
- **web-core 的宿主脚本必须用 `<script type="module">`**：`client_prod` 的入口用了 `import.meta`，当作传统脚本加载会抛 `Cannot use 'import.meta' outside a module` —— 这是个**不进 `console.error` 的未捕获异常**，`<lynx-view>` 不 upgrade、整页纯黑、零诊断信息。dev-middleware 那份是 IIFE 没这个约束，这正是「`web:dev` 能跑」长期掩盖问题的原因。`serve.mjs` 与 `copy-bundle-web.mjs` 现已统一用 `client_prod`（两套资源除入口文件名外完全相同），并有 vitest 闸门锁住「index.html 的每个本地引用都存在」+「入口以 module 加载」。
- **验证 Web 改动时至少跑一次 `build:web` 并真的打开产物**。只跑 `web:dev` 证明不了产物可用——这一条已经吃过两次亏。

### lynx-ui

- **按组件包导入**（`@lynx-js/lynx-ui-button`），禁用桶入口 `@lynx-js/lynx-ui`。批51 起桶入口**已不是依赖**，import 它会直接解析失败（此前它在 `package.json` 里，3 个文件绕过了这条规则）。体积上两者实测**只差 4 字节**（各子包都声明 `sideEffects: false`，tree-shaking 本来就摇掉了未用到的转发）——这条规则买的是一致性和 Lynx 副作用暴露面，不是字节
- compound 组件（Switch 等）不带样式，`ui-checked`/`ui-active` 须使用方样式表提供——统一用 `src/shared/ui/AppSwitch.tsx`
- 测试 mock 原生组件时必须保留「状态→className」映射

#### 锚定弹出层（自研，批53 起不再用 lynx-ui-popover）

弹出菜单/面板统一走 `src/shared/ui/PopoverMenu.tsx` 与 `PopoverPanel.tsx`，两者共用 `PopoverSurface`（触发器 + 遮罩 + 面板）与 `anchored-overlay.ts`（测量 + 定位）。新增弹出层复用它们，不要直接拼原语，也不要把 `@lynx-js/lynx-ui-popover` 装回来。

- **为什么不用库的 positioner**：`computeCoordsFromPlacement` 返回的坐标是**相对触发器**的（库自己的注释写明了这个取舍），而 `OverlayView` 用 `position: absolute` 施加它 —— 后者的包含块是**最近的定位祖先**。两者只在「触发器正好位于该祖先原点」时等价，而本仓库 8 个调用点里 6 个把弹出层放在多子元素的工具栏行内。浏览器实测：歌单详情排序菜单落在 `x = -122`（整块在屏外，功能等于不存在）、音量面板 `-60`、倍速菜单 `-30`、曲库排序 `0`（应为 106）；播放器 ⋯ 菜单只是**恰好**对，因为它的触发器是容器唯一的子元素
- **库自带的溢出收敛也救不了**：`detectOverflow` 拿 `SystemInfo.pixelWidth / pixelRatio` 当屏幕，Web 上报的是浏览器**屏幕**尺寸（实测 800×600，而 lynx-view 是 420×900）
- **测量走 `boundingClientRect` invoke**（同 `useBreakpoint` 的 `measureRect`）。它在两端都有定义，Web 上按 web-core 的 `createInvokeUIMethod` 返回 **lynx-view 相对**坐标，与 native 的页面坐标同义。触发器与 `.theme-root` 视口在**同一次 `exec`** 里量，两次量会拿到「变化前的触发器 + 变化后的视口」
- **invoke 的回调是异步的**，所以「点了才量、量到再开」会让菜单卡在一次往返之后，而「先开后量」会先在兜底位置画一帧再跳。`useAnchoredOverlay` 因此**挂载时就量一次**（工具栏远早于用户伸手就绪，首次打开就是对的），**每次打开再量一次**（表头收起、列表滚动、窗口变宽都会让锚点移动）。别把 `exec()` 之后同步读结果当成「失败了」—— 初版就是这么写的，于是永远判定「没量到」、永远兜底
- **面板只用边缘定位**（`left`/`right` + `top`/`bottom` 各一个，配 `max-width`/`max-height` 上限），刻意不算角点：这样计算完全不需要面板自身尺寸，也就没有「量—画—再量」那一趟，不会有一帧画在错的地方，且「留在屏内」是构造保证而不是靠一个可能被喂错视口的 clamp
- **每个轴只能给一个偏移**：`position: fixed` 同时拿到 `top` 和 `bottom` 会被**拉伸**而不是按内容定尺寸。所以 `PopoverMenu.css` 里一个偏移都不写，兜底位置由 `DOCKED_POSITION` 内联给出 —— 样式表里留一个 `bottom` 不会被内联的 `top` 覆盖，而是与它叠加
- **`max-width` 不能用来收窄面板**：CSS 在它**之后**解析 `min-width`，所以 `.popover-menu--wide` 的 `min-width: 180px` 赢。靠边的触发器要靠偏移本身预留 `RESERVED_PANEL_WIDTH`（200 = 全库最宽的音量面板）才真的收得住
- **「点外部关闭」挂在遮罩上**（面板的兄弟），不要挂在共同根上靠面板 `catchtap` 拦冒泡：后者在真机成立，但让「这一行有没有误关面板」无法测试
- 顺带没了：Presence 的 16 帧固定开启延迟、靠 `transition` 才能及时卸载（否则空转 24 帧单帧 rAF ≈ 1 秒）、`PopoverBackdrop` 缺 `top`/`left` 导致两个弹出层能同开、以及「不要给 `PopoverPositioner` 传 `container`」（`<overlay>` 不在 web-core 的标签表里）

#### 列表行的菜单只能挂在全局（批54，浏览器探针实测）

**虚拟列表 `<list>` 内部放不了弹出层**，所以歌曲行的菜单是 `GlobalMenu` + `song-row-overlays.ts` 这一套（行在点击时量 `⋯` 的 rect，随歌曲送进 store，面板在 root route 上用 `placePanel` 落位）。这条以前只是批50 的口述结论，现在有数：

- `x-list` 实测 `contain: layout` + `container-type: size` —— layout containment 使它成为**fixed 后代的包含块**。在 `list-item` 里插一个 `position: fixed; left:0; top:0` 的探针，实际落在 **(440, 273.5)**，即列表自身原点而非视口原点。`anchored-overlay.ts` 量的是 lynx-view 坐标，直接用会整体偏掉列表的偏移 ⇒ 得引入第二套坐标系
- `x-list::part(content)` 是 **`overflow: hidden scroll`**（另有 `content-visibility: auto`）。放在该框上方与下方的两个探针 `checkVisibility()` 都是 true，但 `document.elementFromPoint` **都打不中** —— 是裁掉了而不是只是看不见。**滚动容器必然裁剪，这一条没有任何样式表能解**
- Web 上每个 Lynx 元素都映射为 `position: relative; overflow: clip`（web-elements `common-css/linear.css`），`list-item` 也在其中 ⇒ 面板先被切到行自己那 ~73px 的框里，要逐层给祖先加 `overflow: visible` 才露得出来（歌单详情页还多两层包装）

行内版**真写过一遍**（净 ~95 行）：菜单只能在列表视口内可见（实测那个窗口下列表高 **371.5px**，而 4 行菜单约 190px，靠底部的行被切）；**不能有遮罩**（全屏点击捕获层同样被裁）⇒ 点外部关不掉；两行可以各开一个菜单，除非再加一个「谁开着」的共享信号 —— 那就是 store 本身。native 侧连验都没走到（原生列表同样裁到自己的视口）。**换掉全局方案省不了 store**：添加到歌单与删除确认是模态的，无论如何都在根上。

**菜单项按视口裁剪（批62 起）**：宽屏行内已有 信息/加歌单/删除 按钮时，⋯ 菜单裁掉这三项——它们与行内按钮调的是同一个 store action，纯重复（Flutter 桌面布局甚至无菜单）。**窄屏行内按钮不渲染，菜单是这三项唯一入口**，所以裁剪依据是 `openMenu({ song, anchor, row })` 携带的行上下文快照（`menuRow`：`isWide` + `deleteShortcut`）——菜单挂在 root route、`LibraryViewportProvider` 之外读不到视口。歌单详情行的 × 是「从歌单移除」**另一动作**，其菜单保留「删除歌曲」。新增歌曲菜单项必须进 `song-menu-items.ts` 的 `buildSongMenuItems`（闸门在 `song-row-overlays.test.ts`），不要在组件里内联。

#### 全局覆盖层的挂载点与 Dialog（批52，浏览器实测抓出）

- **全局覆盖层必须挂在 root route 的 `ThemeProvider` 内**（`src/router.tsx`，与 `ToastHost` 同处），不能作为 `<RouterProvider>` 的兄弟挂在 `App.tsx`。后者在 native 上看不出问题，在 Web 上却同时踩两条：① 落在 `.theme-root` 子树之外，而 Muse 的 CSS 变量全部声明在那个类上 ⇒ 每个 `var(--*)` 解析为空字符串，卡片背景透明、无圆角内边距、遮罩不可见（**文字还在，所以像「样式崩了」而不像「没渲染」**）；② 拿不到 Router context ⇒ `SongRowOverlays` 因 `useNavigateToSongDetail()` 渲染中断，**歌曲菜单从未进 DOM、零报错**，点 ⋯ 按钮像没接线。闸门：`src/__tests__/root-overlay-mount.test.ts`
- **`DialogBackdrop` 的 `position` 只能由 `style` prop 给**：它内联硬编码 `position: absolute; width: 100%; height: 100%`，内联胜过样式表，所以类里写 `position: fixed` 是死代码；而它的父 `DialogView` 是个没有尺寸的 fixed 包装 ⇒ 遮罩实测 0×0（既不可见，`clickToClose` 也永远点不到）。**遮罩的四个偏移必须写全**，与 `.popover-backdrop` 同理（见 `popover-menu-css.test.ts`）：偏移为 auto 的 fixed 元素落在静态位置，弹出层的遮罩就是这么漏出「两个同时打开」的
- **「点弹窗外部取消」要挂在 `DialogContent` 上**（`dialogContentProps={{ bindtap }}`），因为该层是 `fixed; inset: 0` + `event-through={false}`，把遮罩整个盖住；同时卡片本身必须 `catchtap`，否则确认按钮的点击会冒泡上去，`onConfirm` 之后紧跟一次 `onCancel`。三条都无法用渲染测试覆盖（无布局引擎 + Dialog stand-in 丢弃 `style`/`dialogContentProps`），闸门在 `src/shared/ui/__tests__/confirm-dialog-overlay.test.ts`
- **Web 上没有 longpress**：web-core 不合成该手势，所以任何「长按打开菜单」的功能在 Web 上必须另有按钮入口（歌曲行的 ⋯ 就是）
- **高度受钳的 column flex 卡片里，固定 chrome 必须 `flex-shrink: 0`**（批60c）：flex 把溢出量按 basis 加权摊给**所有** shrink 非零的子项，小 basis 只是分得少、不是不分。两个歌曲弹窗的滚动 body 刻意用 `flex-basis: auto`（basis 0 会在卡片未被钳制时塌陷），于是标题行与 action 行也各摊一份——实测标题 `13.4px` / 内容 22px，而 Lynx 每个元素都带 `overflow: clip` ⇒ **文字上半直接被裁，看起来像「标题被什么挡住了」**；action 行 21.8/36，而 `.confirm-dialog__btn` 固定 36px ⇒ 按钮溢出卡片 content box。滚动 body 必须是唯一能吸收溢出的子项。同理，**卡片钳制与 body 钳制必须自洽**：`dialogBodyMaxHeight` 由 `0.85H − CARD_CHROME_PX` 派生而非独立取一个份额，否则 `body + chrome > card` 时差额从底部溢出、裁掉 action 行
- **底部滑入面板：`max-height` 单独出现 + zero-basis body = 塌陷成标题行**（2026-08-26 真机报障，**上一条末尾曾说这三个 sheet「basis 0 天然免疫」，那是错的，已更正**）：`play-history` / `more-tabs` / `playlist-desc` 的 panel 是 `position: absolute` + `left/right/bottom`（无 `top`、无 `height`）⇒ 按内容 shrink-to-fit；滚动 body 是 `flex: 1`（basis 0）⇒ 对内容高度贡献 0 ⇒ panel 塌成 chrome 高度，`max-height` 上限从未被触及。批60c 只看到「钳制卡片」这一种失效，漏了「absolute shrink-to-fit」这另一种。两种合法形态：**固定高度**（panel 给 `height: X%`，如播放历史 70%、添加歌单 62%）或**贴合内容**（body 保留 `flex: 0 1 auto; min-height: 0`，chrome 加 `flex-shrink: 0`，如更多 tab / 歌单描述）。闸门 `bottom-sheet-height.test.ts` 锁「panel 无 height 且 body 零 basis」这一非法组合
- **弹窗被压扁类问题无法用渲染测试发现**（无布局引擎），闸门只能锁 CSS 声明；真正的判据是浏览器实测里 `getComputedStyle(el).height` 与 `el.scrollHeight` 的差值——**截图容易误读成「样式没生效」或「被遮挡」**

### 事件与布局

- `<refresh>` 会吞掉内部横向手势——手指在横向区时需置 `enable-refresh=false`
- 横向 `scroll-view` 内容行须 `width: max-content`，否则视觉不滚动
- 带连字符的 JSX 属性无类型检查（`scroll-x` 等拼错不报错），须配产物 grep 测试

### 底部导航胶囊（批58 起，iOS-26 悬浮样式）

底部 Tab 栏是 **fixed 悬浮胶囊覆盖层**，不是贴底通栏。改导航/新增滚动页前先记这几条：

- **层级**：胶囊 `z-index: 90`、mini-player `91`、浮层（sheet/popover）`100`、dialog `200/201`。fixed 层自带 z-index（本仓铁律，见「全局覆盖层」节）；新固定层不得插进 90–91 之间。
- **内容穿过**：胶囊脱流后页面滚动到屏幕底，靠各页尾部 inset 避让——统一写 `padding/margin/height: var(--nav-inset, 80px)`（两档：无歌 80 / 有 mini-player 148，由 shell 根的 `shell--with-mini` 类切换，定义在 `ShellLayout.css`）。**新增可滚动页面必须消费该变量**，否则列表尾部永久被胶囊/mini player 挡住（已踩：首页/曲库滚不到底）。
- **VirtualList（原生 `<list>`）页不用 CSS padding**——不可靠，走 `footer` 插尾 spacer（见 `PlaylistDetailPage` / `CategorySongsPage` 的 `__nav-inset` 类）。
- **选中态**：底栏为固定尺寸横向胶囊（宽 = tab 槽 `calc(100% - 8px)`、高 52px，不随文字长短变化；安全因为 64px 槽吸收尺寸）；**rail 选中只变色、严禁改尺寸**——rail 行是内容高度，选中改高会跳动下方所有行（已踩：宽屏切 tab 抖动）。两处共用 `--primary-faint` 淡色底 + tint；**禁止**回到整块 `--primary` 填充 + 反白。
- **图标 tint**：SVG 不在 CSS 级联，选中色必须用 `activeAccentIconColor()`（运行时读主题包 seedColor，无包回退墨色），不能写 `ICON_COLORS.primaryContent`。
- **底栏标签**：`--font-2xs`（10px）+ `nowrap` + ellipsis，水平 padding ≤8px——**4 字中文名（洛雪音源）必须在 360dp 最窄主流屏完整显示**，省略号只兑底 5+ 字 pathological 名。宽屏 rail 标签不受此限。
- **宽屏侧栏**：iPadOS 分组（主导航 →「插件」组头+插件 tabs → 设置），行内胶囊选中态与窄屏同款 tint 语言。
- **`--radius-nav` 已冻结**：导航形状固定 `--radius-pill`，包的 `navigationRadius` 映射保留但无消费点（schema 兼容）；`--primary-faint` 由 seedColor 派生（light 10% / dark 14%），派生逻辑在 `theme-pack-mapping.ts`，闸门测试锁 tokens.css 与 baseline 表同步。

### 系统跟随（深浅色/语言）

- Lynx 无 `prefers-color-scheme`/`matchMedia`/locale API
- 宿主两条通道：`LynxLoadMeta.setGlobalProps` 送初值（首帧正确），`sendGlobalEvent` 送变更
- `android:configChanges` 须含 `uiMode|locale|layoutDirection`，否则切换时 Activity 重建
- `'system'` 选择须存解析后的派生值到 state，否则同值写入被 React 跳过

### 返回导航（铁律摘要 —— 完整规范见 [docs/reference/back-navigation.md](docs/reference/back-navigation.md)）

一次返回按键走三层，命中即停：**覆盖层/模式态 LIFO 栈**（`src/shared/nav/back-stack.ts`）→ **路由父级**（纯函数 `resolveRouteBack`）→ **退出提示**（仅 tab 首页）。装配在 `src/core/navigation/back-controller.ts`，由 `src/index.tsx` 在首帧前调用。

- **新增覆盖层/模式态**：`useBackHandler(active, handler)`，handler 返回 `true` 表示已消费。**`active` 挂载时必须为 `false`** —— 优先级是「激活时刻」而非 z-index（全库覆盖层都是 `z-index: 100`，没有可排序的东西），父子在同一 commit 内同时激活会让父反而在栈顶
- **新增路由**：在 `src/shared/nav/route-back.ts` 声明父级。不声明 `route-back.test.ts` 会红（它枚举 `router.routesById` 的每条叶子路由）
- **`SubPageShell` 已无 `backTo` prop**：父级只存在于 `route-back.ts` 一处，返回箭头与硬件按键读同一份。`onBack` 语义仍是宽屏 pane 内的兄弟页切换，**不是**路由返回
- **绝不用 `router.history.back()`**：栈底是 `/login`，所有返回按钮与 tab 切换都是 push，`canGoBack()` 几乎恒为 `true`
- **`consumable` 标志**：`onBackPressed()` 必须同步决定，所以 JS 把「下一次返回是否归我」镜像给宿主。**双击退出的第二次按键由宿主本地 `moveTaskToBack(true)` 执行**（武装提示时把标志降为 false），故快速连击无竞态、JS 卡死在 tab 首页也能退出。剩余情况由「连续 3 次无 ack」看门狗兜底（**不用定时器** —— 会把慢 JS 误判成死亡）
- **平台差异只在 tab 首页**：Android 首次按键出 toast；Web 恒 `consumable=false`，浏览器返回直接离开页面
- **Web 靠主线程一个 sentinel history entry**，其存在性严格等于 `consumable`（worker 没有 `history`/`popstate`）
- **`sendGlobalEvent(name, params)` 第二参必须是数组**：worker 侧最终走 `listener.apply(ctx, params)`，普通对象没有 `length` ⇒ 传零个参数、listener 收到 `undefined`。此前 Web 音频事件与深浅色事件都踩了，已修 + 加闸门
- **iOS 刻意不注册该模块**：没有返回键可拦（无 `UINavigationController`，连边缘滑动都没有），TS facade 降级为惰性桩
- **全屏视频 / 文件选择器无需处理**：独立 Activity，栈顶时 `MainActivity.onBackPressed()` 不会被调用，系统默认已正确

### 其他

- `<svg src={url}>` 远程加载在本宿主不可用（无 `GenericResourceFetcher`），须取文本后用 `<svg content>`
- Vitest 文件正文禁止字面量 `@vitest-environment`
- `tsc -b` 写 `.tsbuildinfo`（已 gitignore），改动未检测时用 `--force`

## 5. 原生模块概览

### 调用约定（铁律）

Lynx 原生方法**不返回 Promise**：写是 fire-and-forget，读靠 `com.lynx.react.bridge.Callback`（iOS 同构）。**Promise 化必须由 TS 适配层完成**，参考 `src/core/storage/native-storage.ts` 的写法。

**禁止**把原生模块直接强转成 Promise 接口：

```ts
// ✘ DLNA 就是这样崩的（dlna.ts）：原生返回 undefined，.then() 直接 TypeError，
//   页面 useEffect 挂载即炸
cached = nm.SongloftDlna as DlnaModule
// ✔ 逐方法包一层，把 callback 转成 Promise
```

另外三条：

- **新增方法要三侧同步**：TS 调用侧、Kotlin `@LynxMethod`、iOS `methodLookup`。少任一侧就是静默 no-op（TS 侧的 `mod?.method` 可选链会把它吞掉）。
- **注册也要写**：Kotlin 在 `SongloftApplication` 的 `registerModule(…)`，iOS 在 `ViewController.buildConfig()` + pbxproj 四处。`@LynxMethod` 写全了但没注册 = 模块不存在。
- **事件名逐字一致**：TS 侧订阅名 vs 原生 `sendGlobalEvent` 发出名。

### Android（Kotlin）

| 模块 | 文件 | 职责 |
|------|------|------|
| SongloftAudioModule | `audio/` | ExoPlayer + MediaSession + 前台服务 + EQ |
| SongloftStorageModule | `storage/` | SharedPreferences（prefs）+ Keystore（secure） |
| SongloftPlatformModule | `platform/` | 文件选择、URL 打开、insecureTls 开关 |
| SystemAppearance | `system/` | 深浅色/语言注入 + 变更事件 |
| SongloftFloatingLyric | `lyric/` | 悬浮歌词覆盖层（`SYSTEM_ALERT_WINDOW` + `FloatingLyricService`；两者都必须在 manifest 里声明，见下方闸门一节） |
| SongloftVideo | `video/` | 全屏视频画面。**不持有播放器**：`SongloftVideoActivity` 只把 SurfaceView 借给引擎（`attachVideoOutput`），退出时必须 `detachVideoOutput`，否则 ExoPlayer 继续往已销毁的窗口画、下一首纯音频歌在 video renderer 里静默死掉 |
| SongloftDlna | `SongloftDlnaModule.kt` | SSDP M-SEARCH 发现 + SOAP AVTransport 控制。**TS 侧禁止 `as DlnaModule` 强转**（见本节开头的调用约定，DLNA 页就是这么崩的） |
| SongloftNavigation | `navigation/` | 返回键。三个方法全是 fire-and-forget 无 `Callback`（宿主是跟随方）；反向的「一次返回按键」由 `MainActivity` 经 `sendGlobalEvent` 发出（`LynxView` 在那里）。`BackKeyState` 持有 JS 镜像过来的 `consumable` 标志 + 看门狗。**iOS 刻意不实现**——没有返回键可拦 |
| SongloftSongCache | `cache/` | 单曲离线缓存（download/getCacheInfo/remove/getCacheSize/clearAll）。四条设计约束写在类的 KDoc 里、**每条都是它曾经出过的 bug**：存 `filesDir` 而非 `cacheDir`（用户指定的缓存不能被 OS 回收）、下载走 `InsecureTls`（否则自签名服务器下缓存失败而播放正常）、原子写 `.part` 再 rename、超限报机器可读的 `limit_exceeded` 哨兵而非人话 |
| （非 Lynx 模块）| `net/` | `SongloftHttpService` = 宿主 `fetch` 服务；`InsecureTls` = TLS 开关 |

### iOS（Swift）

| 模块 | 文件 | 职责 |
|------|------|------|
| SongloftAudioModule | `SongloftAudioModule.swift` + `SongloftAudioEngine.swift` | AVPlayer + MediaSession + EQ DSP |
| AudioEqualizer | `AudioEqualizer.swift` | MTAudioProcessingTap + NBandEQ |
| SongloftStorageModule | `SongloftStorageModule.swift` | UserDefaults + Keychain |
| SongloftPlatformModule | `SongloftPlatformModule.swift` | 文件选择、URL 打开、insecureTls 开关 |
| SystemAppearance | `SystemAppearance.swift` | 深浅色/语言注入 |
| SongloftDlna | `SongloftDlnaModule.swift` | NWConnection UDP 多播发现 + SOAP 控制。callback 类型必须是 `@escaping (String) -> Void`，**不能**用 `LynxCallbackBlock`（见 SongloftVideo 那条） |
| SongloftVideo | `SongloftVideoModule.swift` | 全屏视频：`AVPlayerViewController` 接引擎的 `AVPlayer`。三条必须写：`updatesNowPlayingInfoCenter = false`（否则覆盖锁屏元数据）、`videoGravity = .resizeAspect`（否则拉伸）、close 时**先 `vc.player = nil` 再 dismiss**（否则暂停共享播放器）。⚠️ 模块 callback 用错类型（`LynxCallbackBlock`）时 selector 仍能匹配并被调用，但拿不到 scene、**静默返回 false** |
| SongloftLiveActivity | `LiveActivityModule.swift` | 锁屏 Live Activity（`NowPlayingAttributes`）。类是 `@available(iOS 16.2, *)` 而部署目标 16.0 ⇒ `buildConfig()` 里的注册**必须包 `if #available`**，否则硬编译错（批45 踩过）。16.0/16.1 上不注册，TS 侧降级为 no-op |
| SongloftSongCache | `SongloftSongCacheModule.swift` | 单曲离线缓存，与 Android 同契约（含 `limit_exceeded` 哨兵逐字一致，由闸门锁住） |
| （非 Lynx 模块）| `SongloftHttpService.swift` / `InsecureTls.swift` / `InsecureMediaLoader.swift` | 宿主 `fetch` 服务 / TLS 开关 + 共享 `URLSession` / 自签名下的媒体字节流加载器 |

### 契约闸门的覆盖范围

`src/__tests__/native-module-contract.test.ts` 逐字校验 iOS⇔Android 的方法名/事件名/键名。**已无模块级盲区**：**9 个**模块全在闸门内 —— Audio / Storage / Platform / Dlna / Video / SongCache / Navigation / FloatingLyric（Android 独有）/ LiveActivity（iOS 独有）。注册也验（Android 的 `registerModule(...)` 与 iOS `buildConfig()` 里的 `config.register(...)`），每个 `ios/SongloftLynx/*.swift` 还会被逐一核对 pbxproj 四处登记。

闸门现在验的是**语义而非子串**，三处刻意如此（都是踩过才补上的）：

- Kotlin 侧断言 `@LynxMethod\s+fun X(` 正则，不是 `fun X(` 子串 —— 后者抓不到「方法在、注解没了」，而那恰好是静默 no-op 的成因，且旧断言的失败信息还谎称自己在验注解
- iOS 注册断言限定在 `buildConfig()` **切片内**且**先剥注释** —— 只查类名会被 import / 文档注释骗过，不剥注释会被「整行注释掉的 `config.register(...)`」骗过（批45 实测过这一条）
- `project.pbxproj` 与 `Info.plist` 都另有**结构可解析性**闸门（括号配对、标签嵌套、`<key>` 必须有兄弟值），因为子串断言分不清「格式正确」与「恰好含这几个字符」——批39 的教训

新增模块时按 `hosts` 表 + modules 表 + 一段 `describe` 三处扩闸门，**并更新上面那两张平台模块表**。详见 `docs/archive/2026-08-14-audit-fix-plan.md`。

> ⚠️ **最后那一步以前不在清单上，于是漂了**：闸门早已覆盖 9 个模块，而上面两张表只列了 6 个 Android + 5 个 iOS 条目 —— `SongloftDlna` / `SongloftNavigation` / `SongloftSongCache` / `SongloftVideo`(iOS) / `SongloftLiveActivity` 五处缺失，2026-08-26 才补上。**闸门保护的是代码，保护不了描述代码的表格**；而「新增方法要三侧同步」这条铁律的执行者是人，人读的是这张表。同类实例见 §6 与 `docs/project/handoff.md` 文首那条警示。

### 视频画面借用同一个播放器（批49）

全屏视频**不新建播放器**。`SongloftVideoActivity`（Android）只把 `SurfaceView` 借给
`SongloftAudioEngine` 里那个正在放的 `ExoPlayer`（`attachVideoOutput`），iOS 侧同理把
`AVPlayer` 交给 `AVPlayerViewController`。这样 EQ / `MediaSession` / 锁屏 / 进度事件 /
`InsecureTls` 全部零改动继承，也不存在音画不同步或两个 `MediaSession` 抢锁屏。改这块时四条不能碰：

- **退出必须 `detachVideoOutput()`**。ExoPlayer 会一直往拿到的 `Surface` 上画，屏没了还画就变成
  往已销毁的窗口提交 buffer：logcat 刷 `Surface … abandoned`，**下一首纯音频歌**在 video renderer
  里死掉，而应用内完全静默。`android-video-fullscreen.scenario.ts` 最后那条 e2e 专门抓它
- **判断「有没有视频轨」不能读 `videoSize`**：没有 surface 就没有帧输出，尺寸永远是空的 —— 鸡生蛋。
  用 `currentTracks` 的轨道组（来自轨道选择，与是否渲染无关）。这个判断有存在必要：`songs.is_video`
  是扫描时按原文件记的，而远端歌可能是从 `-vn` 转过的缓存里发的
- **画面要 letterbox**。`MATCH_PARENT` 的 surface 会把 640×360 抻成设备形状，**任何状态断言都是绿的**，
  只有截图能看出来。Android 用 `onVideoSizeChanged` → `applyAspect()`；iOS 用 `videoGravity = .resizeAspect`
- **iOS 的 `AVPlayerViewController` 必须 `updatesNowPlayingInfoCenter = false`**，否则它会拿自己那套
  信息覆盖引擎写的锁屏 title/artist/artwork。纯真机可见，单测抓不到，故进了契约闸门

视频源的 direct/转码判定在 `src/core/network/video-source.ts`。那里的 **`'m4a'` 属于视频直出集合不是笔误**：
后端 `songs.format` 用 tag 库的家族命名，一个 H.264+AAC 的 `.mp4` 扫进来是 `format: 'm4a', is_video: true`（实测）。

### `AndroidManifest.xml` 也是契约面（批48）

`src/__tests__/android-manifest-contract.test.ts` 守住它。此前它是唯一**完全没有闸门**的原生契约面，代价是悬浮歌词整个功能死了四个批次没人发现：manifest 既没声明 `SYSTEM_ALERT_WINDOW` 也没声明 `FloatingLyricService`，而**两处都是静默失败** —— `startService()` 解析不到未声明的 Service 不抛异常（系统只打一行 `Unable to start service … not found`），权限未声明则让 app 不出现在「显示在其他应用上层」里，于是 `canDrawOverlays()` 只可能是 false、用户无从授权。更糟的是批43 把这两项记成了「此前已有」，而**没有任何东西会去读那个文件**，所以这句错话与代码之间四个批次里没有对账机会。

闸门**从 Kotlin 源码推导需求，不硬编码清单**（这样新加一个 Service 不需要谁记得来扩这个文件）：

- 基类名以 `Service`/`Activity` 结尾的类必须有 `<service>`/`<activity>` 声明；**反向也验**，防改名留下悬空声明
- 用了 `TYPE_APPLICATION_OVERLAY` / `canDrawOverlays` ⇒ 必须声明 `SYSTEM_ALERT_WINDOW`
- 每个 `foregroundServiceType` ⇒ 必须有配套权限（Android 14 起缺了是 `startForeground()` 处的硬 `SecurityException`）
- `MainActivity` 的 `configChanges` 必须含 `uiMode|locale|layoutDirection`（§4 早就要求，此前无人验）
- XML 结构可解析（同 pbxproj / Info.plist 那两条的理由）

**改 Kotlin 侧的 View 时另记一条**：原生模块方法跑在 Lynx JS 线程上，碰主线程创建的 View 会抛 `CalledFromWrongThreadException`，而模块里常见的 `catch (_: Exception) {}` 会把它整个吞掉——悬浮歌词就是这样「窗口浮出来了、一行歌词也不显示、logcat 干净」。`FloatingLyricService.updateText` 现在经 `Handler(Looper.getMainLooper())` post。判定这类问题**不要靠截图**（当时是白字白底，看不出区别），用与配色无关的量：`dumpsys window windows` 里的 `Requested h` / `mLayoutSeq` 在文本真的写进去时必然变化。

### 宿主 HTTP service 是我们自己的（批45，改网络层前必读）

两个宿主的 `fetch` 都**不再走 SDK 的 HTTP service**，换成了自己的实现，唯一目的是拿到 TLS 钩子：

| | 实现 | 注册 |
|---|---|---|
| Android | `net/SongloftHttpService.kt`（`ILynxHttpService`） | `SongloftApplication` 里注册它而**不注册** `com.lynx.service.http.LynxHttpService` |
| iOS | `SongloftHttpService.swift`（`LynxServiceHttpProtocol`） | `ios/Podfile` **摘掉 `LynxService/Http` subspec**，`AppDelegate` 在 `LynxEnv.sharedInstance()` 之后显式注册 |

- 起因：SDK 两侧的实现都把 client 私有化（Android 是私有 `OkHttpClient()`，iOS 直接用不能挂 delegate 的 `URLSession.shared`），所以「允许不安全的 TLS」**根本到不了 `fetch`**，自签名服务器连登录都过不去
- 两边都是「替换」而非「覆盖」：服务按接口/协议绑定，谁赢没有文档保证，所以直接不给竞争者留位置
- 失败模式是**响亮的**（丢了注册 → 请求全死），刻意不做成「静默回落到忽略 TLS 设置的 SDK 实现」
- 请求/响应映射是 SDK 实现的**逐行转写**（同样的 499 哨兵、同样的 header 拼接、同样的 streaming 分支），只在 TLS 配置一处分叉 —— 改这两个文件时保持这个性质
- **`InsecureTls` 是三条出站路径的唯一开关**（`net/InsecureTls.kt` / `InsecureTls.swift`）：`fetch`、媒体流、以及模块自己的上传/SOAP/封面。**iOS 的媒体流不是靠答复 AVFoundation 的信任挑战**——`AVAssetResourceLoaderDelegate.shouldWaitForResponseTo` 实测（iOS 18.3）对普通 `https` 资源根本不触发，那段代码已删。现在走 `InsecureMediaLoader`：把 asset URL 的 scheme 换成 `songloft-insecure-https`，AVFoundation 因无法自行加载而把每个加载请求交给我们，由 `InsecureTls.session` 拉字节范围。**改它时两条不能碰**：① 加载器的回调队列**不能是 `.main`**（`buildAudioMix` 会在主线程同步等 asset 轨道，回调挂主线程就是自己锁死自己，表现为每次尝试卡约 10 秒后 `-11800`）；② 必须**流式**喂 `respond(with:)`，用 completion-handler 一次性收会把整条剩余音轨读进内存（实测 19MB 文件来了一个 19MB buffer），且 AVFoundation 从此只会从头消费、seek 不会发新的 range
- **关掉开关要立即生效，两端机制不同**：Android 的 `SongloftHttpService.clientFor()` 在标志变化时**重建 OkHttpClient**，新 client 自带新连接池，天然立即生效；iOS 的 `URLSession` 会复用已握手的连接（TLS 按连接协商，复用时不再发起 server-trust 挑战），所以 `InsecureTls.update()` 必须 `invalidateAndCancel()` 并重建 session。**验证「关掉是否生效」时如果不换 hostname，就要确认这条逻辑在**，否则测到的是热连接
- iOS 的 `NSAllowsArbitraryLoads` 只放开**明文 HTTP**，与证书校验无关 —— 曾有注释把它当成自签名支持的依据，那是错的

## 6. 测试与闸门原则（来自三次教训）

- **闸门要验语义，不验子串**。pbxproj 闸门用 `.toContain('X.swift in Sources')`，而写坏的那行**恰好包含该子串**，于是专为「漏登记」设的闸门对真正发生的「写坏了」全绿。结构化文件（pbxproj/plist/JSON）应验**可解析性**。
- **mock 必须保留真实实现的前置条件**。`mock-audio.ts` 的 `play()` 不需要先 `load()` 就能 tick，于是「冷启动播放键无效」在测试里永远不可见。同族前例：Switch mock 丢掉 `checked` 映射。**批46 又一例**：mock 被 `load` **直接告知**时长并同步回显，而真实宿主必须先解析容器、在此之前一律上报 `durationMs: 0`（`C.TIME_UNSET` / `indefinite` 都归一成 0），于是「store 用这个 0 抹掉已知时长」在测试里无法复现——补了 `simulateUnknownDurationProgress()` 才测得到。**判断标准：mock 能不能表达真实宿主的「我还不知道」状态。**
- **写断言时先反向验证它会红**。`scan-model.test.ts` 有一条断言把「元数据再次刷新点了不轮询」这个 bug 当成契约固化了。
- **能力探测器与消费点同批落地**。`platform-capabilities.ts` 写好了却全库无调用点（`tsconfig` 未开 `noUnusedLocals`），导致 Web 上一批入口点了没反应。
- **i18n 闸门的盲区是模板字面量 key**。它验两件事：en/zh 键集完全一致，以及 `src/` 里每个**字面量** `t('…')` 的 key 都存在（`i18n.test.ts:72`，正则只匹配单引号）。所以 `` t(`settings.quality_${o}`) `` 这类拼接不在覆盖内，只有 `DYNAMIC_KEY_PREFIXES` 白名单里的 `settings.quality_` / `eq.preset_` 两个前缀被豁免记账——`settings.floatingLyricFont*` 至今靠人工。搬迁含模板 key 的代码时逐字复制那行表达式，不要「顺手简化」。另：闸门**不查反向**（定义了但无人引用的 key 不会报），删代码时要自己带走它的 key。

## 7. 可用 Skills

- `lynx-api-docs` — Lynx 元素/CSS/布局文档，写页面前必查
- `lynx-ui` — lynx-ui 组件选型与 API
- `lynx-check-css-support` — 按后端/版本核实 CSS 属性支持
