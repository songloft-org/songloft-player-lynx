# 返回导航规范（Android 返回键 / Web 浏览器返回）

本文档定义 songloft-player-lynx 的返回处理契约，供新增页面、弹出层和原生模块时对齐。

**背景**：此前全仓对返回键**零处理** —— `MainActivity` 没有 `onBackPressed`，用户在任何页面、任何弹出层打开时按返回都直接退出应用；Web 端用 memory history，浏览器返回直接离开页面。`docs/migration/lynx_capability_matrix.md` 早已把「硬件/手势返回」列为需自研的能力缺口。

---

## 1. 三层模型

一次返回按键自上而下走三层，命中即停：

| 层 | 实现 | 谁注册 |
|---|---|---|
| ① **覆盖层 / 模式态** | `src/shared/nav/back-stack.ts` LIFO 栈 | 各弹出层、模式态经 `useBackHandler` |
| ② **路由父级** | `src/shared/nav/route-back.ts` 纯函数 `resolveRouteBack` | 声明式表，无需注册 |
| ③ **退出提示** | `src/shared/nav/exit-prompt.ts` + 宿主 | 仅在 tab 首页 |

装配在 `src/core/navigation/back-controller.ts`（`initBackController`，由 `src/index.tsx` 在首帧渲染前调用）。第 ② 层同时是**所有 UI 返回箭头**的实现（`performRouteBack`，在 `src/core/navigation/route-back-action.ts`），所以按键与箭头不可能不一致。

### 优先级 = 激活时刻，不是 z-index

全库手写覆盖层一律 `position: fixed; z-index: 100`，同层平铺、按 DOM 顺序绘制，没有可排序的东西。真正需要的语义是「关掉用户最后打开的那层」，而覆盖层只在打开时才注册，所以注册顺序天然等于打开顺序。

两种排序各有一个失效场景，取失效场景不会真实发生的那个：

| 排序依据 | 失效场景 |
|---|---|
| 渲染顺序（父先子后） | **同级兄弟会错** —— `FullPlayerPage` 里速度 Popover 在睡眠 Sheet 之前渲染，先开 Sheet 再开 Popover 会关错层 |
| **激活时刻**（采用） | 仅「父子在同一个 commit 内同时激活」时错（子 effect 先于父 effect ⇒ 父反而在栈顶）。覆盖层都在用户操作后激活，必然晚于页面挂载那个 commit |

⚠️ **由此得出的硬约束：覆盖层的 `active` 在挂载时必须为 `false`。** 由 `back-stack.test.ts` 钉住顺序。

---

## 2. `consumable` 契约（宿主标志）

`Activity.onBackPressed()` 必须**同步**决定消费还是退出，而 Lynx 既不能同步调 JS，也不能让 native 阻塞等 Promise（AGENTS.md 铁律）。所以方向是反的：**JS 持续把一个布尔值镜像给宿主，宿主只读自己缓存的副本。**

| | |
|---|---|
| 计算 | `back-controller.ts` 的 `computeConsumable()` |
| 推送时机 | 栈深度变化（`subscribeBackStack`）、路由变化（`router.subscribe('onResolved')`）、退出窗口开/闭 |
| 去重 | 值未变化时不发 IPC；ack 走独立的 `notifyBackHandled` |
| 宿主侧 | Android `BackKeyState`；Web `audio-host.js` 的 sentinel 状态机 |

### 平台差异（刻意的）

只在 **tab 首页**不同：

| 平台 | tab 首页时 `consumable` | 原因 |
|---|---|---|
| Android | `true`，除非退出提示已武装 | 第一次按键要出 toast；第二次由宿主本地 `moveTaskToBack` 执行 |
| Web | 恒 `false` | 浏览器返回离开页面才是 web 用户的预期；且没有 sentinel ⇒ worker 卡死也能离开 |

### 为什么这个设计能扛住 JS 卡死

双击退出的**第二次按键根本不进 JS**：武装提示的同时把 `consumable` 降为 `false`，宿主自己完成退出。因此
① 快速连击没有可竞争的往返；② JS 卡死在 tab 首页时退出照常可用；③ 状态基于时间戳，后台返回也不会残留武装态。

