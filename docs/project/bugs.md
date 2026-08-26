# Bug 跟踪

> 真机测试与代码审计发现的问题清单。已修复项标 `[x]`，待修项标 `[ ]`。
>
> 下方**「手动测试发现」**是用户真机使用中报的问题；**「代码审计发现」**（2026-08-14）是四路并行审计查出的缺陷，**其 P0/P1/P2 三段已由批41–48 全部修完**（每条就地标了修复批次），实施细节在 [`../archive/2026-08-14-audit-fix-plan.md`](../archive/2026-08-14-audit-fix-plan.md)，本文件只作清单索引。
>
> **当前未修项共 8 条**，全部集中在「批49/51 途中发现」「刻意推迟的清理」「仍未定位」三段，以及手动测试段的 3 条（`ProxySettingsPage` 裸 fetch 致该页无法写渲染测试、Android 封面 letterbox、`illegal css key:237` 告警）。每条都写明了「为什么没修」——多数是**缺少可验证的素材或闸门**，而非遗漏。

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
- [x] 网络代理页的输入框与卡片边框位置不对（`.proxy-settings__field` 的 padding 是 `0 var(--space-4) var(--space-3)`——**顶部为 0**，于是输入框顶边贴死在卡片内边缘、白色留白只出现在下方；更糟的是左右缩进 16px 恰好落在卡片 `--radius-lg`（20px）圆角的弧线区内，而 `.settings-section__card` 带 `overflow: hidden`，输入框上面两个角**被卡片的圆弧削掉**。与缓存配置那次是同一个根因：字段塞进「为自带内边距的行设计」的卡片里却给了不对称 padding。改为对称 `var(--space-4)`，并把输入框样式对齐同为设置子页的 `.cache-manage__input` / `.server-settings__input`）
  - 顺带查出**同一批修过的 `-x-placeholder-color` 漂了三处**：14 个 `<Input>`/`<TextArea>` 里 `proxy-settings__input`、`server-edit__input`、`libops-exclude__input` 都没写，而清单第一条「暗色输入框提示文字看不清」早已标记为批19 修完。`libops-exclude__input` 更彻底——只有一句 `flex: 1`，连背景、边框、文字色都没有。三处已补齐，并新增 `shared/ui/__tests__/input-css.test.ts`：**从 TSX 里扫出所有 `<Input>`/`<TextArea>` 的 className 反推需求**（而不是硬编码清单），少一个就报出类名。反向验证过：摘掉任一处立刻红
  - **随后把全库 15 个文本字段逐个过了一遍**（不是 14 个：`LyricEditPage` 用的是**裸 `<textarea>`** 而非 lynx-ui 组件，只认组件名的闸门会静默漏掉它，已扩到匹配小写裸标签并加了一条专门钉住它在扫描范围内的用例）。结论：**贴边/削角那个几何问题别处没有**——全库 `overflow: hidden` + 圆角的容器里只有 `.settings-section__card` 装输入框，而只有网络代理与缓存配置往它里面塞字段。但查出另一族按 `DESIGN.md` 判定的 token 误用：
    - **6 处用 `--paper`（`DESIGN.md:28`「浮于 canvas 上的卡片/面板」）或 `--canvas`（「最底层背景」）当输入框底**，而 `:30` 明写 `--neutral-faint` 是「极弱填充（**输入框底**、标签底）」。这不是审美问题：那 6 处都无边框且坐在透明页面上，浅色下是 `#fafafa` 压 `#ffffff`，**对比度约 1.04:1 —— 看不出哪里是输入框**，只能看见占位符（`song-detail` / `add-songs` / `library__filter` / `playlist-detail__search` / `plugin-registry__search` / `lyric-edit__textarea`，另有 `server-edit` 用 `--canvas` 与页面同色）
    - **15 处全用 `--radius-md`**（`:59`「普通卡片」），而 `:58` 指定输入框用 `--radius-sm`
  - 按形态收敛成两种：**表单字段** 10 个 = `--neutral-faint` + `--line` hairline；**搜索条与全页歌词编辑器** 5 个 = `--neutral-faint` 无描边（对齐本来就正确的 `library__search-input`）。半径 15 处统一 `--radius-sm`。`plugin-registry__search-btn` 跟着旁边的输入框一起改，否则它会变成这一对里更淡、更圆的那半边
  - 三条不变量都进了 `input-css.test.ts`（占位符色 / 填充 token / 圆角 token），逐条反向验证过。**闸门从 TSX 反推字段清单**，所以新写的输入框一落地就自动受约束
  - 私有域白名单那个字段是**单行 `<input>`**，而 `save()` 按 `\n` 切分、占位符写着「每行一个 IP 或 CIDR」——单行 input 装不进换行符，**多条白名单从来输入不了**。换成 `TextArea`（`<textarea>` 在 Android xelement 4.0.0 / iOS XElement 4.0.1 / web-core 三端都注册了，已逐一核实），`maxLength` 从共享默认 140 提到 2000（140 只够约八条 CIDR）
