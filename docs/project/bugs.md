# Bug 跟踪

> 真机测试与代码审计发现的问题清单。**截至 2026-08-26 所有条目均已闭合**（已修 / 上游定性 / 无法复现）。
> 新发现的问题请新起条目，别在已闭合条目上续写。
>
> - 上游问题（`illegal css key:237`、swiper `autopx`、placeholder 空转）见 [`plans/upstream-issues.md`](plans/upstream-issues.md)
> - 审计修复实施细节见 [`../archive/2026-08-14-audit-fix-plan.md`](../archive/2026-08-14-audit-fix-plan.md)
> - 各批次的完整修复过程见 [`progress.md`](progress.md) 对应批次
>
> 格式：`症状 — 根因/修法（修复批次）`。

## 待修复（开放）

> 2026-08-31 从 handoff.md 迁入。尚未闭合，修复后改 `[x]` 并移主题归类，别在已闭合条目上续写。

- [ ] 全屏播放器响应式测试 14 个失败（`src/features/player/__tests__/full-player-responsive.test.tsx`）— 近期 UI 改动后断言不匹配：封面高度 `252px`、宽屏 4:5 分栏 `flexGrow`、宽窄屏 header 文案 "Now Playing"/专辑名切换，多数失败为 `querySelector` 返回 null。闸门快照（2026-08-31 复跑确认）：**2023 passed / 14 failed / 190 文件**。修法待定：先核对 `.full-player__cover` 等类名与布局预算是否仍与测试假设一致
- [ ] HLS 播放列表内的绝对 https URI（自签名下）不通 — P3。批47 修完 iOS 自签名媒体流后剩余缺口：播放列表里的**相对** URI 继续带自定义 scheme 回到 `InsecureMediaLoader`（Songloft 自有 HLS 反代产出相对 URL，按构造是通的），但**绝对** `https://` URI 由 AVFoundation 自行加载、撞同一道证书墙。**无可测自签名 HLS 源，未实测**。复现环境见 [pitfalls.md](pitfalls.md) 附录

## 手动测试发现

