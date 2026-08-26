# 审计修复计划（2026-08-14）

> **来源**：批40 收尾后的一次四路并行代码审计（Web 平台完整性 / 正确性缺陷 / Flutter 功能缺口 / 原生模块契约与「待验证」项核实）。
> **性质**：本文件是**待执行的修复与开发计划**，不是进展记录。每批完成后把交付内容写进 `../project/progress.md`，并在此勾选。
> **证据标记**：`✅复核` = 本次审计中已亲自运行命令 / 读源码确认；`🔍待复核` = 有明确 `file:line` 证据但未再次独立验证，动手前先花一分钟确认。

## 为什么会积累这些问题——三类系统性错误

修具体 bug 之前先看这一节。**下面 3 类根因合计解释了本次发现的绝大多数缺陷**，只修表象一定会再犯。相应的铁律已写入 `../../AGENTS.md`。

### 根因 1：把「realm 探测」当成「平台判断」

Lynx 是双线程模型，而 `@lynx-js/web-core` 把**背景线程实现为真正的 Web Worker**（`new Worker(…, { name: 'lynx-bg' })`）。业务组件跑在那个 realm 里，那里 **没有** `document`、`localStorage`、`sessionStorage`、`HTMLAudioElement`（`window` 却诡异地是 `object`）。

于是任何形如 `typeof <DOM 全局> !== 'undefined'` 的判断，在 **Web 平台上会回答「不是 Web」**。同一个错误已经踩到 **三次**：

| 次序 | 表现 | 探测什么 | 结局 |
|---|---|---|---|
| 1（批36） | 首页顶部永久显示「下拉刷新…」 | `window` + `document` | 修错方向，批40 后修才真修好 |
| 2 | Web 刷新页面掉登录 | `localStorage` | 落到内存存储，token 随页面蒸发 |
| 3（本次） | **Web 完全没有声音** | `HTMLAudioElement` | 落到 mock，见 P0-2 |

**铁律**：判断平台只能用 `isWebPlatform()`（读 `SystemInfo.platform`，两个 realm 都有）。DOM 探测只允许用来守卫紧随其后的那几行 DOM 调用，**不允许**用来选择实现分支。

### 根因 2：闸门测试验「子串存在」而不验「语义正确」

`src/__tests__/native-module-contract.test.ts:187` 用
`section('PBXSourcesBuildPhase')` 切片后 `.toContain('SongloftDlnaModule.swift in Sources')`。
而 P0-1 那行畸形文本**恰好包含这个子串**，所以专为「iOS 漏登记」设计的闸门，对真正发生的「pbxproj 写坏了」全绿通过。

同族问题还有两处：

- `scan-model.test.ts:175`「forced still stops once a terminal state arrives」**把 bug 当成契约断言固化了**（见 P2-6）。
- `mock-audio.ts:65` 的 `play()` 不需要先 `load()` 就能 tick，**掩盖了**冷启动时播放键无效（见 P2-4）。

**铁律**：① 结构化文件（pbxproj / plist / JSON）要验**可解析性**，不是子串；② mock 必须保留真实实现的**前置条件**，否则测试在证明一个不存在的世界；③ 写断言时先反向验证它会红。

### 根因 3：写了能力探测器却没接上

`src/native/platform-capabilities.ts` 的文档注释明确写着它的用途是「在 Web 上隐藏悬浮歌词 / Live Activity / DLNA 入口」。实际上 `getPlatformCapabilities()` **全库无调用点**，只在 `src/native/index.ts:31` 被 re-export；`:43` 算出 `const isWeb` 后**根本没用**（`tsconfig` 未开 `noUnusedLocals`，无人报警）。

这一条同时是**多个「点了没反应」缺陷的共同上游**：DLNA 按钮、悬浮歌词开关、数据导出在 Web 上照样渲染，点下去静默失败。

**铁律**：能力探测器与它的消费点必须在**同一批**落地，并配一条「入口在 X 平台不渲染」的测试。

---

## 批41 · P0 阻断

> **状态：P0-0 / P0-1 / P0-3 已完成**（2026-08-14，见 `../project/progress.md` 批41）。P0-2 / P0-4 / P0-5 仍未开始。
>
> 排在最前的 P0-0 是**修文档时顺手撞出来的**，不在四路审计的产出里 —— 它一行就能修，但影响面比其他所有 P0 都大。
>
> ⚠️ **P0-3 的根因在实施中被推翻了一半**：文件名只是表层，真根因是加载方式（`import.meta` 要求 `type="module"`）。下方 P0-3 小节已订正——**这条值得记**：如果当时只按原判断改文件名就收工，页面依然是黑的，而所有闸门都会绿。

