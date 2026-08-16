# Bug 跟踪

> 真机测试与代码审计发现的问题清单。已修复项标 `[x]`，待修项标 `[ ]`。
>
> 下方**「手动测试发现」**是用户真机使用中报的问题；**「代码审计发现」**（2026-08-14）是四路并行审计查出的、尚未被任何测试或真机验证覆盖的缺陷——它们的修复排期与实施细节在 [`../plans/2026-08-14-audit-fix-plan.md`](../plans/2026-08-14-audit-fix-plan.md)，本文件只作清单索引。

## 手动测试发现

- [x] 暗色很多地方看不清,比如输入框提示文字
- [x] 切tab回曲库没有记住上次的子页签
- [x] 安卓CI打包需要使用gh命令配置好密钥和证书，参考songloft-player工程
- [x] 安卓通知栏已经出现，需要补充下一曲按钮和收藏按钮，通知栏封面右下角图标需要是正确的 songloft 图标
- [x] 应用图标需要更新成正式的 songloft 图标，名字也需要是正式的 songloft
- [x] 首页我的歌单和我的电台布局有问题，无法拖动，而且大小应该是矩形才对。
- [x] 首页插件的图标没有正常显示出来
- [x] 全屏播放器关闭的时候每次都回到首页了，需要回到上次的tab，而且底部小播放器条应该只在首页和曲库页显示，其他的设置和插件页不应显示底部小播放器。
- [x] 设置页不需要有播放设置。
- [x] 首页统计信息改为使用 /songs/stats 接口的数据显示，具体布局你自由发挥。接口可以看 swagger.json 。
- [x] 外观跟随系统没效果，始终是深色了，正常应该跟随系统变化。
- [x] 语言跟随系统没效果，始终是英语了，正常应该跟随系统变化。
- [x] 插件顶部标题用插件的name字段显示
- [x] 首页下拉刷新不触发（批20 在 Android 模拟器上新发现，**非本批引入**：把 `<refresh>` 恢复成改动前的配置后同样是 0 次 `bindstartrefresh`。首页数据本来靠 query 缓存 + 扫描完成自动失效，故未阻塞批20）
- [x] 底部导航的插件 tab 图标统一是内置 settings 图标（`ShellLayout.tsx` 硬编码 `name='settings'`），应改用插件自己的图标（与「首页插件图标」同源但另一个渲染点）
- [x] 插件 WebView 打开后内容空白（批20 在模拟器上观察到，标题栏正常、页面区全黑，未深查）
- [x] 首页进入的歌单，关闭歌单详情后应该回到首页才对
- [x] 歌单列表和曲库分类页封面改为正方形（与首页一致）
- [x] 插件的禁用和启用搞反了？点击全部更新没反应？插件商店右上角的刷新按钮icon错了，应该用刷新icon而不是现在的菜单icon。插件搜索框没法输入？（批33：文案改为动作提示，Input 组件可输入，图标换 refresh，更新按钮加 loading 态）
- [x] Tab 配置没有及时生效？（批33：变更后 invalidateQueries 即时刷新 ShellLayout）
- [x] ios端主题/语言有没有正常同步？应用图标有没有正常打包？（批33：代码审计确认 SystemAppearance 正确，补充 AppIcon PNG）
- [x] 日志导出功能需要完善，不需要展开看日志，直接导出zip包就行。（批33：改为 openURL 直接下载，移除内联查看页面）
- [x] web 版本首页顶部仍显示「下拉刷新」几个字（批36 那次修复无效：`enable-refresh={!isWeb}` 里的 `isWebEnvironment()` 探测 `window`/`document`，而这段渲染跑在 web-core 的 background **Worker** 里，那里两者都不存在，所以 `isWeb` 恒为 false、属性恒为 `"true"`。更根本的是 Web 没有 `<refresh>` 实现（web-core 的 `LYNX_TAG_TO_HTML_TAG_MAP` 无此条目、web-elements 注册的是 `x-refresh-view`），两个标签作为未知元素落进 DOM，header 的文案就成了普通页面内容，属性开关无论如何都关不掉它。改为按 `SystemInfo.platform` 判定（两个 realm 都有）并在 Web 上整段不渲染 `<refresh>`；同一根因还让插件 WebView 页在 Web 上渲染无实现的 `<webview>` 而非 fallback 文案，一并修掉）
- [x] web 平台刷新页面就掉登录（根因就写在控制台那行 warn 里：`no NativeModules.SongloftStorage and no localStorage; using in-memory storage`。web-core 把 app 跑在真 `Worker` 里，而 Web Storage 是 window-only，所以 worker realm 的 `localStorage`/`sessionStorage` 都是 undefined，能力探测一路落到 `createMemoryStorage()`，token 随页面一起没了。新增 `idb-storage.ts`：worker realm 里 `indexedDB` 原生可用（实测 put/get 往返成功），插在 localStorage 与 memory 之间。刻意不走「桥到主线程 localStorage」——那要给 `web/index.html` 与嵌入产物各塞一个宿主文件，而 IDB 零宿主配合。`open` 带 3s 超时兜底：auth bootstrap 等着第一次读，另一个 tab 触发 version-change blocked 时浏览器既不 fire `onsuccess` 也不 fire `onerror`，不设超时就是白屏挂死）