- [x] GitHub 代理输入框下加「复制 Prompt 让 AI 帮你找」按钮（对齐 Flutter 的 `github_proxy_dialog.dart`）—— 可用的 GitHub 镜像来来去去，所以参考实现给的是**提示词**而不是会腐坏的预设列表。**前提是全库压根没有剪贴板能力**：Lynx 自身无剪贴板 API（查过 `@lynx-js/types` 与文档），渲染 realm 也没有 `navigator.clipboard`，而 TS / Kotlin / Swift / Web 宿主四处此前**全无**任何 clipboard 代码。于是先补 `SongloftPlatform.setClipboard` 三侧：
  - Kotlin 走 `ClipboardManager` 且**必须 post 到主线程** —— 模块方法跑在 Lynx JS 线程上，这正是批48 悬浮歌词那个坑（裸 `catch` 吞掉 wrong-thread 异常，窗口浮出来却一行不显示）
  - Swift `UIPasteboard` 同样主线程；Web 宿主先试 `navigator.clipboard.writeText`，**回退**到 textarea + `execCommand`（前者要安全上下文、而这次调用是从 worker 经桥过来的，user activation 可能已丢）
  - **契约闸门自动逼出了两侧实现**：`native-module-contract.test.ts` 是从 TS 接口**反推**方法清单的，往 `SongloftPlatformNative` 加一行之后它立刻红「Kotlin has no @LynxMethod setClipboard」。两侧都编译验证过（`compileDebugKotlin` 通过、iOS `BUILD SUCCEEDED`）
  - 提示词文本**刻意不做 i18n**：它不是界面文案而是用户粘给 AI 的内容，翻两份就要维护两份语义一致的 prompt，参考实现同样是单个中文常量
- [ ] **`ProxySettingsPage` 用裸 `fetch` + `useEffect` 加载四个设置**，而其余设置页都走 api + query 层。后果是它的 loading 闸在 ReactLynx 测试环境里**永远不放行**（fetch 确实调了 4 次，但 promise 续体里的 `setLoading(false)` 不落进渲染树，连续 6 个 `act` + 10ms 也不行），所以这一页**无法写渲染测试**。批51 因此把 AI 提示词那条改成断言导出的常量 + 剪贴板管道，而不是点按钮。真要补渲染覆盖，得先把这页迁到 query 层
- [x] 删除插件没有二次确认 / 从文件安装点击没反应 —— 两处都修：
  - **删除**：其实有两段式确认（`confirmDeleteId`），但全部反馈只是那个 16px `×` 从 `--content-muted` 变成 `--danger`，跟 hover 着色无从区分，所以读起来就是「点一下就删」。两段式适合**带文字的按钮**（文字会跟着变，如「再次点按确认删除」），不适合一个纯图标。改用对话框（点名要删的插件，说明会连同其存储数据一起删）。顺带把**两份**手写对话框（设置页登出的 `logout-dialog__*`、重复检测页的 `fp-dialog__*`）收敛成 `shared/ui/ConfirmDialog`——两份已经在 `DESIGN.md` 明文规定的那点上漂了：`--danger` 是「危险色（**仅文字，不做彩色背景块**）」，设置页那份守住了（ghost 底 + 红描边 + 红字），重复检测那份用的是**实心红填充**。统一到合规的那份，并加「无人重新手写对话框 CSS」闸门
    - **后续真机复现「点取消多闪一帧『将删除「」…』」**：`show` 直接由 `pendingDelete !== null` 驱动，点取消把 subject 清掉的同时 lynx-ui 还在播**退出动画**，于是动画那几百毫秒面板留在屏幕上、名字已经没了。改为 `deleteOpen` 与 `pendingDelete` 分离：subject 只在「下一次打开」时被替换、绝不因关闭而清空。单测的 Dialog stub 也改成真 lynx-ui 行为（`show=false` 时子树仍挂载、只标记隐藏）——之前「show=false 就卸载」的 stub 恰好把这个 bug 藏住了。反向验证过
  - **从文件安装**：根因是 `getUploadUrl()` 返回**裸相对路径且不带凭据**。这个 URL 交给 `pickAndUploadFile`，而它在**所有平台上都走 `HttpClient` 之外**的 multipart POST（原生是 OkHttp / URLSession，Web 是宿主里的裸 `fetch`），所以既没有拦截器给它挂 Bearer token，也没有谁去解析相对路径 → 端点是 `@Security BearerAuth`，**每次必 401**；原生侧那个 URL 连解析都过不去。而页面用的是 `catch {}` **空捕获**，于是 401 表现为「按钮没反应」。改为绝对地址 + `?access_token=`（与 `openLogs` 同一写法，后端 `middleware/auth.go:53` 明确支持这个 query 回退），并把失败改成页内红字显示（Lynx 无 toast），`cancelled` 不算失败。3 条单测钉住 URL 形状（含「token 只编码一次」），反向验证过
  - **但 Web 上「native module not available」还有更深一层的真根因（本次才挖到）**：`audio-host.js` 把三个模块以**普通对象**塞进 `nativeModulesMap`，而 web-core 的 `createNativeModules` 对每个 value 做 `import(url)` —— 对象被强转成 `"[object Object]"`，import 拒绝，`Promise.all` 跟着拒绝，于是 **worker 的 `NativeModules` 里连一个自定义模块都没有**，只剩 web-core 自带的 `bridge`/`LynxExposureModule`。**用无头 Chrome 实证**：混入一个对象值 → `REJECTED: Failed to resolve module specifier '[object Object]'`。这一下让三件事同时静默死掉：文件选择器报「native module not available」、剪贴板写入无声 no-op、以及**批43 的 Web 音频修复从未生效**（facade 探不到 `SongloftAudio` 落回静音 mock）。修法：`nativeModulesMap` 的 value 改成 **ESM URL**（worker `import` 它、default export 是 `(nativeModules, call) => module` 工厂），方法经 `call` 转发到主线程的 `onNativeModulesCall`。新增 `web/songloft-platform-module.js`、`web/songloft-audio-module.js` 两个转发模块；**`SongloftStorage` 刻意不注册**——worker 已有可用的 `idb-storage`（DB `songloft`），而 audio-host 里那份用的是**另一个 DB 名**（`songloft_storage`），接上会把已持久化的登录 token 换库、刷新即掉登录，所以把那份死代码删了、让存储探测照旧落到 `idb-storage`。音频事件本来就走 `sendGlobalEvent`（不经此通道），转发模块只搬 worker→main 的方法调用。闸门：`web-host-page.test.ts` 加「每个 value 都是 URL 字符串、对应文件存在、被 copy 脚本拷贝、有 default-export 工厂」，反向验证过（把一个 value 换回对象立刻红）；copy 脚本对缺失的宿主脚本**直接 throw**。⚠️ **未竟**：`pickAndUploadFile` 在 Web 上仍可能因 user activation 丢失而不弹文件框（调用从 worker 经桥过来），无头环境不可观测，需真浏览器确认
