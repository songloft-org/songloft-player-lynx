# 踩坑实录（Pitfalls）

本项目反复踩过的坑，按主题组织：每条 = 现象 → 根因 → 一句话规则 → 证据位置。

> **规则本体在 [AGENTS.md](../../AGENTS.md)**（§4 Lynx 约束 / §5 原生模块 / §6 测试与闸门），本文是它们背后的证据与案例。逐条缺陷的完整根因在 [bugs.md](bugs.md)，逐批交付在 [progress.md](progress.md)。

---

## 1. 平台判断：DOM 探测在 Web 上回答「不是 Web」

web-core 把背景线程实现为**真 Web Worker**（`new Worker(…, { name: 'lynx-bg' })`），业务组件跑在那个 realm 里——那里没有 `document` / `localStorage` / `HTMLAudioElement`（`window` 却是 object）。所以 `typeof <DOM 全局> !== 'undefined'` 在 Web 平台上恒为 false。

同一根因的三次事故：

| # | 表现 | 探测了什么 | 结局 |
|---|---|---|---|
| 1（批36） | 首页永久显示「下拉刷新…」 | `window` + `document` | 修错方向，批40 后修才真修好 |
| 2（批40 后修） | Web 刷新掉登录 | `localStorage` | 落到内存存储，token 随页面蒸发 |
| 3（批43 审计） | Web 完全没有声音 | `HTMLAudioElement` | 落到 mock，进度条照走、自动切歌，唯独不出声 |

**规则**：判平台一律 `isWebPlatform()`（读 `SystemInfo.platform`，两个 realm 都有）；DOM 探测只允许守卫紧随其后的那几行 DOM 调用，绝不用来选实现分支。推论：主线程 API（`new Audio()` / `AudioContext` / `navigator.mediaSession` / `window.open` / `document.createElement`）不能在业务代码里直接调，Web 上只能经 web-core 的 `nativeModulesMap` 在主线程注册宿主模块。证据：[bugs.md](bugs.md)、progress.md「批40 后修」两条。

## 2. Web 平台宿主

### `nativeModulesMap` 的 value 必须是 ESM URL 字符串

塞普通对象会被 `import(url)` 强转成 `"[object Object]"`、`Promise.all` 拒绝——worker 里**一个自定义模块都没有**，同时静默杀死文件选择器、剪贴板与音频（批43 的 Web 音频修复因此从未生效过）。修法：ESM URL 工厂 + `call` 转发到主线程（`web/songloft-*-module.js`）。**`SongloftStorage` 刻意不注册**——worker 已有 idb-storage（DB `songloft`），宿主那份用另一个 DB 名，接上会把已持久化的 token 换库、刷新即掉登录。闸门：`web-host-page.test.ts` 四条（value 是 URL / 文件存在 / 被 copy 脚本拷贝 / 有 default-export 工厂）。

### 插件 frame 只能隐藏，不能 detach

`web/webview-host.js` / `web/lynx-frame-host.js` 里 `remove()` / `removeChild(` 是禁忌。切 tab 时销毁插件 frame 会撞 Chrome 在「往正在拆掉的 frame 里注入扩展内容脚本」路径上的空指针：渲染进程 SIGSEGV（error code 11），`fault_addr` 恒为 `0xf8`。三个必要条件是 ①我们 detach ②装了 `all_frames: true` 的扩展（实测 KISS Translator）③DevTools 真的打开 —— 全齐 15/15 崩，缺一即 0。所以离开插件页只 `hide`（iframe 置 `visibility: hidden`，lynx 子视图置 `display: none`），`close` 只在插件禁用/卸载/强制更新与登出时调，且 iframe 的 `close` 是导航到 `about:blank` 而**元素仍不摘除**。仅去掉 `src = 'about:blank'` 这一行**不管用**（3/3 仍崩），触发点是 detach 本身。`<lynx-view>` 没有 `about:blank` 退路（web-core 的 `#render()` 在 `url` 为假值时直接返回，清空 url 不 dispose），所以它的 `close` 仍要 detach，随之必须等 `disconnectedCallback` 那个**异步** dispose 完成（可观测信号：web-core 清空该元素的 shadow root）再重建，否则新 worker/WASM/realm 会叠在下沉的旧实例上。全部证据与实验矩阵见 [`../archive/web-plugin-tab-crash.md`](../archive/web-plugin-tab-crash.md)；闸门 `web-plugin-frame-keepalive.test.ts`（执行宿主脚本、数 `appendChild`/`removeChild`）+ 真实浏览器脚本 `scripts/cdp-plugin-tab-crash.mjs`。

### 部署清单是手写的，index.html 引用了不代表产物里有

`scripts/copy-bundle-web.mjs` 的 `HOST_SCRIPTS` 是人工维护的数组。`lynx-frame-host.js` 和它的两个 module URL 从来没进过这个数组，于是 **`renderEngine: "lynx"` 的插件在 standalone 可部署产物里从未工作过**：`index.html` 的 script 标签 404 → `SongloftLynxFrame` 未注册 → facade 报 unavailable。本该拦住的闸门把宿主脚本列表也硬编码成 `['web/audio-host.js', 'web/webview-host.js']`，两处同一个毛病互相掩护。现在 `web-host-page.test.ts` 从 `index.html` 推导该列表并断言每个引用都在部署清单里 —— **凡是「两边各写一份名单」的地方，闸门要从一边推导另一边，不要也写第三份**。

### 未映射标签走恒等回落

web-core 的 `LYNX_TAG_TO_HTML_TAG_MAP` 只映射 view/text/image/raw-text/scroll-view/wrapper/list/page/input/textarea/svg/frame；`<refresh>` / `<webview>` 落成 `HTMLUnknownElement`，**属性开关完全无效**。写跨平台页用了新标签先查这张表，Web 分支该整段不渲染而不是靠属性关掉。