## 代码审计发现（2026-08-14，均未修）

按严重度排序。`✅复核` = 已亲自运行命令/读源码确认；`🔍待复核` = 有 `file:line` 证据但未二次独立验证。

### P0 — 让某个平台整体不可用

- [x] **`pnpm run build` 不再产出原生 bundle，Android/iOS 一直在打包陈旧产物**（批41 已修）—— `lynx.config.ts:133` 的 `environments: { web: … }` **替换**（而非追加）了 rspeedy 的隐式默认环境，`rspeedy build` 只输出 `dist/web/main.web.bundle`；实测 `dist/main.lynx.bundle` 的 mtime 前后不变，`--environment lynx` 也报「环境不存在」。而 `build:android-bundle`/`build:ios-bundle` 照旧从 `dist/main.lynx.bundle` 拷贝 → **嵌进包里的是上次遗留的任何东西**。`2330c22`（Web 支持，08-13 23:35）引入，发现时那个文件是 08-13 22:52 的一份 **6.5 MB dev bundle**（生产版约 1.76 MB）。**非审计产出，是改文档时顺手撞出来的**。修法：`environments` 补 `lynx: {}` + 新增 `scripts/assert-bundle-fresh.mjs`（产物比源文件旧就 fail，`existsSync` 抓不到这类问题）
- [x] **iOS 自批39 起完全无法构建**（批41 已修）—— `project.pbxproj:255` 在 `PBXSourcesBuildPhase` 的 `files = ( … );` 数组内多了一行 `PBXBuildFile` 赋值语句（第 23 行已有正确那份）。契约闸门用 `.toContain('SongloftDlnaModule.swift in Sources')`，而畸形行恰好含该子串故全绿。修法：删该行 + 闸门加结构校验（元素列表体内不得有 `{isa = …}` 赋值；**注意括号配平那条在损坏文件上是绿的**，畸形行自身配平）。验收：`pnpm run ios:build` 完整 `BUILD SUCCEEDED`
- [x] **`pnpm run build:web` 产物黑屏**（批41 已修，**根因两层**）—— ① `web/index.html` 请求 `index.css`/`index.js`，而 prod 产物是 `client.css`/`client.js`；② **改完文件名后依然全黑**，真实异常是 `Cannot use 'import.meta' outside a module` —— `client_prod` 入口是 ES module，必须 `<script type="module">`。该异常**不进 `console.error`**（只走 `pageerror`），表现是「资源全 200、零 console 错误、`<lynx-view>` 就是不 upgrade」。`serve.mjs` 因为读 dev-middleware 的 `www/static`（IIFE 入口、文件名 `index.js`）所以一直正常，两次 Web 修复的无头浏览器验证都从这条路绕过去了。修法：统一到 `client_prod` + `type="module"` + 新增 `web-host-page.test.ts`(6 例) 锁死引用可解析与 module 加载。验收：产物真的用无头 Chrome 打开，登录页完整渲染、零 pageerror
- [x] **Web 完全没有声音，且表现得一切正常** ✅复核 —— `web-audio.ts:30` 用 `typeof HTMLAudioElement !== 'undefined'` 判定平台，在 web-core 的 background Worker 里恒 false，`audio-facade.ts:64`（`WebSongloftAudio` 的唯一构造点）永不命中，落到 mock。mock 拿到真实 `durationMs`，于是进度条走、时间跳、自动切下一首，唯独不出声。**改判断救不回来**（`new Audio()`/`AudioContext`/`mediaSession` 全是主线程 API），需主线程宿主桥接（批43 已修：`web/audio-host.js` 注册为 NativeModules.SongloftAudio，走 NativeSongloftAudio 路径）
- [x] **`pnpm run build:web` 产物黑屏** ✅复核 —— `web/index.html:9,32` 请求 `index.css`/`index.js`，而 prod 产物是 `client.css`/`client.js`。`serve.mjs:41` 优先用 dev-middleware 的 `www/static`（那里叫 `index.js`），所以 `web:dev` 正常、`build:web` 坏（批41 已修两层根因）
- [x] **embedded 模式 Web 产物没有宿主页** 🔍待复核 —— `copy-bundle-web.mjs:65` 的 `if (!isEmbedded)` 守着唯一一处 index.html 拷贝，嵌进 Go 二进制后 `/` 仍是旧 Flutter 应用，且 ~9 MB `canvaskit/` 一直烤在里面（批43 已修：移除守卫 + rmSync 清理）
- [x] **Web 端无法得知后端地址** 🔍待复核 —— `app-config.ts:41` 硬编码 `localhost:58091`，`deployMode` 全库无写入点。手机上从 LAN 打开页面时 API 全部打到访问者自己的机器。worker realm 的 `location.origin` 可用但无人读（批43 已修：`self.location.origin` 自动检测 + deployMode 自动设为 embedded）