### P0-0 `pnpm run build` 不再产出原生 bundle，Android/iOS 一直在打包陈旧产物 ✅已修复

**证据**：`lynx.config.ts:133` 的 `environments: { web: { … } }` **替换**掉了 rspeedy 的隐式默认环境，而不是追加。于是 `rspeedy build` 只构建 `web`：

```
$ pnpm run build
File (web)                 Size
dist/web/main.web.bundle   1807.6 kB      ← 只有这一个
```

实测 mtime 前后不变，`dist/main.lynx.bundle` **根本没被重写**；且 `pnpm exec rspeedy build --environment lynx` 报错——不存在名为 `lynx` 的环境。

**影响链**：`build:android-bundle` 与 `build:ios-bundle` 都是 `rspeedy build && copy-bundle-*.mjs`，而 `copy-bundle-android.mjs:19` 从 `dist/main.lynx.bundle` 取文件。**构建不刷新它，拷贝却照拷** → 装进 APK / .app 的是上一次留在 `dist/` 里的任何东西。

**时间线**（已核对 commit 时间与文件 mtime）：`2330c22`（Web 支持）于 08-13 23:35 引入该 `environments` 块；`dist/main.lynx.bundle` 的 mtime 停在 **08-13 22:52**，即那之前。发现时它是 **6.5 MB** —— 一份 `rspeedy dev` 留下的未压缩 dev bundle（生产版约 1.76 MB）。**自 08-13 23:35 之后的任何原生构建都在嵌入这份陈旧 dev 产物**，两次 Web 修复与其后的改动均不在其中。

**已落地的修法**：显式声明两个环境。

```ts
environments: {
  lynx: {},          // ← 加这一行，隐式默认环境被 environments 块替换掉了
  web: { output: { distPath: { root: 'dist/web' } } },
},
```

改完 `pnpm run build` 同时输出两个产物（实测 `dist/main.lynx.bundle` 1762.1 kB + `dist/web/main.web.bundle` 1807.6 kB）。

**同时落地**：新增 `scripts/assert-bundle-fresh.mjs`，两个 copy-bundle 脚本都改为调用它 —— 若 `dist/main.lynx.bundle` 的 mtime 早于 `src/` 或 `lynx.config.ts`/`package.json` 里最新的源文件，**直接 fail 并给出「检查 build 输出是否列出 File (lynx)」的指引**，而不是静默拷贝。`existsSync` 抓不到这类缺陷，因为文件确实存在，只有年龄能暴露它。

**验收**：`pnpm run build` 同时输出 `dist/main.lynx.bundle`（1762.1 kB）与 `dist/web/main.web.bundle`（1807.6 kB）；两个 copy 脚本正常拷贝；反向验证 —— `touch src/index.tsx` 后再拷贝，脚本以退出码 1 拒绝并提示 stale。

### P0-1 iOS 工程文件损坏，自批39 起完全无法构建 ✅已修复

**证据**：`ios/SongloftLynx.xcodeproj/project.pbxproj:255` 在 `PBXSourcesBuildPhase` 的 `files = ( … );` **数组内部**插进了一行 `PBXBuildFile` 赋值语句（第 23 行已有正确的那一份，这是重复）。实测：

```
$ xcodebuild -list -project ios/SongloftLynx.xcodeproj
Error Domain=NSCocoaErrorDomain Code=3840 "JSON text did not start with array or object…"
```

`5f51f0c`（批39 DLNA）引入。`ios/build/DerivedData` 最后修改时间早于该提交，即**该提交后 iOS 一次都没构建过**；批39/40 声称的「build 全绿」全部只是 rspeedy 的 JS 产物。

**已落地的修法**：删掉 `:255` 那一行；契约闸门新增 `describe('the hand-written pbxproj is structurally well-formed')`（2 例）—— ① 元素列表体内不得出现 `{isa = …}` 对象赋值（按括号深度逐行判定，注释与字符串先剥离）；② 括号与花括号配平。纯 JS，不依赖 Xcode，CI 可跑。

**一个值得记的观测**：反向验证时，**「括号配平」那条在损坏文件上是绿的** —— 畸形行本身是配平的。真正起作用的是「列表里不许有赋值」这条精准断言。泛泛的结构检查给不出这个保证。

**验收**：`xcodebuild -list` 恢复正常；**`pnpm run ios:build` 完整通过（`BUILD SUCCEEDED` ×2，`.app` 内含 `main.lynx.bundle`）** —— 不只是能解析，是真的编译出来了。闸门反向验证精确报出 `line 255: AA…0035 /* SongloftDlnaModule.swift in Sources */ = {isa = PBXBuildFile; …}`。