- [x] 卸载对话框点「取消」会多闪一帧「将删除「」…」（名字空了）+ Web 上「从文件安装 / 复制提示词」全都够不着原生模块 —— 真机复现后挖到**两个独立根因**：
  - **对话框**：`show` 直接由 `pendingDelete !== null` 驱动，点取消把 subject 清掉的同时 lynx-ui 还在播**退出动画**，于是动画那几百毫秒里面板留在屏幕上、名字已经没了。改为 `deleteOpen` 与 `pendingDelete` 分离：subject 只在「下一次打开」时被替换、绝不因关闭而清空。单测里把 Dialog stub 改成**真 lynx-ui 的行为**（`show=false` 时子树仍挂载、只标记隐藏）——之前那版「show=false 就卸载」的 stub 恰好把这个 bug 藏住了，又是「mock 丢了真实实现的前置条件」。反向验证过
  - **Web 原生模块整体失联（真正的根因）**：`audio-host.js` 把三个模块以**普通对象**塞进 `nativeModulesMap`，而 web-core 的 `createNativeModules` 对每个 value 做 `import(url)` —— 对象被强转成 `"[object Object]"`，import 拒绝，`Promise.all` 跟着拒绝，于是 **`NativeModules` 里连一个自定义模块都没有**，只剩 web-core 自带的 `bridge`/`LynxExposureModule`。**用无头 Chrome 实证**：混入一个对象值 → `REJECTED: Failed to resolve module specifier '[object Object]'`。这意味着三件事同时静默死掉：文件选择器报「native module not available」、剪贴板写入无声 no-op、以及**批43 的 Web 音频修复从未生效**（facade 探不到 `SongloftAudio` 落回静音 mock）。修法：`nativeModulesMap` 的 value 改成 **ESM URL**（worker `import` 它、default export 是 `(nativeModules, call) => module` 工厂），方法经 `call` 转发到主线程的 `onNativeModulesCall`。`SongloftPlatform`、`SongloftAudio` 各一个转发模块；**`SongloftStorage` 刻意不注册**——worker 已有可用的 `idb-storage`（DB `songloft`），而 audio-host 里那份用的是**另一个 DB 名**（`songloft_storage`），接上会把已持久化的登录 token 换库、刷新即掉登录。音频事件本来就走 `sendGlobalEvent`（不经此通道），所以转发模块只需搬运 worker→main 的方法调用
  - 闸门：`web-host-page.test.ts` 新增「nativeModulesMap 每个 value 都是 URL 字符串、对应文件存在、被 copy 脚本拷贝、有 default-export 工厂」四条，反向验证过（把一个 value 换回对象立刻红）。copy 脚本现在对缺失的宿主脚本**直接 throw** 而不是静默跳过
- [x] 设置页开关形式不统一：布尔值有时是开关、有时是尾部对勾，而「勾」又分带框和不带框 —— 确实是设计问题，**同一件事在全库有三种画法**。`DESIGN.md` 只定义了 Switch 一种状态控件，却没写「什么时候用什么」，于是漂成：
  - **布尔值三种写法**：`AppSwitch`（HLS 代理 / EQ / insecureTls / 6 个扫描开关）、**尾部无框对勾**（设置→播放的自动续播、音量均衡）、**手写带框勾**（浏览视图、Tab 配置）
  - **带框勾六份互不相同的副本**：`tab-config__check`(22px/无描边/`--paper` 底)、`browse-views__toggle`(22px/硬编码 4px 圆角/2px 描边/文本 `✓`)、`libops-tree__box`(18px/1px)、`library__select-check`(20px/**圆形**/文本 `✓`)、`playlist-detail__select-check`(24px/**圆形**/文本 `✓`)、`playlists__select-badge`(22px/**圆形**/文本 `✓`)。圆形本身就是错的语义——圆形读作单选
  - 定为三种角色各一种控件并写进 `DESIGN.md`（新增「状态控件」铁律 + Checkbox 规格）：**开/关 → Switch；一组里选一个 → 尾部无框对勾；列表里勾选若干 → 新的 `AppCheckbox`（20px 方形）**。改动：两个布尔行 → `SwitchRow`；浏览视图与 Tab 配置的自绘行 → `SettingsSection` + `SwitchRow`；四处多选 → `AppCheckbox`；`SwitchRow` 从 `library-ops/widgets/` 移到 `settings/widgets/`（它复用 `.settings-row*`，本就该跟 `SettingsRow` 放一起）；删掉六份副本的 CSS。产物反而小了约 6 KB
  - 闸门：`app-switch-css.test.ts` 加「无人重新手写 checkbox CSS」（判据是「画了框 + 用 `--primary` 填充」），反向验证过
