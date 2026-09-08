# 调试

三条路子：Android 真机 logcat、Web 无头浏览器实测、一次性探针 scenario。**选哪条取决于你要的证据在哪**，不取决于哪条方便。

## 贯穿全篇的一条原则

**先想清楚「如果它坏了，我会看到什么」。** 这个仓库大量缺陷的失败模式是**静默**的：

- `startService()` 解析不到未声明的 Service **不抛异常**（系统只打一行 `Unable to start service … not found`）
- 原生模块里常见的 `catch (_: Exception) {}` 会吞掉 `CalledFromWrongThreadException`
- TS facade 无论成败一律返回 resolved promise
- 未定义的 CSS 自定义属性会让整条声明**被静默丢弃**，元素沿用继承值
- Lynx 未注册的标签**不报错**，元素静默不渲染

所以断言要落在**进程外**或**与故障机制无关的量**上 —— 只问被怀疑的组件「你好了吗」，等于让嫌疑人自证清白。

## Android 真机

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
pnpm run android:install
adb reverse tcp:58091 tcp:58091
adb logcat -s lynx:V LynxUISVG:E AndroidRuntime:E
```

`dumpsys` 是原生侧最可靠的进程外证据：

| 要证明的事 | 命令与判据 |
|---|---|
| 前台服务真的在跑 | `adb shell dumpsys activity services \| grep FloatingLyricService` |
| 覆盖窗口真的存在 | `adb shell dumpsys window windows \| grep org.songloft.lynx` |
| **文本真的写进了覆盖层** | `dumpsys window windows` 里的 `Requested h` / `mLayoutSeq` / frame 在写入前后是否变化 |
| 全屏视频 Activity 在栈顶 | `adb shell dumpsys activity activities \| grep topResumedActivity` |
| 视频轨真的被解码 | logcat 出现 `c2.android.avc.decoder` |

**「文本写进去了」这条尤其值得记**：悬浮歌词那次是白字白底，截图和肉眼都看不出区别。定位靠的是写入前后 `Requested h=46` / `mLayoutSeq=4724` **逐字节相同** → 压根没重排。修完后 46→48、4748→4749。这也顺便成了免费的反向验证。

**这台 Android 13 镜像打印的是 `topResumedActivity=`，没有 `mResumedActivity`** —— 写错的话每条断言都会读成「Activity 没起来」。

**数进程别用 `ps -ef | grep X | wc -l`**：当前 shell 自己的命令行就含那个关键字，会稳定多算 1–2 个。用 `pgrep -x <可执行名>`。

## Web 无头浏览器

批52/53/57/58/60b/60c 的 Web 实测都走这条路，抓出过 6 处弹出层错位（其中一个 `x = -122`，整块在屏外）和弹窗被 flex 压扁。

```bash
# 1. 构建产物并起本地服务（web:dev 不等于产物可用，见 build-and-run.md）
pnpm run build:web
pnpm run web:dev

# 2. 起浏览器容器。--network host 才能让容器里的 Chrome 访问宿主的服务与真后端 58091
docker run -d --name uichrome --network host browserless/chrome:latest

# 3. 用 /function 端点跑 puppeteer 脚本（Content-Type 必须是 application/javascript）
curl -s -X POST http://127.0.0.1:3000/function \
  -H 'Content-Type: application/javascript' --data-binary @script.js