### P0-2 Web 端完全没有声音，而且看起来一切正常 ✅复核

**证据**：`src/native/web-audio.ts:30` 的 `isWebAudioEnvironment()` 是 `typeof HTMLAudioElement !== 'undefined'` —— 根因 1 的第三次。`src/native/audio-facade.ts:64` 是 `WebSongloftAudio` 的**唯一**构造点，在 worker realm 里那个判断恒 false，于是落到 `createMockAudio()`。那 ~560 行**从未在任何平台执行过**，也没有任何测试。

**为什么假象完美**：`player-store.ts:228` 把真实 `durationMs` 传给 mock，`mock-audio.ts:193` 于是模拟出正确时间轴并按时 fire `ended`。**进度条走、时间跳、自动切下一首、就是不出声**。

**关键取舍：改判断救不回来。** `new Audio()`、`new AudioContext()`、`navigator.mediaSession` 全是主线程 API，把 `isWebAudioEnvironment()` 换成 `isWebPlatform()` 只会把静音换成 `ReferenceError`。真做只有一条路：

> 通过 web-core 的 `nativeModulesMap`（`LynxView.js` 的真实能力）在**主线程**注册一个宿主侧 `SongloftAudio`，让 worker 里的 `NativeModules.SongloftAudio` 有值，从而走**已有且测试完备**的 `NativeSongloftAudio` 分支。EQ / mediaSession / 锁屏控件一起白拿。

这同时是 P3-11（Web 上 `openURL` / 文件选择）的唯一解锁路径，所以**主线程宿主桥接应当作为一个独立批次**（批43），而不是塞进批41。

**批41 内先做能做的**：`web-audio.ts` 顶部加一段醒目注释说明它当前是 dead code 及原因，避免下一个人以为 Web 音频已经有了；`getPlatformCapabilities` 接上后（P1-3）让 Web 上不再显示「正在播放」之外的音频相关承诺。

**工作量**：注释极小；真实现（批43）大。

### P0-3 `pnpm run build:web` 的产物是黑屏 ✅已修复（根因两层，第二层是实施时才发现的）

**第一层（审计发现）**：文件名对不上。

| | |
|---|---|
| `web/index.html` 原先请求 | `/web-core/static/{css/index.css, js/index.js}` |
| `build:web` 实际产出 | `css/client.css`、`js/client.js` |

**为什么一直没被发现（包括审计前的我）**：`serve.mjs` 优先使用 dev-middleware 的 `www/static`（那里确实叫 `index.js`），所以 `web:dev` 正常、`build:web` 坏；之前用无头浏览器验证两次 Web 修复时走的恰好是前者，**完整绕过了这个 bug**。

**第二层（改完文件名后才暴露，靠真的加载产物才发现）**：页面**依然全黑**。真实异常是

```
Cannot use 'import.meta' outside a module
```

`client_prod` 的入口是 **ES module**，必须 `<script type="module">`；原先是 `<script defer>`。而这个异常**不进 `console.error`**（只走 `pageerror`），所以表现是「资源全 200、零 console 错误、`<lynx-view>` 就是不 upgrade」。dev-middleware 那份入口是传统 IIFE，没有这个约束——这也解释了为什么两套资源看起来「只差一个文件名」。

**已落地的修法**：

1. `web/index.html` 指向 `client.css`/`client.js`，且入口改为 `<script type="module">`（module 默认 deferred，原 `defer` 已多余）
2. `serve.mjs` 与 `copy-bundle-web.mjs` **统一用 `client_prod`** —— 两套资源除入口文件名外结构完全相同（async chunk、wasm 哈希、版本号都一致），统一后「dev 能跑 / prod 不能跑」这个类别从结构上消失
3. 新增闸门 `src/__tests__/web-host-page.test.ts`（6 例）：index.html 的每个本地引用都能在 `client_prod` 里解析、bundle 名与拷贝脚本一致、**入口以 module 加载**、serve 与 copy 用同一套资源。两条关键断言都做过反向验证

**验收**：`build:web` 产物用无头 Chrome 真的打开 —— `lynx-view` 已注册（`x-view`/`x-text`/`x-image` 均在）、wasm 200、**零 pageerror**、登录页完整渲染（截图确认 Muse 配色 + 中文 locale + TLS 开关）。

**教训**：如果按审计的原判断只改文件名就收工，页面依然是黑的，而 build/tsc/test 全绿。**「资源 200」不等于「脚本跑起来了」**。