### web-elements 的 part 样式改不动 → patch 默认值

`::part()` 穿不透 lynx-view 的 shadow root，part 上的显式默认又优先于继承值（输入框 placeholder 恒 grey 一例：host 上写 `--placeholder-color` 到不了 part，document 级 `::part()` 规则含 `!important` 也无效）。有效修法是 patch web-core 打包产物的默认值（`scripts/patch-web-core-client.mjs`），一处生效全库；**别在 host CSS 上反复试**。

### 宿主脚本必须 `<script type="module">`

`client_prod` 入口用了 `import.meta`，当传统脚本加载抛 `Cannot use 'import.meta' outside a module`——这个异常**不进 `console.error`**（只走 `pageerror`），表现是整页纯黑、零诊断。教训：无头浏览器验证要监听 `page.on('pageerror')`，别只看 console。

## 3. 原生模块

### 原生方法不返回 Promise

写是 fire-and-forget，读靠 callback；`nm.X as SomePromiseInterface` 让 `.then()` 落在 `undefined` 上——DLNA 页就这么对所有 Android 用户开屏即崩。promisify 必须在 TS 适配层逐方法做（参考 `core/storage/native-storage.ts`）。**部分可用的模块比完全没有更糟**：facade 逐个探测必需方法，缺一个就整体当没有。

### 注册要在多处落地，漏任一处都是静默 no-op

TS facade / Kotlin `@LynxMethod` / iOS `func` + `methodLookup` / 契约闸门——漏任何一处都没有运行时报错。新模块还要：Android `registerModule` / iOS `config.register` + **pbxproj 四处登记** + `AndroidManifest.xml` 声明。悬浮歌词曾**五重死**（无 `@LynxMethod`、未注册、签名不符、manifest 缺 `SYSTEM_ALERT_WINDOW`、缺 service 声明）整整四个批次没人发现——批43 还记错一句「manifest 此前已有」，又活了四批（见 §7）。

### 模块方法跑在 Lynx JS 线程上

碰主线程创建的 View 抛 `CalledFromWrongThreadException`，而模块里常见的 `catch (_: Exception) {}` 会把它整个吞掉——悬浮歌词「窗口浮出来了、一行歌词也不显示、logcat 干净」就是这形态。碰 View 就 post 主线程（`Handler(Looper.getMainLooper())` / `DispatchQueue.main.async`）。

### `sendGlobalEvent(name, params)` 第二参必须是数组

worker 侧最终走 `listener.apply(ctx, params)`，普通对象没有 `length` ⇒ 传零个参数、listener 收到 `undefined`。音频事件与深浅色事件都栽过，修后加了闸门（对 `web/` 三文件做行级检查）。

### media3 的通知位只有一个主人：占位通知会顶掉播放器卡片（Android）

`SongloftPlaybackService` 为满足 Android 8+ 的 5 秒 FGS 死线，在 `onStartCommand` 里先发一份占位通知，它与 media3 `DefaultMediaNotificationProvider` 共用 **notification id 1001**（`DEFAULT_NOTIFICATION_ID`）。共用是故意的——真通知靠这个「顶掉」占位；但反向同样成立：**后发者赢**。

而 media3 的通知是**经由本 service 发的**：`MediaNotificationManager.startForeground()` 先 `ContextCompat.startForegroundService(service, selfIntent)`、再 `setForegroundServiceNotification(...)`。于是播放中每一次通知更新（含每句歌词引起的 metadata 变化）都会**重新进一次 `onStartCommand`**，且发生在 MediaStyle 通知已就位之后（AMS 经主 looper 投递）。无条件的占位通知因此在毫秒级把播放器卡片盖掉，整首歌只剩一条空白静音的「Songloft」——只有**暂停**时才看得见真卡片（暂停走 `notify()`，不自启动 service）。

- **唯一判据在进程外**：`adb shell dumpsys notification --noredact | grep "pkg=org.songloft.lynx "` 读 `channel=`（`default_channel_id` = 播放器卡片，`songloft.playback.placeholder` = 占位）。播放、导出日志、`dumpsys media_session`（session active、controllers 2、state=3）全部正常，JS 侧完全看不出来。实测轨迹：播放 30 s 恒为占位 → 暂停 1 s 内变 `default_channel_id` → 再播放又变回占位。
- **修法**：占位只在 media3 未持有该位时发。`mediaNotificationOwnsSlot` 镜像 media3 自己的 `startedInForeground`，在覆写的 `onUpdateNotification(session, startInForegroundRequired)` 里**先赋值再 `super`**——`super` 才是触发那次重入的东西，赋值放在后面就输掉这场竞争。闸门：`src/__tests__/android-media-notification.test.ts`（两条断言均已反向验证会红）。
- **另一半**：`load()` 失败时 media3 什么都不发，而它的 `maybeStopForegroundService` 只 cancel「它自己发过的」1001 ⇒ 占位会永久留在通知栏，且 `ONGOING | NO_CLEAR` 连划都划不掉。所以 `onUpdateNotification` 里用与 media3 `shouldShowNotification` 同款的条件（player 非 `STATE_IDLE` 且 timeline 非空）判断「没人会来接手」，此时 `stopForeground(true)` 自己收尾。
- **与 minSdk 21 无关**：机制在任何 API 级别都成立（实测机 Android 13）。时间上撞在一起纯属巧合——占位通知是降 minSdk 那批之前一个提交引入的，两者都在同一天。

### 拿到通知位 ≠ 通知还在栏里：被系统清掉之后没人重发（Android）

