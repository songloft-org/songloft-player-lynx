# Web 部署

两种产物：**standalone**（独立部署，用户填后端地址）与 **embedded**（嵌进 Go 后端二进制，同源）。

```bash
pnpm run build:web            # standalone
pnpm run build:web-embedded   # embedded → 父仓库 clients/player-build/web-embedded
```

两者的差别不只是产物路径 —— `deployMode` 决定要不要显示「API 地址」配置 UI，embedded 模式下后端地址由 `self.location.origin` 自动检测。

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

**目前未验证子路径部署**。资源与 API 仍有根相对路径，仅给后端设置 `-base-path /xxx` 或 `BASE_PATH=/xxx` 不能保证 Lynx 可用。embedded 下 API base 取 worker realm 的 `self.location.origin`；standalone 与 embedded 由 `deployMode` global prop 区分（`copy-bundle-web.mjs --embedded` 剥掉该属性）。部署请先使用域名根路径。

> ⚠️ worker realm **也**拿得到 `self.location`，所以「探测 location 是否存在」不能用来判断 standalone 还是 embedded —— 这正是 `deployMode` global prop 存在的理由。

## 歌单 JSON 导入与导出

在「设置 → 数据管理」选择之前导出的 Songloft 版本 1 JSON 备份，或导出服务器的全部歌单。Web 宿主按 `pickTextFile/saveTextFile/cancelTextFile` 三个真实方法开放入口；旧宿主未实现这些方法时隐藏入口，并在数据页说明原因。

文件选择与 Blob 下载在主线程执行，业务 Worker 只接收文件文本；读取的导入文件上限为 20 MiB。若跨线程调用或网络等待丢失浏览器临时用户激活，主线程显示可点击的文件选择/下载控件与取消按钮，继续点击即可。下载后撤销临时 object URL，取消或离开数据页会移除文件控件；取消不上传文件。空文件、无效 JSON 和非版本 1 备份在客户端报错。

Web 接口请求走共享认证客户端：导入为 `/playlists/import` 的 multipart `file`，导出为 `/playlists/export` 的认证 GET，token 只进入 Authorization 请求头。401 复用已有刷新与原请求重试，刷新失效回登录；HTTP 错误结束 busy 状态。传输期间禁用两个按钮，成功导入失效 `['playlist']` 与 `['library']` 查询，包括详情、歌曲列表和首页统计。原生客户端继续使用已有文件上传/浏览器导出流程。

已在 Docker Chrome 153 的真实 Worker 页面验证 standalone 跨源 CORS 和 embedded 根路径同源：实际文件选择、新歌单/歌曲入库、中文/emoji JSON 下载、空/坏文件拒绝、取消、401 刷新重试和服务器失败恢复。用户激活过期路径通过延迟真实宿主调用后点击主线程控件验证。Firefox/Safari 未在当前环境运行；子路径部署仍保留上节的限制。

参考：[文件输入](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)、[用户激活与选择器](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/showPicker)、[Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob)、[撤销 object URL](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)。

## Web 平台的已知限制

部署前该知道用户会遇到什么：

| 限制                                     | 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **无 secure enclave**                    | `SongloftStorage` 的 `secure` 命名空间在 Web 上只是命名空间，安全性等同任何同源脚本                                                                                                                                                                                                                                                                                                                                                                        |
| **会话持久化走 IndexedDB**               | worker realm 没有浏览器真正的 `localStorage`（那是 window-only；web-core 注入到背景 realm 的同名 scope 绑定不是页面持久化的那个），存储探测顺序是 native → **IndexedDB** → localStorage → 内存，且 IndexedDB 必须赢过 localStorage                                                                                                                                                                                                                         |
| **无 longpress**                         | web-core 不合成该手势，任何「长按打开菜单」的功能必须另有按钮入口                                                                                                                                                                                                                                                                                                                                                                                          |
| ~~占位符颜色恒为库自带 grey~~            | **已修（2026-08-26）**：`-x-placeholder-color` 在 Web 上是空转声明、web-elements 走 `::part(input)::placeholder` 且 part 上有显式默认 —— 这三者接不起来，所以改为 patch web-core 产物的默认值（`grey` → `var(--content-muted,grey)`，`scripts/patch-web-core-client.mjs`），CDP 实测随主题切换（light `#7b7b88` / dark `#8b8b98`）。**同类问题（web-elements 部件样式改不动）先想 part 显式默认 + shadow root 穿透，修法走 patch 脚本**，见 AGENTS.md §3.2 |
| **歌单文件选择的用户激活** | JSON 导入/导出已提供主线程可点击控件，应对 Worker 调用丢失激活；Chrome 已验证，Firefox/Safari 待验。其他旧 `pickAndUploadFile` 调用仍沿用原桥接。 |
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

## 相关

- [构建与运行](./build-and-run.md) —— 全部平台的构建命令
- [调试](./debugging.md) —— 无头浏览器实测方法
- [平台差异](../architecture/platform-differences.md) —— 四端能力矩阵
