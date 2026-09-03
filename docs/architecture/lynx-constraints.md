# Lynx 运行时约束：机制与来历

**这篇讲「为什么」。** 具体该怎么写、不许怎么写的铁律在 [AGENTS.md §4](../../AGENTS.md)，那是行动清单；本文解释背后的机制，这样遇到一个没被列进铁律的新情况时，你能自己推出答案。

---

## 一、双线程与 realm 隔离

Lynx 把一个页面跑在**两个 JS realm** 里：

| realm | 别名 | 跑什么 | 有什么全局 |
|---|---|---|---|
| 主线程 | Lepus / MTS | 渲染、`main-thread:` 脚本、`__globalProps` | `lynx`、`SystemInfo` |
| 背景线程 | BTS | **业务代码**（组件、store、effect） | `SystemInfo`、`NativeModules`（部分） |

这不是优化细节，而是**很多"不可能的 bug"的根源**：状态在一个 realm 里正确，另一个 realm 里读不到，而两边都不报错。

### 实测出来的三条事实

1. **BTS realm 里没有 `lynx`。** `typeof lynx === 'undefined'`，所以 `lynx.__globalProps` 在业务代码里读不到 —— 它是主线程 Lepus realm 的全局。iOS 的三个外观 e2e 用例就是这么"失败"的：测试从 BTS eval 读 `lynx.__globalProps.theme`，读到 `undefined`，而宿主功能本身完全正常。修法是经 `e2e-bridge` 暴露把手。
2. **`NativeModules` 在 eval scope 里完全不可达** —— 裸的和 `globalThis` 上都没有。所以 E2E 想驱动原生能力，只能走 `src/e2e-bridge.ts` 暴露的 `__E2E_*__`。
3. **`SystemInfo` 与 `NativeModules` 不同，两个 realm 都有。** 这是 `isWebPlatform()` 能成立的唯一原因（见下）。

### Lynx 宿主全局是裸全局

`fetch` 这类宿主注入的全局**不挂在 `globalThis` 上**，要用 `typeof fetch !== 'undefined'` 读。反过来，缺失的全局（如 `AbortController`）用 `globalThis.X = …` polyfill，注入点在 `lynx.config.ts` 的 banner。

**不要注入 `globalThis.self = globalThis`** —— 在 BTS 无效。第三方库若访问 `self`/`window`/`document`/`navigator`，正确做法是 patch 掉那处访问或加 `typeof` 守卫。这类库真机崩溃但本地测试可能不报错，引入前先查。

---

## 二、Web 平台：业务代码跑在真 Worker 里

`@lynx-js/web-core` 把背景线程实现为**真正的 Web Worker**（`new Worker(…, { name: 'lynx-bg' })`）。业务组件跑在那个 realm 里，那里：

- 没有 `document`、`localStorage`、`sessionStorage`、`HTMLAudioElement`
- **`window` 却是 `object`** —— 所以连它都不能用来判断
- `indexedDB` 原生可用（实测 put/get 往返成功）

### 于是有了这条踩过三次的坑

**`typeof <DOM 全局> !== 'undefined'` 不是平台判断 —— 它在 Web 平台上会回答「不是 Web」。**

| 判断「当前平台是不是 Web」 | 判断「当前 realm 有没有 DOM」 |
|---|---|
| `isWebPlatform()`（`src/native/web-platform.ts`）读 `SystemInfo.platform`，**两个 realm 都有** | `isWebEnvironment()` **仅**用于守卫紧随其后的那几行 DOM 调用 |

**`isWebEnvironment()` 绝不可用来选择实现分支。** 三次事故，一次比一次隐蔽：

1. 首页永久显示「下拉刷新…」—— 探 `window` + `document`，属性开关 `enable-refresh={!isWeb}` 从未生效。而**即使修对了也关不掉那行字**：Web 压根没有 `<refresh>` 实现（web-core 的 `LYNX_TAG_TO_HTML_TAG_MAP` 无此条目，web-elements 注册的是 `x-refresh-view`），两个标签作为未知元素落进 DOM，header 的文案成了普通页面内容。
2. Web 刷新掉登录 —— 探 `localStorage`，落到内存存储，token 随刷新蒸发，**唯一提示是一条 warn**。
3. **Web 完全没有声音** —— `web-audio.ts` 探 `HTMLAudioElement`，落到 mock。而 mock 拿到真实时长，**进度条照走、时间跳、自动切下一首，唯独不出声**。