- [x] **`var(--on-primary)` 是个不存在的 token，5 处在用，其中两处让内容彻底看不见** —— 顺着上一条查配色时发现。正确的是 `--primary-content`（`DESIGN.md:38`）。未定义的自定义属性会让整条声明被**静默丢弃**、元素沿用继承值，没有任何警告：
  - `playlists__select-badge-mark` 的对勾继承到 `--content`（近黑）压在 `--primary`（浅色主题是黑）填充上 → **多选歌单时根本看不出选了哪些**
  - `home__state-action-text`（空态「浏览曲库」按钮文字）**两个主题下都不可见**（浅色是近黑压黑，暗色是近白压白）
  - 另外 3 处是删除按钮文字压在 `--danger` 上，对比度差但还能读
  - 新增闸门 `shared/theme/__tests__/tokens-defined.test.ts`：全库 CSS 里每个**无 fallback** 的 `var(--x)` 都必须有声明。它当场又查出 6 处**另一套设计系统遗留的命名**从未迁移：`--surface`×3、`--surface-raised`、`--border`、`--primary-faint`（Material 风格名，Muse 里根本没有）。按各自同类兄弟的取值逐一改正（页面根 → `--canvas`、分隔线 → `--line`、工具条/选中行 → `--paper`、填充按钮 → `--neutral-faint`）。反向验证过
- [x] 音乐库管理页最后两项入口（重复歌曲检测 / 清理无效歌曲）跟上面的设置区不匹配 —— **是设计问题：这两项被手写成了裸卡片**（`.libops__dup-entry`），没走页面其余部分统一用的 `SettingsSection` + `SettingsRow`。四处偏差同时存在：① **无横向 margin**，而每个 `.settings-section` 卡片都有 `margin: 0 var(--space-4)`，于是这两项比上面所有卡片**宽 32px**（用户说的「边框比上面宽」）；② 纵向 padding 是 `var(--space-3)`（12px）而 `.settings-row` 是 16px（用户说的「太紧凑」）；③ 每项**各自带一圈 border**，两项相邻处出现双线；④ 没有区块标题，而同页其他四块都有。另外「已清理 N 首无效歌曲」是浮在卡片外的一行散字。改为一个 `SettingsSection`（新 key `libops.maintenanceSection`「维护」）+ 两个 `SettingsRow`，清理结果落进行的 subtitle，删掉三条已无引用的 CSS 规则。补 3 条单测（此前这两个入口**零覆盖**）
- [x] 扫描完成后拿不回「跳过已存在 / 重新导入」的选择 —— `onResetScan` 在「重新扫描」里**立刻发起了一次扫描**（注释写着「rescan means do it now」），于是跳过了 idle 态提供的全部选择：扫描模式与目标目录。更糟的是那些控件**根本无法到达**：`/scan` 进度端点会一直汇报**上一次**运行的终态，所以即使重新挂载页面也直接落在总结态，唯一出路就是这个按钮，而它会用本地 state 里恰好存着的模式（新挂载时是默认 `skip`）去扫——**「重新导入」在 UI 上完全选不到**。Flutter 参考实现的按钮只调 `reset()`（清本地进度 → 回 idle 态 → 出现模式选择 + 指定目录 + 扫描按钮），已对齐：新增本地 `dismissed`「已读这次结果」标记传给 `deriveScanView`，只遮蔽**终态**、绝不遮蔽正在跑的扫描（别的客户端或自动扫描起的任务仍要显示）。5 条单测，摘掉那一行后 3 条立刻红
- [x] 进了二级页面后底部/侧边导航的 tab 全都不亮（不是设计如此，是**移植时丢了前缀匹配**）—— `ShellLayout.tsx` 用 `pathname === dest.path` 做判定，于是 `/settings/plugins`、`/library/category/artist`、`/playlists/7`、`/plugin/x/*` 这些**没有一个**能点亮所属 tab，整条导航栏是暗的。Flutter 参考实现 `shell_layout.dart:_getCurrentIndex` 一直是按前缀匹配的，且**永远返回某个 index**（兜底 0=首页），从不出现「一个都不亮」。已按参考实现补 `navPathOwns` / `activeNavPath`（`shared/nav/shell-navigation.ts`，与 `showsMiniPlayer` 同一处策略模块）：
  - `/settings/*` → 设置；`/library/*` → 曲库；`/plugin/<entry>/*` → 该插件 tab；最长匹配优先，未渲染的 tab 不会被点亮
  - **`/playlists*` 归曲库**（照参考实现的「歌单已并入曲库」），尽管歌单也能从首页进——「返回哪个 tab」是另一个问题，`getLastShellLocation()` 早就按历史而不是按路径在回答它
  - **首页不按前缀匹配**（`/` 是所有路径的前缀），它是 `activeNavPath` 的兜底，于是陌生路由也只会点亮一个而不是零个
  - 8 条单测；摘掉前缀那一行后其中 3 条立刻红