```

脚本形如 `module.exports = async ({ page }) => { …; return { data: {…}, type: 'application/json' } }`；截图用 `page.screenshot({ encoding: 'base64' })` 塞进 `data` 带回来再本地解码。

### Lynx Web 的关键事实：是真实 DOM，但在 shadow root 里

**不要照搬 Flutter 版的经验** —— Flutter Web 是 canvas 渲染、DOM 里没有按钮；Lynx Web 不是。web-core 把每个 Lynx 元素映射成自定义元素（`x-view` / `x-text` / `x-image` / `x-input` …），挂在 `<lynx-view>` 的 **shadow root** 内：

```js
const root = await page.evaluate(() => document.querySelector('lynx-view').shadowRoot.innerHTML)
```

所以 `querySelector` / `getComputedStyle` / `getBoundingClientRect` 全都可用 —— 这是 Web 实测比真机强的地方，也是几次几何缺陷只能在这里被发现的原因。

### 量什么

| 症状 | 判据 |
|---|---|
| 弹出层位置错 | `getBoundingClientRect()` 的 `x` / `right`，与 lynx-view 视口比 |
| 弹窗「标题被挡住」 | `getComputedStyle(el).height` vs `el.scrollHeight` 的**差值**（截图会误读成「样式没生效」或「被遮挡」） |
| 元素是否被裁掉 | `checkVisibility()` 为 true 但 `document.elementFromPoint` 打不中 ⇒ 是裁剪，不是不可见 |
| token 没生效 | `getComputedStyle(el).getPropertyValue('--x')` 为空串 ⇒ 元素在 `.theme-root` 子树之外 |
| 标签没实现 | shadow root 里出现原样的 `<refresh>` / `<webview>`（未映射标签走恒等回落，成为 `HTMLUnknownElement`） |

### 两个反复踩的坑

- **业务代码跑在 Web Worker realm 里**（web-core 的 `new Worker(…, { name: 'lynx-bg' })`），那里没有 `document` / `localStorage` / `HTMLAudioElement`。**所以 DOM 探测在 Web 上会回答「不是 Web」** —— 已踩三次。判平台一律 `isWebPlatform()`（读 `SystemInfo.platform`）。
- **不进 `console.error` 的异常**：`import.meta` 用错脚本类型时只走 `pageerror`。监听 `page.on('pageerror')`，别只看 console。

## macOS 上的真实 Chrome（需要扩展或 DevTools 在场时）

有些 bug 只在**特定浏览器配置**下出现，Docker 里的无头 Chrome 复现不了。插件 tab 切换崩溃就是这种：需要 ①我们 detach 插件 frame ②装了 `all_frames: true` 的扩展 ③DevTools 真的打开，缺一即不发生。现成的驱动器是 [`scripts/cdp-plugin-tab-crash.mjs`](../../scripts/cdp-plugin-tab-crash.mjs)（自带浏览器启动、DevTools 停靠、登录、来回切 tab、崩溃判定）。

从中抽出来的可复用事实：

- **`--remote-debugging-port` 在默认 profile 上被 Chrome 拒绝**（安全限制），所以没法附加到用户正在用的那个实例；必须另起一个带 `--user-data-dir` 的实例。
- **`--load-extension` 从 Chrome 137 起被忽略**。侧载要用 CDP `Extensions.loadUnpacked`（profile 的 `Preferences` 里还得先打开 `extensions.ui.developer_mode`）。
- **商店安装目录不能直接 unpacked 加载**：里面有 `_metadata/`，而 `_` 前缀是保留名 —— 先 `cp -R` 出来再 `rm -rf _metadata`。
- 以上两条都**静默失败**：扩展没装上，测试照样"通过"。凡是「缺了某个条件就一定不会失败」的测试，脚本必须自检该条件是否真的成立，否则那个通过毫无意义。
- **崩溃 dump 在 Chrome 自己的目录**：`~/Library/Application Support/Google/Chrome/Crashpad/completed/*.dmp`（不是 `~/Library/Logs/DiagnosticReports/`）。用 Python 解 minidump 的 exception stream 就能拿到异常码与故障地址，不需要符号；crashpad 注解里还带崩溃进程类型和**当时注入的扩展 ID**。
- **想验证一个改法值不值得落盘**：用 CDP `Fetch` 域拦响应体、改写后 `fulfillRequest`，可以在完全不动仓库文件的前提下 A/B 几种改法。

## 一次性探针 scenario

需要弄清「宿主到底发了什么」时，写个 `zz-probe.scenario.ts`，跑完删。TestBridge 能直接 eval 到 store，密集轮询几秒就能把 tick 节奏、事件时序量化出来。

批46 有两条 iOS 失败的首次归因都是错的（「iOS 只随 tick 上报时长」「低速下每 tick 只推 250ms」），实测推翻后才发现真根因（`.readyToPlay` 时 `item.duration` 本就是 `indefinite`；tick 间隔按**媒体时间**计，墙钟间隔是 `interval / rate`）。**先量化再改代码**，比连猜带改省好几轮 iOS 构建。

## 本机环境的两个坑

- **宿主的 `google-chrome --headless` 在这台机器上会 core dump**，CDP 端口也起不来。别在那上面浪费时间，直接用上面的 Docker 路子。
- **全局 git `insteadOf` 会打断一切 https clone**：`~/.gitconfig` 有 `url.git@github.com:.insteadOf https://github.com/`，而本机 22 端口不通 ⇒ CocoaPods / Homebrew 的 clone 全部失败，报错完全不指向真因。绕法：命令前加 `GIT_CONFIG_GLOBAL=/dev/null`。

## 相关

- [测试](./testing.md) —— 单元与 E2E
- [构建与运行](./build-and-run.md) —— 各平台构建及其环境坑
- [Lynx 约束](../architecture/lynx-constraints.md) —— 双线程/无 DOM/realm 隔离的来龙去脉
