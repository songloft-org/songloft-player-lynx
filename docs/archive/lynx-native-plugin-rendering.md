# 计划：Lynx 原生插件渲染

## Context

当前 Lynx 版 JS 插件使用系统 WebView（native）或 iframe（Web）渲染 HTML 内容。Flutter 版支持 WebView/WebF 双模，WebF 将 HTML/CSS/JS 直接渲染到 Flutter 管线中，消除了平台视图的各种问题。

本方案在 Lynx 版实现类似能力：插件以 ReactLynx 编写、编译为 `.lynx.bundle`，运行时通过 `<frame>` 元素加载——在 native 上是 Lynx 原生渲染，在 Web 上映射为嵌套 `<lynx-view>`。

**关键发现**：Lynx 的 `<frame>` 元素（since 3.4）在 native 上直接加载远程 bundle 作为子页面；在 Web 上映射为嵌套 `<lynx-view>` 自定义元素（完整的独立 Lynx 运行时），均可加载远程 `.lynx.bundle`。

---

## 架构总览

三种渲染模式由 `plugin.json` 的 `renderEngine` 字段选择：

| `renderEngine` | Native | Web |
|---|---|---|
| `"webview"`（默认） | 系统 WebView | iframe（`webview-host.js`） |
| `"webf"` | WebF（仅 Flutter 版） | — |
| **`"lynx"`（新增）** | **`<frame src=...>`** | **嵌套 `<lynx-view>`（`lynx-frame-host.js`）** |

路由不变（`/plugin/$entryPath`），`PluginWebViewPage` 内部根据 `renderEngine` 分流。

---

## 通信设计

`<frame>` 没有 `bindmessage` 事件，需要通过 NativeModule 建立双向通道：

### Native 路径

```
Parent Page
  │
  ├─ registerHost(frameId)
  │    └─ SongloftPluginBridge (NativeModule, static registry)
  │
  ├─ <frame src="bundle" global-props={frameId, theme}>
  │    └─ Child Frame
  │         └─ calls NativeModules.SongloftPluginBridge.hostCall(frameId, callId, ns, method, params)
  │              └─ Module dispatches to parent via sendGlobalEvent('SongloftPluginBridge.hostCall')
  │
  └─ Parent receives event → handlePluginHostCall → hostReply(frameId, callId, result)
       └─ Module dispatches to child via sendGlobalEvent('SongloftPluginBridge.hostReply')
```

### Web 路径

```
Parent Worker
  │
  ├─ NativeModules.SongloftLynxFrame.open(bundleUrl, selector, globalProps)
  │    └─ lynx-frame-host.js (main thread):
  │         ├─ 创建嵌套 <lynx-view url="..." nativeModulesMap={bridge}>
  │         └─ 拦截 child 的 bridge 调用 → sendGlobalEvent 转发给 parent Worker
  │
  └─ Parent receives GlobalEvent → handlePluginHostCall → reply via sendEvent
       └─ lynx-frame-host.js → child.sendGlobalEvent(...)
```

---

## 实现步骤

### Phase 1: 后端（最小改动）

**文件**: `internal/jsplugin/plugin.go`

```go
const RenderEngineLynx = "lynx"

func IsValidRenderEngine(v string) bool {
    switch v {
    case "", RenderEngineWebView, RenderEngineWebF, RenderEngineLynx:
        return true
    }
    return false
}
```

无需 DB 迁移（`render_engine` 列已是 TEXT）。静态文件 serve 已支持任意文件（`.lynx.bundle` 直接可用）。

---

### Phase 2: Native Bridge Module（Android + iOS + HarmonyOS）

**新文件**:
- `android/app/.../plugin/SongloftPluginBridgeModule.kt`
- `ios/SongloftLynx/SongloftPluginBridgeModule.swift`
- `harmony/entry/.../modules/plugin/SongloftPluginBridgeModule.ets`

**接口契约**（三平台一致）：