- [x] 私有域白名单输入框右边超出卡片边框（**Web 独有，两处**）—— `@lynx-js/web-elements` 是用 `::part()` 给影子树里的真控件套样式的，而 `x-textarea.css` 只转发 `width`/`padding`/`border` 等，**偏偏不转发 `box-sizing`**（`x-input.css` 两个都转发）。于是内层 `<textarea>` 保着 UA 的 `content-box` 却继承了 `width: 100%`，边框盒比容器内容宽出 `padding + border`，从卡片右侧捅出去。**用无头 Chrome 复现了机制并量到了数**：白名单字段右边缘 417px 对卡片的 383px（超 34px = 2×16 padding + 2×1 border）；`LyricEditPage` 那个裸 `<textarea>` 是同一个 bug 的第二处，409px 对 383px（超 26px）。原生不受影响（Lynx 默认 border-box），所以只在浏览器里看得见。改为交给 flex 定尺（白名单 `width: auto`、歌词编辑器 `flex: 1`）——stretch 与 `flex` 都作用在**外**盒，两种盒模型下都对，实测两处都回到 383px 齐平。闸门加了「多行字段的**有效** width/height 不得是百分比」一条（按同特异性「后声明者胜」解析 base 与 modifier，因为 `.proxy-settings__input` 的 `width: 100%` 是那两个单行 input 要用的、只有 `--tall` 该覆盖它）
  - **这道闸门第一版是坏的，被它自己的反向验证抓出来**：字段表按「首个 class」做 map 且先到先得，而 `proxy-settings__input` 同时被两个 `<Input>` 和这个 `<TextArea>` 穿着，于是白名单被记成单行、直接被排除在多行断言之外——摘掉修复后闸门竟然是绿的。改为按**完整 className 串**建条目。教训：**闸门写完必须让它红一次**，否则你验的是自己的想象
  - ⚠️ 同一个缺口还有一半没法从我们的样式表里补：`x-textarea.css` 也**不转发 `border-radius`**，所以 Web 上这两个多行字段是直角、跟其他 13 个圆角字段不一致。要修得给 textarea 套一层承载背景/边框/圆角的 `<view>`，那会让「15 个字段两种形态」的闸门口径变复杂，故未做