`mediaNotificationOwnsSlot` 镜像的是 media3 的 `startedInForeground`，两者都只是「**发过**」的记录，不是「**还在**」的证据。HyperOS 会在连播尾巴上清掉它认为「session 已非活跃」的媒体通知，而这次清除**晚于**新卡片的重发：Issue #2 的导出日志里 `08:34:28.456` media3 交还前台位、`.519` service 补占位、`.545` media3 重新 `startForeground` 发出真卡片，`08:34:29.181` 才收到 media3 通知的 deleteIntent（`KEYCODE_MEDIA_STOP` + session URI）——**deleteIntent 只在通知真的离开通知栏时才发**，所以被清掉的是 `.545` 那张。

于是两侧记账同时错向同一边：谁都认为卡片在，谁都不重发。stop 被自动连播守卫吃掉（否则播放会停），音频继续，通知栏空着、锁屏也没控件，直到下一次有事情去调 `onUpdateNotification`。**「偶现」的另一半在这里**：一首没有逐行歌词的曲子不产生 metadata 变化，也就不产生任何通知更新——实测空了 **77 秒**，直到用户自己回播放器切下一首。

- **唯一可信的判据在自己的记账之外**：`NotificationManager.getActiveNotifications()`（API 23）里找 id 1001，并且**要读 channel**——占位与真卡片共用 1001，只看 id 会把一张卡住的空白占位读成「卡片在」。这与上一条用 `dumpsys notification` 的 `channel=` 区分的是同一件事，只不过这次在进程内就能读。
- **修法**：`SongloftPlaybackService` 的通知看护——播放中每 10 秒查一次，卡片不在就走 media3 自己的漏斗 `onUpdateNotification(session, true)` 重发。**不能自己 `notify` 也不能补占位**：前者绕开 provider 会丢封面/按钮/歌词行，后者是拿一张空白卡片换掉一张缺失卡片。抑制 stale MEDIA_STOP 的那条分支额外排一次 400ms 快检查——那个 intent 本身就是「卡片已经没了」的通知，是最早的信号。
- **判据不可用时一律报「在」**：API < 23、取不到 service、ROM 抛异常，全部返回 `true` 并放弃这次修复；抛异常时还要把读取 latch 掉（它跑在定时器上，导出日志的可读性是硬要求）。宁可不修，也不能对着看不见的通知栏盲发。
- **必须能自己收手**：连续 3 次重发后仍观察不到卡片就熄火并记一条日志（有的 ROM 压根不把自己的前台通知报回来），再看到卡片才重新武装。
- **心跳只在 `isPlaying` 为真时续期**：Android 13+ 用户可以主动划掉前台服务通知，而播放中被划掉时 media3 的 deleteIntent 会真的停播（`isPlaying` 随即为假）。所以「在播且卡片没了」是唯一属于我们该修的状态，重发不会跟用户对抗。
- **闸门**：`src/__tests__/android-media-notification.test.ts` 后半段 8 条（判据来自 `.activeNotifications`、占位不算卡片、不可读时报「在」且 latch 掉日志、`isPlaying` 门在重发之前、重发走 media3 漏斗且不碰占位、stale STOP 分支排快检查、重发有下限与上限、`onDestroy` 撤回 tick），9 个变异全部反向验证会红。第一条断言写成 `/activeNotifications/` 时**是绿的**——同一个函数里的 latch 变量 `activeNotificationsReadable` 就能满足它，必须锚成 `/\.activeNotifications\b/` 才咬得住「删掉真实读取」这个变异。
- **真机判据（尚未真机复验）**：连播到一首**无歌词**曲目，日志应出现 `media notification missing from the shade (reason=...)`，通知栏在 0.4–10 秒内恢复。

### 无结果回传的系统授权页：答复只能等到 App 重回前台（Android）

`SYSTEM_ALERT_WINDOW`（`Settings.ACTION_MANAGE_OVERLAY_PERMISSION`）**不能 `startActivityForResult`、什么都不回传**，唯一可观测的时刻是 App 重回前台。`startActivity` 之后顺手答 `false` 等于对每一次「用户正要去授权」都回答「拒绝」——悬浮歌词开关因此拨上去了、pref 写了、`show()` 永不发生，用户只能「再关一次再开一次」（那时走的是「已授权」早返回分支）。

- 修法：把待答请求停在 `MainActivity.onResume`（`lyric/OverlayPermission.kt`），重读带少量重试（部分 ROM 在 resume 之后才翻转 `canDrawOverlays`）；打不开系统页要立刻答复，别留无人应答的等待者。
- 推论：**「只想恢复上次状态」的调用点必须另有一个只读探测**（本仓是 `hasPermission`）。启动链上调「会等前台恢复才 resolve」的那个方法，会把它后面的 `auth.hydrate()` 一起卡死；顺带它还会在冷启动时把用户弹去系统设置页。
- 同族：**pref 与系统授权是两个真相源**。授权被撤销后 pref 仍为 true ⇒ 开关显示「开」而屏幕上什么都没有。进页/启动时以授权为准回写 pref，协调逻辑收在一处。
- 未授权时碰 `WindowManager.addView` 抛 `BadTokenException: permission denied for window type 2038`，而它抛在 `onStartCommand` 里 ⇒ **未捕获 = 杀进程**。服务自己也要查一遍授权：调用方查过不代表此刻仍成立（用户可随时撤销，`START_STICKY` 还会重发 SHOW）。

### 「原生模块能跑就算移植完成」漏掉了成本：CPU 密集活不能留在 JS 侧

日志导出（songloft-player-lynx#3）功能上三端都通，但用户报「导出日志需要等很久才弹出安卓分享界面，Flutter 版很快」。形态是：JS 把后端日志（后端上限 10 MiB）和客户端日志（会话上限 20 MB）读成 JS 字符串 → `fflate.zipSync` 压缩 → 手写 base64 → 整个 payload 跨桥回原生。Flutter 参考实现同样的步骤用 AOT Dart 的 `archive` 做，再把**文件路径**交给 `share_plus`，没有 base64、没有跨桥搬运。

同一份 `fflate` + 同一个 base64 实现在 Node(V8) 上的实测（这是**下限**，设备端 JS 引擎无 JIT，这类紧凑数值循环通常再慢一个数量级）：

