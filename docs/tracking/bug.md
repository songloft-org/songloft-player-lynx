# 手动测试 Bug 跟踪

> 真机测试发现的问题清单。已修复项标 `[x]`，待修项标 `[ ]`。

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