- [x] 设置页从二级页面返回后落回顶部，没记住一级列表的滚动位置（滚动偏移存在页面自己的 `useRef` 里，而 `/settings/cache` 这类子页是**兄弟路由**不是嵌套路由——打开子页会把 `SettingsPage` 整个卸载，per-mount 的 ref 随之归零，所以 `scroll-top={scrollRef.current}` 自上线起**没有恢复过任何一次**：每次挂载读到的都是 0。改为 `shared/nav/scroll-memory.ts` 的模块级会话记忆（沿用 `last-library-search` / `shell-navigation` 的既有写法）+ `initial-scroll-offset`。**选 `initial-scroll-offset` 而不是 `scroll-top` 是查过三端 SDK 的**，因为文档对这两个属性都没给平台矩阵：前者在 Android `UIScrollView`/`LynxUIScrollView`、iOS `LynxUIScroller`/`LynxUIScrollView`、web-elements `ScrollAttributes` 五处全部有实现，且**都会等到内容布局完成**才应用（Android 在 `handleComputeScroll()` 里反复重试直到 `offset + height <= contentHeight`，iOS 排进 `scrollReadyBlock`，web 等一帧 `requestAnimationFrame`）——挂载那一刻内容还没测量，正需要这个延迟；`scroll-top` 则在**两条 new-arch 路径上压根不存在**，Android 默认路径上还是「立即」变体。另有一个单位坑：Android 的 `LynxScrollEvent.setScrollParams` 把 `scrollTop` 经 `pxToDip` 报出，`setInitialScrollOffset` 再经 `dipToPx` 收回，两头刚好对齐；把 px 值喂给这个属性会按屏幕密度成倍越界、直接落到页面底部）
- [x] web 平台刷新页面就掉登录（根因就写在控制台那行 warn 里：`no NativeModules.SongloftStorage and no localStorage; using in-memory storage`。web-core 把 app 跑在真 `Worker` 里，而 Web Storage 是 window-only，所以 worker realm 的 `localStorage`/`sessionStorage` 都是 undefined，能力探测一路落到 `createMemoryStorage()`，token 随页面一起没了。新增 `idb-storage.ts`：worker realm 里 `indexedDB` 原生可用（实测 put/get 往返成功），插在 localStorage 与 memory 之间。刻意不走「桥到主线程 localStorage」——那要给 `web/index.html` 与嵌入产物各塞一个宿主文件，而 IDB 零宿主配合。`open` 带 3s 超时兜底：auth bootstrap 等着第一次读，另一个 tab 触发 version-change blocked 时浏览器既不 fire `onsuccess` 也不 fire `onerror`，不设超时就是白屏挂死）
- [x] 导出日志功能缺少导出客户端日志功能，需要和flutter版本功能对齐。
- [x] 日志等级设置是不是缺少了一个标题？
- [x] 播放器速度/播放模式弹出层能同时打开两个，点其他区域应该让上一个消失（批51，**用户截图报的**）—— `PopoverBackdrop` 是负责吞掉外部点击的遮罩，库样式给了 `100vw × 100vh` 却**没有 `top`/`left`**；fixed 元素在偏移为 auto 时落在**静态位置**（定位容器内、紧贴触发器），于是它铺的是「从弹出层量起」的一屏，弹出层左侧与上方全没盖住——速度菜单在右上时，左下的播放模式键就在遮罩之外。补 `top: 0; left: 0` 钉到视口原点。同时删掉前一版自写的同名遮罩（`popover-backdrop` 这个类名是库里硬编码的，自写必然撞车；且它那个 `z-index: 99` 会把遮罩压在菜单**上面**，导致点菜单项只关闭、选不中）。闸门 `popover-menu-css.test.ts` 钉住这两条，摘掉 `top/left` 即红
- [x] 弹出层点击后要一秒左右才消失，是卡顿吗（批51，**不是卡顿**）—— `PopoverContent` 是承载 `bindtransitionend`/`bindanimationend` 的元素，而 `Presence` 只有等到这些事件才离开 `Leaving` 状态；我们的 CSS 一个 transition 都没声明，于是它退化成空转 `MAX_WAIT_FRAMES = 24` 次单帧 `lynx.requestAnimationFrame`（`delayFrames` 的实现就是 `lynx.requestAnimationFrame`），而业务代码在 BTS 背景线程上、每帧都是一次线程往返——纯帧数按 60fps 算也已 400ms 起。修法 `transition: opacity 140ms` + `.ui-closed { opacity: 0 }`，**两半缺一不可**（只有 transition 而值不变则什么都不触发）；`transitionend` 一到就立刻卸载。若某宿主不派发该事件则退回原来的 24 帧超时，慢但不坏。顺带修掉一个未被报告的问题：定位在 `DelayedEntering` 才计算（比 `Entering` 晚 16 帧），此前那 16 帧里菜单是以**未定位的位置可见**的，会先显形再跳走
  - 同一批还修了个我自己引入的回归：这两个弹出层**一开始根本打不开**（受控模式下 `PopoverTrigger` 只走 `onVisibleChange`，封装漏传了它；`onClose` 是 Presence 的「已关完」生命周期回调，拿它当关闭请求会死锁）。三条的机制与铁律见 `AGENTS.md` §4「Popover / Presence」