第三条最值得记：失败模式与"正常"几乎无法区分。

### 推论：主线程 API 不能在业务代码里直接调

`new Audio()` / `new AudioContext()` / `navigator.mediaSession` / `window.open` / `document.createElement` 在 worker realm 全部抛 `ReferenceError`。Web 上需要它们，只能经 web-core 的 `nativeModulesMap` 在主线程注册宿主模块，让 worker 侧通过 `NativeModules.X` 拿到 —— 这也顺带复用了已有的 native 分支。

**`nativeModulesMap` 的 value 必须是 ESM URL 字符串。** web-core 对每个 value 做 `import(url)`；塞普通对象会被强转成 `"[object Object]"`、import 拒绝、`Promise.all` 跟着拒绝，结果是 **worker 里一个自定义模块都没有**。这一下同时静默杀死三件事：文件选择器、剪贴板、以及批43 那次 Web 音频修复（facade 探不到 `SongloftAudio` 就回落静音 mock —— 所以「修好了」和「没修」看起来一样）。

### `sendGlobalEvent(name, params)` 第二参必须是数组

worker 侧最终走 `listener.apply(ctx, params)`。普通对象没有 `length` ⇒ 传零个参数、listener 收到 `undefined`。Web 音频事件与深浅色事件都栽过，现已有闸门。

---

## 三、无 DOM

没有 `window` / `document`，元素是 `<view>` / `<text>` / `<image>`。几个直接后果：

- **没有 `matchMedia` / `prefers-color-scheme` / locale API** —— 系统深浅色与语言只能由宿主给，走两条互补通道：`LynxLoadMeta.setGlobalProps` 送初值（首帧就正确，不闪），`sendGlobalEvent` 送运行中的变更（globalProps 更新不会通知已在跑的页面）。
- **没有 `@media` 查询** —— 响应式靠 `useBreakpoint()` 测量。它用 `bindlayoutchange` **加**挂载时一次 `boundingClientRect` invoke：`bindlayoutchange` 是变更通知，**Web 上对导航后挂载的元素根本不触发**，只靠它会让宽度永远是初始的 0（`/player` 与设置页宽屏布局都因此死过）。
- **没有剪贴板 API** —— 自建 `SongloftPlatform.setClipboard` 三侧实现。
- **`<svg src={url}>` 远程加载在本宿主不可用**（无 `GenericResourceFetcher`），必须取文本后用 `<svg content>`。而 `<svg content>` **不在 CSS 级联内** ⇒ 图标色只能硬编码 hex，这是 `ICON_COLORS` 与 `activeAccentIconColor()` 存在的原因。

### 带连字符的 JSX 属性没有类型检查

`scroll-x`、`enable-refresh` 这类属性拼错**不报错**。所以这类约定要靠产物 grep 测试兜住（`grep` 产物时记得排除注释与字符串 —— `dist/main.lynx.bundle` 含未压缩调试段）。

---

## 四、并非所有内置元素在 Web 上都有实现

web-core 的 `LYNX_TAG_TO_HTML_TAG_MAP` 只映射 view/text/image/raw-text/scroll-view/wrapper/list/page/input/textarea/svg/frame。**未映射的标签走恒等回落**，作为 `HTMLUnknownElement` 原样落进 DOM —— 子节点当普通内容渲染、属性开关**完全无效**。

已知在 Web 上是 no-op 的属性：`enable-nested-scroll`、`scroll-into-view`（web-elements 只认命令式 `__scrollIntoView`，所以歌词自动滚动在 Web 上不工作）、`<list>` 的 px 形式 `lower-threshold`（它只认 `lower-threshold-item-count`；`scroll-view` 上的 px 形式**是**有效的）。

**写跨平台页面时用了新标签，先查那张表** —— Web 分支应该整段不渲染，而不是靠属性关掉。

### 反例：`<blur-view>` 是有实现的，而且是真 backdrop blur 的唯一路径

`backdrop-filter` **不是 Lynx CSS 属性**（`@lynx-js/css-defines` 里没有），所以整套玻璃材质是伪造的（见 `tokens.css` 的 `--glass-*`）。但**元素**这一层不一样：`<blur-view>` 是一等元素（`@lynx-js/types` 里有 `BlurViewProps`，`IntrinsicElements` 已注册），四个平台都有实现，逐一查证过——

