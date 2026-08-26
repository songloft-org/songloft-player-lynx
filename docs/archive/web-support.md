# Web 平台支持计划（已归档 · 含订正）

> **归档说明**：本文件是 Web 平台支持（commit `2330c22`）的原始设计计划，2026-08-14 从仓库根的 `plans/`（gitignore 目录，未入库）移入 docs 归档。
>
> **保留原因不是它对，而是它错在哪里很有价值** —— 2026-08-14 的审计发现 Web 平台的多数缺陷都能追溯到本计划里几条**未经验证就写进设计的假设**。原文照录（下方分隔线以后未作任何修改），先读这段订正。

## 订正：本计划中被实践否证的假设

| 处 | 原计划怎么写 | 实际情况 | 后果 |
|---|---|---|---|
| Phase 2 结尾「接入点」 | 「`isNativeAudioAvailable` 为 false 且 **`HTMLAudioElement` 可用**时返回 `WebSongloftAudio`」 | web-core 把业务代码跑在**真 Worker** 里，那里 `HTMLAudioElement` 是 `undefined`。判断恒 false | **Web 完全没有声音**，且 `web-audio.ts` 全文（~560 行）从未在任何平台执行过。mock 拿到真实时长，进度条照走、自动切歌，唯独不出声 |
| Phase 2 整节的实现设计 | `HTMLAudioElement` + `AudioContext` + `navigator.mediaSession` 直接在实现类里 new | 三者**全是主线程 API**，worker realm 里抛 `ReferenceError` | 即便修对判断也救不回来；正解是经 web-core 的 `nativeModulesMap` 在主线程注册宿主模块 |
| Phase 3a 的 bootstrap 片段 | 在 `lynxviewready` 后赋 `lynxView.globalProps` | **web-core 0.23.1 从不派发 `lynxviewready`**（全包零命中） | `globalProps` 永不送达 → 深浅色与语言的「跟随系统」在 Web 上完全不生效 |
| Phase 3a 的变更事件 | `sendGlobalEvent('…', { theme })` | 读取侧要的键是 `systemTheme`/`systemLocale`，且签名是 `(name, params: Cloneable[])` 数组 | 目前恰好无害（新旧值都解码为全 null 而被早退），但**一旦修好上一条，第一次系统深浅色切换会把 UI 语言重置为英文** —— 两条必须同批修 |
| Phase 4 | 「`<webview>` 是 Lynx 原生元素，在 web-core 中是否可用**需确认**」 | 未确认。实际不可用（未映射标签走恒等回落成 `HTMLUnknownElement`） | 插件页在 Web 上渲染一个无实现的 `<webview>` 而不是 fallback 文案。同源问题让首页 `<refresh>` 的「下拉刷新…」文案变成普通页面内容 |
| Phase 5 | 「添加轻量工具函数 `platform-capabilities.ts`」 | 文件建了，`getPlatformCapabilities()` **全库无调用点**，内部算出的 `isWeb` 也没用上 | Web 上 DLNA 按钮 / 悬浮歌词开关 / 数据导出入口照样渲染，点了静默失败 |
| Phase 6 | 「`package.json` 新增 `build:web`」 | 脚本加了，但宿主页请求 `index.css`/`index.js`，而 prod 产物叫 `client.css`/`client.js`；embedded 分支还漏拷宿主页 | `build:web` 产物黑屏；embedded 嵌进后端后 `/` 仍是旧 Flutter 应用 |
| 「验证」清单 7 条 | 全部是需要人工在浏览器点的项 | 其中「音频正常出声」「深浅色跟随系统」「插件页加载」「入口隐藏」四条**若真跑过就会立刻发现问题** | 计划有验证清单，但未执行到位；教训已写进 `../../AGENTS.md` §3（Web 改动至少跑一次 `build:web` 并打开产物） |

**共同的元教训**（已固化为 `AGENTS.md` §4「平台判断」铁律）：把「当前 realm 有没有某个 DOM 对象」当成「当前平台是不是 Web」。正确信号是 `SystemInfo.platform`（两个 realm 都有），封装为 `isWebPlatform()`。

修复计划见 `../2026-08-14-audit-fix-plan.md`。

---

# 以下为原始计划全文（未修改）

## 背景

Songloft Player Lynx 客户端目前支持 Android 和 iOS 两个平台。`@lynx-js/web-core` 提供了在浏览器中加载 Lynx 渲染 bundle 的能力，`rspeedy dev` 的 dev server 已经内置了 web-core 中间件。需要补齐 Web 平台的音频、平台适配层和部署路径。

## 整体架构

```
web/index.html  ← Web 宿主入口（production 用）
    ↓
<lynx-view url="/main.lynx.bundle">  ← @lynx-js/web-core 渲染 Lynx 元素
    ↓
NativeModules 注入（web-bootstrap.ts）
  ├── SongloftAudio     → WebSongloftAudio (HTMLAudioElement + hls.js + EQ)
  ├── SongloftStorage   → 已存在 (web-storage.ts)
  ├── SongloftPlatform  → openURL + file picker (Web API)
  └── SystemAppearance  → matchMedia + sendGlobalEvent
```

## 实施步骤

### Phase 1: Web 宿主页 + 构建（已具备基础）

**`rspeedy dev` 的 dev server 已内置 web-core 中间件**（`@lynx-js/web-rsbuild-server-middleware`），`pnpm dev` 即可在浏览器中预览。需要确认：