**看门狗**补上剩下那一种情况（`consumable` 为 `true` 期间 JS 卡死，即有覆盖层或在二级页）：宿主计未应答次数，连续 `BackKeyState.MAX_UNANSWERED`（3）次无 ack 就走系统默认逃生。**刻意不用定时器** —— 超时会把「仅仅是慢」的 JS 误判成死亡并退出应用。

---

## 3. 新增覆盖层的必做清单

```tsx
const [open, setOpen] = useState(false)          // 挂载时必须是 false
useBackHandler(open, () => { setOpen(false); return true })
```

- 返回 `true` = 已消费；返回 `false` = 让下一层处理
- **`active` 挂载时必须为 `false`**（见 §1）
- 嵌套子状态各注册一层，由激活顺序自然形成正确的退出顺序（如歌曲菜单 → 添加到歌单 → 删除确认，五者 —— 连同歌曲信息/编辑弹窗 —— 由 `song-row-overlays.ts` 互斥驱动；信息弹窗的编辑按钮经 `openEdit` 单槽切换，返回键永远不会同时见到两个弹窗）
- lynx-ui Dialog **没有命令式关闭**，只能改外部 `show` state（自研的 `PopoverSurface` 同样是受控的，只经 `onShowChange` 关）

---

## 3b. 伪路由 / 子视图层

有一类「层」既不是覆盖层也不是路由：页面内部的子视图或状态机。它们同样注册 `useBackHandler`，但语义是「退回上一个子视图」而非「关掉」。已接入的四处：

| 位置 | 层 | 返回行为 |
|---|---|---|
| `FullPlayerPage` 歌词页 | Swiper 第 2 屏 | 滑回封面（`swipeTo(0)`）；**宽屏并排常显时此层不存在**（`!isWide` 判定） |
| `SettingsPage` 双栏 pane | `activeSubPage` | 复位到 `DEFAULT_SUB_PAGE`；仅 `isDualColumn` 且非默认时是一层 |
| `DuplicateCheckPage` phase | `status`/`computing`/`results` | 仅从 `results` 退回 `status`（保留已选保留项，不清空）；`computing`/`status` 交给路由层 |
| `PluginWebViewPage` 内部历史 | webview 自身 history | 逐层 `history.back()`，耗尽后交给路由层（见下） |

**歌词页**需要新增 index state：`Swiper` 的 `onChange` 记录当前屏，返回键据此判断是否在歌词屏。`swipeTo` 会触发 `onChange`，所以自动进入歌词（`readAutoEnterLyrics`）与手动滑动共用同一个 state。

**Settings 双栏**：宽屏下子页在右 pane 内切换、路由停在 `/settings`，没有可 pop 的路由。`SubPageShell` 在 pane 内隐藏返回箭头（它注释里那个 "dead key"），这一层正是补上那个洞。子页自己开的覆盖层注册在它之上、先关。

**DuplicateCheck phase** 是后端驱动的状态机，返回键只在 `results` 时介入。刻意**不**在 `computing` 时把 phase 设回 `status`：自动恢复 effect 会因任务仍在跑立刻把它弹回 `computing`，纯属空转，不如让路由层直接离开页面（后端任务继续、下次进来自动续上）。退回 `status` 时也**不**清空 `selectedKeep`/`ignoredGroups`——返回是「退一步」不是「重来」（那是 `onRecheck` 的语义）。

### 插件 WebView 内部历史（最脆弱的一处）

Lynx `<webview>` 没有 `canGoBack`/`goBack`，只能近似：

- `bindlocationchange` 告知页面发生了导航；我们用它维护深度计数 `webDepth`，并用 `eval('history.back()')` 驱动回退。
- **`locationchange` 对前进导航和我们自己的 `history.back()` 都会触发**。用 `selfBackPending` 标志区分：主动 back 时置位，下一个 `locationchange` 当作回声消耗掉而不计数。
- **handler 只在 `webDepth > 0` 时激活**。类型里 `bindlocationchange` 标着 `@since Lynx 3.5 @PC` —— Android 是否触发**未经证实**。若不触发，`webDepth` 恒 0，返回键直接落回路由层（即接入前的行为）。**优雅降级为 no-op，而不是误动作**。
- 主动 back 后挂一个 400ms 看门狗：若无 `locationchange` 确认且计数已归零，说明 webview 没有可退的历史，改走路由返回，避免「按了没反应」。计数仍 >0 时不强制离开——宁可让用户再按一次，也不把一个还有内部历史的插件直接拽出去。