| 日志量 | `strToU8` | `zipSync`(L6) | 手写 base64 | 合计 |
|---|---|---|---|---|
| 1MB | 2ms | 94ms | 10ms | ~106ms |
| 5MB | 9ms | 370ms | 32ms | ~411ms |
| 10MB | 19ms | 777ms | 71ms | ~867ms |
| 20MB | 44ms | 1501ms | 179ms | ~1724ms |

- **在 JS 里省不掉**：`level: 0`（只存不压）把 deflate 从 1501ms 降到 127ms，但 base64 涨到 1683ms、跨桥字符串从 3.7MB 涨到 27MB —— 实测总账更差。唯一的解法是把工作整体搬到原生（`shareLogArchive`）。
- **判据**：跨桥 payload 与 JS 侧 CPU 都要按**上限**估，不是按「我这次测的那份日志」。20MB 的会话上限就在 `ClientFileLog` 里写着。
- **推论**：把 Flutter 的某个 service 逐行照搬成 TS 时，凡是原文里由 AOT 代码或平台库承担的活（压缩、编解码、大文件读写、哈希），照搬后就落在了没有 JIT 的 JS 线程上。移植的等价性要看**工作发生在哪一侧**，不只看结果对不对。
- 顺带：`logRead` 这种「把整份文件当一个字符串还给 JS」的读接口，本身就是这个坑的入口。归档路径改用 `ClientFileLog.copyTo` 在日志线程做原生文件拷贝，既省掉跨桥又保住了「导出前排队的日志行已落盘」的顺序语义。

## 4. 构建与闸门

### 「闸门全绿而产物是坏的」

批41 三条 P0 同属这一类：① `lynx.config.ts` 的 `environments` 是**替换**隐式默认环境而非扩展，`build` 静默停产出原生 bundle 而 copy 脚本照拷陈旧文件（`assert-bundle-fresh.mjs` 按产物**年龄**拦截，`existsSync` 抓不到「文件在但是旧的」）；② pbxproj 数组内多一行赋值语句，契约闸门的 `.toContain` 子串断言恰好被畸形行骗过；③ `build:web` 产物黑屏两层根因（宿主页请求错文件名 + 入口必须 module 加载）。**闸门只证明它真正读过的东西**——vitest 读不到 Xcode 工程、Gradle 与真机行为；`web:dev` 能跑也证明不了 `build:web` 能跑（两者取的静态资源目录不同）。

### 「刻意的跨平台双写」有时只是没读宿主实现：多行截断该在 `text-maxline` 上

四个界面（`.playlist-detail__desc` / `.plugin-manager__desc` / `.song-info-dialog__name` / `.lyric-adjust__line-text`）长期在业务 CSS 里写 `display: -webkit-box` + `-webkit-box-orient: vertical` + `-webkit-line-clamp: 2`，每个文件都带注释说明「原生模板编码器会剥掉它、`max-height` 才是那边真正的 clamp」，于是它被当成**有意的跨平台双写**接受下来，代价是每次 `pnpm run build` 固定 4 组 `⚠ Unsupported property … was removed during template encode`——而本仓的规矩是这类警告要当错误看。

**它从一开始就不必要**：web-elements 把整套机制放在属性后面（`x-text.css` 里 `x-text[text-maxline] { overflow: hidden }` 与 `x-text[text-maxline]::part(inner-box) { display: -webkit-box; -webkit-box-orient: vertical }`，`XTextTruncation._handleAttributeChange` 再往同一个 inner box 上写 `-webkit-line-clamp`），原生 Lynx 则直接支持 `text-maxline`。所以那套三件套在一端被剥离、在另一端是重复——**而且比重复更糟**：它落在 host 元素上，把 `x-text { display: flex }` 覆盖成了 `-webkit-box`。

- **无头 Chrome 实测（对照组是判据的一半）**：带 `text-maxline='2'` 时 inner box 算出 `display: -webkit-box` / `-webkit-box-orient: vertical` / `-webkit-line-clamp: 2`，host 保持 `display: flex`，`scrollHeight === clientHeight === 32` ⇒ 真截断；去掉属性只留 `max-height` 的对照组 inner box 是 `display: block`、`scrollHeight 192` vs `clientHeight 32` ⇒ 硬裁十行、无省略号。**只量带属性那一组是量不出结论的**，两组一起才说明属性是承重件。
- **`x-text-clipped` 不出现是正常的**：没有自定义 `inline-truncation` 且 `tail-color-convert` 不为 false 时，web-elements 走纯 CSS clamp、跳过那趟昂贵的 JS 行布局分析，因此不设该属性。拿它当判据会得出「没生效」的错结论。
- **`max-height` 留着**：属性负责截断，它只是高度封顶，值由 line-height（16px）而非 font-size 决定。
- **闸门**：`src/__tests__/text-clamp.test.ts` 4 条——任何业务样式表出现这三件套即红（带遍历非空断言）、每个 clamp 的 `<text>` 必须有正整数 `text-maxline` 且其 CSS 规则 `overflow: hidden`（从属性用法反推）、四个面另有一条下限清单（面若整片丢掉属性，反推清单会连同它一起消失，只靠反推是绿的）。6 个变异全部反向验证会红。
- **顺带发现共享扫描器的一个缺陷**：`shared/testing/jsx-classes.ts` 的 `openingTags` 跟踪引号状态，标签内的 JSX 注释若含一个单引号（`SongInfoDialog.tsx` 里的 `the stylesheet's calc/vh`）就会翻转它，把后面整片标签吞成一个——`<text text-maxline='2'>` 因此根本不出现在反推清单里，闸门全绿且失明。**已于同日修好**（扫描器改为注释感知），本闸门那段本地剥注释也随之删掉、改读共享实现；影响面与我当天的第一判断不同，量化结论见 §6「共享解析器要有自己的闸门」。