### P0-4 embedded 模式的 Web 产物根本没有宿主页 🔍待复核

**证据**：`scripts/copy-bundle-web.mjs:65` 的 `if (!isEmbedded)` 守着**唯一**一处 index.html 拷贝（`:66-67`）。于是 `build:web-embedded` 只把 bundle 和 `web-core/static/**` 铺进 `songloft-player-build/web-embedded/`，而那个目录是一份完整的 Flutter 构建，Go 侧 `internal/app/embed.go` 无条件服务它的 `index.html`。

**后果**：嵌进 Go 二进制后访问 `/` 仍然是**旧的 Flutter 应用**，且因为 `cpSync` 是合并而非清理，~9 MB 的 `canvaskit/` 会一直烤在二进制里。

**修法**：产出 embedded 版 index.html（与 standalone 的差异是隐藏服务器地址 UI）+ 拷贝前清理目标目录。**注意**：这一条涉及后端仓库的嵌入路径约定，改动前确认 `songloft-player-build/web-embedded` 仍是后端 `make build` 读取的路径。

**工作量**：小–中。

### P0-5 Web 端无法得知后端地址 🔍待复核

**证据**：`src/core/config/app-config.ts:41` 的 `DEFAULT_BASE_URL` 硬编码 `http://localhost:58091`；`:89` 的 `deployMode = 'standalone'` **全库没有写入点**（只有 `:126` 的 `reset()`）；`:64` 的 `devCredentials` 仍是 `admin`/`admin`。Flutter 版是靠宿主注入 `deploy-mode.js` 解决的，`web/index.html` 没有等价物。

**后果**：用户从 `http://192.168.1.5:58091/` 打开页面，登录页仍预填 `http://localhost:58091`，所有 API 打到**访问者自己的机器**。手机上永远不可能成功。

**便宜的修法**：worker realm 的 `WorkerGlobalScope.location` **仍然报告页面 origin**，所以在应用代码里读 `location.origin` 即可自动判定 embedded/同源，无需宿主注入。目前无人读它。

**工作量**：小。

---

## 批42 · 一眼可见的缺陷（都是小改动，互不耦合）

