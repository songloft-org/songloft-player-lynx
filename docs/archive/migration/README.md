# 迁移调研（历史归档）+ 订正表

这 5 份文档产出于**项目启动之前**，用途是论证「Flutter → Lynx 是否可行」并规划路线。它们作为**决策记录**有价值 —— 能看到当时掌握什么信息、为什么那样选。

> ## ⚠️ 不要把它们当现状读，更不要照抄里面的接口签名
>
> 项目已推进到批60c。下面这张表列出**会导致错误判断或错误代码**的偏差，按危险程度排序。表里没提到的内容，多数是「当时的判断，事后看仍成立」或「关于桌面端，至今未被检验」。

| # | 位置 | 文档说 | 实际 | 危险 |
|---|---|---|---|---|
| 1 | `lynx_native_modules_spec.md` L49–70 等**全部接口草案** | 方法返回 `Promise<void>` | **原生方法不返回 Promise**。写是 fire-and-forget，读靠 `Callback`；promisify 必须在 TS 适配层做 | 🔴 **照抄会崩**。`nm.X as SomePromiseInterface` 让 `.then()` 落在 `undefined` 上 —— DLNA 页就是这么对所有 Android 用户开屏即崩的 |
| 2 | `lynx_capability_matrix.md` L47/L49/L50 · `spec.md` L174–203 | 悬浮歌词/Live Activity/DLNA 挂在 `SongloftPlatform` 下；另有 `SongloftBackend` | 三者都是**独立顶层模块**（`SongloftFloatingLyric` / `SongloftLiveActivity` / `SongloftDlna`）。`SongloftBackend` **不存在**。实际 `SongloftPlatform` 的方法是 openURL / pickAndUploadFile / setInsecureTls / setClipboard / logWrite / logRead / shareFile —— 与草案列的 7 个子对象**零重叠** | 🔴 指向不存在的对象 |
| 3 | `capability_matrix.md` L4 头部 | 视频播放 / DLNA / Live Activity / 悬浮歌词「已有代码但**从未跑通**」 | **全部已完工并进契约闸门**（批42/43/45/48/49）。只剩 Lynxtron 桌面 | 🔴 主动断言了一个反事实 |
| 4 | `capability_matrix.md` L78 · `plan.md` L21 | 移动端用 Native `fetch`，**无需自实现 HTTP service** | **两个宿主都必须自实现**（`net/SongloftHttpService.kt` / `SongloftHttpService.swift`，iOS 还从 Podfile 摘掉 `LynxService/Http`）。SDK 实现把 client 私有化，「允许不安全 TLS」根本到不了 `fetch`，自签名服务器连登录都过不去 | 🔴 结论完全相反 |
| 5 | `spec.md` L14/L24 | 按 Lynx Autolink 库形态组织（`lynx.lib.json`） | **没走 Autolink**。模块直接写在宿主工程里，注册是手写的：Android `registerModule(...)`、iOS `config.register(...)` **加手写 pbxproj 四处登记**。仓库无 `lynx.lib.json` | 🟠 整篇的组织前提被否证 |
| 6 | `capability_matrix.md` L81 · `spec.md` L131 | Web 用 `localStorage` | Web 落 **IndexedDB**。worker realm 的 `localStorage` 是 undefined（Web Storage 是 window-only），落到内存实现会让 token 随刷新蒸发 —— 这个 bug 真的发生过 | 🟠 |
| 7 | `roadmap.md` L8 · `overview.md` L4 | P3「进行中，DLNA/歌词/Live Activity/桌面待做」 | P3 ≈ **90%**，仅剩桌面 | 🟠 |
| 8 | `roadmap.md` L6 | 「P0 技术验证 ✅ **全部通过**」 | P0 自己的范围含「桌面 Lynxtron 预览版验证」「桌面元素覆盖清点」，退出判据含「Android + **一个桌面端** + Web 三端跑通」，以及 L47–74 一整份桌面 clay 验收清单 —— **这些从未执行**。应读作「移动端 + Web 部分通过」 | 🟠 header 盖掉了下面 28 行未执行的清单 |
| 9 | `overview.md` L85 · `roadmap.md` L90 · `plan.md` L40 | 路由 file-based / react-router memory router | **TanStack Router，code-based**（`src/router.tsx` 明确写了不用 file-based codegen） | 🟡 三处互相矛盾 |
| 10 | `overview.md` L87 · `plan.md` L40 | UI = umbrella 包 `@lynx-js/lynx-ui` + LUNA tokens | **按组件包导入**（9 个 `@lynx-js/lynx-ui-*`，桶入口已不是依赖）+ **Muse** 设计语言（LUNA 已被全面重构替换，见 [DESIGN.md](../../../DESIGN.md)） | 🟡 |
| 11 | `overview.md` L138–139 | 净收益：bundle 天然可下发热更 | **热更至今未实现**，且在「明确不做」清单里。能力具备 ≠ 已落地 —— 而这是迁移动机 #1 | 🟡 收益尚未到账 |
| 12 | `plan.md` L16 | CSS 覆盖 97%、元素属性覆盖 73% | 这两个数字**被本系列自己否掉**：`roadmap.md` L30 明确写「勿用未证实的『~73%』数字」 | 🟡 同一套文档内部互相否证 |
| 13 | `capability_matrix.md` L111/L117 | 第四档断点按**宽高比** >2.2（车机） | 断点是**纯宽度制**：`tablet 600 / desktop 900 / tv 1920`，没有宽高比档 | 🟡 |
| 14 | `capability_matrix.md` L85 · L127 | 封面取色「待核实」 | **已结论：不可行**。Lynx 无 canvas、无像素读取，后端也没有颜色字段 ⇒ 没有可取色的对象。改为固定 canvas 色 veil，alpha 由对比度**算出** | 🟡 |
| 15 | `overview.md` L17–19 | 工程在 `/Users/hanxi/toy/songloft-player-lynx/`；内层 `./songloft-player/` 是只读参考；本 `docs/` 不受版本控制 | 仓库在 `/Users/hanxi/toy/songloft/songloft-player-lynx`；Flutter 快照移到**同级** `../songloft-player`；`docs/` **已入库** | 🟢 |