- [x] 暗色下输入框提示文字看不清 — 补 `-x-placeholder-color`（批19）；后续查出全库 15 个文本字段有 6 处用 `--paper`/`--canvas` 当输入框底（对比度 1.04:1）、15 处圆角用错 token，统一为 `--neutral-faint` + `--radius-sm`，新增 `input-css.test.ts` 闸门从 TSX 反推字段清单
- [x] 切 tab 回曲库不记得子页签 — 会话记忆恢复
- [x] 安卓 CI 打包需 gh 配置密钥证书（参考 songloft-player 工程）
- [x] 通知栏缺下一曲/收藏按钮、封面角标图标错 — 补齐
- [x] 应用图标与名称非正式 songloft — 更换
- [x] 首页歌单/电台布局错、无法拖动 — 改为矩形卡片
- [x] 首页插件图标不显示 — 修复渲染
- [x] 全屏播放器关闭总回首页 — 改回上次 tab；mini player 条只在首页/曲库显示
- [x] 设置页多余的播放设置 — 移除
- [x] 首页统计改用 `/songs/stats` 接口数据
- [x] 外观跟随系统无效（恒深色）— 修复 SystemAppearance 链路
- [x] 语言跟随系统无效（恒英语）— 修复
- [x] 插件顶部标题改用插件 name 字段
- [x] 首页下拉刷新不触发（批20 发现，非本批引入；首页数据靠 query 缓存自动失效，未阻塞）
- [x] 底部导航插件 tab 图标硬编码 settings — `ShellLayout.tsx` 改用插件自身图标
- [x] 插件 WebView 内容空白（批20）— 修复
- [x] 歌单详情关闭应回首页 — 修复返回目标
- [x] 歌单/曲库封面改正方形（与首页一致）
- [x] 插件启用/禁用文案反了、全部更新无反应、刷新图标错、搜索框不能输入 — 批33 逐一修复
- [x] Tab 配置不及时生效 — 批33 变更后 invalidateQueries
- [x] iOS 主题/语言/图标核查 — 批33 审计确认 SystemAppearance 正确，补 AppIcon PNG
- [x] 日志导出改为直接下载 zip（批33），移除内联查看页
- [x] Web 首页残留「下拉刷新」文字 — 根因：`isWebEnvironment()` 探 `window`/`document`，在 web-core background Worker 里恒 false；且 Web 没有 `<refresh>` 实现。改按 `SystemInfo.platform` 判定并在 Web 整段不渲染；同根因顺带修了 Web 上的 `<webview>`
- [x] 代理设置输入框贴边、角被卡片圆角削掉 — padding 不对称 + `overflow: hidden` 圆角容器；改对称 padding。附带查出 3 处漏写 placeholder 色（补齐）、白名单单行 `<input>` 装不下多行改 `TextArea`（maxLength 140→2000）
- [x] GitHub 代理加「复制 Prompt 让 AI 帮你找」按钮 — 全库此前无剪贴板能力，新增 `SongloftPlatform.setClipboard` 三端（Kotlin/Swift 必须主线程；契约闸门自动逼出双端实现）；提示词刻意不做 i18n
- [x] `ProxySettingsPage` 裸 `fetch`+`useEffect` 导致 loading 闸在测试环境永不放行 — 迁到 api+query 层，补 2 条渲染测试
- [x] 删除插件无二次确认 / 从文件安装点击无反应 — 三个症状同根：①两段式确认对纯图标无效，改 `ConfirmDialog`（顺带收敛两份手写对话框 CSS）；②闪帧：`show` 直接由 `pendingDelete` 驱动，退出动画期间名字已清空，改状态分离；③安装 401：`getUploadUrl()` 返回裸相对路径且无凭据，改绝对地址 + `?access_token=`；④更深根因：Web 的 `nativeModulesMap` 塞普通对象被 `import()` 强转 `"[object Object]"` 拒绝，**三个自定义模块全部静默失效**，改注册 ESM URL 转发模块
- [x] 设置页开关形式不统一（布尔值三种画法、带框勾六份互不相同的副本）— 定为三角色各一控件写进 `DESIGN.md`：开/关→Switch、单选→无框对勾、多选→新 `AppCheckbox`；删六份副本，产物小 6 KB
- [x] `var(--on-primary)` 不存在的 token 被 5 处使用，两处内容彻底不可见 — 正确是 `--primary-content`；新增 `tokens-defined.test.ts` 闸门（无 fallback 的 `var()` 必须有声明），当场又查出 6 处 Material 风格遗留命名
- [x] 曲库管理页最后两项入口与设置区不匹配（宽 32px/更紧凑/双线边框/无标题）— 手写裸卡片改 `SettingsSection`+`SettingsRow`
- [x] 扫描完成后拿不回「跳过/重新导入」选择 — `onResetScan` 直接发起扫描跳过 idle 态；对齐 Flutter：只 reset + 本地 `dismissed` 标记
- [x] 二级页面导航 tab 全不亮 — 移植丢了前缀匹配（`pathname === dest.path`）；按 Flutter 参考实现补 `navPathOwns`/`activeNavPath`，最长匹配优先，首页兜底
- [x] 白名单输入框 Web 上超出卡片（Web 独有）— `x-textarea.css` 的 `::part()` 不转发 `box-sizing`，内层 `content-box` 继承 `width:100%` 撑破；改 flex 定尺。⚠️ 同缺口 `border-radius` 也不转发，Web 多行字段是直角，未修
- [x] 设置页从二级页返回落回顶部 — 子页是兄弟路由，卸载即丢 `useRef` 滚动偏移；改模块级 `scroll-memory.ts` + `initial-scroll-offset`（查过三端 SDK 才选的这个属性，`scroll-top` 在两条 new-arch 路径不存在）
- [x] Web 刷新掉登录 — worker realm 无 `localStorage`，能力探测落到内存存储；新增 `idb-storage.ts`（worker 里 IndexedDB 原生可用，零宿主配合，`open` 带 3s 超时防 version-change 挂死）
- [x] 日志导出缺客户端日志 / 日志等级设置缺标题 — 对齐 Flutter 补齐
- [x] 速度/播放模式弹出层能同时开两个（批51）— `PopoverBackdrop` 有 `100vw×100vh` 却没 `top`/`left`，fixed 元素落在静态位置没盖住触发器外侧；补 `top:0;left:0`
- [x] 弹出层点完约 1 秒才消失（批51，非卡顿）— CSS 没声明任何 transition，`Presence` 等不到 `transitionend`，退化成 24 帧空转（BTS 背景线程每帧一次往返）；补 `transition: opacity 140ms` + closed 态 `opacity:0`。同批修了自己引入的回归：受控模式漏传 `onVisibleChange` 导致弹层根本打不开。铁律见 `AGENTS.md` §4「Popover / Presence」
- [x] 全屏播放器封面 Android 整块不显示 — `box-shadow` 加在 `<image>` 上导致位图不渲染（元素占位画背景色）；阴影挪到外层 `<view>`。这类失效只有真机可见
- [x] 全屏播放器 Web 宽度恒 0、歌词页不可达 — `useBreakpoint()` 漏传 `measureSelector`（Web 的 `bindlayoutchange` 只对首屏元素触发）；新增全库闸门 `measure-selector-contract.test.ts`
- [x] 「打开后自动进歌词」偏好从未生效 — mount 时 Swiper 还没挂载，`swipeTo` 静默丢弃；改等「偏好读到 + Swiper 挂载」两者齐备
- [x] 全屏横屏封面上溢 — 高度预算错把整页高度喂给 Flutter 公式；改测 stage 自身高度
- [x] 全屏封面 Android 非正方形（letterbox）— **无法复现关闭**：模拟器多路径实测全程 405×405，原设备不可用。若真机再现请重开并记录设备型号/分辨率/密度
- [x] 播放器 logcat 两条 `illegal css key:237` — **上游 bug，无害**：`lynx-ui-swiper` SwiperItem 用 camelCase `marginInlineEnd` 调 kebab-case 解析器，名称未命中落到表尾+1=237；被丢的是默认值 `margin-inline-end: 0px`。已记 upstream-issues
- [x] 播放历史页面报错（批50）— 三处独立错：前端把 context 放 JSON body 而后端从 query 读且必须 `type=play` 才落库 ⇒ **写入从来没成功过**；「设置→播放历史」入口拿不到上下文（后端按播放上下文分桶、无全局最近播放端点）⇒ 不可能修好，移除入口。详见 progress.md 批50
- [x] 曲库设计问题、自定义显示分类无效（批51-A~D）— 探查证实该功能**从未生效过**：PUT 契约是 `{views:[{key,visible}]}` 而旧实现发 `{id,visible,order}` ⇒ 恒 400 被 `.catch(()=>{})` 吞掉；`KNOWN_VIEWS` 自创 4 个假 id、丢 4 个真的。曲库重写为对齐 Flutter 的单页 14 视图
- [x] 弹出层位置错乱（批53）— `lynx-ui-popover` 返回**相对触发器**坐标而 `OverlayView` 用 `position:absolute` 施加（含块是最近定位祖先），实测排序菜单落在 `x=-122` 整块屏外；库的溢出检测还拿浏览器屏幕尺寸当视口。自研 `PopoverMenu`/`PopoverPanel` + `anchored-overlay.ts` 退役该库，铁律见 `AGENTS.md` §4
- [x] 插件商店缺「重新安装最新版本」（批57）— 对照 Flutter 盘点挖出模型级 bug：schema 把 `conflict` 建模为 string 而后端发 boolean ⇒ 撞名冲突流程一直是死的。行动作补齐四态
- [x] 禁用插件后 tab 图标还显示（批57b）— tab-config 不过滤 `isActive` + mutation invalidate 的 query key 与 shell-nav 的 key 对不上（staleTime 60s 永不刷新）
- [x] 底部导航选中态整块紫底反白观感差（批58）— 按 Liquid Glass 重做为悬浮胶囊 + 淡色 tint；用户随即报内容被 mini player 挡住 ⇒ 新增 `--nav-inset` 两档变量（无歌 80/有歌 148），见 `AGENTS.md` §4
- [x] 宽屏 rail 选中跳动（批58b）— 批58 的固定尺寸规则没限作用域，选中 52px 撑高 ~40px 的行；收进 `.shell__bottombar` 作用域，rail 选中只变色
- [x] 编辑弹窗保存按钮无强调、标题溢出（批60b）— 无主题包时 `--primary` 回退墨色使描边按钮黑边黑字，改实心填充；`max-height:85%` 在 fixed 弹层下原生引擎不可靠，改 `85vh`
- [x] 编辑弹窗标题被「挡住」（批60c，实为 flex 压扁）— 高度钳制下 flex 把溢出摊给所有 shrink 非零子项，标题行被压到 13.4px 且 Lynx 元素自带 `overflow:clip` 裁掉文字上半；固定 chrome 加 `flex-shrink:0`。判据：`getComputedStyle().height` vs `scrollHeight`，见 `AGENTS.md` §4
- [x] 底部滑入面板 Android 只剩标题行 — `absolute` 无 `height` ⇒ shrink-to-fit，而 body `flex-basis:0` 对内容高度贡献 0 ⇒ 塌成 chrome 高；`max-height` 只给上限不给高度。播放历史改 `height:70%`，其余 body 改 `auto` basis；闸门 `bottom-sheet-height.test.ts`
- [x] ⋯ 菜单与宽屏行内按钮重复（批62）— 按打开行的视口裁剪菜单（窄屏菜单是唯一入口不能无条件删）；顺带修 `PlayHistoryPanel` 行漏传 `showDeleteAction={false}`