### P1 — 一眼可见 / 一改就好

- [x] **登出确认框的取消按钮字面显示 `common.cancel`**（批42 已修）—— 补 en/zh `cancel` key + 新增「扫描全部字面量 `t('…')` 断言 key 存在」闸门
- [x] **播放进度从不落盘，「续播」永远从 0 开始**（批42 已修）—— 阈值 `>5000ms` 在 250/500ms 步长下永不成立，改 10s 桶下标 + flush 时读最新 state
- [x] **DLNA 页在 Android 真机上一进去就崩**（批42 已修）—— 按 Kotlin/Swift 真实契约重写适配层 promisify，禁止 `as DlnaModule` 强转
- [x] **切换服务器立刻被踢回登录，并连带抹掉目标服务器的 token**（批42 已修）—— 新增 `invalidateTokenCaches()`，switchTo 写完 storage 后统一失效缓存
- [x] **冷启动后 mini player 的播放键完全无效**（批42 已修）—— 新增 `_loadedSongId` 跟踪引擎持有的歌，togglePlay 不一致时补 load；此前被 mock 掩盖
- [x] **元数据「再次刷新」点了不开始轮询**（批42 已修）—— forced 改为优先于终态 + 页面用 `dataUpdatedAt >= startedAt` 守卫；原测试把 bug 断言成契约已订正
- [x] **`getPlatformCapabilities()` 是死代码**（批42 已修）—— 改 `isWebPlatform()` + 每能力看自己的模块，接上投屏按钮/悬浮歌词行/DataSection 三个消费点
- [x] **HTTP 请求没有任何超时**（批42 已修）—— `TransportRequest` 加 `timeoutMs`，AbortController + `Promise.race`，新增 `HttpTimeoutError`
- [x] **收藏歌单 ID 拉取可能死循环刷请求**（批42 已修）—— 空页即停 + 200 页兜底
- [x] **升级进度轮询在后端重启后永不停止**（批42 已修）—— 容忍 15 次失败后落终态；顺带修 error 只在 `!checkResult` 时渲染的第二处问题
- [x] **多选状态跨搜索/筛选残留** 🔍待复核 —— `LibraryPage.tsx:104` 的 `selected` 与 `filters` 无联动，会把屏幕上不存在的歌加进歌单（**批42 唯一未修项**）
- [x] **队列有重复歌曲时拖动排序把「当前播放」钉错**（批42 已修）—— `indexOf` 按对象身份改纯下标算术
- [x] **iOS Live Activity 重复 start 泄漏锁屏卡片**（批42 已修 JS 侧）—— 补 in-flight 标记 + 空 id 闭锁；⚠️ iOS 原生模块本身还没注册为 Lynx 模块（见 P2），接通后才能真机验

