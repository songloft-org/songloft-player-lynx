# Web 端插件 tab 切换导致浏览器崩溃（error code 11）

> **交接文档** — 上一段会话在 Linux 开发机上完成了只读调查，没有改任何代码。接手会话在 macOS 上继续，任务是**取证 → 确认根因 → 实施 keep-alive 修复**。
>
> 本文所有路径相对 `clients/player-lynx/`（本子模块根），跨仓库引用会写明 `clients/player/`（Flutter 客户端）。
>
> **一句话现状**：Web 端打开插件页后切到其他 tab，Chrome 渲染进程崩溃（error code 11 = SIGSEGV）；**只在 DevTools 打开时复现**。已定位到我们侧的触发源（插件视图切 tab 即销毁/重建，无 keep-alive），Chrome 的无障碍模式是放大器（待取证证实）。Flutter 客户端在 2026-06 修过同码同路径的崩溃，修法是 keep-alive，可直接对齐。

---

## 1. 症状与复现条件

用户报障原文：Mac + Chrome，打开开发者工具后，在插件 tab 和其他 tab 之间切换就崩溃；不打开开发者工具时看起来不崩。

| 项 | 值 |
|---|---|
| 平台 | macOS + Chrome（版本待补） |
| 错误码 | 11（SIGSEGV，Chrome "Aw, Snap!" 页面） |
| 触发操作 | 打开插件页 → 切换到其他 tab（"经常"，未确认是否首次就崩） |
| 关键条件 | **DevTools 打开**；关闭 DevTools 疑似不崩 |
| 部署形态 | 待确认（standalone 跨域 / embedded 同源，影响 iframe 是否跨进程） |

**尚缺的信息**（决定修哪条代码路径，务必先问用户或自己查 `plugins/`）：

1. 崩溃那个插件的 `renderEngine` 是 `webview` 还是 `lynx`？两条路径的宿主实现完全不同（见 §3）。
2. 一次切换就崩，还是来回切几次才崩？
3. 只有配成 tab 的插件会崩，还是从插件网格进去再返回也会？
4. Chrome 版本号，以及部署是 standalone 还是 embedded。

---

## 2. 已确认的事实（代码已核，非推断）

### 2.1 Flutter 客户端修过同一个崩溃，根因不是无障碍

`clients/player` 提交 `32d8924` **fix(web): keep plugin tabs alive to prevent browser crash on tab switch**：

> 插件 tab 切换时 CanvasKit 的 platform view 反复销毁/重建 iframe 触发渲染器段错误（error code 11）。改为通过 Offstage 保持插件 tab 存活，避免 HtmlElementView 的销毁/重建周期。

同错误码、同触发路径（插件页 → 切 tab）、同修法方向。实现落在 `lib/shared/layouts/shell_layout.dart`（`_visitedPluginTabs` + `Stack`/`Offstage` 保活）和 `lib/features/home/presentation/plugin_tab_page_stub.dart`（viewType 去掉 `hashCode`、改静态注册表，让同一插件复用同一 platform view）。

Flutter 侧另有两个**无障碍**提交，修的都不是崩溃，别混淆：

- `b5e646b` — 进插件 iframe 页临时关语义树，修的是**语义节点抢走点击**（songloft#295）
- `f54e77c` — 移动端不再常驻语义树，修的是 **iOS Safari 输入框不弹软键盘**（#26）

用户最初的印象「之前 flutter 版修过无障碍导致的崩溃」是把这两件事记成了一件。

### 2.2 Lynx web 侧没有 Flutter 那套语义树，也没有对应开关可关

Flutter Web 是 CanvasKit canvas 渲染，可交互元素只能靠 `flt-semantics` 叠层暴露，所以才会有"语义树盖在插件 iframe 上"这类问题，也才有 `WebSemanticsController` 那种 suspend/resume 开关。

Lynx web-core 渲染真实 DOM，无障碍完全由浏览器原生承担：`src/` 下没有任何语义树 / accessibility API 调用；唯一带 a11y 名字的提交 `4868733` 只是 `--font-scale` 字号缩放。**结论：我们没有"临时关无障碍"这条可走的规避路径，只能修销毁/重建。**