```typescript
interface SongloftPluginBridge {
  // 父页面调用
  registerHost(frameId: string): void
  unregisterHost(frameId: string): void
  hostReply(frameId: string, callId: string, resultJson: string): void
  pushToChild(frameId: string, eventName: string, dataJson: string): void
  
  // 子 frame 调用
  registerChild(frameId: string): void
  hostCall(frameId: string, callId: string, ns: string, method: string, paramsJson: string): void
}
```

**设计要点**：
- 使用 companion/static 级别的 `ConcurrentHashMap<frameId, LynxContext>` 作为注册表
- 父子各自调用 `registerHost`/`registerChild`，module 通过 `sendGlobalEvent` 跨 context 转发
- `frameId` 由父页面生成，通过 `global-props` 传给子 frame

**注册**：按现有模块注册模式（`SongloftApplication.registerModule` / `buildConfig().register` / `EntryAbility.modules.set`）

**闸门更新**：`src/__tests__/native-module-contract.test.ts` 新增 SongloftPluginBridge 模块验证

---

### Phase 3: 客户端渲染分支

**修改**: `src/features/jsplugin/pages/PluginWebViewPage.tsx`

在现有组件中根据 `renderEngine` 分流：

```tsx
const plugin = plugins?.find(p => p.entryPath === entryPath)
const engine = plugin?.renderEngine

if (engine === 'lynx') {
  return isWebPlatform()
    ? <WebLynxPluginFrame entryPath={entryPath} isTabEntry={isTabEntry} />
    : <LynxPluginFrame entryPath={entryPath} isTabEntry={isTabEntry} />
}
// 现有 webview/iframe 路径...
```

**新文件**: `src/features/jsplugin/widgets/LynxPluginFrame.tsx`（native 路径）

```tsx
function LynxPluginFrame({ entryPath, isTabEntry }: Props) {
  const frameId = useRef(`frame-${entryPath}-${Date.now()}`).current
  const bundleUrl = buildLynxBundleUrl(entryPath) // .../static/main.lynx.bundle
  const theme = useAppTheme()

  // 1. registerHost on mount, unregisterHost on unmount
  // 2. Listen GlobalEventEmitter('SongloftPluginBridge.hostCall') → handlePluginHostCall → hostReply
  // 3. Subscribe playerStore → pushToChild('playerState', stateJson) on signature change
  // 4. Push theme changes via global-props update

  return (
    <frame
      src={bundleUrl}
      global-props={{ frameId, theme, hostVersion: '1.0.0' }}
      className="plugin-webview__frame"
      bindload={onLoad}
    />
  )
}
```

**新文件**: `src/features/jsplugin/widgets/WebLynxPluginFrame.tsx`（Web 路径）

镜像 `WebPluginFrame` 结构，驱动 `NativeModules.SongloftLynxFrame`：

```tsx
function WebLynxPluginFrame({ entryPath, isTabEntry }: Props) {
  const frameModule = getLynxFrameModule()
  // mount: frameModule.open(bundleUrl, '#plugin-lynx-placeholder', globalPropsJson)
  // bridge handlers: receive hostCall → handlePluginHostCall → reply
  // player state subscription → frameModule.sendEvent('playerState', json)
  // unmount: frameModule.close()

  return <view id="plugin-lynx-placeholder" className="plugin-webview__frame" />
}
```

**Bundle URL 构建**：

```typescript
function buildLynxBundleUrl(entryPath: string): string {
  const base = `${appConfig.baseUrl}${appConfig.basePath}`
  const bundle = isWebPlatform() ? 'main.web.bundle' : 'main.lynx.bundle'
  return `${base}/api/v1/jsplugin/${entryPath}/static/${bundle}`
}
```

---

### Phase 4: Web Bridge

**新文件**: `web/lynx-frame-host.js`

