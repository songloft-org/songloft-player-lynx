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

## 4. 构建与闸门

### 「闸门全绿而产物是坏的」

批41 三条 P0 同属这一类：① `lynx.config.ts` 的 `environments` 是**替换**隐式默认环境而非扩展，`build` 静默停产出原生 bundle 而 copy 脚本照拷陈旧文件（`assert-bundle-fresh.mjs` 按产物**年龄**拦截，`existsSync` 抓不到「文件在但是旧的」）；② pbxproj 数组内多一行赋值语句，契约闸门的 `.toContain` 子串断言恰好被畸形行骗过；③ `build:web` 产物黑屏两层根因（宿主页请求错文件名 + 入口必须 module 加载）。**闸门只证明它真正读过的东西**——vitest 读不到 Xcode 工程、Gradle 与真机行为；`web:dev` 能跑也证明不了 `build:web` 能跑（两者取的静态资源目录不同）。

### 闸门要验语义，不验子串；mock 要保留真实前置条件

- pbxproj 闸门被「恰好包含该子串」的畸形行骗过；iOS 注册断言曾被「整行注释掉的 `config.register(...)`」骗过——反向验证是唯一发现手段。
- `mock-audio` 的 `play()` 不需先 `load()`，掩盖了冷启动播放键无效；mock 被 `load` 直接告知时长，表达不出真实宿主的「我还不知道」（`durationMs: 0`）——**问一句「mock 能表达宿主的未知态吗」就能提前发现**。
- **断言先反向验证会红**：批46 有一例是反向验证救回来的——第一版测试摘掉修复后依然绿，它测的是 mock 的同步回显而不是修复本身。闸门写完必须让它红一次，否则你验的是自己的想象。

## 5. 布局与弹层

### `position: fixed` 的包含块陷阱

- 每个 Lynx 元素在 Web 上映射为 `position: relative; overflow: clip`；`x-list` 实测 `contain: layout` + `container-type: size`，使它成为 fixed 后代的**包含块**（探针落在列表原点而非视口）⇒ **虚拟列表内放不了弹出层**，行的菜单只能挂全局（`GlobalMenu` + `song-row-overlays.ts`）。滚动容器还必然裁剪——`checkVisibility()` 为 true 但 `elementFromPoint` 打不中，**没有任何样式表能解**。
- 遮罩/弹层的偏移必须写全（`top: 0; left: 0`）：偏移为 auto 的 fixed 元素落在静态位置，曾造成两个弹出层能同开、点外部关不掉。
- `max-height` 只给上限不给高度：absolute shrink-to-fit 面板配 zero-basis flex 子项必然塌陷成标题行（2026-08-26 真机报障）。底部面板要么给 `height`（如播放历史 70%），要么让 body 保留 `flex: 0 1 auto`。

### 高度受钳的 column flex 卡片：固定 chrome 必须 `flex-shrink: 0`

flex 把溢出量按 basis **加权摊给所有** shrink 非零的子项，小 basis 只是分得少、不是不分——标题行被摊到一份后实测 `height: 13.4px`，配上 Lynx 每个元素自带的 `overflow: clip` ⇒ 文字上半被裁，**看起来像「被什么挡住了」而不是「被压扁」**。判据：`getComputedStyle(el).height` 与 `el.scrollHeight` 的差值；截图容易误读。同类推论：卡片钳制与 body 钳制必须自洽（`dialogBodyMaxHeight` 由卡片钳制减 chrome 派生，不能独立取份额）。

### 锚定弹出层用自研，不要装回 `lynx-ui-popover`

库的 `computeCoordsFromPlacement` 返回**相对触发器**的坐标，而 `OverlayView` 用 `position: absolute` 施加（包含块是最近的定位祖先），两者只在「触发器正好位于该祖先原点」时等价——实测歌单详情排序菜单落在 `x = -122`（整块屏外，功能等于不存在）。统一走 `PopoverMenu` / `PopoverPanel` + `anchored-overlay.ts`；invoke 回调是异步的，「先开后量」会先画一帧兜底位置再跳，正确做法是**挂载时量一次 + 每次打开再量**。另：每个轴只能给一个偏移（`top` + `bottom` 同给会被拉伸）；`max-width` 收窄不了面板（CSS 在它之后解析 `min-width`）。

## 6. 测试与量化

### 先量化再改代码

批46 两条 iOS 失败的首次归因都是「看现象合理推断」，实测全推翻：「iOS 只随 tick 上报时长」——`.readyToPlay` 时 `item.duration` 本就是 `indefinite`；「低速下每 tick 只推 250ms」——每 tick 仍推 500ms，是间隔被拉成 1 秒墙钟（`addPeriodicTimeObserver` 按媒体时间计，墙钟 = interval / rate）。一次性探针 scenario（`zz-probe.scenario.ts`，跑完删）密集采样几秒就能把时序量化，比连猜连改省好几轮 iOS 构建。

### 断言落在进程外或与故障机制无关的量上

TS facade 无论成败一律返回 resolved promise——只问 `isShowing()` 等于让嫌疑人自证清白。可用判据：`dumpsys activity services` / `dumpsys window windows`（悬浮歌词靠写入前后 `Requested h` / `mLayoutSeq` 逐字节相同定位「压根没重排」）；`pgrep -x <名>`（别用 `ps -ef | grep X | wc -l`，当前 shell 的命令行含关键字会稳定多算 1–2 个）；`getComputedStyle(el).height` vs `el.scrollHeight`。

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