> ⚠️ 顶栏返回箭头**刻意保持** `performRouteBack()`（离开插件），不逐层退内部历史：它是显式的「关闭此插件」动作，与系统返回键的「沿历史后退」分工不同，这也与多数内嵌 webview 的应用一致。

---

## 4. 新增路由的必做清单

在 `src/shared/nav/route-back.ts` 声明父级：

- 父级就是所在 section 根 → 已被通用前缀规则覆盖（如 `/settings/*` → `/settings`）
- 父级另有其人 → 加进 `EXPLICIT_PARENTS`（或 `EXPLICIT_PARENT_PREFIXES`，用于带参数段的路径）

**不声明会怎样**：`src/shared/nav/__tests__/route-back.test.ts` 会红 —— 它走 `router.routesById` 枚举**每一条叶子路由**，断言都不落到 `fallback` 分支。运行时的降级是「导航到所属 tab + `console.warn`」，绝不会误退出应用。

### 没有 `backTo` 了

`SubPageShell` 曾有 `backTo` prop（默认 `/settings`）。移除的原因是硬件返回键需要同一个答案，而两张表必然漂移。现在每条路由的父级只存在一处，箭头与按键读同一份。`onBack` prop 保留，语义仍是**宽屏 pane 内的兄弟页切换**（不是路由返回），由 `sub-page-back-contract.test.ts` 守住。

---

## 5. Web sentinel

业务代码跑在真 Web Worker，没有 `history` / `popstate`，所以拦截只能在主线程（`web/audio-host.js`）。机制是**一个** sentinel history entry，其存在性严格等于 `consumable`：

| 事件 | 动作 |
|---|---|
| `consumable` false→true | `pushState(sentinel)` |
| `consumable` true→false | `suppressedPops++` 后 `history.back()` 撤掉 sentinel |
| `popstate`（自造的） | 计数递减，无操作 |
| `popstate`（用户真按） | 立即重新 push 把守卫重新武装，再 `sendGlobalEvent` 通知 JS |

`history.back()` 是异步的，所以移除操作串行化（`sentinelOpInFlight`），并在完成后重新驱动一次 —— 期间标志可能已经翻回来了。

**已知降级**：页面在新标签页直接打开、没有更早的 history entry 时，返回无法离开页面。这是浏览器行为，无法规避。

### `sendGlobalEvent` 第二参必须是数组

`sendGlobalEvent(name, params)` 的 `params` 是**数组**。web-core 把它转给 worker，最终走 `listener.apply(ctx, params)` —— 普通对象没有 `length`，`apply` 会传**零个参数**，listener 收到 `undefined`。

这个缺陷此前存在于两处（Web 端所有音频 state/progress/error 事件、深浅色切换事件，后者键名还写成 `theme` 而非 `systemTheme`），已随本特性修复，并由 `native-module-contract.test.ts` 的闸门锁住。

---

## 6. 原生侧铁律

