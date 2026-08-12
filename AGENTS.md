# AGENTS.md — Songloft Player (Lynx) 协作规则

本仓库是 **Songloft Player 的 Lynx 客户端**，由 Flutter 版整体重写而来。任何 agent/协作者在此工作前必读本文件。

## 1. 目录边界（硬约束）

- `songloft-player/` — Flutter 产品的**只读参考快照**（上游独立仓库 `songloft-org/songloft-player`，含自己的 `.git`）。**禁止修改其中任何文件**，仅作对照参考。已在 `.gitignore` 排除，不纳入本仓库。
- `docs/` — 迁移调研文档（4 篇：overview / capability_matrix / native_modules_spec / roadmap）。改动需谨慎，属决策依据。
- `plan.md` — 分批实现计划。
- `src/` — Lynx 客户端源码，所有新代码落在这里。
- `patches/` + `pnpm-workspace.yaml` 的 `patchedDependencies` — 依赖补丁，**必须提交**（否则真机修复失效）。

> **重写输入映射**：参考 `songloft-player/AGENTS.md` 与 `docs/` 提供了完整的路由表、feature 结构（`data/domain/presentation`）、API 类清单、核心模型（Song/Playlist/AuthTokens/PlayerState）、Provider 职责——作为本项目重写的需求/设计输入。但其中的 **Flutter 特有包袱在 Lynx 已删除**：`flutter_patcher`/`libapp.so` 热更、Dart 契约哈希闸、Kotlin 冻结规则、Riverpod/GoRouter/Dio、WebF（GPL）——见 `docs/lynx_migration_overview.md` §6。**不要照搬这些。**

## 后端与联调

- 后端 API 默认 `http://localhost:58091`，开发账号 **admin / admin**，接口前缀 `/api/v1`。
- 部署模式（沿用现有产品行为）：**standalone** = 前后端分离，登录页显示 API 地址配置 UI + 不安全 TLS 开关；**embedded** = 同域内嵌后端，隐藏地址 UI。批 3 登录页需保留 standalone 的地址配置分支。

## 2. 技术栈（已锁定，实施时不再讨论）

- 构建/框架/语言：**Rspeedy + ReactLynx + TypeScript**
- 状态：**Zustand**（客户端态）；**TanStack Query**（服务端态，需 no-op `focusManager`/`onlineManager`）
- 路由：**TanStack Router**（memory history；当前 code-based，日后可迁 file-based）
- UI：**lynx-ui**（`@lynx-js/lynx-ui`）+ LUNA tokens + `@lynx-js/motion`。**禁止硬编码颜色/尺寸**，一律走 LUNA tokens / 主题 CSS 变量（`src/shared/theme/`）。
- 数据模型：**zod**（`src/models`，snake_case↔camelCase transform）。**后端会发 `null`，而 zod `.default()` 只兜 `undefined` 不兜 `null`**——可空/可缺字段一律用 `.catch(fallback)`（+ 数值用 `z.coerce.number()`）对齐 Flutter 参考的 `_intFromJson`/`_labelsFromJson` 容错，否则一条 `labels:null`/`song_count:null` 就让整个列表 query 抛错（真机现象：整页 "Could not load …"，非空态）。范例：`src/models/playlist.ts`。
- 桌面宿主：Lynxtron（后续批次）
- 包管理器：**pnpm**（勿用 npm/yarn）

## 3. Lynx 无 DOM 铁律（最易踩坑）

Lynx 不是浏览器：**无 `window` / `document` / `self`**，无 DOM，双线程（主线程 / 背景线程 BTS），事件用 `bindtap` 体系，文本必须包 `<text>`，元素用 `<view>/<text>/<image>`（非 div/span/img）。写页面代码前**先查 `lynx-api-docs` skill**，勿凭 web 经验。