| 平台 | 证据 | 结论 |
| --- | --- | --- |
| Web | 实现存在（web-core 注册 `x-blur-view`，往自己 shadow root 写 `:host { backdrop-filter: blur(Npx) }`），**但标签名接不上**——见下方 | ⚠️ 需宿主页别名，已修 |
| iOS | `ios/Podfile.lock` 有 `XElement/BlurView (4.0.1)`，由 `XElement/Behavior` 自注册 | ✅ |
| Android | `xelement-blur-view:4.0.0` 经 `xelement` 伞包 POM 传递依赖进来，`MainActivity.kt` 调 `addBehaviors(XElementBehaviors().create())`；反编译 aar 得标签名 `blur-view` | ✅ |
| HarmonyOS | `blur-radius` 文档标了 @Harmony，但本宿主只装了 `@lynx/xelement_svg` | ⚠️ 当作"可能解析不出"处理 |

**属性有平台分支，别当通用**：`blur-radius`（三平台）、`blur-sampling` 仅 @Android、而 `blur-effect` / `spacing` / `glass-*` / `ios-user-interface-style` **仅 @iOS**。

**Web 上这个元素恰好踩了本节开头那条回落**，值得单独记，因为它是「元素存在」与「元素可用」不等价的活样本：

- `__CreateElement` 是 `document.createElement(LYNX_TAG_TO_HTML_TAG_MAP[tagName] ?? tagName)`。`blur-view` **不在**那张表里，于是走恒等回落，DOM 里落的是字面标签 `blur-view`。
- 而 web-elements 把实现注册在 **`x-blur-view`** 这个名字下，且从不注册裸 `blur-view`（把它的注册助手调用点全列出来核过）。
- 结论：**元素和标签各自都存在，但永远碰不上面**。`blur-view` 是 `HTMLUnknownElement`，属性完全无效，**没有任何报错或告警**。
- 修法在宿主页做别名（`web/index.html`，`customElements.whenDefined('x-blur-view')` 后 `define('blur-view', class extends X {})`），因为那张表是 frozen 的模块常量。闸门在 `src/__tests__/web-host-page.test.ts`。

**这条也是一次验证方法论的教训**：本节最初写的是「Web ✅ 已实测」，因为无头探针**手工 `createElement('x-blur-view')`** 测出了 `blur(20px)`——恰好跳过了唯一要紧的那一步（标签映射）。验证一个元素能不能用，必须**用业务代码实际发出的那个标签名**去创建它。

Harmony 这一格决定了**挂载形状**：`<BackdropBlur />` 必须是 scrim 的**前置兄弟**，不能是 wrapper 也不能是 child。child 会盖在带 `bindtap={onClose}` 的 scrim 前面吞掉点击关闭，wrapper 会把整个弹层子树塞进一个某平台可能解析不出的标签里——而前置兄弟最坏只是"少了模糊"。又一次失败模式不对称。

**但这条论证只覆盖 scrim 形状**，后来补的**面板形状**不受它约束，因为前提全不成立：弹出菜单没有 scrim（没有"前置"的对象）、没有 `bindtap` 手势可吞、而 Harmony 的顾虑本来是针对 wrapper 而非 child。所以 popover / 底部导航胶囊 / mini-player 走的是**面板模式**：`<BackdropBlur className='ui-backdrop-blur--panel' />` 作为半透明面板自己的**首个子节点**，配 `z-index: -1`。

面板模式有两处必须记住的细节：

- **`z-index: -1` 不是装饰**。绝对定位子节点默认画在非定位的在流兄弟**之上**，不给负 z 就会盖住菜单行。
- **绘制顺序在两端不同，但结果相同**。Web 上负 z 的子节点在父背景**之后**绘制（模糊采样到的是 `页面 ⊕ 面板填充`），原生上父填充是图层背景、子视图永远在其上。两者靠模糊的线性性收敛到同一张画面（`blur(页面 ⊕ 均匀) === blur(页面) ⊕ 均匀`），**所以不需要平台分支**。
- **面板自己的基础规则必须是定位的**。`inset: 0` 的绝对子节点会去找最近的定位祖先，`.mini-player` 在宽屏是在流盒子，漏掉 `position: relative` 会把模糊层拉满整个内容列。闸门校的是**基础选择器那条规则**，`.shell--narrow .mini-player { position: fixed }` 这种变体不算数（这条是被变异测试打出来的）。
- **已接受的局限**：滚动容器里的绝对子节点跟着内容滚。菜单长到出现滚动时，模糊层会随之上移，底部几行退回 `--glass-fill-strong` 的平涂。要修得加一层裁剪外壳＋内层滚动器，代价是所有 `.popover-menu` 消费方都要重排版面。

