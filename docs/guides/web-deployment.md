# Web 部署

两种产物：**standalone**（独立部署，用户填后端地址）与 **embedded**（嵌进 Go 后端二进制，同源）。

```bash
pnpm run build:web            # standalone
pnpm run build:web-embedded   # embedded → 父仓库 clients/player-build/web-embedded
```

两者的差别不只是产物路径：`deployMode` 决定是否显示「API 地址」配置 UI，embedded 后端地址使用宿主页注入的 `webBaseUrl`（页面目录，含部署前缀）。未提供该字段的旧宿主仍回退到 Worker origin。

## 部署前必做

web-core 依赖 SharedArrayBuffer，无降级路径。宿主页必须为安全上下文（HTTPS，localhost 例外），并返回 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp`。standalone 和 embedded 均需要；Go 默认 Flutter 部署不能自动满足这项 Lynx 宿主契约。可在反向代理中设置响应头，跨源封面/音频还需后端的 CORP 支持。`web/serve.mjs` 已提供本地验证所需响应头。

Nginx 静态根路径示例（TLS 配置由部署者提供；embedded 的 `/api/v1/` 另配置反向代理）：

```nginx
location / {
    root /var/www/songloft-lynx;
    try_files $uri $uri/ /index.html;
    add_header Cross-Origin-Opener-Policy same-origin always;
    add_header Cross-Origin-Embedder-Policy require-corp always;
    add_header Cache-Control no-cache always;
}
```

**用浏览器真的打开产物。** `pnpm run web:dev` 只起静态服务（`web/serve.mjs`），不自己构建 —— 先跑一次 `web:sync`（与 `build:web` 现在是**同一条命令**，都是 `rspeedy build --environment web && node scripts/copy-bundle-web.mjs`）。现有闸门只锁住「`index.html` 的每个本地引用都存在、入口以 `type="module"` 加载」，不锁页面渲染。2026-08 为此吃过两次亏，当时两者取的静态资源目录确实不同（`web:dev` 读 dev-middleware 的 IIFE 入口，产物用 `client_prod` 的 ESM 入口），现已统一 —— 但「构建产物存在」仍然不等于「浏览器里能起来」。

现有 vitest 闸门锁住了两件事：`index.html` 的每个本地引用都存在、入口以 `type="module"` 加载。但闸门只证明它读过的东西 —— 它不会替你确认页面真的渲染出来了。

## 子路径部署

前端支持根路径和目录子路径，例如 `/songloft/`。宿主页在 web-core 升级元素前注入页面目录，并将 bundle、模块、脚本、样式、WASM 和应用图标定位到该目录；插件子 frame 的桥接模块也从宿主页目录加载。standalone 的服务器地址独立配置，允许与前端目录不同；embedded 的 API 使用同源目录，恢复会话时忽略旧 standalone 的 `server_url`。没有 `location` 的 Web Lynx 主线程通过平台标识读取同一宿主目录，原生资源路径保持原行为。

目录入口必须带尾斜杠，或显式访问目录内的 `index.html`；代理应将 `/songloft` 重定向到 `/songloft/`。应用使用内存路由，不把应用内路由映射成任意服务器目录。embedded 后端同时配置 `-base-path /songloft`（或 `BASE_PATH=/songloft`），代理保留 API 前缀。以下示例将前端文件放在 `/var/www/songloft/`；安全上下文和隔离响应头仍是必需条件：

```nginx
location = /songloft {
    return 308 /songloft/$is_args$args;
}
location /songloft/api/ {
    proxy_pass http://127.0.0.1:58091;
}
location /songloft/ {
    root /var/www;
    index index.html;
    try_files $uri $uri/ =404;
    add_header Cross-Origin-Opener-Policy same-origin always;
    add_header Cross-Origin-Embedder-Policy require-corp always;
    add_header Cache-Control no-cache always;
}
```

2026-10-07 已在严格只提供 `/songloft/` 资源的测试服务验证两种部署：Chrome 153 实际登录、应用图标、引擎/Worker、已安装 Lynx 计数插件及 WebView 插件 `host.getInfo` 往返通过；Linux WebKit 18.2 的歌单选择/入库/下载、401 刷新重试、取消/错误恢复通过。旧服务器地址夹具不会影响 embedded 请求。测试插件是隔离验收夹具，不代表 MIoT 长后台或真实 Safari 验收。此前 `e09592b` 包的 11 项 404/黑屏记录保留，该旧包未修改；新包身份与验证细节见 [progress](../project/progress.md)。

**旧包 `e09592b` 的 standalone 根路径连接带前缀后端已验证**。该交付包连接 `http://127.0.0.1:58192/songloft`，Linux WebKit 18.2 完成 JSON 导入/导出、401 刷新重试、取消/错误恢复、播放/切歌/音量快捷键与持久化；请求保留 `/songloft/api/v1/`。这不等于前端子路径挂载可用，也不覆盖真实 Safari、插件或全部资源。证据与空音频输出/输入夹具边界见 [progress](../project/progress.md)。standalone 与 embedded 仍由 `deployMode` global prop 区分（`copy-bundle-web.mjs --embedded` 剥掉该属性）。