- 引入任何第三方库前，警惕它访问裸 `self`/`window`/`document`/`navigator`——真机会崩，而本机 `build`/`tsc`/vitest 都可能测不到。
- **`globalThis.self = globalThis` 兜底在 Lynx BTS 里对裸 `self` 无效**（BTS 裸 `self` 是独立绑定；node:vm/jsdom 会 fallthrough 因此本机测试会骗人）。正确做法：**优先 patch 掉该访问**（`typeof x` 守卫或改走 `globalThis`），而非注入全局。范例：`patches/@tanstack__router-core@*.patch`。
- **Lynx 宿主提供的全局是「裸全局」而非 `globalThis.X`**：`fetch`（宿主 HTTP service，Android/iOS 2.18+）、`self` 等要用**裸标识符 + `typeof` 守卫**读取（`typeof fetch !== 'undefined' ? fetch : …`），别只查 `globalThis.fetch`（Lynx 上为 undefined）。范例：`src/core/network/http-client.ts`。
- **缺失的「未声明」全局**（如 `AbortController`，Lynx 引擎无、读裸标识符抛 `ReferenceError`）用 **`globalThis.X = …` polyfill 有效**（未声明名的裸读会 fallthrough 到全局对象属性）——注入点是 `lynx.config.ts` 的 raw banner（覆盖 main-thread + background 两个 bundle、最先执行）。`AbortController` 已如此处理（TanStack Router/Query 都会 `new AbortController()`）。
- **`dist/main.lynx.bundle` 是容器**：内含压缩可执行码 **+ 未压缩调试源段**（注释、错误消息字符串都会出现）。对产物做 grep 校验时要排除注释/字符串误匹配（见 `background-bundle-self.test.ts`）。
- lynx-ui **按组件包导入**（如 `@lynx-js/lynx-ui-button`），勿用桶入口 `@lynx-js/lynx-ui`（桶入口会 eager 加载全部子包、污染测试环境）。
- **lynx-ui 的 compound 组件自身不带样式**：`Switch`/`SwitchTrack`/`SwitchThumb` 这类只把 `ui-checked`/`ui-active`/`ui-disabled` 追加到你给的 className 上，**「选中/按下」的视觉完全由使用方样式表提供**——漏写 `.x.ui-checked` 规则，开关就永远长一个样（批19 真机 bug）。这类组件**一律走已封装好状态样式的 `src/shared/ui/AppSwitch.tsx`，不要再手搭 compound 树**（三处手抄导致第三份抄漏，`app-switch-css.test.ts` 现在会拦第四份）。
- **测试 double 不许抹掉被测状态**：`_render-mocks.tsx` 里的 Switch stub 原先丢掉 `checked`，ON/OFF 渲染成同一棵树，于是上面那个 bug 一路绿灯上真机。mock 原生叶子时**必须保留「状态 → className/属性」这条映射**，否则渲染断言只是在验证 mock 自己。
- **带连字符的 JSX 属性完全没有类型保护**：TypeScript 对含 `-` 的 JSX 属性名一律豁免未知属性检查，而 Lynx 的元素属性几乎全是这种形状。所以 `scroll-x`（**已废弃**，正确写法 `scroll-orientation="horizontal"`）、拼错的 `enable-nested-scrol` 都能过 `tsc` 和 build，只在真机上静默失效——与 CSS 侧的 `placeholder-color` 同一类陷阱。写这类属性时**必须配一条产物 grep 测试**证明它真进了模板（范例：`home-section-scroll.test.ts`）。
- **`<refresh>` 吞掉横向手势**：`<refresh>` 内的横向 `scroll-view` 在 Android 上**完全收不到拖拽**（`bindscroll` 不触发），而 `getScrollInfo` 的 `scrollRange` 和 `scrollTo` 都正常——**测量对、程序滚动对、手指无效**，极易误判成 CSS 问题。`<refresh>` 没有手势过滤属性，唯一解法是手指按在横向区时把 `enable-refresh` 置 false（范例：`HomeSection` 的 `onStripTouch` → `HomePage`）。
- **横向 `scroll-view` 的内容行必须 `width: max-content`**：否则它被按视口宽度布局、子元素溢出被裁，滚动时平移的正是这一行——于是 `scrollRange` 算得对但**视觉毫不动**。同时 scroll-view 自身只负责尺寸（显式 `width`+`height`），`display:flex` 要放在内层 view（本仓所有可用的 `scroll-y` 都是这个分工）。
- **「跟随系统」（深浅色 / 语言）在 Lynx 里没有任何 JS 侧来源**：无 `prefers-color-scheme`、无 `matchMedia`、无 locale API（`SystemInfo.theme?: object` 也只是宿主 `setTheme` 塞进去的东西）。必须由宿主注入，且**两条通道都不可省**：`LynxLoadMeta.setGlobalProps` → `lynx.__globalProps` 送**初值**（在 `loadTemplate` 之前，所以首帧就是对的主题、不闪；原生模块 getter 做不到——异步、答案晚于启动帧），`LynxView.sendGlobalEvent` 送**变更**（globalProps 更新不会通知已在跑的页面）。**`LynxView.setGlobalProps` 两个重载都已弃用**，用 `LynxLoadMeta.Builder()`。范例：`src/native/system-appearance.ts` ↔ `android/.../system/SystemAppearance.kt`（key/事件名必须逐字对齐）。
- **`android:configChanges` 漏一项就整包重载**：`uiMode` 只管深浅色；**语言切换要 `locale|layoutDirection`**，漏了会重建 Activity → bundle 重载、JS 状态全丢（还容易被误读成「跟随系统生效了」，因为重载后确实是新语言）。
- **订阅到了、值没变，React 就不重渲染**：`'system'` 这类间接选择要把**已解析**的结果放进 state。`ThemeProvider` 原来存 `AppTheme` 选择，系统翻转时选择仍是 `'system'`、`setState` 同值写入被跳过——模型层全对而 UI 永不跟随（批21 真机 bug）。这类「订阅 + 派生值」一律存派生结果，并配一条渲染层断言。
- **`<svg src={url}>` 远程加载在本宿主不可用**：URL 加载由宿主注册的 `GenericResourceFetcher` 负责，`android/` 宿主没注册，真机 logcat 报 `getGenericResourceFetcher is null, svg fetch src failed!` 且**无 `binderror` 可挂兜底**。远程 SVG 一律「用已鉴权 client 取文本（`parseJson: false`）→ `<svg content>`」，并校验响应确实以 `<svg` 开头（插件静态端点对未知路径会 SPA fallback 成 200 + HTML）。范例：`usePluginIconQuery`。

