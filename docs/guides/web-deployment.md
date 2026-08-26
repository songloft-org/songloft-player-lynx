# Web 部署

两种产物：**standalone**（独立部署，用户填后端地址）与 **embedded**（嵌进 Go 后端二进制，同源）。

```bash
pnpm run build:web            # standalone
pnpm run build:web-embedded   # embedded → songloft-player-build/web-embedded
```

两者的差别不只是产物路径 —— `deployMode` 决定要不要显示「API 地址」配置 UI，embedded 模式下后端地址由 `self.location.origin` 自动检测。

## 部署前必做

**用浏览器真的打开产物。** `pnpm run web:dev` 能跑证明不了 `build:web` 能跑 —— 两者取的静态资源目录不同，这一条吃过两次亏（`web:dev` 读 dev-middleware 的 IIFE 入口，产物用的是 `client_prod` 的 ESM 入口）。

现有 vitest 闸门锁住了两件事：`index.html` 的每个本地引用都存在、入口以 `type="module"` 加载。但闸门只证明它读过的东西 —— 它不会替你确认页面真的渲染出来了。

## 子路径部署

后端启动时给 `-base-path /xxx` 或 `BASE_PATH=/xxx`。前端在 embedded 模式下从 `Uri.base.path` 自动检测子路径，无需额外构建参数。

## Web 平台的已知限制

部署前该知道用户会遇到什么：

| 限制 | 说明 |
|---|---|
| **无 secure enclave** | `SongloftStorage` 的 `secure` 命名空间在 Web 上只是命名空间，安全性等同任何同源脚本 |
| **会话持久化走 IndexedDB** | worker realm 没有 `localStorage`（那是 window-only），存储探测顺序是 native → localStorage → **IndexedDB** → 内存 |
| **无 longpress** | web-core 不合成该手势，任何「长按打开菜单」的功能必须另有按钮入口 |
| ~~占位符颜色恒为库自带 grey~~ | **已修（2026-08-26）**：`-x-placeholder-color` 在 Web 上是空转声明、web-elements 走 `::part(input)::placeholder` 且 part 上有显式默认 —— 这三者接不起来，所以改为 patch web-core 产物的默认值（`grey` → `var(--content-muted,grey)`，`scripts/patch-web-core-client.mjs`），CDP 实测随主题切换（light `#7b7b88` / dark `#8b8b98`）。**同类问题（web-elements 部件样式改不动）先想 part 显式默认 + shadow root 穿透，修法走 patch 脚本**，见 AGENTS.md §4 |
| **文件选择器可能不弹** | `pickAndUploadFile` 的调用从 worker 经桥过来，user activation 可能已丢。无头环境不可观测，需真浏览器确认 |
| **无「清空浏览器缓存」入口（刻意不做）** | Flutter 版有（清 Cache Storage + 注销 SW + 强刷 HTTP 缓存，解决 PWA 更新后旧资源问题）。本仓库 Web 端不注册 Service Worker、不用 Cache Storage，standalone（`serve.mjs`）与 embedded（后端 embed.go）的响应一律 `Cache-Control: no-cache` + ETag 304 —— 更新后普通刷新即最新，无需用户手动清 |
| **部分 Lynx 元素无实现** | `<refresh>` / `<webview>` 等未映射标签走恒等回落，成为 `HTMLUnknownElement`——属性开关完全无效。写跨平台页面前先查 web-core 的 `LYNX_TAG_TO_HTML_TAG_MAP` |

完整清单见 [AGENTS.md §4「Web 平台」](../../AGENTS.md)。

## 宿主模块（Web 特有）

主线程 API（`new Audio()` / `AudioContext` / `navigator.mediaSession` / `window.open` / `document.createElement`）在 worker realm 全部抛 `ReferenceError`。Web 上需要它们，只能经 web-core 的 `nativeModulesMap` 在主线程注册宿主模块，让 worker 侧通过 `NativeModules.X` 拿到 —— 这也顺带复用了已有的 native 分支。

现有宿主模块在 `web/`：`audio-host.js`、`songloft-platform-module.js`、`songloft-audio-module.js`、`songloft-webview-module.js`、`webview-host.js`。

> ⚠️ **`nativeModulesMap` 的 value 必须是 ESM URL 字符串**，不能是普通对象。web-core 对每个 value 做 `import(url)`，对象会被强转成 `"[object Object]"`、import 拒绝、`Promise.all` 跟着拒绝 —— 结果是 **worker 里一个自定义模块都没有**，而这会同时静默杀死文件选择器、剪贴板、以及音频（facade 探不到 `SongloftAudio` 就回落静音 mock）。`web-host-page.test.ts` 现在锁住了「每个 value 都是 URL、文件存在、被 copy 脚本拷贝、有 default-export 工厂」四条。
>
> **`SongloftStorage` 刻意不注册**：worker 已有可用的 `idb-storage`（DB `songloft`），而宿主那份用的是另一个 DB 名，接上会把已持久化的 token 换库、刷新即掉登录。

## 插件页在 Web 上走 iframe

原生用 `<webview>`，Web 用 iframe —— 且 **iframe 必须挂进 `lynxView.shadowRoot`**。lynx-view 带 `contain: strict`，是个 stacking context；body 级的 iframe 会盖住所有覆盖层，只能靠隐藏来对抗。z-index 固定 50，由契约闸门锁住挂载点。

## 相关

- [构建与运行](./build-and-run.md) —— 全部平台的构建命令
- [调试](./debugging.md) —— 无头浏览器实测方法
- [平台差异](../architecture/platform-differences.md) —— 三平台能力矩阵