> ⚠️ worker realm **也**拿得到 `self.location`，所以「探测 location 是否存在」不能用来判断 standalone 还是 embedded —— 这正是 `deployMode` global prop 存在的理由。

最终复验使用源码 `f5d00c0`、构建号 `213498463` 的新 standalone/embedded 包；两种子路径的 Linux WebKit 播放/切歌/音量快捷键与持久化也通过。浏览器目录与实际归档逐文件一致，源码身份和回执见 `/tmp/lynx-local-delivery/f5d00c0/{verification,browser-acceptance}.json` 与 progress；输入/组合事件及空音频输出仍不替代系统输入法和扬声器验收。

## 歌单 JSON 导入与导出

在「设置 → 数据管理」选择之前导出的 Songloft 版本 1 JSON 备份，或导出服务器的全部歌单。Web 宿主按 `pickTextFile/saveTextFile/cancelTextFile` 三个真实方法开放入口；旧宿主未实现这些方法时隐藏入口，并在数据页说明原因。

文件选择与 Blob 下载在主线程执行，业务 Worker 只接收文件文本；读取的导入文件上限为 20 MiB。若跨线程调用或网络等待丢失浏览器临时用户激活，主线程显示可点击的文件选择/下载控件与取消按钮，继续点击即可。下载后撤销临时 object URL，取消或离开数据页会移除文件控件；取消不上传文件。空文件、无效 JSON 和非版本 1 备份在客户端报错。

Web 接口请求走共享认证客户端：导入为 `/playlists/import` 的 multipart `file`，导出为 `/playlists/export` 的认证 GET，token 只进入 Authorization 请求头。401 复用已有刷新与原请求重试，刷新失效回登录；HTTP 错误结束 busy 状态。传输期间禁用两个按钮，成功导入失效 `['playlist']` 与 `['library']` 查询，包括详情、歌曲列表和首页统计。原生客户端继续使用已有文件上传/浏览器导出流程。

已在 Docker Chrome 153 的真实 Worker 页面验证 standalone 跨源 CORS 和 embedded 根路径同源：实际文件选择、新歌单/歌曲入库、中文/emoji JSON 下载、空/坏文件拒绝、取消、401 刷新重试和服务器失败恢复。用户激活过期路径通过延迟真实宿主调用后点击主线程控件验证。Firefox 134 在独立 Playwright 环境也通过两种根路径部署的选文件、入库、下载、错误与认证回归；其激活失效取消使用显式夹具，5.5 秒延迟并未触发备用控件。一次启动出现 Blob 脚本加载异常，后续两种部署流程通过，仍保留该兼容性观察，不代表所有 Firefox 版本稳定。Safari 未运行；子路径部署的独立验证见上节。

参考：[文件输入](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)、[用户激活与选择器](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/showPicker)、[Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob)、[撤销 object URL](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)。

