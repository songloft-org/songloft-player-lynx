# Web 端插件 tab 切换导致浏览器崩溃（error code 11）

> **已闭合**（2026-09-08）。切 tab 不再销毁插件 frame，改为保活隐藏；修复方向经真实 Chrome 实验验证。
>
> 本文路径相对 `clients/player-lynx/`（本子模块根），跨仓库引用写明 `clients/player/`（Flutter 客户端）。
>
> 一句话：**我们在切 tab 时 detach 插件 iframe，撞上 Chrome 在「往正在拆掉的 frame 里注入扩展内容脚本」路径上的空指针**。三个条件缺一不崩，所以它长期只在特定机器上出现。

---

## 1. 症状

| 项 | 值 |
|---|---|
| 平台 | macOS 26.6.2 (25G83) + Chrome 152.0.7977.77 |
| 错误码 | 11（SIGSEGV，Chrome "Aw, Snap!"） |
| 崩溃进程 | 渲染进程（crashpad 注解 `ptype=renderer`） |
| 异常 | `EXC_BAD_ACCESS` / `KERN_INVALID_ADDRESS`，`fault_addr` **恒为 `0xf8`** |
| 触发操作 | 打开插件 tab → 切到其他 tab，**第一次切走就崩** |
| 部署形态 | standalone（app 在 `:3010`，插件内容在后端 `:58091`，iframe 跨域跨进程） |
| DevTools | 打开且停靠（docked） |

7 个 crash dump（6 个用户报障 + 1 个会话期间新产生）的 `fault_addr` **完全一致**，是确定性空指针解引用（`this == nullptr` 后读 `+0xf8` 处成员），不是随机内存损坏。

---

## 2. 根因：三个必要条件

崩溃需要三者同时成立，缺任何一个都不发生：

| # | 条件 | 归属 |
|---|---|---|
| ① | **插件 frame 被 detach** —— 切 tab 时 `PluginWebViewPage` 卸载 → `webview.close()` → `webview-host.js` 的 `destroyIframe()` → `remove()` | **我们的代码**（已修） |
| ② | 一个内容脚本注入**所有 frame** 的扩展 —— KISS Translator（`matches: <all_urls>`、`all_frames: true`、`match_about_blank: true`） | 用户浏览器 |
| ③ | **真正打开的 DevTools**（停靠、Elements 面板） | 用户操作 |

Chrome 在 frame detach 与扩展脚本注入交汇处踩空。我们无法修 Chrome，只能不去踩 —— 即**永不 detach**。

### 实验矩阵（真实 Chrome，standalone，自动化脚本驱动）

| 配置 | 崩溃 |
|---|---|
| ① + ② + ③ 全齐 | **15 / 15** |
| 去掉 ②（无扩展 / 只装 React DevTools / 只装 Vimium C） | 0 / 6 |
| 去掉 ③（不开 DevTools；含只启用 CDP `Accessibility` 域、以及把视口钉到与崩溃时相同的 1200×979 两组对照） | 0 / 8 |
| 去掉 ①（扩展与 DevTools 都在，但只切不带插件的 tab；以及在网络层把 `close()` 改成只隐藏） | 0 / 5 |

第三行的两组对照是用来排除混淆项的：**视口高度**和**无障碍模式**都不是原因，必须是 DevTools 前端本身。

---

## 3. 取证方法（可复用）

1. **崩溃 dump**。macOS 上 Chrome 自己的 minidump 在
   `~/Library/Application Support/Google/Chrome/Crashpad/completed/*.dmp`（不在
   `~/Library/Logs/DiagnosticReports/`，那里只有系统级 `.ips`）。用 Python 解
   minidump 头即可拿到异常码与故障地址，无需符号：`MDRawHeader` → stream 目录 →
   `MD_EXCEPTION_STREAM`（type 6）读 `exception_code` / `exception_flags` /
   `exception_address`。