### 2.3 Lynx web 当前的行为与 Flutter 修复前同构：切 tab 即销毁插件视图

- 插件 tab 与插件页共用同一路由 `/plugin/$entryPath`（`src/router.tsx:316`），靠 `?tab=true` 区分 chromeless 与带 topbar。切 tab 直接 unmount 组件，**全链路没有任何 keep-alive**。
- **webview 引擎路径**：`src/features/jsplugin/pages/PluginWebViewPage.tsx:423` 的 cleanup 调 `webview.close()`（:428）→ `web/webview-host.js:258` → `destroyIframe()`（:184，`src='about:blank'` + `remove()`）。返回插件页时 `ensureIframe()`（:131）重新 `createElement('iframe')`。每次进出都是一次真实的 iframe 创建/销毁，且该 iframe 带 `credentialless`、挂在父 `<lynx-view>` 的 shadow root 内（`contain: strict`）。
- **lynx 引擎路径**：`src/features/jsplugin/widgets/LynxPluginFrame.tsx:96` 的 cleanup 调 `mod.close()`（:98）→ `web/lynx-frame-host.js:197` → `destroyChild()`（:81），只做 `removeChild`。而 web-core 的 `LynxViewElement.disconnectedCallback` → `#disposeInstance()` 是**异步**的（`node_modules/@lynx-js/web-core/dist/client/mainthread/LynxView.js:402`，要 await 实例 `Symbol.asyncDispose` 才拆掉 worker 与 iframe realm）。`open`（`web/lynx-frame-host.js:119`）里 `destroyChild()` 之后**立刻**同步 `createElement('lynx-view')`，不等旧实例拆完 —— 反复开关会让 worker + WASM + iframe realm 叠着起落。

---

## 3. 当前结论与置信度

| 层 | 判断 | 置信度 |
|---|---|---|
| 触发源 | 插件视图切 tab 即销毁/重建（§2.3），跨进程 iframe 或嵌套 lynx-view 实例反复起落 | **已证实是代码行为**；是否为崩溃直接诱因 = 高置信推断（Flutter 侧同码同路径已证） |
| 放大器 | DevTools 打开使 Chrome 为该页启用渲染进程无障碍模式（AXMode），AX 树在跨进程节点销毁瞬间踩空 → SIGSEGV | **推断，待 §4 取证** |
| 责任方 | 崩溃发生在 Chrome 内部，我们无法修；只能不去踩（keep-alive） | 高置信推断 |
| 用户影响面 | 不开 DevTools 的普通用户疑似不受影响 | **用户口述"好像"，未确认** |

用户的直觉「是不是无障碍导致的」方向对，但主体不是我们的代码 —— 是浏览器因 DevTools 而启用的无障碍模式放大了我们的销毁/重建。

---

## 4. 接手第一步：取证（macOS，只读）

### 4.1 抓崩溃栈 —— 把"AX 放大器"从推断变成事实

```bash
ls -lt ~/Library/Logs/DiagnosticReports/ | grep -i chrome | head -5
```

```bash
f=$(ls -t ~/Library/Logs/DiagnosticReports/*Chrome*Helper*Renderer*.ips 2>/dev/null | head -1)
echo "$f"
grep -oiE '"[A-Za-z:_]*(Accessib|AXObject|AXTree|AXNode|RemoteFrame|WebLocalFrame)[A-Za-z:_]*"' "$f" | sort -u | head -30
```

栈里出现 `BrowserAccessibilityManager` / `AXObjectCache` / `ui::AXTree` / `AXNode` 之类 → 放大器成立。拿到具体函数名后可去 crbug 搜是否已有上游 issue，若有则记进 `docs/project/plans/upstream-issues.md`。

`.ips` 是 JSON，必要时 `python3 -m json.tool` 展开看 `frames`。

### 4.2 判别实验 —— 30 秒确认 AX 是否必要条件

完全退出 Chrome，然后：

```bash
open -na "Google Chrome" --args --disable-renderer-accessibility
```