| # | 缺陷 | 证据 | 状态 | 量 |
|---|---|---|---|---|
| P1-1 | **登出确认框的取消按钮字面显示 `common.cancel`** | `SettingsPage.tsx:429` 调用它，而 `resources.ts` 的 `common` 组只有 `loading`/`loadingMore`/`retry`/`unknown`/`untitled`/`songCount*` —— 没有 `cancel`。中英双语都是裸 key。正确文案在 `i18n/generated/{en,zh}.json:49` 现成 | ✅复核 | 极小 |
| P1-2 | **播放进度从不落盘，「续播」永远从 0 开始** | `player-store.ts:564` `Math.abs(currentTime - prev.currentTime) > 5_000`，而 progress 事件步长是 250ms（mock/web）/ 500ms（Android），**该条件正常播放中永不成立**。唯一触发是切歌归 0（存的正是 0）。附带：`setTimeout` 回调用的是闭包捕获的 `state` 快照，不是 flush 时的最新值 | ✅复核 | 小 |
| P1-3 | **DLNA 页在 Android 真机上一进去就崩** | `dlna.ts:22` 把原生模块直接 `as DlnaModule` 强转成 Promise 接口，而 Kotlin 侧是 `startDiscovery(callback: Callback)`。`DlnaPage.tsx:24` 的 `.then()` 落在 `undefined` 上 → TypeError，`useEffect` 挂载即炸。本仓库自己的约定就写在 `core/storage/native-storage.ts:13`（原生写是 fire-and-forget、读是 callback，**由 TS 层 promisify**），这里没照做 | ✅复核 | 小 |
| P1-4 | **冷启动后 mini player 的播放键完全无效** | 自动续播默认关闭时，`restorePlaybackState`（`player-store.ts:612`）只写 store、不调 `audio.load`；`togglePlay` 只发 `play()` 也不补 load。ExoPlayer / AVPlayer 在没有 media item 时静默 no-op。**被 mock 掩盖**（根因 2） | 🔍待复核 | 小 |
| P1-5 | **切换服务器立刻被踢回登录，并连带抹掉目标服务器的 token** | `switchTo`（`server-store.ts:149`）只写 secure storage，而 `TokenStore.getAccessToken()`（`token-store.ts:22`）`if (this.cachedAccess) return` —— **永不回读 storage**，没有任何地方让它失效。于是拿 A 的 token 打 B → 401 → 用 A 的 refresh token 找 B 刷新 → 失败 → logout。现有测试只断言 storage 被写入，从不检查客户端实际取到哪个 token | ✅复核 | 中 |
| P1-6 | **元数据「再次刷新」点了不开始轮询** | `scan-model.ts:319` 把 `if (progress.isDone) return false` 放在 `forced` 判断**之前**，短路掉了专为这个竞态设计的 sticky `forced`。**且 `scan-model.test.ts:175` 把该 bug 断言成了契约**。正确模板就在同仓库 `DuplicateCheckPage.tsx:119` 的 `computingSinceRef` 时间戳守卫 | 🔍待复核 | 小 |
| P1-7 | **`getPlatformCapabilities()` 接上消费点** | 根因 3。接上后 Web 上的 DLNA 按钮（`FullPlayerPage.tsx:140`）、悬浮歌词行（`SettingsPage.tsx:368`）、数据导出/导入行自动消失。注意 `:43` 的 `isWeb` 要改用 `isWebPlatform()` | 🔍待复核 | 小 |
| P1-8 | **数据导入失败时把内部错误串甩给用户** | `handleImport`（`SettingsPage.tsx:453`）没有可用性门控（`handleExport` 有），Web 上会显示「导入失败: SongloftPlatform native module not available」。P1-7 做完后这一条只剩文案兜底 | 🔍待复核 | 极小 |
| P1-9 | **HTTP 请求没有任何超时** | `http-client.ts:156` 把 `connectTimeoutMs`/`receiveTimeoutMs` 读进字段后**从未使用**，`createFetchTransport` 也不传 `signal`（`FetchLike` 类型里留了这个字段）。后端可连但不响应时转圈永不结束。`AbortController` polyfill 早在 banner 里了，缺的只是接线 | 🔍待复核 | 小 |
| P1-10 | **收藏歌单 ID 拉取可能死循环刷请求** | `favorites.ts:16` 的 `for(;;)` 退出条件只看累计条数、不看本页是否为空。歌被删但 join 行还在、或 offset 越界返回空页时永不退出。该函数**每次切歌**都会被 `getFavoriteState` 调到 | 🔍待复核 | 小 |
| P1-11 | **升级进度轮询在后端重启后永不停止** | `UpgradePage.tsx:71` 的 `void getProgress().then(…)` 没有 `.catch()`，也没有连续失败计数。进入 `restarting` 阶段后每 2s 一次请求 + 一条未捕获 rejection，界面永远不给结论 | 🔍待复核 | 小 |
| P1-12 | **多选状态跨搜索/筛选残留** | `LibraryPage.tsx:104` 的 `selected` 只在进/出选择模式时清空，与 `filters`/`debouncedSearch` 无联动。勾 3 首 → 改搜索词 → 列表全换 → 工具栏仍显示「已选 3 首」→ 加入歌单，加进去的是屏幕上不存在的歌 | 🔍待复核 | 小 |
| P1-13 | **队列有重复歌曲时拖动排序会把「当前播放」钉错** | `queue.ts:89` 用 `next.indexOf(pinned)` 按对象身份定位，同一首歌加两次时只命中第一个 | 🔍待复核 | 小 |
| P1-14 | **iOS Live Activity 重复 start 泄漏锁屏卡片** | `player-store.ts:581` 用可空模块变量去重，无 in-flight 标记；且 native 失败返回 `''`，`if (!_liveActivityId)` 对空串恒真 → 每次切歌都重新 start、永不 `end()`。**注意**：`LiveActivityModule.swift` 目前根本没注册（见 P2-2），这条要等它能跑起来才可验 | 🔍待复核 | 小 |

---

## 批43 · 结构性问题（影响面大，需要单独一批）

### P2-1 每个 feature 各建一套 `TokenStore` + `AuthInterceptor` 🔍待复核

`api-client.ts:54` 每次调用都 `new TokenStore()`，而 library / settings / playlist / jsplugin / library-ops 各持一个 bundle 单例，`auth-store.ts:67` 又是第 6 个。两个后果：

1. **换账号登录后曲库仍带上一个账号的 token** —— JWT 无状态且未过期，后端会正常返回数据，用户看到别人的库。
2. **单飞是实例级的** —— token 过期时几个 bundle 各刷一次 `/auth/refresh`、互相覆盖写 secure storage。现有 `auth-interceptor.test.ts` 只在单个 bundle 内验单飞，正好绕过。

**修法**：把 `TokenStore` + `AuthInterceptor` 提到进程级单例（`core/network` 导出 `getSharedApiBundle()`），各 feature 只包装自己的 Api 类。P1-5 的缓存失效也应在这一批一起收口。**动所有 feature 的 api bundle，务必单独一批。**