## 4. 分批工作流

按 `plan.md` **顺序分批**实现，一批一个聚焦范围。**每批过验收后暂停等确认，再进下一批**。

**每批验收后必须更新 `docs/PROGRESS.md`**（当前进展、本批交付、遗留/未完成事项与风险），保证随时可交接。

## 5. 验收标准（每批必须全绿）

本机自动验收：
```
pnpm run build          # rspeedy 构建（内含 type checker，是类型的真闸）
pnpm exec tsc -b        # 类型检查（必须带 -b，见下）
pnpm test               # vitest run
```
真机目测有两条路：
- **Android 模拟器/真机（推荐，批20 起可用）**——本机已装 Android SDK，可直接出包并装设备：
  ```
  export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
  pnpm run android:install      # build + 拷 bundle 进 assets + gradlew installDebug
  adb reverse tcp:58091 tcp:58091   # 让设备的 localhost 指向宿主机后端
  adb shell am start -n org.songloft.lynx/.MainActivity
  adb logcat -s lynx:V LynxUISVG:E AndroidRuntime:E   # 真机报错都在这
  ```
  首轮 gradle 要下载依赖（~8 分钟），之后增量安装约 **4 秒**，可以快速迭代。
  用 `adb exec-out screencap -p > /tmp/x.png` 截图核对，`adb shell input tap/swipe` 驱动交互；
  判断「有没有变化」用 PIL 比对像素 bbox，比肉眼看截图可靠。
  改系统设置的两个杠杆：`adb shell cmd uimode night yes|no`（深浅色）、
  `adb shell cmd locale set-app-locales <pkg> --locales en-US`（应用语言，API 33+，传 `""` 清除）。
  **这条路解除了 PROGRESS 里长期的「Kotlin 只能靠 CI 验」限制**——原生改动现在能本机编译+运行。
- LynxExplorer 扫码：`pnpm run dev` 起 dev server + 二维码。改前端时热更更快，但验不了原生。

> ⚠️ **`adb shell input swipe` 能驱动纵向滚动，但驱不动被 `<refresh>` 包裹的横向 scroll-view**
> ——那不是模拟器的锅，是真实缺陷（见 §3）。要区分「手势没到」和「元素不能滚」，
> 用 `getScrollInfo` 读 `scrollRange` + `scrollTo` 主动滚一次：两者正常而手指无效，就是手势被拦。

> ⚠️ **类型检查必须用 `tsc -b`，`tsc --noEmit` 是空跑。** 根 `tsconfig.json` 是
> solution-style（`"files": []` + `references` 指向 `./src` 与 `./tsconfig.node.json`），
> 对它执行 `tsc --noEmit` 的输入文件集为空——**什么都不检查，永远 exit 0**。
> 本仓库自批1 起验收清单里写的就是 `--noEmit`，所以那一行一直是安慰剂；真正拦住
> 类型错误的是 `pnpm run build` 里的 rspeedy type checker（批19 实测：一个
> `SetStateAction<'admin'>` 错误被 build 拦下、`--noEmit` 完全静默）。
> `tsc -b` 会写 `*.tsbuildinfo`（已在 `.gitignore`）；改动没被检测到时用 `tsc -b --force`。