### 闸门要验语义，不验子串；mock 要保留真实前置条件

- pbxproj 闸门被「恰好包含该子串」的畸形行骗过；iOS 注册断言曾被「整行注释掉的 `config.register(...)`」骗过——反向验证是唯一发现手段。
- `mock-audio` 的 `play()` 不需先 `load()`，掩盖了冷启动播放键无效；mock 被 `load` 直接告知时长，表达不出真实宿主的「我还不知道」（`durationMs: 0`）——**问一句「mock 能表达宿主的未知态吗」就能提前发现**。
- **断言先反向验证会红**：批46 有一例是反向验证救回来的——第一版测试摘掉修复后依然绿，它测的是 mock 的同步回显而不是修复本身。闸门写完必须让它红一次，否则你验的是自己的想象。

### 降 minSdk 到 24 以下会让 AAR 的默认接口方法凭空消失

`minSdk` 24→21 后 Android 每次启动即 `AbstractMethodError: abstract method "...ILynxDevToolService.getServiceClass()"`（`SongloftApplication.initLynxService`），而 `./gradlew assembleDebug` 一路绿灯。

- **机制**：minSdk < 24 时 D8 必须脱糖 Java 8 默认接口方法——接口的方法体搬到 `Interface$-CC`、接口方法本身变 abstract，同时给每个实现类注入转发方法。AGP 默认**逐个 library 单独 dex**，脱糖 classpath 取自该 library **POM 里声明的**依赖。POM 少声明了持有接口的模块，D8 就看不见那个默认方法：接口照样被剥空，实现类却拿不到转发方法 ⇒ 运行期必死，且**与设备 API 级别无关**（33 的机器一样崩）。
- **为什么只崩 devtool**：`ILynxLogService` / `ILynxImageService` 在 `service-api` 里，而 `lynx-service-log` / `-image` 的 POM 恰好声明了它 ⇒ 转发方法在。`ILynxDevToolService` 与 `ILynxHttpService` 在 **`lynx`** artifact 里，`lynx-service-devtool` 的 POM 只声明 `service-api` + `debug-router` ⇒ 转发方法缺失。app module 自己的代码（`SongloftHttpService`）不受影响，它是用全量 classpath dex 的。
- **修法**：`android/gradle.properties` 加 `android.useFullClasspathForDexingTransform=true`（AGP 8.5 有此 flag），让脱糖按完整运行时 classpath 做。不必回退 minSdk。
- **顺带修好了另外 3 个还没崩到的类**：前后 dex 对比显示 `xelement/input/LynxEditText`、`xelement/refresh/LynxUIRefresh$createView$1`、`xelement/viewpager/Pager` 各缺 13 个 renderer-host 方法 —— 即 `<input>` / `<refresh>` / viewpager 都埋着同一颗雷。**这类缺失只有 dex 层面看得见**：

```bash
unzip -o app-debug.apk '*.dex' && dexdump -d classes12.dex \
  | grep -A400 "Lcom/lynx/service/devtool/LynxDevToolService;"   # 必须列出 getServiceClass
```

推论：**「Gradle build 成功」对 minSdk 变更零证明力**，唯一判据是真机启动一次 + dex 里数方法。

## 5. 布局与弹层

### `position: fixed` 的包含块陷阱

- 每个 Lynx 元素在 Web 上映射为 `position: relative; overflow: clip`；`x-list` 实测 `contain: layout` + `container-type: size`，使它成为 fixed 后代的**包含块**（探针落在列表原点而非视口）⇒ **虚拟列表内放不了弹出层**，行的菜单只能挂全局（`GlobalMenu` + `song-row-overlays.ts`）。滚动容器还必然裁剪——`checkVisibility()` 为 true 但 `elementFromPoint` 打不中，**没有任何样式表能解**。
- 遮罩/弹层的偏移必须写全（`top: 0; left: 0`）：偏移为 auto 的 fixed 元素落在静态位置，曾造成两个弹出层能同开、点外部关不掉。
- `max-height` 只给上限不给高度：absolute shrink-to-fit 面板配 zero-basis flex 子项必然塌陷成标题行（2026-08-26 真机报障）。底部面板要么给 `height`（如播放历史 70%），要么让 body 保留 `flex: 0 1 auto`。

### 高度受钳的 column flex 卡片：固定 chrome 必须 `flex-shrink: 0`

flex 把溢出量按 basis **加权摊给所有** shrink 非零的子项，小 basis 只是分得少、不是不分——标题行被摊到一份后实测 `height: 13.4px`，配上 Lynx 每个元素自带的 `overflow: clip` ⇒ 文字上半被裁，**看起来像「被什么挡住了」而不是「被压扁」**。判据：`getComputedStyle(el).height` 与 `el.scrollHeight` 的差值；截图容易误读。同类推论：卡片钳制与 body 钳制必须自洽（`dialogBodyMaxHeight` 由卡片钳制减 chrome 派生，不能独立取份额）。

### 玻璃面板里的不透明填充：行不是 surface

`.song-row` 带 `background-color: var(--canvas)` 在**页面上是空操作**（页面根就是 `--canvas`，中间没东西上色），放进 `--glass-fill-strong` 面板就变成逐行满幅不透明板，盖掉玻璃填充、sheen、ramp 和面板底下的 `<blur-view>`——用户看到的是「一个白色，一个透明色」（播放历史 vs 加入歌单，两个面板材质其实逐字相同）。同一条填充还盖掉画在**祖先**上的整行选中高亮（`.playlist-detail__song-row-wrapper--selected`），只在勾选框槽里露一条，浅色下 #fff 对 #fafafa 几乎看不出、暗色下 #0f0f11 对 #17171b 明显错。