## 代码审计发现（2026-08-14 · 27 条已全部修完）

> 四路并行审计产出。P0 批41/43 修完，P1 批42，P2 批43/45/47/48。

### P0 — 让某个平台整体不可用

- [x] `pnpm run build` 不再产出原生 bundle（批41）— `lynx.config.ts` 的 `environments: {web:…}` **替换**了 rspeedy 默认环境，Android/iOS 一直打陈旧产物；补 `lynx: {}` + 产物新鲜度断言脚本
- [x] iOS 自批39 起无法构建（批41）— `project.pbxproj` Sources 数组内多了一行赋值语句；契约闸门的 `toContain` 恰好被子串满足而全绿，补结构校验
- [x] `build:web` 产物黑屏（批41，两层根因）— ①引用文件名与产物不符；②入口是 ES module 却无 `type="module"`，`import.meta` 异常不进 `console.error` 只走 `pageerror`。补 `web-host-page.test.ts`
- [x] Web 完全没声音且表现一切正常（批43）— `typeof HTMLAudioElement !== 'undefined'` 在 background Worker 里恒 false，落到会走完整进度的静音 mock；主线程 API 无法从 worker 直调，改宿主桥接注册 `NativeModules.SongloftAudio`
- [x] embedded 模式 Web 无宿主页（批43）— 拷贝脚本的 `!isEmbedded` 守卫；移除并清掉烤进去的 9 MB canvaskit
- [x] Web 硬编码 `localhost:58091`（批43）— 改 `self.location.origin` 自动检测 + deployMode 自动 embedded