2. **谁在场**。dump 里 crashpad 注解含 `extension-1/2/3`，`strings` 抓 32 位
   `[a-p]` 扩展 ID，再拿 ID 去
   `~/Library/Application Support/Google/Chrome/Default/Extensions/<id>/*/manifest.json`
   对名字。本例解出 KISS Translator、React Developer Tools、Vimium C —— 二分后凶手是第一个。

3. **侧载扩展做二分**。两个坑：
   - Chrome 137+ **忽略 `--load-extension`**，要用 CDP `Extensions.loadUnpacked`；
   - 商店安装目录带 `_metadata/`，unpacked 加载会因保留的 `_` 前缀目录失败 ——
     必须先复制出来删掉它。

   两个坑都会**静默**：扩展没装上，测试照样"通过"。所以
   `scripts/cdp-plugin-tab-crash.mjs` 会先验证扩展真的注入了，否则拒绝报告通过。

4. **验证修复方向而不落盘**。用 CDP `Fetch` 域拦截 `webview-host.js` 的响应体、
   改写后 `fulfillRequest`，就能在不改仓库任何文件的前提下对比几种改法。

---

## 4. 两个被证伪的假设

- **「DevTools 打开启用的无障碍模式（AXMode）是放大器」** —— 方向错。仅通过 CDP
  `Accessibility.enable` + 持续 `getFullAXTree` 复现不出来（0/3），必须是 DevTools
  前端。交接时把这条记成结论是过早的。
- **「`destroyIframe()` 里 `el.src = 'about:blank'` 制造了注入竞态窗口」** —— 机制看
  似吻合（`match_about_blank` 让扩展也注入 `about:blank`），但只去掉这一行仍然
  **3/3 崩**。触发点是 **detach 本身**，不是那次导航。

另外，Flutter 客户端 2026-06 的两个**无障碍**提交（`b5e646b` 语义节点抢点击、
`f54e77c` iOS Safari 软键盘）与本崩溃无关，别混为一谈；同源同修法的是
`clients/player` 的 `32d8924`（**fix(web): keep plugin tabs alive to prevent browser
crash on tab switch**，Offstage 保活）。

---

## 5. 修复

核心规则：**主线程永不 detach 插件 frame**。

### iframe 路径（`renderEngine` 为 `webview` / `webf` / 空，Web 端绝大多数插件）

`web/webview-host.js` 从「一个 module 级 `iframe` 变量」改为**按插件一个 frame**：

- `open(url, selector, key)` —— 复用 `key` 对应的 frame；URL 未变就不重新导航（插件
  文档与状态因此存活），变了才导航。
- `hide(key)` —— 只置 `visibility: hidden`，**元素留在 DOM 里**。这是切 tab 走的路径。
- `close(key)` —— 真释放：导航到 `about:blank` 杀掉插件文档，**空壳元素仍不摘除**。
  无 key 时释放全部（登出）。

**key 是插件的 `entryPath`，不是 URL** —— URL 带 `?theme=` 和 `?access_token=`，按 URL
做键会每次换主题、每次重新登录都多留一个活的插件文档。

### lynx 路径（`renderEngine: "lynx"`）

`web/lynx-frame-host.js` 同样改为按插件保活、隐藏用 `display: none`。但这里没有
`about:blank` 那种退路：web-core 的 `#render()` 在 `url` 为假值时直接返回，**清空 url
并不会 dispose**，所以 detach 是释放 `<lynx-view>` 的唯一手段。于是 `close` 仍然
detach，也正因如此必须修交接文档里提到的第二个 bug：

`disconnectedCallback` → `#disposeInstance()` 是**异步**的（要 await 实例的
`Symbol.asyncDispose` 才拆掉 worker 与 iframe realm），而 `#disposePromise` 是私有字段。
旧代码 `removeChild` 后**立刻** `createElement('lynx-view')`，让新 worker/WASM/realm
叠在正在下沉的旧实例上。可观测的 dispose 完成信号是 **web-core 会清空该元素的
shadow root**（`LynxView.js` 的 `shadowRoot.innerHTML = ''`），`awaitDisposed()` 就等这
个，带 2 秒上限降级。