2026-10-07 补充：Linux Playwright WebKit 18.2 也完成上述两种根路径部署的数据传输流程，实际后端新增与 JSON 下载可观测，最终页面错误为零；用户激活失效为显式夹具。临时 Mesa/依赖环境与日志见 [progress](../project/progress.md)。[Playwright 的 WebKit](https://playwright.dev/docs/browsers#webkit) 不是 Safari 品牌浏览器，真实 Safari 继续待验。

## 复制到剪贴板

复制提示词与歌曲路径等操作使用 `setClipboardWithResult`，等待 `navigator.clipboard.writeText` 完成才提示成功；非安全上下文/点击权限丢失或 API 拒绝时尝试旧复制接口，只有 `execCommand('copy')` 返回 true 才确认，否则显示失败。临时 textarea 和焦点会清理/恢复。Chrome 两处真实按钮复制后的粘贴一致，失败/重试也已检查；其他浏览器仍待验。见 [Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)。

## 播放键盘快捷键

播放设置提供本地保存的开关，默认开启。应用拥有交互焦点、已有可播放队列时：空格播放/暂停；Ctrl/⌘ + ←/→ 上一首/下一首；Ctrl/⌘ + ↑/↓ 调整音量，每次 5%，范围 0–100%。动作复用现有播放器，Web 主线程只识别按键并向 Worker 发事件。主线程还回报实际媒体音量，避免首次调整跳到默认值。

输入框、可编辑内容、按钮/链接/滑块、插件 iframe、组合输入及已处理的事件保留自己的操作；有返回栈覆盖层、选择/编辑模式或宽屏设置子页时暂停响应。播放与切歌忽略长按重复，音量允许重复；失焦和关闭开关后不消费按键。重复初始化清理旧监听，移动端不安装此监听。

Chrome 153 已实际验证播放、暂停、切歌、音量、开关持久化和播放器菜单保护。Shadow DOM 输入框/iframe 为浏览器注入夹具，组合输入为协议事件夹具，未宣称操作系统输入法或已安装插件的完整验收。Firefox 134 在临时 PulseAudio 空输出下也完成上述快捷键流程，最终媒体错误/页面异常为零；验证使用现有 128 kbps 设置，实际后端流解码和进度推进，不包含扬声器听感。此前 `MEDIA_ERR_DECODE` 经 Firefox 日志定位为输出端初始化失败 `NS_ERROR_DOM_MEDIA_MEDIASINK_ERR`，不是证实编码器不支持；空白页探针接入输出端后同样恢复。测试只向该浏览器传 `PULSE_SERVER`，未修改宿主音频配置。空输出含义见 [PulseAudio module-null-sink](https://wiki.freedesktop.org/www/Software/PulseAudio/Documentation/User/Modules/#module-null-sink)。间歇性 Blob 脚本异常仍保留观察，Safari 仍待验。事件依据见 [composedPath](https://developer.mozilla.org/en-US/docs/Web/API/Event/composedPath)、[isComposing](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing)、[repeat](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat)。

Linux WebKit 18.2 也完成快捷键实际控制回归，最终 audioErrors/errors 为空；使用同一交付包、128 kbps 流和临时 PulseAudio 空输出。首次媒体进程退出经空白页探针定位为缺少 GStreamer appsink/appsrc/autoaudiosink，补临时插件后恢复。第三个空白页样本被激活策略拒绝，未记作媒体通过。环境、日志、375px 中文及输入/IME 夹具边界见 [progress](../project/progress.md)；没有改客户端代码或放宽应用校验。Linux WebKit 不替代真实 Safari、系统输入法或扬声器验收。

## Web 平台的已知限制

部署前该知道用户会遇到什么：

| 限制                                     | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **无 secure enclave**                    | `SongloftStorage` 的 `secure` 命名空间在 Web 上只是命名空间，安全性等同任何同源脚本                                                                                                                                                                                                                                                                                                                                                                        |
| **会话持久化走 IndexedDB**               | worker realm 没有浏览器真正的 `localStorage`（那是 window-only；web-core 注入到背景 realm 的同名 scope 绑定不是页面持久化的那个），存储探测顺序是 native → **IndexedDB** → localStorage → 内存，且 IndexedDB 必须赢过 localStorage                                                                                                                                                                                                                         |
| **无 longpress**                         | web-core 不合成该手势，任何「长按打开菜单」的功能必须另有按钮入口                                                                                                                                                                                                                                                                                                                                                                                          |
| ~~占位符颜色恒为库自带 grey~~            | **已修（2026-08-26）**：`-x-placeholder-color` 在 Web 上是空转声明、web-elements 走 `::part(input)::placeholder` 且 part 上有显式默认 —— 这三者接不起来，所以改为 patch web-core 产物的默认值（`grey` → `var(--content-muted,grey)`，`scripts/patch-web-core-client.mjs`），CDP 实测随主题切换（light `#7b7b88` / dark `#8b8b98`）。**同类问题（web-elements 部件样式改不动）先想 part 显式默认 + shadow root 穿透，修法走 patch 脚本**，见 AGENTS.md §3.2 |
| **歌单文件选择的用户激活** | JSON 导入/导出已提供主线程可点击控件，应对 Worker 调用丢失激活；Chrome、Firefox 134 与 Linux WebKit 18.2 两种根路径部署的数据流程通过，后两者激活失效采用夹具。Safari 待验。其他旧 `pickAndUploadFile` 调用仍沿用原桥接。 |
| **无「清空浏览器缓存」入口（刻意不做）** | Flutter 版有（清 Cache Storage + 注销 SW + 强刷 HTTP 缓存，解决 PWA 更新后旧资源问题）。本仓库 Web 端不注册 Service Worker、不用 Cache Storage，standalone（`serve.mjs`）与 embedded（后端 embed.go）的响应一律 `Cache-Control: no-cache` + ETag 304 —— 更新后普通刷新即最新，无需用户手动清                                                                                                                                                               |
| **部分 Lynx 元素无实现**                 | `<refresh>` / `<webview>` 等未映射标签走恒等回落，成为 `HTMLUnknownElement`——属性开关完全无效。写跨平台页面前先查 web-core 的 `LYNX_TAG_TO_HTML_TAG_MAP`                                                                                                                                                                                                                                                                                                   |

完整清单见 [AGENTS.md §3「Lynx 与 Web 约束」](../../AGENTS.md)。

## 宿主模块（Web 特有）

主线程 API（`new Audio()` / `AudioContext` / `navigator.mediaSession` / `window.open` / `document.createElement`）在 worker realm 全部抛 `ReferenceError`。Web 上需要它们，只能经 web-core 的 `nativeModulesMap` 在主线程注册宿主模块，让 worker 侧通过 `NativeModules.X` 拿到 —— 这也顺带复用了已有的 native 分支。

现有宿主注册（`nativeModulesMap`）共 **7 条**，分布在三个宿主脚本里：`audio-host.js` 注册 `SongloftAudio` / `SongloftPlatform` / `SongloftNavigation` / `SongloftVideo`；`webview-host.js` 注册 `SongloftWebview`；`lynx-frame-host.js` 注册 `SongloftPluginBridge` / `SongloftLynxFrame`。worker 侧对应 `songloft-*-module.js`，另有 `lynx-plugin-bridge-shim.js` 给插件页补 `window.pluginBridge`。

> ⚠️ **`nativeModulesMap` 的 value 必须是 ESM URL 字符串**，不能是普通对象。web-core 对每个 value 做 `import(url)`，对象会被强转成 `"[object Object]"`、import 拒绝、`Promise.all` 跟着拒绝 —— 结果是 **worker 里一个自定义模块都没有**，而这会同时静默杀死文件选择器、剪贴板、以及音频（facade 探不到 `SongloftAudio` 就回落静音 mock）。`web-host-page.test.ts` 现在锁住了「每个 value 都是 URL、文件存在、被 copy 脚本拷贝、有 default-export 工厂」四条。
>
> **`SongloftStorage` 刻意不注册**：worker 已有可用的 `idb-storage`（DB `songloft`），而宿主那份用的是另一个 DB 名，接上会把已持久化的 token 换库、刷新即掉登录。

## 插件页在 Web 上走 iframe

原生用 `<webview>`，Web 用 iframe —— 且 **iframe 必须挂进 `lynxView.shadowRoot`**。lynx-view 带 `contain: strict`，是个 stacking context；body 级的 iframe 会盖住所有覆盖层，只能靠隐藏来对抗。z-index 固定 50，由契约闸门锁住挂载点。

`renderEngine: "lynx"` 使用嵌套 `<lynx-view>`。P6c 主线程在浏览器恢复可见、保活插件重新进入时，通过 `SongloftPluginBridge.push` 推送 `lifecycle` / `{"state":"resumed"}`，只通知当前活跃且 ready 的插件，不重载其 worker/state。子插件需用更新的 Lynx SDK 重建：事件订阅自行注册子 frame，再发 `lifecycle.ready`，不依赖先调用 RPC。SDK 源码已更新但尚未发布 npm；旧插件缺 ready 时不会收到此新增推送。

2026-10-07 官方 Firefox 134 / geckodriver 0.36.0 在临时 Xvfb 中补验真实标签页切换：6 次 hidden→visible、12 个事件均 isTrusted=true；活跃插件一次恢复一次通知，隐藏插件不增，保活重入保持同元素/计数，关闭后重建采用新元素并重新等待 SDK 就绪。日志 `/tmp/lynx-p6c-gecko-plugin-visibility-final.log`、截图 `firefox-real-plugin-visibility.png`，无捕获到的页面异常。测试通过宿主入口加载本地 SDK 测试插件，不覆盖已安装插件 UI、MIoT 长后台重连、操作系统恢复或 Safari；环境与警告边界见 [progress](../project/progress.md)。Playwright [多页面文档](https://playwright.dev/docs/pages#multiple-pages)说明其页面按活跃页面处理，不能把未产生 hidden 的自动化切页当作真实可见性验收。

## 相关

- [构建与运行](./build-and-run.md) —— 全部平台的构建命令
- [调试](./debugging.md) —— 无头浏览器实测方法
- [平台差异](../architecture/platform-differences.md) —— 四端能力矩阵