**验证要忠实**：不要只信 vitest（jsdom/node 环境与 Lynx BTS 语义不同）。凡涉及运行时全局/无 DOM 行为，**静态检查真机实际运行的产物**（build 后 grep `dist/main.lynx.bundle`；dev 则 curl dev server 的 `main.lynx.bundle`），确认危险代码已被守卫。参见 `src/__tests__/background-bundle-self.test.ts`、`router-no-dom.test.tsx`。

> ⚠️ **受限沙箱里 `pnpm test`/`pnpm run build` 可能被 `WebAssembly.instantiate(): Out of memory` 挡住**（批26 定位）：根因是沙箱 `ulimit -v` 上限（约 23.8GB 这一档）配 V8 默认的 trap-handler-based WASM 越界检查——每个 `WebAssembly.Memory` 实例会保留约 10-12GB guard-page 地址空间（与声明的 `maximum` 无关），这类沙箱里最多只够 2 个实例，而 Node 内建 `undici`（`lazyllhttp`）加上 `@lynx-js/react` 的 transform WASM 刚好是致命的第 3 个。**遇到这个报错直接设 `NODE_OPTIONS=--disable-wasm-trap-handler` 再跑**（Node 原生 flag，允许写进 `NODE_OPTIONS`），关掉 guard-page 保留、改走显式边界检查，无需重新排查。这是运行环境问题，不是仓库配置问题，不必写进任何仓库文件。

> ⚠️ **`pnpm run build` 在 24G 虚拟上限下仍会 OOM（批27 定位）**：`NODE_OPTIONS=--disable-wasm-trap-handler` 对 `pnpm test` 够用，但 `pnpm run build` 里 Rspack 的 loader worker（`node::worker::Worker`）会另起 V8 Isolate，与主进程已占的 WASM 虚拟叠加，撞 `Failed to reserve virtual memory for CodeRange` / `SegmentedTable::InitializeTable`。实测 2 个 4GB-max WASM 在 flag 下从 21.7G 降到 9.1G（flag 生效），但 build 的实例更多。**根因是本机 `~/.bashrc` 里 `ulimit -v 25000000`（≈24G，且无 `-S` 同时锁了硬限）**——改这行（提到 120G = `ulimit -v 120000000` 或 `unlimited`）后**必须重启 cloudcli-runner 会话**新上限才生效（当前会话硬限已锁，`ulimit -v unlimited` 报 Operation not permitted）。`RSPACK_LOADER_WORKER_THREADS=1` / `--single-threaded` / 调 `--max-old-space-size` 都救不了，唯一解是抬 `ulimit -v`。

- Vitest 测试文件正文中**禁止出现字面量 `@vitest-environment`**（散文里也会被 Vitest 当指令解析而切换环境）。

> ⚠️ **验「跟随系统」类功能前，先确认应用里选中的就是「跟随系统」。** 批21 首次装包截图是
> 浅色 + 中文、与系统设置完全一致，看着一次就成——实际是早前批次测试留下的**显式选择**
> （语言=中文/外观=浅色）恰好撞上系统值，而显式选择下忽略系统变化正是**正确**行为。
> 同理适用于任何「默认/自动」分支：**先把选项摆到被测分支，再判断结果**，否则显式配置
> 会伪装成功能生效。

## 6. Git 提交约定

- 在**关键节点**提交（每批验收通过后）。
- **Conventional Commits** 格式：`type(scope): description`（如 `feat(auth): 登录页与鉴权守卫`、`fix(router): 守卫 self.__TSR_ROUTER__`）；description 用简体中文，简洁说明改动与验收结果。
- **禁止添加 `Co-Authored-By` 尾注。**
- 引用父仓库 issue **必须带完整路径** `songloft-org/songloft#NNN`（只写 `#NNN` 会被 GitHub 解析为本仓库 issue）。
- **禁止提交**：`node_modules/`、`dist/`、`.rspeedy/`、`songloft-player/`、`.claude/settings.local.json`（已在 `.gitignore`）；`patches/`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` **必须提交**。
- 分支：`main`；远程：`origin`（`git@github.com:songloft-org/songloft-player-lynx.git`）。

## 7. 可用 skills

- `lynx-api-docs` — Lynx 元素/CSS/布局文档，**写页面前必查**。
- `lynx-ui` — lynx-ui 组件选型与 API。
- `lynx-check-css-support` — 按后端/版本核实 CSS 属性支持（勿凭浏览器经验）。