### P1 — 一眼可见（批42 全修）

- [x] 登出确认框取消按钮字面显示 `common.cancel` — 补 key + 新增全库 `t('…')` key 存在性闸门
- [x] 播放进度从不落盘、续播永远从 0 — 阈值 `>5000ms` 在 250/500ms 步长下永不成立；改 10s 桶
- [x] DLNA 页 Android 真机进去就崩 — 按 Kotlin/Swift 真实契约重写 promisify，禁 `as DlnaModule` 强转
- [x] 切服务器立刻被踢回登录并抹掉目标 token — 新增 `invalidateTokenCaches()`
- [x] 冷启动后 mini player 播放键无效 — 补 `_loadedSongId` 跟踪，不一致时补 load
- [x] 元数据「再次刷新」不开始轮询 — forced 优先于终态 + `dataUpdatedAt >= startedAt` 守卫
- [x] `getPlatformCapabilities()` 死代码 — 改 `isWebPlatform()`，接上三个消费点
- [x] HTTP 请求无任何超时 — `timeoutMs` + AbortController + `HttpTimeoutError`
- [x] 收藏歌单 ID 拉取可能死循环刷请求 — 空页即停 + 200 页兜底
- [x] 升级轮询后端重启后永不停止 — 容忍 15 次失败落终态
- [x] 多选状态跨搜索/筛选残留（会把不存在的歌加进歌单）— selected 与 filters 联动
- [x] 队列重复歌曲拖动排序钉错「当前播放」— `indexOf` 按对象身份改纯下标
- [x] iOS Live Activity 重复 start 泄漏锁屏卡片 — in-flight 标记 + 空 id 闭锁（JS 侧）