**一条不会变的数学**：模糊买不到任何 alpha 余量。blur 是线性滤波，**均匀背景是它的不动点**（纯白盖层模糊后还是纯白），而本仓库所有对比度闸门的最坏情况都是从**均匀极值**推出来的。所以再好的模糊也压不低任何 alpha，它只是抹掉了 WCAG 本来就不建模的高频细节。

---

## 五、布局与事件的几处反直觉

这些不是"Lynx 的 bug"，而是它的模型与 Web 不同：

- **每个 Lynx 元素都带 `overflow: clip`**（Web 侧由 web-elements 的 `linear.css` 施加）。所以任何"内容比盒子大"的情形都是**裁掉**，不是溢出可见 —— 弹窗标题被 flex 压扁后，症状是「文字上半不见了」，看起来像被挡住。
- **虚拟列表 `<list>` 内部放不了弹出层**。`x-list` 实测带 `contain: layout`（使它成为 fixed 后代的包含块）+ `::part(content)` 是 `overflow: hidden scroll`（放在框外的元素 `checkVisibility()` 为 true 但 `elementFromPoint` 打不中 —— 是裁剪，没有样式表能解）。原生列表同样裁到自己的视口。所以行内菜单只能挂全局。
- **`position: fixed` 同轴给两个偏移会被拉伸**，而不是按内容定尺寸。弹出层因此每轴只给一个偏移。
- **`max-width` 收窄不了面板** —— CSS 在它**之后**解析 `min-width`，后者赢。
- **`<refresh>` 会吞掉内部横向手势**；横向 `scroll-view` 的内容行须 `width: max-content`，否则视觉上不滚动。
- **Web 上没有 longpress** —— web-core 不合成该手势，任何「长按打开菜单」必须另有按钮入口。

---

## 六、原生模块是 callback 式的

Lynx 原生方法**不返回 Promise**：写是 fire-and-forget，读靠 `com.lynx.react.bridge.Callback`（iOS 同构）。**Promise 化必须由 TS 适配层完成。**

`nm.X as SomePromiseInterface` 会让 `.then()` 落在 `undefined` 上 —— DLNA 页就是这么在 `useEffect` 挂载时崩掉的，且对所有 Android 用户开屏即崩。

另一面：**部分可用的模块比完全没有更糟**。`navigation.ts` 逐个检查三个方法、缺一个就整体当没有，因为缺的那半是「用户永远退不出去」；`song-cache.ts` 探测的是 `getCacheInfo` 而不是 `download`，因为后者的**参数个数变过**，旧壳会报「可用」然后被喂进它绑不了的参数。

完整调用约定见 [AGENTS.md §5](../../AGENTS.md)，模块清单见 [reference/native-modules.md](../reference/native-modules.md)。

---

## 七、贯穿全篇的一条

上面每一条的共同点：**失败是静默的**。未注册的标签不报错、未定义的 CSS 变量让整条声明被丢弃、TS facade 一律返回 resolved promise、原生模块的裸 `catch` 吞掉线程异常、mock 在缺少前置条件时照样"工作"。

所以写代码时值得反复问一句：**如果这里坏了，我会看到什么？** 如果答案是"什么都看不到"，那就得主动造一个可观测的信号 —— 这也是 [AGENTS.md §6](../../AGENTS.md) 那套闸门原则的由来。

---

## 相关

- [AGENTS.md §4–§6](../../AGENTS.md) —— 铁律清单（做什么/不做什么）
- [平台差异](./platform-differences.md) —— 三端能力与行为矩阵
- [reference/native-modules.md](../reference/native-modules.md) —— 9 个模块的契约
- [调试](../guides/debugging.md) —— 怎么拿到证据