**规则**：行不是 surface，surface 由容器给；面板内的不透明填充只允许在**有界对象**上——自带 `border-radius` 的旋钮/芯片/徽标/内嵌卡片；无界盒子铺不透明色等于把材质**换掉**。行的**状态**（当前曲/选中）用半透明填充，好让底下玻璃继续透出。证据与闸门：`glass-surface.test.ts` 后 3 条（从每个玻璃面板 BFS 收集可达类）、`SongRow.css` 注释。

### 状态填充有两个通道，「有界」不等于「对」

上一条的规则（面板内不透明填充只允许在有界对象上）**字面上放行了** `.drawer__row--active`：不透明 `--neutral-faint` + 圆角 12px，它确实有界，但它把玻璃**在这一行**换成了实心浅灰。HIG 的选中态是在材质**上**加一层薄色（tint over material），不是换材质。所以填充要按**通道**分：**accent wash** 用 `--primary-faint`（主题包会把它重指向 `seedColor`，「与强调色同源」的选中/当前状态就该跟着走）；**中性 on-material 填充** 用 `--fill-faint`（内嵌块、滑轨，**刻意不列入主题包可覆盖表**，它必须永远是中性的）。分隔线令牌（`--line` / `--rule`）不是填充——mini-player 进度槽拿 `--line` 当背景，语义错，而且顺带漏了圆角。

**闸门看不见这两处，因为它的不透明令牌清单是手写的**：`glass-surface.test.ts` 原先写死 `canvas|paper`，`--neutral-faint` 不在里面 ⇒ 那条 BFS 闸门从头到尾没见过 `.drawer__row--active` 和 `.popover-menu__item--selected`。改成**从 tokens.css 按值反推**（hex 读 alpha / `rgb()` 无 alpha 通道 / `rgba(…, a≥1)`），且**两侧都要下限**（不透明与半透明各 ≥ 12）——把整个通道判错的解析器不能还是绿的。再加一张**正交**的网：面板内**带交互状态后缀**的类（`--active` / `--selected` / `--on` …）不许拿 surface 或分隔线通道的令牌当 wash，「有界但把材质换掉了」只有它抓得到（后缀要枚举：`--empty` 是**内容**描述、`--primary` 是强调，都不属于交互态）。判「有界」时注意**修饰类继承基类的形状**：`.x--active` 自己不写圆角、`.x` 写了，它就是有界的。

### 锚定弹出层用自研，不要装回 `lynx-ui-popover`

库的 `computeCoordsFromPlacement` 返回**相对触发器**的坐标，而 `OverlayView` 用 `position: absolute` 施加（包含块是最近的定位祖先），两者只在「触发器正好位于该祖先原点」时等价——实测歌单详情排序菜单落在 `x = -122`（整块屏外，功能等于不存在）。统一走 `PopoverMenu` / `PopoverPanel` + `anchored-overlay.ts`；invoke 回调是异步的，「先开后量」会先画一帧兜底位置再跳，正确做法是**挂载时量一次 + 每次打开再量**。另：每个轴只能给一个偏移（`top` + `bottom` 同给会被拉伸）；`max-width` 收窄不了面板（CSS 在它之后解析 `min-width`）。

## 6. 测试与量化

### 先量化再改代码

批46 两条 iOS 失败的首次归因都是「看现象合理推断」，实测全推翻：「iOS 只随 tick 上报时长」——`.readyToPlay` 时 `item.duration` 本就是 `indefinite`；「低速下每 tick 只推 250ms」——每 tick 仍推 500ms，是间隔被拉成 1 秒墙钟（`addPeriodicTimeObserver` 按媒体时间计，墙钟 = interval / rate）。一次性探针 scenario（`zz-probe.scenario.ts`，跑完删）密集采样几秒就能把时序量化，比连猜连改省好几轮 iOS 构建。

### 断言落在进程外或与故障机制无关的量上

TS facade 无论成败一律返回 resolved promise——只问 `isShowing()` 等于让嫌疑人自证清白。可用判据：`dumpsys activity services`（**只能读 `active services` 那一段** —— `Destroying services` 里的 `app=null destroying=true` 尸体能挂到重启为止，整份 grep 会把它读成「服务还在跑」、让 `hide()` 与 stopWithTask 两条永久假红）/ `dumpsys window windows`（悬浮歌词靠写入前后 `Requested h` / `mLayoutSeq` 逐字节相同定位「压根没重排」）；`pgrep -x <名>`（别用 `ps -ef | grep X | wc -l`，当前 shell 的命令行含关键字会稳定多算 1–2 个）；`getComputedStyle(el).height` vs `el.scrollHeight`。

### 反推清单只有它的解析器那么宽

把手写清单改成按用法反推只是**第一半**：`classTokens()` 起初丢掉插值模板的字面量头部——`` {`song-row${cond ? ' mod' : ''}`} `` 的第一个词出来是 `song-row${cond` 被过滤掉，于是凡按这种写法写的类名全部在清单外，`.song-row` 这个带 `bindtap` 的行就在其中，而闸门是绿的。**更宽的清单配更窄的解析器，绿得和手写清单一样。** 对策：清单规模与**成员多样性**都要断言（每个成员对应一种不同的到达途径，含「插值模板的头部」这一种），解析器辅助函数放共享模块（`src/shared/testing/jsx-classes.ts`）而不是每个闸门各抄一份。

### 共享解析器要有自己的闸门；它的影响方向必须量过才知道

`openingTags` 逐字符跟踪引号状态却不认 JSX 注释：标签属性之间的 `/* … */` 里只要有一个撇号（`SongInfoDialog.tsx` 的 `the stylesheet's calc/vh`），引号状态就翻转，后面整片标签被吞进同一个「开标签」。全库量下来 **187 个 TSX 里 45 个的标签边界是错的**（`ConfirmDialog` 3→14、`PlaylistsView` 35→64、`SongInfoDialog` 45→61）。**这个解析器当时没有任何直接单元测试**，而两个反推闸门全绿——本仓上一条踩坑（「反推清单只有它的解析器那么宽」）说的正是这件事，只是那次修了清单、没给解析器补闸门。