镜像 `webview-host.js` 结构：
- 在 `lynxView.nativeModulesMap` 注册 `SongloftLynxFrame` 模块
- `open(bundleUrl, selector, globalPropsJson)`: 在 shadow root 中创建嵌套 `<lynx-view>`，设置 url + globalProps + 定位
- 配置子 `<lynx-view>` 的 `nativeModulesMap` 包含 `SongloftPluginBridge`（一个转发所有调用到父 Worker 的简单模块）
- `sendEvent(name, dataJson)`: 向子 `<lynx-view>` 发送 `sendGlobalEvent`
- `close()`: 销毁嵌套 `<lynx-view>`
- 子→父消息通过 `sendGlobalEvent('SongloftLynxFrame.message', ...)` 转发

**新文件**: `web/songloft-lynx-bridge-module.js`

子 `<lynx-view>` 的 NativeModule ESM，暴露 `hostCall`/`registerChild` 方法，实际通过 parent `lynx-frame-host.js` 的拦截回调向上转发。

**新文件**: `src/native/web-lynx-frame.ts`

Worker 侧 facade（镜像 `web-webview.ts`）：

```typescript
export interface LynxFrameModule {
  readonly available: boolean
  open(bundleUrl: string, selector: string, globalPropsJson: string): void
  updateGlobalProps(json: string): void
  sendEvent(name: string, dataJson: string): void
  close(): void
}

export function getLynxFrameModule(): LynxFrameModule
export function setLynxFrameBridgeHandlers(handlers: { onMessage: (payload: string) => void } | null): void
```

**`web/index.html` 变更**：在 `webview-host.js` 之后添加 `<script defer src="/lynx-frame-host.js">`

---

### Phase 5: 插件 SDK

**新 npm 包**: `plugin-toolchain/packages/lynx-plugin-sdk/`

为在 `<frame>` 内运行的 ReactLynx 插件提供宿主通信能力：

```typescript
// @songloft/lynx-plugin-sdk
export function invokeHost(ns: string, method: string, params?: object): Promise<unknown>
export function usePlayerState(): PlayerState
export function useTheme(): 'light' | 'dark'
export function onPlayerStateChange(cb: (state: PlayerState) => void): () => void
export function onThemeChange(cb: (theme: string) => void): () => void

// 底层：通过 NativeModules.SongloftPluginBridge 通信
// frameId 从 lynx.__globalProps.frameId 读取
// Reply 监听 GlobalEventEmitter('SongloftPluginBridge.hostReply')
// State 推送监听 GlobalEventEmitter('SongloftPluginBridge.push')
```

---

### Phase 6: 工具链变更

**`plugin-toolchain/packages/plugin-builder/src/manifest.ts`**:
```typescript
const VALID_RENDER_ENGINES = ['webview', 'webf', 'lynx']
```

**`plugin-toolchain/packages/plugin-builder/src/build.ts`**:
- 当 `manifest.renderEngine === 'lynx'` 时，在 `frontend/` 内执行 rspeedy build
- 产物为 `static/main.lynx.bundle` + `static/main.web.bundle`（双环境）
- QuickJS 后端（`src/main.ts`）仍走 esbuild，与渲染引擎无关

**`plugin-toolchain/packages/create-songloft-plugin/src/index.ts`**:
- 新增模板选项 `'lynx'`
- 新建 `templates/with-lynx/` 目录：
  - `frontend/src/App.tsx` — ReactLynx 入口
  - `frontend/lynx.config.ts` — rspeedy 配置
  - `frontend/package.json` — 依赖 `@lynx-js/react`, `@lynx-js/rspeedy`, `@songloft/lynx-plugin-sdk`
  - `plugin.json` — `"renderEngine": "lynx"`

---

### Phase 7: 状态/主题同步

| 数据 | Native | Web |
|------|--------|-----|
| 初始主题 | `global-props.theme` | `globalProps.theme` on nested `<lynx-view>` |
| 主题切换 | 更新 `<frame>` 的 `global-props` | `lynx-frame-host.js` 调 `child.updateGlobalProps()` |
| 初始播放状态 | mount 后首次 `pushToChild('playerState', ...)` | 同 |
| 播放状态变更 | `pushToChild('playerState', stateJson)` 按 signature 节流 | `sendEvent('playerState', stateJson)` |
| Host info | `global-props.hostVersion` | 同 |