1. 运行 `pnpm dev` 并打开浏览器，确认 bundle 通过 `<lynx-view>` 正常渲染
2. 验证登录、歌曲列表、页面导航等基本功能
3. 记录当前 dev server 的行为（访问地址、需要注入的 globalProps 等）

**production 构建**：创建 `web/index.html` + `web/web-bootstrap.ts` 作为生产宿主页，稍后实现。

### Phase 2: Web 音频实现（核心工作量）

创建 `src/native/web-audio.ts`，实现 `SongloftAudio` 接口。

**修改文件：**
- `src/native/web-audio.ts` ← 新增
- `src/native/audio-facade.ts` ← 增加 `isWebAudioEnvironment()` 分支

**设计：**

```typescript
export class WebSongloftAudio implements SongloftAudio {
  private audio: HTMLAudioElement
  private hls: Hls | null = null    // 用于 HLS 电台
  private eqContext: AudioContext | null = null
  private eqFilters: BiquadFilterNode[] = []
  private mediaSession: MediaSession | null = null
}
```

**功能矩阵：**

| 方法 | Web 实现 |
|------|----------|
| `load(url)` | 普通 URL → `audio.src = url`；`.m3u8` → hls.js |
| `play()/pause()/seek()` | `HTMLAudioElement` 原生方法 |
| `setVolume(0-1)` | `audio.volume` |
| `setSpeed(rate)` | `audio.playbackRate` |
| `setEqEnabled / setEqBands` | Web Audio API `BiquadFilterNode` × 10 段 |
| 状态/进度事件 | `ontimeupdate/onplay/onended/onerror` → 回调 |
| MediaSession | `navigator.mediaSession.metadata` + action handlers |
| 队列管理 | 纯 TS 逻辑（已在 player store 中，无需改动） |

**HLS 支持：** hls.js 已存在于 `songloft-player/web/hls_bridge.js`，可参考其逻辑改为 TypeScript 内联，或直接导入 hls.js npm 包。

**EQ 实现：** 复用 `songloft-player/web/equalizer.js` 的 10 段频率参数（与现有 `EQ_CENTER_FREQS` 一致），用 `BiquadFilterNode` 链。

**状态管理：** `setStateListener` 和 `setProgressListener` 通过 `onplay/onpause/ontimeupdate` 等事件回调实现。

**接入点：** 修改 `resolveAudio()` 在 `isNativeAudioAvailable` 为 false 且 `HTMLAudioElement` 可用时返回 `WebSongloftAudio`。

### Phase 3: Web 平台适配层

#### 3a. 系统外观（深浅色/语言）

`src/native/system-appearance.ts` 当前依赖 `lynx.__globalProps`。Web 上需要注入初始值并通过 `sendGlobalEvent` 推送变更。

在 `web/web-bootstrap.ts` 中：
```typescript
lynxView.globalProps = {
  systemTheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  systemLocale: navigator.language,
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  lynxView.sendGlobalEvent('SongloftSystem.appearanceChanged', {
    theme: e.matches ? 'dark' : 'light'
  })
})
```

#### 3b. 平台功能 Web 实现

创建 `src/native/web-platform.ts`，实现 `openURL`（`window.open`）和 `file picker`（`<input type="file">` + FormData + fetch）。

#### 3c. 响应式布局

`useBreakpoint` 当前使用 Lynx 的 `bindlayoutchange`。`@lynx-js/web-core` 已通过 `ResizeObserver` 桥接了此事件，无需额外改动。

### Phase 4: JS 插件 iframe 适配

**修改文件：** `src/features/jsplugin/pages/PluginWebViewPage.tsx`

Web 端将 `<webview>` 替换为 `<iframe>`，通信方式：
- 入站：`postMessage`（替代 `webview.invoke({ method: 'eval' })`）
- 出站：`window.addEventListener('message', ...)` 接收（替代 `bindmessage`）

注意：`<webview>` 是 Lynx 原生元素，在 web-core 中是否可用需确认。如果不可用，需要条件渲染 `<iframe>`。

### Phase 5: 功能可见性控制

对 Web 不可用的功能隐藏 UI 入口。建议添加轻量工具函数 `src/native/platform-capabilities.ts`。

### Phase 6: 部署对齐

- **Production 构建：** `rspeedy build` 产出 `dist/main.lynx.bundle`，`web/index.html` 通过 `<lynx-view url="/main.lynx.bundle">` 加载
- **Embedded 模式：** 产物复制到 `songloft-player-build/web-embedded/`，与 Go 后端同源部署
- **package.json 新增脚本：** `build:web`、`build:web-embedded`

## 主要文件清单

### 新增文件
- `web/index.html` — Web 宿主入口页
- `web/web-bootstrap.ts` — 初始化逻辑（globalProps、NativeModules 注入）
- `src/native/web-audio.ts` — HTMLAudioElement 实现
- `src/native/web-platform.ts` — Web 平台功能（openURL、file picker）
- `src/native/platform-capabilities.ts` — 平台能力检测

### 修改文件
- `src/native/audio-facade.ts` — 增加 Web 音频分支
- `src/features/jsplugin/pages/PluginWebViewPage.tsx` — iframe 适配
- `package.json` — 新增 build:web 脚本

## 验证

1. `pnpm dev` → 浏览器打开 → 确认登录、歌曲列表、页面导航正常
2. 点击播放按钮 → 音频正常出声（Web Audio）
3. HLS 电台播放验证
4. EQ 开关 + 调节
5. 深浅色跟随系统
6. JS 插件页面加载（iframe 通信）
7. 功能入口（悬浮歌词、DLNA 等）在 Web 上隐藏
