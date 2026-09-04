# 架构总览

一页看懂这个客户端怎么组织的。**为什么会有某些反直觉的约束** → [Lynx 约束](./lynx-constraints.md)；**四端差异** → [平台差异](./platform-differences.md)。

## 分层

```
┌─ 宿主（Android Kotlin / iOS Swift / HarmonyOS ArkTS / Web 主线程脚本）
│    10 个契约模块 + 平台专用宿主服务与系统能力注入
├─ src/native/            原生模块的 TS facade（callback → Promise）
├─ src/core/              网络（api-client / auth-interceptor）· 存储 · 配置
├─ src/models/            zod 模型（snake → camelCase，.catch() 容错）
├─ src/features/<mod>/    8 个功能模块，每个内部再分：
│      api/  data/  domain/  store/  pages/  widgets/
├─ src/shared/            主题 · 布局 · UI 原语 · 导航策略 · 响应式
└─ src/router.tsx         TanStack Router（memory history，code-based）
```

## 状态：两套，边界清晰

| 类型 | 工具 | 放什么 |
|---|---|---|
| **服务端态** | TanStack Query | 一切来自后端的数据。key 前缀分域（`['library',…]` / `['jsplugin',…]` / `['settings',…]`） |
| **客户端态** | Zustand | 播放器、鉴权、EQ、主题、服务器档案、覆盖层开关 |

**Query 在无 DOM 环境下要特殊处理**：`focusManager` / `onlineManager` 都是 no-op（`src/lib/query/query-client.ts`），并且有一道**读 query-core 源码**的闸门防止升级后回退。

轮询**不用** `refetchInterval` —— 实测在本 Lynx build 上首次 fetch 后就不再 fire。改为页面级显式 `setInterval` 驱动 `refetch()`，而 `scanPollInterval` 这类纯函数保留为「是否轮询 + 间隔多少」的判定谓词（可单测）。

## 数据流：一次播放请求

```
用户点歌
 → player-store.playPlaylist(songs, index, context?)
 → resolvePlaybackSource(song)          ← 优先本地缓存 file://，否则远程
 → syncQueueWindow(playlist, index)      ← 只推当前 ±5 首元数据给原生层
 → audio facade.load(url, opts)
 → NativeModules.SongloftAudio（Kotlin ExoPlayer / Swift AVPlayer / Web 宿主模块）
 ← 事件：state / progress / completion / remoteCommand
 → player-store 更新 → 组件重渲染
```

两处值得知道：

- **播放 URL 由 `buildSongUrl` 统一拼**，带 `platform` 参数（决定服务端是否转码）。漏传它曾导致两个方向相反的静默错误：视频容器被要求 `-vn` 剥掉画面；iOS 的 ogg/opus 因落在 web 默认集而不转码、AVPlayer 打不开。
- **元数据 URL 必须与实际加载的 URL 一致**。原生侧按 URL 做 key 查元数据，不一致就查不到，锁屏显示空白 —— 所以两者都走同一个 resolver。

## 鉴权

JWT 双 token。`api-client` 装 `auth-interceptor`：401 → 用 refresh token 换新的 → 重放原请求。

**TokenStore 与 AuthInterceptor 是进程级单例**（`getSharedApiBundle()`）。以前每个 feature 各 `new` 一套，共 6 份，后果是换账号后曲库仍带上一个账号的 token（后端会正常返数据，用户看到别人的库），且 token 过期时多份各刷一次 refresh、互相覆盖。

## 导航

TanStack Router，**memory history**（没有 URL 栏）。三件事各有归属：

| 关心 | 在哪 |
|---|---|
| 路由表 | `src/router.tsx`（code-based，非 file-based） |
| **返回**该去哪 | `src/shared/nav/route-back.ts` 的纯函数 + 覆盖层 LIFO 栈 |
| tab 归属与 mini-player 可见性 | `src/shared/nav/shell-navigation.ts` |

**绝不用 `router.history.back()`** —— 栈底是 `/login`，所有返回按钮与 tab 切换都是 push，`canGoBack()` 几乎恒为 true。完整模型见 [返回导航规范](../reference/back-navigation.md)。

## 主题

三层叠加，**所以 token 值不是编译期常量**：

1. `tokens.css` 定义基线
2. `ThemeProvider` 挂 `.theme-root.theme-dark` / `.theme-light`
3. 主题包在运行时以内联 custom properties **覆盖 11 个** token（`theme-pack-mapping.ts` 的 `PACK_OVERRIDABLE_BASELINE`）

`<svg content>` 不在 CSS 级联内，所以图标色走单独的 `ICON_COLORS`（Proxy，按当前主题取值）与 `activeAccentIconColor()`（读主题包 seedColor）。详见 [DESIGN.md](../../DESIGN.md)。

## 覆盖层为什么都挂在根上

弹窗、菜单、底部面板全部挂在 root route 的 `ThemeProvider` 内（`src/router.tsx`，与 `ToastHost` 同处），状态在 store 里而不是组件树里。三个原因：

1. **`.theme-root` 之外拿不到 CSS 变量** —— 挂错地方会让每个 `var(--*)` 解析为空字符串，卡片透明无圆角、遮罩不可见，而**文字还在**，所以像「样式崩了」而不像「没渲染」。
2. **虚拟列表内部放不了弹出层**（`contain: layout` + 滚动容器裁剪，见 [Lynx 约束](./lynx-constraints.md)）。
3. **模态本来就该在根上** —— 添加到歌单、删除确认无论如何都要跨页面存在。

## 测试与闸门

| 层 | 作用 |
|---|---|
| Vitest | 单元测试 + 契约闸门（原生模块、manifest、pbxproj、CSS 不变量、i18n key、Web 宿主页） |
| E2E | TestBridge（TCP 9230）驱动设备上的 App，关键断言落在**进程外**状态 |

**闸门只证明它真正读过的东西** —— vitest 读不到 Xcode 工程、Gradle 或真机行为。这条与「闸门要验语义不验子串」「mock 要保留真实前置条件」「断言先反向验证会红」一起构成 [AGENTS.md §6](../../AGENTS.md)，那是三次教训的沉淀。

## 相关

- [Lynx 约束](./lynx-constraints.md) —— 双线程/无 DOM/realm 隔离的机制
- [平台差异](./platform-differences.md) —— 三端能力矩阵
- [E2E 测试架构](./e2e-testing-design.md) —— Driver 接口与 TestBridge 协议
- [AGENTS.md](../../AGENTS.md) —— 铁律与验收闸门