## 几处「当时没预见、后来最贵」的坑

这 4 类占了批41–48 修复量的大头，**任何风险登记里都没有**。补记在此，因为它们比逐格订正档位更有价值：

1. **原生方法不返回 Promise，TS 侧强转 = 页面开屏即崩**（见上表 #1）。
2. **宿主 HTTP service 必须自研**，唯一目的是拿 TLS 钩子（见 #4）。
3. **Web 端 `nativeModulesMap` 的 value 必须是 ESM URL 工厂**，塞普通对象会被强转成 `"[object Object]"`，静默丢掉**所有**自定义模块 —— 同时杀死文件选择器、剪贴板和音频。
4. **`sendGlobalEvent(name, params)` 第二参必须是数组**，传裸对象则每个载荷到达时都是 `undefined`。音频事件与外观事件都栽过。

## 仍然成立的部分（值得一读）

- **`overview.md`**：迁移动机的技术前提判断（bundle 可下发、`<webview>` 可替 WebF 解除 GPL 传染 —— 后者**已兑现**）；「Dart → TS 无代码可直接复用，属整体重写」；无 DOM / 双线程 / 滚动须用 `<scroll-view>` 等约束被实践反复确认。
- **`roadmap.md`**：「以 P0 闸门开局、不预先承诺全量迁移」的方法论事后看是对的；L47–74 那份桌面 clay 验收清单质量很高，**未执行不等于无效**，做桌面时直接拿来用。
- **`spec.md`**：逐端实现路径的选型**全部押对**（Android ExoPlayer + MediaSessionService + 前台服务；iOS AVPlayer + AVAudioSession + MPNowPlayingInfoCenter + MPRemoteCommandCenter）。
- **工作量估算的方法论**：L172–188 预测「TS 重写行数与 Dart 同量级或略少」—— 实测 Lynx 侧 560 文件 / ~78.5K 行 对 Dart 侧 87,211 行，**假设成立**。

## 当前的权威来源

| 想知道 | 去 |
|---|---|
| 现在的架构 | [architecture/overview.md](../../architecture/overview.md) |
| Lynx 约束的机制 | [architecture/lynx-constraints.md](../../architecture/lynx-constraints.md) |
| 原生模块契约 | [reference/native-modules.md](../../reference/native-modules.md) |
| 三端能力差异 | [architecture/platform-differences.md](../../architecture/platform-differences.md) |
| 开发铁律 | [AGENTS.md](../../../AGENTS.md) |
| 逐批交付历史 | [project/progress.md](../../project/progress.md) |