### P2-2 Web 主线程宿主桥接（解锁音频 + 平台能力）

见 P0-2。同时解决 Web 上 `openURL`（`webOpenURL` 需要 `window.open`）与文件选择（`webPickAndUploadFile` 需要 `document.createElement`）—— 这两个函数和 `web-audio.ts` 是**同一个结构性原因**造成的 dead code。

### P2-3 悬浮歌词与 Live Activity 目前是「五重死」🔍待复核

| 侧 | 问题 |
|---|---|
| `FloatingLyricModule.kt` | 5 个方法**全都没有 `@LynxMethod`**（第 9 行却 import 了它）；`SongloftApplication.kt:67` 的 5 行注册里没有它；签名与 TS 不符（`updateLyric(args, callback)` vs `updateLyric(line)`，且回调是 Kotlin lambda 不是 `com.lynx.react.bridge.Callback`）；`AndroidManifest.xml` 缺 `SYSTEM_ALERT_WINDOW` 权限与 `FloatingLyricService` 声明 |
| `LiveActivityModule.swift:12` | 是普通 `enum` + `static func`，没有 `@objc` / `static var name` / `methodLookup`，也不在 `ViewController.swift:117` 的 `buildConfig()` 里 —— **根本不是 Lynx 模块** |

两者都走 stub，UI 不报错。`lyric-store.ts:168` 每行歌词都在往 stub 里写。

**先决条件**：契约闸门当前**不覆盖** `SongloftPlatform` / `SongloftDlna` / `SongloftFloatingLyric` / `SongloftLiveActivity`，也**完全不验证「注册」这件事**。修之前先把闸门扩到这四个模块 + 加注册断言，否则修完还是无人守。

### P2-4 单边实现的原生方法 🔍待复核

| 方法 | Android | iOS |
|---|---|---|
| `setInsecureTls` | ✅ `SongloftPlatformModule.kt:108` | ❌ 不在 `methodLookup`（✅复核）—— TS 用 `mod?.setInsecureTls` 守卫，静默 no-op |
| `setArtworkUri`（通知栏封面） | ✅ `SongloftAudioEngine.kt:307` | ❌ `SongloftAudioEngine.swift:418` 解析后丢弃，注释自己写着 "nothing consumes it here"（且该注释在批40 后已过期） |

即批40「封面进通知栏」应拆成 **Android 待真机验 / iOS 未实现**；批39「不安全 TLS 生效」同理只做了一半。这两条原本记在已删除的 `remaining-work-plan.md` 的 ⑤⑥ 项，现并入本计划——那份文档里关于 iOS 侧的调研笔记值得保留：

- **iOS 的 ATS 已由 `Info.plist` 的 `NSAllowsArbitraryLoads` 解决**，`setInsecureTls` 要解决的是另一件事：**自签名证书的证书链校验**。
- 需要实现 `URLSessionDelegate.urlSession(_:didReceiveChallenge:completionHandler:)`。⚠️ **原笔记写的 `.performDefaultHandling` 是错的**——那正是「按默认规则校验」，自签名证书照样被拒。要接受自签名必须返回 `.useCredential(URLCredential(trust: serverTrust))`，并且**只在开关打开时**如此（否则等于永久关闭 TLS 校验）。
- 前置未知：需先确认 `LynxHttpService` 是否走 `URLSession`、其 session 配置能否被替换。若不能，这条在 iOS 上可能无解，届时应在 UI 上标注「仅 Android 生效」而不是留一个假开关。
- **验证**：真机 + 自签名证书后端（本机 `tsc` 无法证明任何事）。

`setArtworkUri` 的 iOS 侧则是另一个形态：`MPNowPlayingInfoCenter` 要的是 `MPMediaItemArtwork` 对象而不是 URL，所以不能照抄 Android 的传 URI 做法，需要先异步下载再包装。

---

## 批44+ · 功能缺口（按 用户价值 ÷ 工作量 排序）

先说一件能直接省掉白干的事：**`PROGRESS.md` 的 defer 清单有 9 项其实早已实现** —— 音量归一化（批36）、主题包市场（批33，6 端点全接）、服务端自升级、歌单导入导出、Library 多选、宽屏首页网格、Android 悬浮歌词基座、通知栏封面+收藏双向同步、DLNA 整条。**「全量 i18n arb 导入」那条的前提也不成立**：en/zh 各 468 leaf、24 namespace、零漂移，且有 CI 闸门。这些已在 `../project/progress.md` 就地订正。

