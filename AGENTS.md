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
docs/                   项目文档（见 docs/README.md）
  reference/           规范与参考（api-design-conventions.md）
  migration/           迁移调研历史
  plans/               待执行的开发/修复计划（含 archive/ 已归档的历史计划）
  testing/             E2E 测试架构设计
  tracking/            开发进展（PROGRESS.md）与 bug 跟踪
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

- 新增 store 方法、修改签名前先查 `docs/reference/api-design-conventions.md`（参数风格、数值范围、命名、E2E store 暴露约定）
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
详见 `docs/testing/behavior-testing-design.md` 和 `e2e/` 目录。

### Git

- 分支：`main`，远程：`origin`（`git@github.com:songloft-org/songloft-player-lynx.git`）
- Conventional Commits：`type(scope): 简体中文描述`
- 禁止 `Co-Authored-By`；issue 引用用 `songloft-org/songloft#NNN`
- `patches/` / `pnpm-lock.yaml` 必须提交；`node_modules/` / `dist/` / `songloft-player/` 禁止提交

### 工作流

- 按 `docs/migration/plan.md` 顺序分批实现，一批一个聚焦范围
- 每批验收后更新 `docs/tracking/PROGRESS.md`
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

- **按组件包导入**（`@lynx-js/lynx-ui-button`），禁用桶入口 `@lynx-js/lynx-ui`
- compound 组件（Switch 等）不带样式，`ui-checked`/`ui-active` 须使用方样式表提供——统一用 `src/shared/ui/AppSwitch.tsx`
- 测试 mock 原生组件时必须保留「状态→className」映射

### 事件与布局

- `<refresh>` 会吞掉内部横向手势——手指在横向区时需置 `enable-refresh=false`
- 横向 `scroll-view` 内容行须 `width: max-content`，否则视觉不滚动
- 带连字符的 JSX 属性无类型检查（`scroll-x` 等拼错不报错），须配产物 grep 测试

### 系统跟随（深浅色/语言）

- Lynx 无 `prefers-color-scheme`/`matchMedia`/locale API
- 宿主两条通道：`LynxLoadMeta.setGlobalProps` 送初值（首帧正确），`sendGlobalEvent` 送变更
- `android:configChanges` 须含 `uiMode|locale|layoutDirection`，否则切换时 Activity 重建
- `'system'` 选择须存解析后的派生值到 state，否则同值写入被 React 跳过

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
| （非 Lynx 模块）| `net/` | `SongloftHttpService` = 宿主 `fetch` 服务；`InsecureTls` = TLS 开关 |

### iOS（Swift）

| 模块 | 文件 | 职责 |
|------|------|------|
| SongloftAudioModule | `SongloftAudioModule.swift` + `SongloftAudioEngine.swift` | AVPlayer + MediaSession + EQ DSP |
| AudioEqualizer | `AudioEqualizer.swift` | MTAudioProcessingTap + NBandEQ |
| SongloftStorageModule | `SongloftStorageModule.swift` | UserDefaults + Keychain |
| SongloftPlatformModule | `SongloftPlatformModule.swift` | 文件选择、URL 打开、insecureTls 开关 |
| SystemAppearance | `SystemAppearance.swift` | 深浅色/语言注入 |
| （非 Lynx 模块）| `SongloftHttpService.swift` / `InsecureTls.swift` / `InsecureMediaLoader.swift` | 宿主 `fetch` 服务 / TLS 开关 + 共享 `URLSession` / 自签名下的媒体字节流加载器 |

### 契约闸门的覆盖范围

`src/__tests__/native-module-contract.test.ts` 逐字校验 iOS⇔Android 的方法名/事件名/键名。**批41–45 后已无模块级盲区**：Audio / Storage / Platform / Dlna / FloatingLyric / LiveActivity 全在闸门内，注册也验（Android 的 `registerModule(...)` 与 iOS `buildConfig()` 里的 `config.register(...)`），每个 `ios/SongloftLynx/*.swift` 还会被逐一核对 pbxproj 四处登记。

闸门现在验的是**语义而非子串**，三处刻意如此（都是踩过才补上的）：

- Kotlin 侧断言 `@LynxMethod\s+fun X(` 正则，不是 `fun X(` 子串 —— 后者抓不到「方法在、注解没了」，而那恰好是静默 no-op 的成因，且旧断言的失败信息还谎称自己在验注解
- iOS 注册断言限定在 `buildConfig()` **切片内**且**先剥注释** —— 只查类名会被 import / 文档注释骗过，不剥注释会被「整行注释掉的 `config.register(...)`」骗过（批45 实测过这一条）
- `project.pbxproj` 与 `Info.plist` 都另有**结构可解析性**闸门（括号配对、标签嵌套、`<key>` 必须有兄弟值），因为子串断言分不清「格式正确」与「恰好含这几个字符」——批39 的教训

新增模块时按 `hosts` 表 + modules 表 + 一段 `describe` 三处扩闸门。详见 `docs/plans/2026-08-14-audit-fix-plan.md`。

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
- **i18n 闸门只防 en/zh 漂移，不防未定义 key** —— 这就是登出弹窗的取消按钮字面显示 `common.cancel` 的原因。加 key 时记得两侧同形。

## 7. 可用 Skills

- `lynx-api-docs` — Lynx 元素/CSS/布局文档，写页面前必查
- `lynx-ui` — lynx-ui 组件选型与 API
- `lynx-check-css-support` — 按后端/版本核实 CSS 属性支持