> 同一元素内改 `url` 是安全的：web-core 自己在 `#render` 里 `if (this.#instance ||
> this.#disposePromise) await this.#disposeInstance()`。

### 真正的释放时机

保活之后唯一的义务是：插件真的消失时它必须停下来。落在
`src/features/jsplugin/domain/plugin-frame-release.ts`，调用点四处：

| 时机 | 位置 |
|---|---|
| 禁用插件 | `PluginManagerPage` `onToggle` 的 `onSuccess`（仅禁用方向） |
| 卸载插件 | `onConfirmDelete` 的 `onSuccess` |
| 强制更新（重装换了文件） | `onConfirmForceUpdate` 的 `onSuccess` |
| 登出 | `SettingsPage` `confirmLogout`（释放全部） |

> **别和后端的 `/settings/plugin-keep-alive` 混用。** 那个白名单管的是插件**服务端 JS
> 服务不因空闲被休眠**（`internal/jsplugin/health.go` 的 `checkIdle`），是用户可配的性能
> 选项；本文的前端 frame 保活不可配，存在的目的是避开浏览器崩溃。
> `PluginManagerPage` 里原来把它注释成「pin 住 webview」，已订正。

---

## 6. 顺带修掉的既存 bug：lynx 三个文件从未进入部署产物

`web/index.html` 有 `<script src="/lynx-frame-host.js">`，但
`scripts/copy-bundle-web.mjs` 的 `HOST_SCRIPTS` 清单里**没有**它，也没有
`songloft-lynx-frame-module.js` 与 `songloft-lynx-bridge-module.js`。也就是说
**`renderEngine: "lynx"` 的插件在 standalone 可部署产物里从来没工作过**：script 标签
404 → `SongloftLynxFrame` 从未注册 → facade 报 unavailable。

本该拦住它的闸门（`src/__tests__/web-host-page.test.ts`）把宿主脚本列表硬编码成
`['web/audio-host.js', 'web/webview-host.js']`，于是 lynx 那条从未被检查。现在该列表
**从 `index.html` 推导**，并新增「index.html 引用的每个根级脚本都必须在部署清单里」的断言。

---

## 6.5 自审阶段顺带修掉的另外两处

- **`LynxPluginFrame` 在 Web 上从未推送过播放状态**。它把订阅 gate 在 `loaded`，而
  `loaded` 只由原生 `<frame>` 的 `bindload` 置位 —— Web 分支渲染的是占位 `<view>`，
  没有那个事件，所以订阅**从来没装上**。而推送通道只送**变化量**，于是子 frame 对播放
  一无所知。修法：初始快照随 `globalProps` 送达（宿主在 `url` 之前设置，且每次 `open`
  都合并新快照 —— 再进入正好走这条），增量继续走 `sendEvent`；`loaded` / `onLoad` /
  原生 `bindload` 随之成为死代码一并删除。原生推送路径日后接通时应沿用同一形状
  （快照进 props、增量走桥），而不是复活这道门。
- **`lynx-frame-host.js` 的 `childFrameId` 是只写不读的死状态**。`registerChild` 把
  frameId 存进一个没人读的模块变量；子 frame 的身份本来就随每次 `hostCall` 的 payload
  一起送达，所以没有要留的东西，连带 `registerChild` 分支一起删掉。

## 7. 闸门

| 闸门 | 覆盖 | 怎么跑 |
|---|---|---|
| `src/__tests__/web-plugin-frame-keepalive.test.ts` | 两个宿主脚本的保活状态机（**真的执行脚本**，用手写最小 DOM 替身数 `appendChild`/`removeChild`，所以「永不 detach」是直接断言而非文本 grep） | `pnpm test` |
| `src/__tests__/native-module-contract.test.ts` | 页面卸载只能调 `hide` 不能调 `close`；宿主脚本里不得出现 `remove()`/`removeChild(`；模块方法两侧齐备 | `pnpm test` |
| `src/__tests__/web-host-page.test.ts` | index.html 引用的宿主脚本都在部署清单里 | `pnpm test` |
| `scripts/cdp-plugin-tab-crash.mjs` | **真实 Chrome** 端到端：自带浏览器、DevTools 停靠、CDP 侧载放大器扩展、来回切 tab | 见脚本头 |