### P2 — 结构性

- [x] **每个 feature 各建一套 `TokenStore` + `AuthInterceptor`** 🔍待复核 —— `api-client.ts:54` 每次 `new`，共 6 份。后果：换账号后曲库仍带上一个账号的 token（后端会正常返数据，用户看到别人的库）；token 过期时多个 bundle 各刷一次 refresh 互相覆盖（批43 P2-1 已修：`getSharedApiBundle()` 进程级单例）
- [x] **悬浮歌词（Android）五重死** 🔍待复核 —— `FloatingLyricModule.kt` 5 个方法全无 `@LynxMethod`（第 9 行却 import 了）+ `SongloftApplication.kt:67` 未注册 + 签名与 TS 不符 + 清单缺 `SYSTEM_ALERT_WINDOW` 与 service 声明。`lyric-store.ts:168` 每行歌词都在往 stub 里写（批43 修了前三重：加 @LynxMethod + Callback + 注册）
  - ⚠️ **批43 那句「SYSTEM_ALERT_WINDOW 权限与 service 声明此前已有」是错的**，批48 对源 manifest 与**合并后**的 manifest 双向核实：两者都没有。所以审计原判的第四、第五重死一直活着，见下面批48 那两条。这条错误结论能活四个批次，直接原因就是「`AndroidManifest.xml` 完全无闸门」——没有任何东西会去读那个文件，于是一句未经核实的话与代码之间没有任何对账机制
- [x] **Live Activity（iOS）不是 Lynx 模块** 🔍待复核 —— `LiveActivityModule.swift:12` 是普通 `enum`，无 `@objc`/`name`/`methodLookup`，也不在 `buildConfig()` 里（批43 已修：enum→class + @objc/name/methodLookup + 注册）
- [x] **契约闸门不覆盖批35+ 的原生模块** 🔍待复核 —— `SongloftPlatform`/`SongloftDlna`/`SongloftFloatingLyric`/`SongloftLiveActivity` 都在闸门外，且闸门完全不验证「注册」这件事（批43 已修：+30 例闸门，覆盖 6 模块双端方法/注册/@LynxMethod/class 结构）
- [x] **`setInsecureTls` / `setArtworkUri` 只有 Android**（批45 已修）—— 复核时发现描述本身有偏差，且缺口比记录的更深：
  - **`setArtworkUri` 不是桥接方法**，它是 Android 引擎内部调用的 Media3 `MediaMetadata.setArtworkUri`；跨桥的是 `setQueue` 里的 `artworkUrl`。iOS 侧一路解析并存进 `metadataByURL`，但 `updateNowPlaying()` 从不读它 → 锁屏/控制中心/CarPlay 永远无封面。已补 `artworkCache` + 异步拉取 + 回主线程重走 `updateNowPlaying()`（该函数每次都重建整个 `nowPlayingInfo`，直接改字典会被下一个 tick 抹掉）
  - **`setInsecureTls` 两个宿主都是半残的**，不只 iOS 缺失。Android 把 trust-all 装在 `HttpsURLConnection` 进程全局默认上，而 JS `fetch` 走 OkHttp、完全无视它 → **开了开关仍然登录不上自签名服务器**，也就是这个功能的唯一用途失效；且 `enabled=false` 被静默忽略，trust-all 留到进程被杀。iOS 则连方法都没有，闸门里那句「iOS uses ATS plist + custom URLSessionDelegate」只有前半句为真，而 ATS 只放开明文 HTTP、与证书校验无关
  - 修法：两侧各自**替换宿主 HTTP service**（`net/SongloftHttpService.kt` / `SongloftHttpService.swift`）以拿到 TLS 钩子，`InsecureTls` 收口三条出站路径且**双向可逆**；TS 侧补上 `applyServerSettings` 与切服务器档案两处漏掉的 `applyInsecureTls`