- **三侧同步**：TS 调用侧（`src/native/navigation.ts`）、Kotlin `@LynxMethod`、Web worker 模块 + 主线程 handler。少任一侧就是静默 no-op；`native-module-contract.test.ts` 逐方法核对
- **注册也要写**：Kotlin 在 `SongloftApplication` 的 `registerModule`。iOS 刻意**不注册** —— 那个宿主没有返回键可拦（无 `UINavigationController`，连边缘滑动都没有），TS facade 在那里降级为惰性桩
- **`@LynxMethod` 跑在 BTS 线程**，碰 Activity/View 必须 `Handler(Looper.getMainLooper()).post`，否则 `CalledFromWrongThreadException` 会被静默吞掉
- **事件名逐字一致**：`BACK_PRESSED_EVENT` = `'SongloftNavigation.backPressed'`，Android 与 Web 两侧都由闸门核对
- **`exitApp` 用 `moveTaskToBack(true)` 而非 `finish()`**：这是音乐播放器，`finish()` 会销毁 LynxView，下次启动变成冷启动、整个 UI 状态重建；`moveTaskToBack` 也与 Android 12+ 根 Activity 的系统默认行为一致。`moveTaskToBack` 拒绝时（非 task root）回落 `finish()`
- **原生方法不返回 Promise**：Promise 化必须在 TS 适配层做，禁止把原生模块直接强转成 Promise 接口（DLNA 就是这样整页崩的，AGENTS.md §5）

### 不需要处理的一层

全屏视频与文件选择器是**独立 Activity**（`SongloftVideoActivity` / `platform.FilePickerActivity`），它们在栈顶时 `MainActivity.onBackPressed()` 根本不会被调用，系统默认 finish 已经正确，视频退出还会 emit `SongloftVideo.closed`。软键盘同理由系统先消费。**刻意不在 JS 侧介入这一层**，避免与 Activity 抢事件。

---

## 7. 为什么不用 `router.history.back()`

memory history 的栈**不描述用户认为自己从哪来**：

- 栈底是 `/login`
- 全项目所有「返回按钮」都是 push 而非 pop（`navigate()` 默认 PUSH）
- 切 tab 也是 push

于是 `canGoBack()` 在首次导航后几乎恒为 `true`，**不能**用它判断是否该退出应用；`back()` 会落到任意位置。`FullPlayerPage` 最早记录了这个坑，`route-back.ts` 把结论一般化为声明式父级表。

---

## 8. Predictive back（targetSdk 35+）

`MainActivity` 实现的是 legacy `onBackPressed()`，manifest 显式声明 `android:enableOnBackInvokedCallback="false"` 把这个选择写明而不是继承平台默认。

若将来改为 `"true"`（或平台移除该 opt-out），框架会停止调用 `onBackPressed()` 并改走 `OnBackInvokedDispatcher`。届时的失败是最坏那种静默：宿主在认为 JS 会处理时**不调** `super.onBackPressed()`，所以丢掉回调不会退化成「返回即退出」，而是**返回键处处失效、零日志**。

`android-manifest-contract.test.ts` 因此断言「manifest 选的那种回调，MainActivity 必须真的实现」。它**刻意不以 targetSdk 为条件** —— opt-out 在 34 以上仍然有效，拿 targetSdk 触发失败是误报。迁移时需要新增 `androidx.activity` 依赖并把基类从 `android.app.Activity` 换成 `ComponentActivity`（注意主题是框架 `android:Theme.Material.Light.NoActionBar`，**不能换 AppCompat**）。

---

## 9. 闸门一览

| 文件 | 守什么 |
|---|---|
| `src/shared/nav/__tests__/route-back.test.ts` | 枚举 `router.routesById` 的每条叶子路由，断言都有声明的父级（含反向验证：未声明路由确实落到 `fallback`） |
| `src/shared/nav/__tests__/back-stack.test.ts` | LIFO 顺序、注销幂等、dispatch 过程中改栈、抛异常不吞按键 |
| `src/shared/nav/__tests__/exit-prompt.test.ts` | 武装窗口边界、时间戳自愈 |
| `src/__tests__/native-module-contract.test.ts` | 事件名逐字一致（Android + Web）、三方法齐备、`sendGlobalEvent` 第二参是数组、模块注册 |
| `src/__tests__/android-manifest-contract.test.ts` | 回调选择已声明、且 MainActivity 实现的正是被选中的那种（Kotlin 源先剥注释） |
| `src/features/settings/__tests__/sub-page-back-contract.test.ts` | `onBack` 仅用于 pane 内兄弟页切换 |

按 AGENTS.md §6：**写断言时先反向验证它会红**。上面每一条都这样验过 —— manifest 那条第一次就因为「文档注释里提到 `OnBackInvokedDispatcher`」而假绿，故现在先剥注释再断言。