- [x] 全屏播放器封面在 Android 上整块不显示（重构播放器时真机抓到，**非本批引入，是历史就有的**）—— 根因是 `box-shadow` 加在 `<image>` 元素上：Android 上位图会因此完全不渲染，元素照常占位、画背景色，但图片（连占位符）都不出来，表现为一个纯白圆角矩形。而 mini-player 的封面没有阴影所以正常。修法：阴影挪到包着图片的 `<view>` 上，`<image>` 用 `mode='aspectFill'` 填充。这类「元素在、位图没了」的失效截图之外没有任何信号，只有真机能看见
- [x] 全屏播放器在 Web 上宽度恒 0、歌词页不可达（重构时附带发现，**历史就有**）—— `useBreakpoint()` 漏传 `measureSelector`。`/player` 是导航后才挂载的页，而 Web 上 `bindlayoutchange` 只对首屏就存在的元素触发，于是宽度永远是初始的 0：Swiper 分支进不去、歌词屏不可达、`isWide` 恒 false。补 `'.full-player'`（HomePage 顺手补 `'.home'`），并新增全库闸门 `measure-selector-contract.test.ts` 防再犯
- [x] 「打开后自动进歌词」偏好从未生效（重构时附带发现，**历史就有**）—— 旧代码在 mount 时读偏好就 `swipeTo(1)`，但 Swiper 要等宽度已知才挂载，此刻 `swiperRef.current` 是 null，调用被静默丢弃。改为等「偏好读到 + Swiper 已挂载」两者齐备再进、且只进一次
- [x] 全屏播放器横屏时封面上溢、顶到顶栏下面（重构时真机横屏抓到）—— 高度预算错把**整页**高度喂给了 Flutter 的公式（那 100 的常量是给「标题在封面栏内」的桌面布局调的），在横屏下要出比可用空间还大的封面。改为测量 **stage**（封面/歌词区）自身高度，常量也换成 stage 内边距
- [ ] 全屏播放器封面在 Android 上不是正方形（letterbox，**遗留，未修**）—— `<image>` 元素给定了 405px 见方的盒子，实际却只布局出约 215px 高，于是方形封面渲染成上下留白的横条。已排除 `height:100%`、内联 px 高、`position:absolute`、`aspect-ratio:1`、`auto-size`、各 `mode` 值、去掉外层 flex 居中，均无效；同一 URL 在 mini-player / 歌单卡（用**类**而非内联定尺）能填满。线索指向「内联 style 定尺 vs 类定尺」的差异，但无 `@media` 没法给类塞断点尺寸，故暂搁。详见 `FullPlayerPage.css` `.full-player__cover-img` 注释
- [ ] 播放器挂载时 logcat 报两条 `illegal css key:237`（**遗留，未查清**）—— 与本次新增 CSS 无关（把 PlayerBackdrop 整个移除后依旧出现），而曲库/设置页挂载时没有；237 超出当前 css-defines 表的范围（表止于 236），疑似只有播放器才挂载的某个 lynx-ui 组件（Swiper/Slider/Sheet）的内部样式键。表现为告警、未见功能损坏，待有空对照宿主版本查
- [x] 播放历史页面有报错（批50）—— 页面上那行 `不支持的 context_type` 只是最外层症状，往下是**三处独立的错**，其中**写入从来没成功过**比读更严重：后端 `SongPlayed` 从 query 读 `type`/`context_type`/`context_key` 且只有 `type=play` 才落库，而前端把 context 放在 **JSON body** 且从不发 `type` → 每次 204、一条都没记。加上「设置→高级→播放历史」这个入口拿不到任何上下文（后端历史是**按播放上下文分桶**的，没有全局「最近播放」端点），所以它不是坏了而是**不可能修好**。改前先用真实后端按新旧两种形状各 POST 一次做反向验证。详见 `progress.md` 批50
- [x] 曲库的设计有问题，自定义曲库显示分类也有问题（批51-A~D）—— 探查证实**「自定义显示分类」整个功能从未生效过**：后端 `PUT /settings/library-browse` 契约是 `{views:[{key,visible}]}`（14 个合法 key），而旧实现发 `{id,visible,order}` → GET 恒回落全默认、PUT 恒 **400** 并被 `.catch(()=>{})` 静默吞掉。且 `KNOWN_VIEWS` 自创了 4 个后端不认的 id、丢了 4 个真实的。曲库随之从「硬编码 4 tab」重写为对齐 Flutter 的**单页 14 视图**（四批）。详见 `progress.md` 批51-A/B/C/D
- [x] 播放器速度/播放模式弹出层位置错乱（批53，**Docker 无头 Chrome 实测抓出 6 处**）—— 上面批51 那两条只治了遮罩与延迟，位置本身仍是错的：`lynx-ui-popover` 的 `computeCoordsFromPlacement` 返回**相对触发器**的坐标，而 `OverlayView` 用 `position: absolute` 施加它（包含块是最近的定位祖先），两者只在「触发器正好位于该祖先原点」时等价。实测歌单详情排序菜单落在 `x = -122`——**整块在屏外，功能等于不存在**；音量面板 `-60`、倍速 `-30`、曲库排序 `0`（应为 106）。库自带的溢出收敛也救不了（`detectOverflow` 拿 `SystemInfo.pixelWidth` 当屏幕，Web 上报的是浏览器**屏幕**尺寸 800×600 而非 lynx-view 的 420×900）。改为自研 `PopoverMenu`/`PopoverPanel` + `anchored-overlay.ts`，退役该库。铁律见 `AGENTS.md` §4「锚定弹出层」
- [x] 插件商店缺「重新安装最新版本」功能（批57）—— 顺着这条对照 Flutter 全量盘点，另外挖出一个**模型级 bug**：`registryPluginEntrySchema` 把 `conflict` 建模为 string，而后端实际发 **boolean**，`true` 落进 `.catch()` 变 undefined ⇒ **整个撞名冲突流程一直是死的**（songloft/songloft#339 那套防护从未生效）。行动作补齐四态（重装 chip / 更新至 vX / 冲突覆盖安装 / 安装）。详见 `progress.md` 批57
- [x] 禁用插件后 tab 上图标还显示（批57b）—— 双处根因：① `useShellNavTabs` 把 tab-config 的 pluginTabs 原样返回，不过滤 `isActive`/是否已卸载；② toggle/delete/install mutation 只 invalidate `['jsplugin','list']`，而 shell-nav query 的 key 是 `['settings','tab-config','shell-nav']`（staleTime 60s）压根不会被刷新。Web 真后端实测：禁用洛雪音源 → 导航栏 7→6 即时消失，无需刷新
- [x] 底部导航选中态是整块紫色填充+反白，观感差（批58，设计问题）—— 按 iOS 26 Liquid Glass 重做：fixed 悬浮胶囊 + `--primary-faint` 淡色底 tint。**顺带踩了一条**：首版内容避让只留 80px，用户随即报**首页/曲库滚不到底被 mini player 挡住** → 升级为 `--nav-inset` 两档变量（无歌 80 / 有 mini-player 148）。新增可滚动页面必须消费该变量，见 `AGENTS.md` §4「底部导航胶囊」
- [x] 宽屏左侧 tab 选中会高度变化导致抖动（批58b）—— 批58 的选中态固定尺寸规则（`height: 52px`）没限作用域：底栏 64px 槽吸收了它所以无影响，但 rail 行是内容高度（~40px），选中被强制 52px、行高跳 12px、**下方所有行位移**。修法是把 `width/height` 收进 `.shell__bottombar` 作用域，rail 选中仅变色。铁律：**rail 选中只变色、严禁改尺寸**
- [x] 编辑弹窗标题和保存按钮有问题（批60b，真机报障）—— 两个独立缺陷：**保存按钮**无主题包时 `--primary` 回退墨色（#111），描边版 submit 渲染成黑边黑字、与取消按钮几乎无差别、主操作零强调 → 改实心主色填充；**标题**是 `max-height: 85%` 在 fixed 弹层下按 containing block 解析、原生引擎不可靠（Web 钳制生效 614px 而原生失效后长表单被 flex 居中溢出顶部）→ 改 `85vh` 直接读 viewport
- [x] 编辑弹窗标题被挡住（批60c，**实为被 flex 压扁而非遮挡**）—— 卡片是 column flex + 高度钳制，flex 把溢出量按 basis **加权摊给所有** shrink 非零的子项，小 basis 只是分得少、不是不分；而这两个弹窗的滚动 body 刻意用 `flex-basis: auto`（basis 0 会在卡片未被钳制时塌陷），于是标题行与 action 行也各摊一份。Web 实测标题 `height: 13.4px` / 内容 22px，而 Lynx 每个元素都带 `overflow: clip` ⇒ **文字上半被裁**；action 行 21.8/36 而按钮固定 36px ⇒ 溢出卡片 content box。修法给固定 chrome 加 `flex-shrink: 0`。**这类问题截图会误读成「样式没生效」或「被遮挡」**，判据是 `getComputedStyle(el).height` 与 `el.scrollHeight` 的差值。见 `AGENTS.md` §4 同名条目