浏览器脚本进不了 CI（需要特定扩展 + DevTools 前端），所以单测是 CI 侧的替代；两者是互补而非重复。

**跑浏览器闸门时务必带扩展。** 不带就等于三个必要条件缺一，无论有没有 bug 都会"通过" ——
脚本因此会自检注入情况并在缺失时以退出码 2 结束（不可读作通过）。

---

## 8. 验证结果

| 项 | 结果 |
|---|---|
| `pnpm exec tsc -b --force` | 通过 |
| `pnpm test` | 2363 项 / 220 文件 全绿 |
| 反向验证（单测闸门） | 8 处变异全咬（卸载改回 `close`、宿主重新 `remove()`、接口删 `hide`、lynx 卸载改回 `close`、lynx hide 改成 detach、`open` 不等 dispose、去掉 active-key 守卫、iframe 不复用） |
| `pnpm run build:web` | 通过；`web/dist` 五个宿主文件与 `web/` 源逐字节一致 |
| 真实 Chrome（KISS + DevTools docked + AX，修复前 15/15 崩） | 单次切换 0/4；7 插件轮转 30 次 0 崩；落地脚本 24 次 0 崩 |
| 浏览器闸门反向验证 | 把 `hideFrame` 改回 detach → 脚本第 1 次切换即报崩溃并退出 1 |
| 保活是否有界 | shadow root 内 frame 数 1 → 8（1 个 web-core realm + 7 个插件）后**停止增长**，每插件一个、复用 |

---

## 9. 未验证与剩余风险

- **lynx 引擎插件没有真实浏览器验证**：本机 7 个插件全是 iframe 路径
  （`webf` ×2、`webview` ×1、空 ×4），没有任何 `renderEngine: "lynx"` 的插件。
  `demo-frame-plugin/` 已能构建出 `main.web.bundle` + `main.lynx.bundle`，但要真跑得把它
  打成 `.jsplugin.zip` 装进后端并配成 tab —— 会改动运行中实例的状态，未做。lynx 路径目前
  由第 7 节的单测覆盖（含 `awaitDisposed` 的时序断言），**web-core 真实 dispose 时序未实测**。
- **只证实了 KISS Translator 一个放大器**。任何 `all_frames: true` 的扩展都可能触发；未穷举。
- `LynxPluginFrame` 的播放状态推送（§6.5 第一条）**只有单测覆盖**，与 lynx 路径的其余部分
  一样缺真实浏览器验证。
- **保活的内存代价**：访问过的插件文档一直活着（定时器、连接照跑）。这是刻意选择 ——
  淘汰式回收意味着 detach，而 detach 就是崩溃本身。释放只发生在第 5 节那四个时机。
- **Chrome 侧未提 issue**。没有符号化栈（只有 `模块+偏移`），符号需从 Google 符号服务器
  下载约 GB 级数据，未做。故意**不**记进 `docs/project/plans/upstream-issues.md` ——
  那份清单的语义是「已提交给 Lynx 官方且有对应本地 patch」，Chrome 的 bug 两条都不符合。

### 会话期间发现、不在本次 scope 的后端问题

用 curl 直接复现，与前端无关，仅记录：

1. `GET /api/v1/songs/{id}/cover` 会发出**与 `Content-Length` 不符的响应体**（实测 song 7
   声明 4412927 字节、实际 3341168），浏览器侧表现为 `ERR_CONTENT_LENGTH_MISMATCH`。
2. 同一接口的 `?w=96` **未生效**：返回的是 4 MB 原图，`data/cover_thumbs/` 始终为空。