- [x] **iOS 自签名 + 媒体流不通 —— 批47 已修（实测通过）** —— 修法就是批45 判定的那条：`InsecureMediaLoader` 把 asset URL 的 scheme 换成 `songloft-insecure-https`，AVFoundation 因无法自行加载而把每个加载请求交给我们，由 `InsecureTls.session`（信任已放宽的那个）拉字节范围。**实测**（自签名 20 分钟本地曲）：播放推进 `pos=0→1500`、`dur=1200039`，seek 到 19 分钟落在 `1158000`，代理侧看到 `bytes=0-1`（content-info）→ `bytes=0-` → `bytes=20471-`（非零偏移）三种请求；关掉开关后走原生加载，全量 e2e 110/110 无回归。**过程里踩了两个坑，都写进了代码注释**：① 加载器回调队列一开始挂在 `.main`，而 `buildAudioMix` 会在主线程同步等 asset 轨道 → 送数据的线程正是被阻塞的那个，**自己锁死自己**，表现是每次尝试卡约 10 秒后 `-11800`、HTTP 请求在 AVFoundation 放弃之后才发出（设备日志 `curll_respondToHandleRequestCompletionOnQueue: … timed-out on handler`）；② 第一版用 completion-handler 一次性收，`requestsAllDataToEndOfResource` 会把整条剩余音轨读进内存（实测 19MB 文件来了一个 19MB buffer），且 AVFoundation 从此只从头消费、seek 不发新 range，改成流式 `respond(with:)` 后非零偏移的 range 才出现。**仍未做**：播放列表内的**绝对** `https://` URI（AVFoundation 会自己去加载，撞同一道墙）；相对 URI 因为继续带自定义 scheme 会回到加载器，而 Songloft 自己的 HLS 反代产出的正是相对 URL，所以那条按构造是通的，**但没有可测的自签名 HLS 源，未实测**
- [x] **`setInsecureTls` 关闭后不影响已建立的连接 —— 批47 已修（iOS）** —— `InsecureTls.update()` 在值真变化时 `invalidateAndCancel()` 并重建 session，丢掉连接池。实测：同一 URL（不换 hostname、不重启 App）关掉开关后登录立刻 `HTTP 499`。**Android 侧已补测，本来就是立即生效的**，原因不是巧合：`SongloftHttpService.clientFor()` 在标志变化时重建 `OkHttpClient`（OkHttp 的 TLS 配置按 client 不可变），新 client 自带新连接池。两端语义现已对齐

### 批48 · 悬浮歌词的第四、第五重死（实测确认并修复）

> 起因是一次「还剩什么没做」的巡查：`AndroidManifest.xml` 无闸门这条 P3 一直挂在清单上，
> 顺着它去读文件，发现批43 记为「此前已有」的两项**都不存在**。功能自始至终没工作过。