子 frame 内 SDK 通过 `GlobalEventEmitter` 监听 `SongloftPluginBridge.push` 事件分发给订阅者。

---

## Flutter 兼容：一份代码全平台运行（方案 C）

### 核心思路

Lynx 构建天然产出 `main.lynx.bundle`（native）+ `main.web.bundle`（web）。web-core 可以在**任何浏览器/WebView** 中渲染 `.web.bundle`（通过 `<lynx-view>` 自定义元素）。因此 Lynx 插件同时兼容 Flutter 客户端——后者通过 WebView 加载一个包含 web-core 的 `index.html`。

### 插件产物结构

```
static/
  main.lynx.bundle      ← Lynx native 客户端直接加载
  main.web.bundle       ← Lynx Web 客户端 + Flutter WebView 用
  index.html            ← 薄壳 HTML（工具链自动生成，嵌入 web-core 引用 + bridge shim）
```

### 各客户端渲染路径

| 客户端 | renderEngine 解析 | 加载方式 | 渲染方式 |
|--------|-----------------|---------|---------|
| Lynx native | `"lynx"` → frame | `<frame src=".../main.lynx.bundle">` | Lynx 原生管线 |
| Lynx Web | `"lynx"` → lynx-frame | 嵌套 `<lynx-view url=".../main.web.bundle">` | web-core |
| Flutter | `"lynx"` 回落为 webView | WebView 打开 `.../index.html` | web-core in WebView |

### `index.html`（工具链自动生成）

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
  <link href="/api/v1/jsplugin-assets/web-core/static/css/client.css" rel="stylesheet">
  <style>html,body{margin:0;height:100%;overflow:hidden}lynx-view{width:100vw;height:100vh;display:block}</style>
</head>
<body>
  <lynx-view id="plugin-view" url="./main.web.bundle"></lynx-view>
  <script type="module" src="/api/v1/jsplugin-assets/web-core/static/js/client.js"></script>
  <script type="module" src="/api/v1/jsplugin-assets/lynx-plugin-bridge-shim.js"></script>