在这个实例里打开 DevTools，照原方式来回切插件 tab。**不崩 → 放大器确证**；**仍崩 → 放大器假设推翻**，回到纯 iframe/lynx-view 销毁问题，改用 §4.3 定位。

### 4.3 备用：直接观察销毁/重建

`chrome://crashes` 看崩溃记录（只有 ID，不足以定位，别依赖它）。更有用的是切 tab 时在 DevTools Console 里盯 `webview-host.js` / `lynx-frame-host.js` 的生命周期，以及 Chrome 任务管理器里的渲染进程/worker 数量是否随来回切换单调上涨（后者能独立证明 lynx 引擎路径的实例泄漏）。

仓库里可用的 CDP 工具：`scripts/cdp-shot.mjs`、`scripts/test-server.mjs`、`scripts/lib-driver.mjs`（用法见 `HARNESS.md` 与 `docs/guides/build-and-run.md`）。

---

## 5. 修复方向（未与用户确认实施细节，属阶段二待办）

核心：**插件视图 keep-alive，切 tab 只隐藏不销毁**，对齐 Flutter `32d8924`。

难点在于 lynx 侧的生命周期归属和 Flutter 不同：iframe / 子 `<lynx-view>` 由**主线程 host 脚本**持有（`web/webview-host.js`、`web/lynx-frame-host.js`），而触发销毁的是**worker 里页面组件的 unmount**。所以：

1. 保活决策不能留在 `PluginWebViewPage` 内部（组件一 unmount 就会走 cleanup），要么上移到 shell 层，要么在 host 脚本侧引入 hide/show 语义（新增 `hide()`/`show()`，`close()` 只在插件被移除/禁用时才调）。**推荐后者**：改动面小，且天然覆盖两条引擎路径。
2. `web/lynx-frame-host.js` 的 `destroyChild()` 无论如何都要补上等待 web-core 异步 dispose 完成再建新实例（现在是 `removeChild` 后立刻 `createElement`）。这条独立成立，与 keep-alive 无关。
3. 需要一并想清楚的边界：插件被禁用/卸载时必须真的释放；主题与播放状态推送在隐藏期间是否继续（Flutter 侧继续推）；隐藏时 iframe 的 `visibility`/位置处理不能让它盖住其他页面（`placeFromElement` 目前用 `visibility: visible` 作为首次落位标记，改造时别破坏这个不变量）。
4. 后端已有的 `/settings/plugin-keep-alive` 白名单（`src/features/jsplugin/api/jsplugin-api.ts:153`）是**插件运行时保活**，与本文的前端视图保活是两件事，别混用。

---

## 6. 验证边界

- **必须**：DevTools 打开，来回切插件 tab 与其他 tab ≥ 20 次不崩（这是原始报障条件，不满足就没修好）。
- **必须**：`pnpm exec tsc -b` + `pnpm test` 全绿；改了 `web/` 下 host 脚本还要 `pnpm run build:web` 并在真实浏览器打开验证（`HARNESS.md`：JS 构建不能替代浏览器验证）。
- **必须**：两条引擎路径都过 —— webview 插件和 lynx 插件（`demo-frame-plugin/` 是现成的 lynx 引擎演示工程）。
- **回归重点**：插件页返回后主题切换、播放状态推送、host-call 往返仍正常；插件禁用/卸载后视图真的释放；nav 胶囊与 mini-player 不被插件视图盖住（这是 `web/webview-host.js` 注释里记的历史 bug）。

---

## 7. 铁律提醒

- 动手前先 `git status --short`，保留工作树里已有改动（交接时父仓库 `clients/player-lynx` 指针为已修改状态）。
- `dist/`、`web/dist/`、`node_modules/`、`songloft-player/` 是禁改区（`HARNESS.md` §禁改区域）。
- `web/` 属高风险目录，必须实际浏览器验证，不能只靠单测。
- 本仓库是子模块。提交引用父仓库 issue 时写全 `songloft-org/songloft#NNN`。
- 提交、推送、Issue 操作各自需要用户单独确认（`.agents/skills/dev-flow/SKILL.md`）。