- [x] **manifest 缺 `SYSTEM_ALERT_WINDOW` 与 `FloatingLyricService` 声明**（批48 已修）——
  两处都是**静默**失败，这是它能活这么久的原因：`Context.startService()` 解析不到未声明的
  Service **不抛异常**，系统只打一行 `Unable to start service … not found` 就返回；权限未声明
  则让 app 根本不出现在「显示在其他应用上层」列表里，于是 `Settings.canDrawOverlays()` 只可能
  返回 false，**用户没有任何途径授权**。设置页那个开关是真的（`getPlatformCapabilities().floatingLyric`
  在 Android 上为 true，因为模块本身批43 已注册），点了就是没反应。修法：补两行声明；
  实测（Android 13 模拟器）`requestPermission → true`、`dumpsys activity services` 里
  `FloatingLyricService` 在跑、`dumpsys window windows` 多出 `Window{… u0 org.songloft.lynx}`
  覆盖窗口，`hide()` 后两者都消失
- [x] **`updateText` 在 Lynx JS 线程上碰 View，异常被模块的裸 `catch` 吞掉**（批48 已修）——
  上面两行补完后覆盖窗口浮出来了，但**一行歌词也没显示**。截图看不出问题（白字白底），
  改用与配色无关的量才定位：写入歌词前后窗口的 `Requested h=46`、`frame=[0,1354][1280,1400]`、
  `mLayoutSeq=4724` **逐字节相同** —— 压根没重排。而 `isShowing()` 返回 true 说明静态 `service`
  引用是好的，所以只能是 `textView?.text = line` 本身失败：它跑在 JS 线程，而只有创建 View 的
  线程能碰它（`setText` → `requestLayout` → `CalledFromWrongThreadException`），
  偏偏 `FloatingLyricModule.updateLyric` 用 `catch (_: Exception) {}` 把它整个吞了，
  logcat 里连一行都没有。修法：`updateText` 经 `Handler(Looper.getMainLooper())` post。
  修后同一量测 `h` 46→48、`mLayoutSeq` 4748→4749、frame 顶边 1354→1352，截图上歌词可见
  - 顺带修了可读性：覆盖层原本是白字+黑投影、**无背景**，浮在浅色应用上几乎不可见
    （就在 Songloft 自己的白色首页上实测到）。加了半透明深色底
- [x] **`AndroidManifest.xml` 完全无闸门**（批48 已修）—— 新增 `src/__tests__/android-manifest-contract.test.ts`
  7 例，**从 Kotlin 源码推导需求而非硬编码清单**：每个基类名以 `Service`/`Activity` 结尾的类都必须有
  声明（反向亦然，防改名留下悬空声明）、用了 `TYPE_APPLICATION_OVERLAY`/`canDrawOverlays` 就必须声明
  `SYSTEM_ALERT_WINDOW`、每个 `foregroundServiceType` 必须有配套权限（Android 14 起缺了是硬
  `SecurityException`）、`MainActivity` 的 `configChanges` 必须含 `uiMode|locale|layoutDirection`
  （AGENTS.md §4 的要求，此前同样无人验）、以及 XML 结构可解析。六条各自反向验证过：摘掉被守护的
  东西只点亮对应那条
- [x] **悬浮歌词此前零 e2e 覆盖**（批48 已补）—— 新增 `e2e/scenarios/android-floating-lyric.scenario.ts`
  5 例，断言全部落在**进程外**的 `dumpsys` 上（service 在跑 / 覆盖窗口存在 / 收到歌词后窗口真的重排），
  因为三重死没有一次能让页面侧看到错误——TS facade 无论如何都返回 resolved promise，
  只问 `isShowing()` 等于让嫌疑人自证清白。反向验证：摘掉主线程 hop 后那条立刻红
  （`expected 46 to be greater than 66`）
  - **门控写法有个坑**：`E2E_PLATFORM === 'android'` 会让这 5 例在裸 `pnpm run test:e2e` 下**整体跳过**，
    而 `createDriver()` 把未设该变量视为 Android。第一次全量跑就是这么「通过」的（107 passed / 8 skipped，
    比预期多 5 个 skip）。正确写法是 `(process.env.E2E_PLATFORM ?? 'android') === 'android'`