</body>
</html>
```

### 桥接自动适配

插件 SDK 统一使用 `NativeModules.SongloftPluginBridge`，不同环境由不同实现支撑：

| 运行环境 | SongloftPluginBridge 实现 |
|---------|--------------------------|
| Lynx native（`<frame>`内） | 真正的 NativeModule（Kotlin/Swift/ArkTS，Phase 2 实现） |
| Lynx Web（嵌套 `<lynx-view>`内） | `lynx-frame-host.js` 注入到 child 的 nativeModulesMap |
| Flutter WebView / 任何浏览器 | `lynx-plugin-bridge-shim.js` 注入到 `<lynx-view>` 的 nativeModulesMap |

### `lynx-plugin-bridge-shim.js`（后端共享资源）

在 `<lynx-view>` 加载前，拦截其 `nativeModulesMap` 注入 `SongloftPluginBridge`：

```javascript
// 等待 <lynx-view> 自定义元素定义
customElements.whenDefined('lynx-view').then(() => {
  const lv = document.getElementById('plugin-view')
  lv.nativeModulesMap = {
    SongloftPluginBridge: (lynxView) => ({
      // 子 frame 调用 hostCall → 转为 common.js 的 postMessage 协议
      hostCall(frameId, callId, ns, method, paramsJson) {
        const id = callId
        const msg = { type: 'songloft-host-call', id, ns, method, params: JSON.parse(paramsJson) }
        window.parent.postMessage(msg, '*')  // embed in iframe
        // OR: flutter_inappwebview.callHandler('songloftHost', ...)
      },
      registerChild() { /* no-op in shim */ },
    })
  }

  // 收到宿主 reply → 转发给 <lynx-view> 内的插件
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'songloft-host-reply') {
      lv.sendGlobalEvent('SongloftPluginBridge.hostReply', [{
        callId: e.data.id,
        result: JSON.stringify({ ok: e.data.ok, data: e.data.data, error: e.data.error })
      }])
    }
    if (e.data?.type === 'songloft-player-state') {
      lv.sendGlobalEvent('SongloftPluginBridge.push', [{
        event: 'playerState', data: JSON.stringify(e.data.state)
      }])
    }
    if (e.data?.type === 'songloft-theme') {
      lv.updateGlobalProps({ theme: e.data.theme })
    }
  })
})
```

### 后端共享资源新增

在 `/api/v1/jsplugin-assets/web-core/` 下 serve `@lynx-js/web-core/dist/client_prod/static/` 全部内容：

- `css/client.css` (2.4 KB)
- `js/client.js` (44 KB) + `js/async/*.js` (~375 KB)
- `wasm/*.module.wasm` (~220 KB, 二选一)
- 总计 ~620 KB，所有 Lynx 插件共享，可设 `Cache-Control: public, max-age=31536000, immutable`

**实现**：Go 后端 `internal/jsplugin/routes.go` 新增 route，从嵌入的（或磁盘上的）web-core 静态文件 serve。

### COEP/COOP Headers

web-core 需要 `Cross-Origin-Embedder-Policy` 和 `Cross-Origin-Opener-Policy` 支持 SharedArrayBuffer。后端已对插件 HTML 设置 `credentialless`。调研发现当前版本所有 RPC endpoint 都是 `isSync: false`，**可能**不严格依赖 SharedArrayBuffer，需实测验证。若需要，升级插件页 headers 为：
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

---

## 验证方案

### 自动化测试

1. **单元测试** `src/features/jsplugin/__tests__/plugin-lynx-frame.test.tsx`:
   - Mock `NativeModules.SongloftPluginBridge`
   - 验证 mount/unmount 注册/注销
   - 验证 hostCall → handlePluginHostCall → hostReply 流程
   - 验证 playerState push 触发

2. **合约闸门** `src/__tests__/native-module-contract.test.ts`:
   - 新增 SongloftPluginBridge 模块三平台验证

3. **Manifest 验证** `plugin-toolchain/.../manifest.test.ts`:
   - `'lynx'` 被 validateManifest 接受

### 手动验证

1. 创建一个 `renderEngine: "lynx"` 的测试插件（显示 "Hello from Lynx Plugin" + 一个播放按钮）
2. 通过上传 API 安装
3. Android 真机：导航到 `/plugin/test-lynx`，确认原生渲染、点击播放按钮触发宿主播放
4. Web `pnpm run web:dev`：确认嵌套 `<lynx-view>` 渲染正确
5. 切换主题：插件跟随切换
6. 退出插件页：确认无内存泄漏（bridge 注册表清空）

---

## 风险与待解决问题

| 风险 | 影响 | 缓解 |
|------|------|------|
| `<frame>` native 上 `global-props` 更新是否反应式传播 | 主题/状态推送可能不工作 | 验证 demo；若不反应式则全走 NativeModule push |
| Web 嵌套 `<lynx-view>` 开销大（Worker + WASM） | 多插件 tab 性能 | `lynxGroupId` 共享 Worker（后续优化） |
| HarmonyOS module 注册是 per-view 而非 global | Bridge 不可达 | 在 child frame 创建时显式注入 module |
| `<frame>` 在当前项目的 Lynx Engine 版本未验证 | 可能 API 不存在 | Phase 0: 写最小 demo 先跑通 |
| 插件生态分裂（HTML 插件 vs Lynx 插件） | 维护负担 | 长期收敛到 Lynx 模式；过渡期并存 |

**建议 Phase 0（验证）**：在实施前先写一个最小 `<frame src="remote-bundle">` demo，确认：
1. Native 上 bundle 加载成功
2. `global-props` 变更可传播
3. Web 上嵌套 `<lynx-view>` 正常工作
4. 双向通信（NativeModule 注册表方案）可行