| # | 缺口 | 依赖 | 量 |
|---|---|---|---|
| 1 | **`POST /songs/{id}/played` 从未调用**（`songs-api.ts:24` 明写 deferred ✅复核）→ `/library/history` 页已上线、能读能删，但客户端不写，**永远是空的**。补一次 fire-and-forget（带 `context_type`/`context_key`）即可 | 纯前端 | 小 |
| 2 | **全场没有「播放全部」** —— Library 工具栏 / facet 卡片 / 分类页 / 歌单详情，Flutter 四处都有。队列永远只是当前加载的那一页。`/songs/ids` 与 `/playlists/{id}/song-ids` 都已接好 | 纯前端 | 小 |
| 3 | **列表里看不出哪首在播** —— `SongRow.tsx` 没有 `isCurrentSong` 概念（首页歌单卡片已有高亮，歌曲行没有） | 纯前端 | 小 |
| 4 | **一首坏歌卡死整个队列** —— 重试预算耗尽后 `player-store.ts:217` 留着 errorMessage 停住；Flutter 自动跳下一首（连续上限 3） | 纯前端 | 小 |
| 5 | **隐藏歌单一去不返** —— `PlaylistsView.tsx:21` 过滤掉且无「显示隐藏」开关，取消隐藏的按钮只在**已经进不去的**详情页里。一次误触＝永久消失 | 纯前端 | 小 |
| 6 | **没有任何删除歌曲的入口**（`deleteSong` 零调用方）；全库唯一出口是「清理无效歌曲」 | 纯前端 | 小 |
| 7 | **建不了电台歌单** —— `CreatePlaylistParams` 没有 `type` 字段，所以 Radio tab 只能永远是空的 | 纯前端 | 小 |
| 8 | **不能从文件装插件**（`POST /jsplugins/upload` 未接）—— dev 构建 / 私有插件全装不了。便宜是因为 `pickAndUploadFile` 通道已存在（歌单导入在用） | 纯前端 | 小 |
| 9 | **投屏是「发出去就不管」** —— `dlna.ts:14` 的 `control()` 声明了但从未被调用：投屏后本地继续出声（双份音频）、无断开、无 pause/seek 转发、无播完自动下一首。原生侧已就绪，**但需先修 P1-3** | 纯前端 | 中 |
| 10 | **`GET/PUT /settings/library-browse` 一个端点吃掉三条 defer** —— 后端定义了 14 个视图（含可见性与顺序、服务端持久化），Lynx 硬编码 4 tab + 3 facet。做它同时解决 local/remote/radio 视图、缺失的 year/decade/language/style 维度、自定义视图编辑器 | 纯前端 | 中 |
| 11 | **偏好不上云** —— `/settings/{user-preferences,equalizer,volume-normalize}` 三端点全未用，主题/音质/播放模式/EQ 全存本地，换设备归零。而 `volume_normalize` 那个后端 config key 正是 miot 插件读的，**Lynx 的开关对它不可见** | 纯前端 | 中 |
| 12 | **启动不探测服务器、也没有「测试连接」** —— Flutter 会并行探测所有 profile（2.5s）挑可达的；Lynx 只 hydrate 上次那个，离开家＝卡死直到手动去设置里切 | 纯前端 | 中 |
| 13 | **插件源管理 + 撞名冲突警告** —— `/settings/plugin-registries` 未接，`PluginRegistryPage.tsx:29` 硬编码 `allSources: true` 且丢掉 `conflict` 字段 → 装同 `entryPath` 的插件会**静默覆盖**别人的插件（后端 `songloft-org/songloft#339` 那个坑） | 纯前端 | 中 |
| 14 | **首页「正在播放」入口条** —— 有歌在播时首页加一个显眼入口，点击跳 `/player`（原 `remaining-work-plan.md` ⑨，未做 ✅复核） | 纯前端 | 极小 |
| 15 | **视频播放（`is_video`）** —— `models/song.ts:66` 解析了就再没人用，视频歌曲只出声。**剩下的最大单块能力** | 需原生视频面 | 大 |

**同梯队、篇幅所限压成一行**：渐进式队列加载 · 歌词时间轴校准页 · 按上下文的播放历史面板（依赖 #1）· 歌曲编辑页只有 3 个字段 · 歌单卡片操作菜单 · 第 5 种播放模式 `singlePlay` · 下一曲 prefetch · 音轨选择器（`?track=N` 已通，缺枚举端点）· `POST /songs/{id}/activate` · 全屏播放器缺收藏/溢出菜单 · `miniPlayerControls` · 单曲离线缓存（需原生 fs）。

**后端 API 覆盖率**：121 path，89 已用，32 未用；未用里真功能缺口约 10 个，其余是 admin / 运维 / Web 专属 / 动态路由。