### 批49 途中发现，**未修（无法验证）**

- [ ] **疑似：Android 上 HLS 电台会落到 `ProgressiveMediaSource`** —— `SongloftAudioEngine.load` 的判定是
  `hls || url.endsWith(".m3u8")`，而我们的 `buildSongUrl` 会追加 `?access_token=…`，于是**后缀判断恒不成立**；
  同时全库没有任何调用方给电台传 `hls: true`（批49 只给 `/video-hls/` 传）。按父仓库 AGENTS.md 的说法
  「无后缀会落到 ProgressiveMediaSource 导致直播无法播」，那么 Android 上的 HLS 电台应当是坏的。
  **刻意不改**：手上没有可用的电台源，改了就是一处无法证伪、也没有回归测试的推测性修改（批46 回退
  `intendedPlaying` 就是这个教训）。**验证方式**：`POST /songs/radio` 建一个真 HLS 电台，
  Android 上播，`adb logcat` 看用的是 `HlsMediaSource` 还是 `ProgressiveMediaSource`；确认后修法有两种
  ——调用方传 `hls: true`（更符合现有约定），或把后缀判定改成只看 `?` 之前的路径

### 仍未定位

- [ ] **偶发全屏灰层**（批29 发现）—— 运行数分钟后整屏蒙中灰，重启即恢复，不影响功能。审计补了一步算术：暗色读数 `13→86` 是**变亮**，纯黑半透层数学上不可能，联立得约 `#838383@0.62`，而仓库与 lynx-ui 里都没有这个颜色。最可查嫌疑是 lynx-ui Sheet 的 backdrop 泄漏。**下次出现时先跑** `adb logcat | grep -i "\[Sheet\] Invalid state transition"`（库自带的免费探针）

## iOS e2e 首次运行发现（2026-08-15，批46 已全部修完）

> 背景：iOS 侧在批45 之后才第一次真正编译（Mac/Xcode 26.6），e2e 也是**首次**在 iOS
> 模拟器（iPhone 16 Pro / iOS 18.3）上跑——此前 107 例只在 Android 上绿过。首跑
> **104 passed / 6 failed**，批46 修完后 **iOS 110/110**、Android 107/110（3 例平台门控跳过）。
> 6 条按根因分两类：音频三条是 iOS 引擎与 Android 参考行为的真实差异（Android 是测试的参考
> 实现），appearance 三条是测试自身读错了对象。**首跑时对前两条的归因有偏差，实测推翻了它们**
> ——原文保留在每条的「首跑记录」里，实测结论见「实测」。

### 音频引擎语义差异（3 条，宿主侧为主）

- [x] **`audio-playback`：`playing` 到达时 `durationMs` 仍为 0**（批46 已修）
  - 首跑记录：以为「iOS 时长只随 0.5s tick 上报」，修法是在 `.readyToPlay` 补发一次 progress。
  - **实测推翻**：`.readyToPlay` 时 AVPlayer 的 `item.duration` **本就还是 `indefinite`**（补发
    了也是 0），真正解析出的 45035.10ms 对应整数采样数 1986048/44100，是**解码整段后**才得到的。
    所以在宿主侧「提早发」无解。
  - 真根因在 JS：`player-store.ts` 的 progress 处理 **无条件** `duration: e.durationMs`，而两个
    宿主都把「未知」归一成 0（`C.TIME_UNSET` / `indefinite`），于是 0 反过来**抹掉**已知时长。
    Android 只是因为 ExoPlayer 在 READY 就知道时长才没暴露。附带的真实缺陷：`playAtIndex`
    从不写 `duration`，**切歌后总时长会沿用上一首**，直到宿主上报。
  - 修法：`stateDurationMsOf()` 用服务端元数据播种 `duration`（`playAtIndex` + 恢复播放两处共用），
    progress 处理改为 `e.durationMs > 0 ? e.durationMs : s.duration`。两条各配一个反向验证过的
    单测；`mock-audio` 补 `simulateUnknownDurationProgress()`——mock 一直被 `load` **直接告知**
    时长并同步回显，真实宿主做不到，这正是掩盖该 bug 的前置条件缺口。