- **影响方向和第一直觉相反，我第一次就报错了**（文档里写成「两个闸门同样失明」并已推送，后按量化订正）：`fileClasses` 是整文件求并集，标签合并**丢不掉**类；a11y 的 `direct` 判定跑在合并后的 blob 上，可点类同样掉不出来。实测 `handler` 桶 **255 → 211**（44 个非可点类此前被错算成可点）、`viaProp` **31 → 35**，**修复后一个类都没新增** ⇒ 这两个闸门是**清单过宽、归属错**（偏严），不是失明，也没有被它藏住的真实缺陷。
- **真正会失明的是按标签「元素类型」过滤的闸门**：被吞的 `<text>` 不再是 `<text>` 标签，`text-clamp` 那条反推因此整片消失。**判据**：闸门是问「这个标签是什么」还是问「这个文件用了哪些类」——前者吃标签边界，后者不吃。
- **注释要抹掉而不是跳过**：只跳过能修好边界，但注释里的散文仍留在标签文本里，被每个消费方的正则当代码读——`BackdropBlur.tsx` 注释里提到的 `ui-backdrop-blur--panel` 就这么变成了「这个文件渲染了它」，一句写着 `bindtap` 的注释同理会让 a11y 认为元素可点。
- **不可证伪的分支就别假装有闸门**：`//` 只在表达式容器内才是注释这条限制，在合法 JSX 上没有任何可观测差异（属性位置的 `//` 只能出现在字符串里，引号分支已经接住），所以变异测试打它必然是绿的。代码注释里直接写明「这是保守写法、无闸门覆盖」，而不是硬凑一条测试。
- **闸门**：`src/shared/testing/__tests__/jsx-classes.test.ts` 10 条（撇号注释不吞标签、注释文本被抹掉、行注释同样被抹、属性字符串里的 `>` 受引号保护、`{() => n > 0}` 不截断、插值模板取到 base+modifier、`*ClassName` 全算、非空守卫），6 个变异全部反向验证会红。

### 对比度闸门管「文字对背景」，不管「填充对表面」

两个多选高亮拿 `--paper` 坐在 `--canvas` 上，比值 **1.04（light）/ 1.07（dark）**——画出来了，看不见，而全部对比度断言是绿的：WCAG 对「填充 vs 它坐的表面」一个字都没有。对策是给状态填充单独钉一条**可见度下限**（本项目取 1.08，已发货的 wash 落在 1.11–1.41），并配一条**缺陷形状**测试——`--paper` 叠 `--canvas` 必须**低于**这条线，否则说明下限定松了。反向的代价也要一起算：wash 在暗色下**提亮**表面，把它上面的三级文字推下 AA（`--content-muted` 5.42 → 3.86），所以推导必须算在**叠加之后**（与批C 那两层渐变同一形状），并且要有一条非空断言证明推导真的生效（暗色 `content-muted` 叠 wash 必须 < 4.5）。

### 「非空字符串」不等于「没被打碎」

改中文文案的工具会切坏多字节序列，留下 U+FFFD（替换字符）。它**本身是合法 UTF-8**，所以 `tsc` 过、打包过、产物里逐字带着上线，屏幕上是句子中间一个黑菱形。

这个缺陷在本仓库回归过三次：`1f02383` 专门清过一轮，`580e002`（HIG 阶段2）重新引入 1 行，`4868733`（HIG 阶段11）变成 2 行——最后是用户自己 `rg` 出来的（移除歌曲确认弹窗 + 取消置顶 toast）。

`i18n.test.ts` 全程绿，因为它断言的轴不对：它证明的是「en/zh 键集一致」和「每个叶子是非空字符串」，而**被打碎的串仍然是非空字符串**，乱码也从不碰键名。同样形状的教训见上面「对比度闸门管『文字对背景』，不管『填充对表面』」——闸门只保护它断言的那个轴。

闸门要下到字节层，而不是资源树层：`src/__tests__/source-encoding.test.ts` 扫 `src`/`web`/`scripts`/`e2e` 全部文本文件加根目录规则文档，① 不许出现 U+FFFD，② 不许有压根解码不出 UTF-8 的字节（同一种打碎，在被某个编辑器「修好」成 U+FFFD **之前**抓住），③ 扫描非空断言，④ 缺陷形状自检。**闸门自己不能出现那个字面字符**，否则它举报自己——用 `String.fromCharCode(0xfffd)` 构造，散文里只写「U+FFFD」。

### 量具先验，再量：两种会静默报「干净」的写法

一次扫描报 0，可能是真干净，也可能是量具坏了。本仓库两次都踩在后者：

- **本地 shell 是 dash（`/bin/sh -> dash`），`$'\xNN'` 不是 ANSI-C 转义。** `grep -c $'\xef\xbf\xbd' file` 里的模式是**字面 12 个字符**，所以它报 0；同一个文件 python 读出 2 行。`git log -S$'\xef\xbf\xbd'` 同理，翻遍历史「查无此物」。要按字节找就显式走 `bash -c`，或者干脆用 python/`rg -P`。
- **`\bcolor:` 会命中 `background-color:`。** `-` 是非单词字符，词边界照样成立，于是「找出 `color` 是 X 的规则」这种扫描先读到 `background-color` 的值，每个违规规则都读成干净的。要用 `(?<![-\w])color:`。

两次都是「扫描返回空数组」而不是「扫描报错」，所以正解不是更小心地写正则，而是**给每个扫描配一条缺陷形状测试**：喂一个已知违规的输入，断言它被抓到。`contrast.test.ts` 里那条 wash 扫描就同时钉了 `\bcolor:` 的错法和 `(?<![-\w])color:` 的对法。