## 代码审计发现（2026-08-14 · P0/P1/P2 已全部修完）

按严重度排序。`✅复核` = 已亲自运行命令/读源码确认；`🔍待复核` = 有 `file:line` 证据但未二次独立验证。

> **标题此前写的是「均未修」，那是审计当天的状态，已过期八个批次。** 三段共 27 条现已全部 `[x]`：P0 由批41/43 修完，P1 由批42 修完，P2 由批43/45/47/48 修完。**这个标题本身就是「没有闸门读的东西不会自己保持为真」的又一个实例**（同批48 的 manifest、批51 的构建警告归零）——文档里的状态断言没有对账机制，只能靠改代码的人顺手带走。

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
- [x] **多选状态跨搜索/筛选残留**（批42 已修，`3e1c342`）—— `selected` 与 `filters` 无联动，会把屏幕上不存在的歌加进歌单。该条一度被记为「批42 唯一未修项」，实际是同批最后一个提交修的；回归测试在批51-B 随曲库重构从 `song-view` 迁到了 `flat-songs-view.test.tsx`
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

### 批51 途中发现，未修

- [ ] **`-x-placeholder-color` 在 Web 上是个空转的声明** —— 查 `dist/web/main.web.bundle` 确认它逐字进了产物的
  CSS，而浏览器对未知属性直接丢弃；`@lynx-js/web-elements` 的占位符颜色走的是另一条路
  （`x-input::part(input)::placeholder { color: var(--placeholder-color) }`，一个真正的 CSS 自定义属性），
  没人把两者接起来。所以 **Web 上所有输入框的占位符恒为库自带的 `grey`**，暗色下就是清单第一条那个
  「看不清」——只在原生两端修好了。修法是在同一条规则里**并列写上 `--placeholder-color: var(--content-muted)`**
  （自定义属性 Lynx 原生会照常解析、无用即无害），要动 15 个字段全部一起改才有意义，故未随批51 顺手做。
  `input-css.test.ts` 的注释里记了这件事，将来改的是那 15 条规则、不是那道闸门
- [x] **构建警告不再是零**（AGENTS §7 与本文件都写着「自批19b 起归零」，实际已漂）——
  `LyricCalibratePage.css` 有一句 `font-variant-numeric: tabular-nums`，Lynx 无此属性，
  模板编码阶段被剥掉只留一行 warning，**从落地起就没生效过**。批51 顺手删掉恢复零警告
  （删它对渲染是纯 no-op）。真要数字不跳动得改 `font-family` 用等宽字体。
  教训同 `AndroidManifest.xml` 那条：**没有闸门读的东西，写在文档里的「已归零」不会自己保持为真**

### 刻意推迟的清理（批50 记录）

- [ ] **`.song-row` 有三份互相冲突的副本** —— 同一套规则分别写在 `LibraryPage.css:118`、
  `CategorySongsPage.css:152`、`PlaylistDetailPage.css:390`，且**不等价**：一份是 `width: 100%`，
  另一份是 `flex: 1; min-width: 0`（`PlaylistDetailPage` 把 `SongRow` 放在 `SortableItem` 里，
  需要后者）。因为 `router.tsx` eager import 每个页面，三份从启动起全在 bundle 里、同特异性，
  **靠源码顺序决定谁赢**。正解是提取成 `SongRow.css` 由组件自己 import，但那必须在冲突规则里
  挑一个赢家，而仓库**没有任何视觉闸门**能抓到回归——只能靠真机截图逐页对比。批50 因此刻意
  没做，新增的 `PlayHistoryPanel.css` 也刻意**不放**第四份副本
- [ ] **`savePlaybackState` 是 4 个位置参数** —— 违反 `docs/reference/api-conventions.md`
  的「≥3 个或含可选参数用对象参数」。改成对象参数会让 `position-persistence.test.ts` 里
  `mock.calls[..][2]` 那种按位取值的断言失效，收益不抵 churn，批50 只把第 4 参从
  `sourcePlaylistId?: number` 换成了 `context?: PlaybackContext`

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