- [x] **`audio-speed`：0.5 倍速 1s 内进度推进为 0（2 倍速同场景通过）**（批46 已修）
  - 首跑记录：以为「低速下每 tick 只推进 250ms，两次读取夹在同一 tick 区间内」。
  - **实测推翻**：tick 数与位置探针显示，0.5x 下**每 tick 仍推进 500ms，但间隔是 1.0 秒墙钟**
    ——`addPeriodicTimeObserver(forInterval:)` 的间隔按**媒体时间**计，实际墙钟间隔是
    `interval / rate`。1 秒窗口于是只能抓到 0 或 1 个 tick（首跑抓到 0，`dbg.count=0`），
    测试是**结构性 flaky**，播放本身完全正常。
  - 修法：`installTimeObserver()` 按 `progressIntervalSeconds * speed` 安装并在 `setSpeed`
    变更时重装，把墙钟节奏钉回 500ms（Android `PROGRESS_INTERVAL_MS` 就是 `postDelayed` 的
    墙钟 500ms）。实测三速率均为 500ms/tick：1x +500、0.5x +250、2x +1000。
  - 连带：每 tick 步长在 2x 变为 1000ms，旧的 1 秒窗口对 2x 也有约 10% 概率抓到 3 个 tick 而
    误判，故两条速度断言统一改为 2 秒窗口 + 容得下一整个 tick 的容差带（`measureAdvancement`）。
  - 同时**回退**了首跑时加的 seek 后 `playImmediately` 恢复（`intendedPlaying`）：那是基于
    「seek 把播放停了」的猜测，根因既已查明，留着就是无法证伪也无回归测试的推测性改动。
- [x] **`audio-error`：坏 URL 后 state 停在 `loading` 而非 `error`**（批46 已修）—— 归因成立：
  AVPlayer 在 item 失败后**仍继续**发 `timeControlStatus` 转换（`waitingToPlay` → 我们发
  `loading`），把 JS 刚落定的 error 态盖掉；ExoPlayer 失败后转 idle 并安静。修法：`itemFailed`
  标记，失败后到下次 `load()` 之前不再由 `timeControlStatus` 发状态。

### appearance 测试读错对象（3 条，测试侧）

- [x] **`ios-appearance` 全部 3 例：theme 读到 `'unknown'`**（批46 已修）—— 测试 eval 读
  `lynx.__globalProps.theme`，但 eval 跑在 **BTS realm**，那里 `lynx` 根本不存在
  （实测 `typeof lynx === 'undefined'`）——`__globalProps` 是主线程 Lepus realm 的全局。
  这是 AGENTS.md 反复警告的 realm 隔离，测试写出来从未跑过所以没暴露。宿主功能本身没问题。
  修法：`e2e-bridge` 暴露 `__E2E_APPEARANCE__`（`getSystemAppearance` / `getAppTheme` /
  `resolveTheme` / `changeAppTheme`），测试断言 `resolveTheme(getAppTheme())`。
  - **照 bug.md 当时那条警告先验了宿主链路，结果真挖出一条**：只断言 `getSystemAppearance()`
    是不够的——那台模拟器持久化的 app 主题是 `'light'`（用户覆盖），此时 app **本就不该**跟随
    系统，而只读系统值的断言照样全绿，测的是空气。故测试改为自己用 `changeAppTheme('system')`
    建立前提、结束后还原，并同时断言 `appTheme === 'system'` 与**解析后**的 `resolvedTheme`
    ——后者才是 app 真正渲染的主题，对得上用例名。