### P2 — 结构性

- [x] 每个 feature 各建一套 `TokenStore`+`AuthInterceptor`（6 份）（批43）— 换账号后曲库带别人 token、多 bundle 互刷 refresh；改 `getSharedApiBundle()` 进程级单例
- [x] 悬浮歌词（Android）五重死（批43 修三：无 `@LynxMethod`、未注册、签名不符；批48 修二：见下）— ⚠️ 批43 误记「权限与 service 声明此前已有」活了四个批次，原因是 manifest 无闸门
- [x] Live Activity（iOS）是普通 enum 不是 Lynx 模块（批43）— enum→class + @objc/name/methodLookup + 注册
- [x] 契约闸门不覆盖批35+ 的 4 个模块、不验证「注册」（批43）— +30 例，覆盖 6 模块双端
- [x] `setInsecureTls`/`setArtworkUri` 只有 Android、且 Android 侧半残（批45）— `setArtworkUri` iOS 存了从不读 ⇒ 锁屏永远无封面；Android trust-all 装在 `HttpsURLConnection` 而 fetch 走 OkHttp 完全无视 ⇒ 功能唯一用途失效。两侧替换宿主 HTTP service 收口，双向可逆
- [x] iOS 自签名媒体流不通（批47 实测通过）— `InsecureMediaLoader` 自定义 scheme 拦截 + 放宽信任的 session 拉字节范围。两个坑：回调队列挂 `.main` 会自己锁死自己（卡 10s 后 -11800）；一次性收数据会把整条音轨读进内存且 seek 失效，改流式
- [x] `setInsecureTls` 关闭不影响已建连接（批47）— 值变化时 `invalidateAndCancel()` 重建 session；Android 本来就是重建 OkHttpClient 即时生效，两端语义对齐

### 批48 · 悬浮歌词第四、第五重死

- [x] manifest 缺 `SYSTEM_ALERT_WINDOW` 与 `FloatingLyricService` 声明 — 两者都是静默失败（`startService` 解析不到只打日志不抛异常；权限缺失使 app 不出现在授权列表），功能自始至终没工作过
- [x] `updateText` 在 Lynx JS 线程碰 View，`CalledFromWrongThreadException` 被裸 `catch` 吞掉 — 窗口浮出但无歌词；定位靠 `mLayoutSeq` 逐字节比对。改 `Handler(Looper.getMainLooper())` post；顺带给覆盖层加深色底（白字无背景在浅色应用上不可见）
- [x] `AndroidManifest.xml` 完全无闸门 — 新增 7 例，从 Kotlin 源码推导需求（Service 声明/覆盖窗权限/foregroundServiceType 配套权限/configChanges），六条反向验证过
- [x] 悬浮歌词零 e2e 覆盖 — 新增 5 例，断言全落在进程外 `dumpsys` 上（三重死没有一次能让页面侧看到错误）。⚠️ 平台门控要写 `(process.env.E2E_PLATFORM ?? 'android')`，裸 `===` 会让整套被静默跳过

### 悬浮歌词第六重死（2026-08-28 真机报障）

- [x] 首次授权返回后开关是开的但无窗口，需关再开 — `requestPermission` 把异步授权当同步用：`startActivity` 后紧接着就答 `false`。新增 `OverlayPermission.kt` 把待答请求停在授权返回时（`onResume` 重读 + 重试）。顺带修同源两条：启动链误调 `requestPermission` 会把用户弹去系统页（改只读 `hasPermission`）；pref 与系统授权两个真相源（进页以授权为准回写）
- [x] 未授权 `show()` 直接杀进程 — `addView` 抛在 `onStartCommand` 等于 FATAL；用户可随时撤销授权且 `START_STICKY` 会重发。先查授权 + try/catch 兜 ROM 说谎
- [x] e2e `serviceRunning()` 把尸体读成活服务 — `dumpsys` 的 `Destroying services` 段能挂到重启；只读 `active services` 段

### 批49 途中发现

