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
- [ ] **Web 完全没有声音，且表现得一切正常** ✅复核 —— `web-audio.ts:30` 用 `typeof HTMLAudioElement !== 'undefined'` 判定平台，在 web-core 的 background Worker 里恒 false，`audio-facade.ts:64`（`WebSongloftAudio` 的唯一构造点）永不命中，落到 mock。mock 拿到真实 `durationMs`，于是进度条走、时间跳、自动切下一首，唯独不出声。**改判断救不回来**（`new Audio()`/`AudioContext`/`mediaSession` 全是主线程 API），需主线程宿主桥接
- [ ] **`pnpm run build:web` 产物黑屏** ✅复核 —— `web/index.html:9,32` 请求 `index.css`/`index.js`，而 prod 产物是 `client.css`/`client.js`。`serve.mjs:41` 优先用 dev-middleware 的 `www/static`（那里叫 `index.js`），所以 `web:dev` 正常、`build:web` 坏
- [ ] **embedded 模式 Web 产物没有宿主页** 🔍待复核 —— `copy-bundle-web.mjs:65` 的 `if (!isEmbedded)` 守着唯一一处 index.html 拷贝，嵌进 Go 二进制后 `/` 仍是旧 Flutter 应用，且 ~9 MB `canvaskit/` 一直烤在里面
- [ ] **Web 端无法得知后端地址** 🔍待复核 —— `app-config.ts:41` 硬编码 `localhost:58091`，`deployMode` 全库无写入点。手机上从 LAN 打开页面时 API 全部打到访问者自己的机器。worker realm 的 `location.origin` 可用但无人读

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

- [ ] **每个 feature 各建一套 `TokenStore` + `AuthInterceptor`** 🔍待复核 —— `api-client.ts:54` 每次 `new`，共 6 份。后果：换账号后曲库仍带上一个账号的 token（后端会正常返数据，用户看到别人的库）；token 过期时多个 bundle 各刷一次 refresh 互相覆盖
- [ ] **悬浮歌词（Android）五重死** 🔍待复核 —— `FloatingLyricModule.kt` 5 个方法全无 `@LynxMethod`（第 9 行却 import 了）+ `SongloftApplication.kt:67` 未注册 + 签名与 TS 不符 + 清单缺 `SYSTEM_ALERT_WINDOW` 与 service 声明。`lyric-store.ts:168` 每行歌词都在往 stub 里写
- [ ] **Live Activity（iOS）不是 Lynx 模块** 🔍待复核 —— `LiveActivityModule.swift:12` 是普通 `enum`，无 `@objc`/`name`/`methodLookup`，也不在 `buildConfig()` 里
- [ ] **契约闸门不覆盖批35+ 的原生模块** 🔍待复核 —— `SongloftPlatform`/`SongloftDlna`/`SongloftFloatingLyric`/`SongloftLiveActivity` 都在闸门外，且闸门完全不验证「注册」这件事
- [ ] **`setInsecureTls` / `setArtworkUri` 只有 Android** ✅复核（前者）—— iOS 侧分别不在 `methodLookup`、解析后丢弃

### 仍未定位

- [ ] **偶发全屏灰层**（批29 发现）—— 运行数分钟后整屏蒙中灰，重启即恢复，不影响功能。审计补了一步算术：暗色读数 `13→86` 是**变亮**，纯黑半透层数学上不可能，联立得约 `#838383@0.62`，而仓库与 lynx-ui 里都没有这个颜色。最可查嫌疑是 lynx-ui Sheet 的 backdrop 泄漏。**下次出现时先跑** `adb logcat | grep -i "\[Sheet\] Invalid state transition"`（库自带的免费探针）