---

## 明确不做（避免反复捡起来）

| 项 | 理由 |
|---|---|
| 键盘快捷键 | Flutter 里就被 `PlatformUtils.isDesktop` 门控，**移动端根本不是缺口** |
| `HomeGridConfig`（用户可配行列） | Flutter 自己就提示「窄屏不生效」，手机优先客户端零收益 |
| `/configs` KV 编辑器、`/auth/tokens` 管理 UI | 对应的 `config_manager.dart`（425 行）与 `token_manager.dart`（256 行）**在 Flutter 里就是 0 引用死代码** |
| 完整 GPL 全文许可页 | Flutter 带全文是因为链接了 GPL 的 WebF；Lynx 用系统 WebView，合规动因已消失 |
| 升级的版本选择 / 手动上传 / 回退 | 服务端运维面，非终端用户功能 |
| 客户端下载页、Web 调试控制台、浏览器缓存区 | 唯一入口都在 Flutter 的 `if (kIsWeb)` 里 |
| 热更（`PatchUpdateService`） | 无 Lynx 对等物，保持已删 |
| 桌面歌词独立窗口 / desktop_player / WidescreenSidePlayer | 目标平台外，建议在 defer 清单里改标 **N/A** 而非「待做」 |
| 深目录树虚拟化 | 只在 1000+ 子目录时咬人，`VirtualList.tsx` 已存在，等真有人抱怨 |
| Settings 主从九分类 IA | 是不同的信息架构，不是缺失的能力 |
| 黑胶唱片环动画 | 纯装饰 |

---

## 每批的验收闸门

除仓库既有的三条（`pnpm run build` / `pnpm exec tsc -b` / `pnpm test`）之外，本次审计暴露的盲区要求补充：

```bash
# iOS 工程可解析（P0-1；无 Xcode 环境应跳过而非报错）
xcodebuild -list -project ios/SongloftLynx.xcodeproj

# Web 产物自洽（P0-3）：index.html 引用的每个本地资源都真实存在
pnpm run build:web && node -e "…"   # 建议固化成 vitest 用例而非手跑
```

以及三条**写进测试**的闸门：

1. pbxproj 可解析性（不是子串包含）
2. `web/dist/index.html` 的资源引用全部可解析
3. i18n **未定义 key** 检测 —— 现有 `i18n.test.ts` 只防 en/zh 漂移，**这正是 P1-1 能上线的原因**。做法：静态提取源码里所有字面量 `t('…')` 的 key，断言 ∈ `flattenKeys(en)`，两处模板字面量（`settings.quality_${}`、`eq.preset_${}`）进 allow-list

顺带可清理：**11 个死 key**（`home.logOut`、`library.clearFilters`、`library.addedToPlaylist`、`playlist.sortBy`、`jsplugin.enabled`、`jsplugin.disabled`、`data.notLoggedIn`、`data.noPlatform`、`libops.cancelFailed`、`libops.dismiss`、`libops.duplicateDetectionDesc`）。注意另有 62 个 key 是被「返回 key 的 helper」间接引用的（`greeting.ts`、`scan-model.ts` 等），**不要删**。

---

## 尚未定位的悬案：偶发全屏灰层

`../project/progress.md` 批29 §7 记录的未结项。本次审计补上了一步之前漏掉的算术：暗色读数 `13→86` 是**变亮**，纯黑半透层在数学上不可能；联立亮/暗两式得约 `#838383@0.62` 的中灰，而**仓库与 lynx-ui 里都不存在这个颜色**。

最可查的嫌疑是 lynx-ui Sheet 的 backdrop 泄漏：`PlaylistDrawer` / `SleepTimerSheet` 是全 app 仅两处 Sheet，都**无条件常驻渲染**、靠 `useEffect` 里命令式 `open()/close()` 驱动 —— React 卸载不是它的关闭路径，主线程动画才是。backdrop 的 opacity 只由主线程 motion-value 订阅驱动，流一断就停在中间值；`useSheetPresence` 遇到非法跃迁只 `console.error` 然后继续执行。

**下次出现时先跑这一条，零改动、零成本**：

```bash
adb logcat | grep -i "\[Sheet\] Invalid state transition"
```

这是库自带的免费探针，有它就当场定性。批33 那次「修复」只在 `FullPlayerPage.tsx:53` 加了句 `closePlaylistDrawer()` —— 改的是 store 标志，压不下主线程的 overlay，这正好解释「改了却没好」。

若真机（非 BlueStacks）复现不了，直接把该 TODO 从 bug 降级为环境记录，不要再投入时间。