- [x] HLS 电台落到 `ProgressiveMediaSource` — `songUrl()` 追加 `?access_token` 使 `endsWith(".m3u8")` 失效 + 电台走 `hls: false` 的 fallback 分支；新增 `isHlsPlaylistPath()`（剥 query 看扩展名）一处修好 Android 与 Web。⚠️ 不能对电台一律传 true：后端只对真播放列表加 `.m3u8` 后缀
- [x] HLS 电台仍无声的第二个原因：跨协议重定向被拒 — `hls_proxy` 关闭时后端 302→https，`DefaultHttpDataSource` 默认拒绝 http→https，报完全不指向真因的 `Response code: 302`；`setAllowCrossProtocolRedirects(true)`。连带：300s 读超时改按 `/video-hls/` 路径判定，避免直播流死等五分钟。⚠️ iOS 侧未实测

### 其他定性

- [x] 本地歌曲封面 404 — **查明是预期行为，非缺陷**：DB 里 `cover_path`/`cover_url` 本就为空（合成音频无封面），按需刮削搜不到返 404 正常。留档教训：观察与因果要分开记
- [x] Swiper `itemHeight='auto'` 被插值成 `"autopx"` — **上游良性怪癖**：`'auto'` 就是默认值，非法值被整条丢弃恰好落回 `auto` 行为，不该改。记 upstream-issues Issue 4
- [x] `-x-placeholder-color` Web 空转 — 浏览器丢弃未知属性，web-elements 占位符走 `::part` 自带默认 `grey`；CDP 否掉三条直觉修法后 patch web-core 打包产物默认值改 `var(--content-muted,grey)`，一处生效全库
- [x] 构建警告「归零」说法过期 — 现剩 3 类已知警告（`-webkit-box-orient`/`-webkit-line-clamp` 跨平台双写，有注释说明）；「归零」退役为「警告应只剩已知 3 类」。教训：没有闸门读的文档断言不会自己保持为真
- [x] `.song-row` 三份互相冲突的副本 — 同特异性靠源码顺序决定谁赢；提取 `SongRow.css` 删三份，闸门断言他处不得定义 `.song-row*`
- [x] `savePlaybackState` 4 个位置参数违反 API 约定 — 改对象参数，实际只有 6 处改动。教训：「churn 大」拖着不改，往往因为没真数过
- [x] 偶发全屏灰层 — **无法复现关闭**（仅批29 一次偶发）。若再出现：先 `adb logcat | grep -i "\[Sheet\] Invalid state transition"` 再重开

## iOS e2e 首次运行发现（2026-08-15 · 批46 全部修完）

> iOS 首次真编译、e2e 首次跑模拟器。首跑 104/110，修完 iOS 110/110、Android 107/110（3 例平台门控跳过）。

### 音频引擎语义差异

- [x] `playing` 到达时 `durationMs` 仍为 0 — 首跑归因（「提早发 progress」）被实测推翻：`.readyToPlay` 时 AVPlayer 时长本就是 `indefinite`。真根因在 JS：progress 处理**无条件**用 0 覆盖已知时长（两宿主都把未知归一为 0）；`playAtIndex` 还从不写 duration ⇒ 切歌沿用上一首时长。改用服务端元数据播种 + `>0` 才覆盖
- [x] 0.5 倍速 1s 内进度推进为 0 — 首跑归因被推翻：`addPeriodicTimeObserver` 间隔按**媒体时间**计，0.5x 下墙钟间隔 1s，测试窗口结构性 flaky、播放本身正常。改按 `interval × speed` 安装并在变速时重装。教训：推测性改动在根因查明后应回退
- [x] 坏 URL 后 state 停在 `loading` — AVPlayer 失败后仍发 `timeControlStatus` 转换，把刚落定的 error 盖掉；`itemFailed` 标记阻断

### appearance 测试读错对象（3 条，测试侧）

- [x] theme 读到 `'unknown'` — eval 跑在 BTS realm，`lynx.__globalProps` 是主线程 Lepus realm 的全局；改经 `e2e-bridge` 的 `__E2E_APPEARANCE__`。附带教训：只断言 `getSystemAppearance()` 会测空气（模拟器持久化了用户覆盖主题），测试须自建前提（`changeAppTheme('system')`）并断言**解析后**的主题