**第三次，同一条 dash 陷阱，而且这条早就写在上面第一点里**（Issue #3 那批）：改完 `docs/project/progress.md` 之后，用 `for f in $(git status --short | awk '{print $2}'); do grep -q $'\xef\xbf\xbd' "$f" ...` 自查，报「干净」；实际那次编辑把文件里**别处**五个无关的中文字（`。门出端件`）打成了 14 个 U+FFFD。写着规则、读过规则、照样踩——**因为规则要靠人在正确的时刻想起来，闸门不用**。真正的修法不是「下次记得用 python」，而是把 `docs/` 纳入 `source-encoding.test.ts` 的扫描范围（那条闸门此前只扫 `src`/`web`/`scripts`/`e2e` + 根目录三个 md），于是这类自查压根不需要有人手写。同批给它补了「docs 必须被扫到且文件数 > 20」的非空断言：一个静默变空的遍历和一个坏正则是同一种失败。

**推论**：编辑大文件（本仓 `progress.md` 单行数千字、整文件近 200 KB）时，编辑工具打碎**改动区之外**的多字节字符是真实存在的失败模式（`4868733`/`580e002` 两次事故也是这个形态）。改完必须比对 `git diff -U0` 的删除行——只应出现你**有意**替换的那几行；多出来的单字符差异就是被打碎的证据。修法是从 HEAD 取原文、用无损方式（python + 显式 UTF-8）重建，而不是就地补那几个字。

### skip 数变了要查

批48 出现过门控条件写反、5 例整体静默跳过而报「全绿」（`E2E_PLATFORM === 'android'` 在裸 `pnpm run test:e2e` 下不成立，而 `createDriver()` 把未设视为 Android；正确写法 `(process.env.E2E_PLATFORM ?? 'android') === 'android'`）。素材缺失要让用例**可见地 skip**（模块级 `test.skipIf`），不是每个 test 里 `return` 的假绿。

## 7. 没有闸门读的状态断言会腐化

四个实例：批43 记错 manifest（「权限与 service 声明此前已有」，活了 4 批）；「构建警告自批19b 起归零」漂移（后订正为「警告应当只剩 3 类已知项」）；`docs/README.md` 指标连续腐烂两次（批32、批42 各一次）；HANDOFF 把 7 个已完成功能列为待做，导致那批工作「在文档上不存在了十天」、下一版 HANDOFF 仍列为待做。**改完代码顺手带走相关文档句子**；可检验的断言要么配闸门，要么别写死数字。

---

## 附录：操作性参考

### Lynx SDK 源码（本地刻意不留副本，需要时 curl 直取）

```
https://repo1.maven.org/maven2/org/lynxsdk/lynx/lynx/4.0.0/lynx-4.0.0-sources.jar          # ILynxHttpService 等接口
https://repo1.maven.org/maven2/org/lynxsdk/lynx/lynx-service-http/4.0.0/lynx-service-http-4.0.0-sources.jar  # Android 参考实现
https://github.com/lynx-family/lynx/releases/download/4.0.1/Lynx-4.0.1.zip                 # LynxServiceHttpProtocol.h / LynxHttpRequest.h
https://github.com/lynx-family/lynx/releases/download/4.0.1/LynxService-4.0.1.zip           # iOS 参考实现（含 LynxNSUrlSessionDelegate）
https://github.com/lynx-family/lynx/releases/download/4.0.1/LynxServiceAPI-4.0.1.zip        # ServiceAPI.h（LynxServices 注册入口）
```

pod 的 podspec 也能直接读，用来定位头文件路径：`https://cdn.cocoapods.org/Specs/<md5 前三位分片>/<Pod>/<版本>/<Pod>.podspec.json`。

### 自签名 TLS 测试环境（约 5 分钟可重搭，刻意不入库）

后端没有 TLS 参数，在前面挂自签反代：`openssl req -x509 -newkey rsa:2048 -nodes -days 2 -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"` 生成证书，再用 20 行 Go（`httputil.NewSingleHostReverseProxy` + `ListenAndServeTLS`）把 `https://127.0.0.1:58543` 转发到 `http://127.0.0.1:58091`；模拟器的 localhost 就是宿主，直接可达。驱动：`__E2E_AUTH_STORE__.getState().login({ username, password, apiBaseUrl, insecureTls })`，播放侧 `__E2E_PLAYER_STORE__.playSong(song)`，读 `getPlayerState()` 的 `state` / `errorMessage`。

**验证「开关关掉是否生效」必须换 hostname**（如 `localhost` ↔ `127.0.0.1`，证书两个 SAN 都签了）：同一 URL 会复用连接池里已握过手的连接，测出假绿——第一次实测就被这一点骗过，差点得出「开关完全无效」的错误结论。

### 视频测试素材（每次实测都要，用完 `POST /api/v1/songs/clean` 收尾）

```bash
ffmpeg -f lavfi -i "testsrc2=size=640x360:rate=25:duration=60" \
       -f lavfi -i "sine=frequency=330:duration=60" \
       -c:v libx264 -pix_fmt yuv420p -preset veryfast -c:a aac -shortest \
       /Users/hanxi/toy/songloft/music/zz-video-probe.mp4
# 等 12 秒过文件稳定阈值，再 POST /api/v1/scan
```

`testsrc2` 自带走动的时间码，两张间隔 1.5s 的截图不同即「画面在动」——与配色无关的活性判据，比肉眼看截图可靠。

---

## 相关

- [AGENTS.md](../../AGENTS.md) —— 规则本体（§4 约束 / §5 原生模块 / §6 测试与闸门）
- [bugs.md](bugs.md) —— 逐条缺陷的完整根因
- [progress.md](progress.md) —— 逐批交付历史
- [调试指南](../guides/debugging.md) —— 无头浏览器实测、dumpsys 判据
- [测试指南](../guides/testing.md) —— e2e 环境检查与 store 把手
