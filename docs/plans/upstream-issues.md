# 上游 Issue 跟踪

> 已提交到 Lynx 官方仓库。修复合入后需移除对应的本地 patch。

---

## Issue 1: `nativeModulesMap` 类字段覆盖预升级值

- **链接**: https://github.com/lynx-family/lynx-stack/issues/3559
- **仓库**: `lynx-family/lynx-stack`
- **标签**: `pending triage`
- **状态**: 已提交，等待 triage

### 当前 workaround

`patches/@lynx-js__web-core@0.23.1.patch` — 对 `dist/client/mainthread/LynxView.js` 应用了与建议修复完全相同的 diff（private field + getter/setter）。

### 上游修复后需执行

1. 升级 `@lynx-js/web-core` 到包含修复的版本
2. 删除 `patches/@lynx-js__web-core@0.23.1.patch`
3. 运行 `pnpm install` 重新应用 patch 列表
4. 验证 `nativeModulesMap` 在 `<lynx-view>` upgrade 前设置后不丢失

### 提交内容摘要

`LynxViewElement` 将 `nativeModulesMap` 声明为裸 TS 类字段（无初始值，等价于 `this.nativeModulesMap = undefined`），覆盖了用户在 `<lynx-view>` upgrade 前设置的值。同类的 `onNativeModulesCall` 已用 private field + getter/setter 模式正确处理了此问题。

- 源码位置: `packages/web-platform/web-core/ts/client/mainthread/LynxView.ts` line 99
- `onNativeModulesCall` 参考实现: lines 309–325
- 影响版本: 0.23.1, 0.24.1

---

## Issue 2: `clearTimeout(undefined)` 抛异常

- **链接**: https://github.com/lynx-family/lynx/issues/8641
- **仓库**: `lynx-family/lynx`
- **标签**: `type:bug`, `status:need triage`
- **状态**: 已提交，等待 triage

### 当前 workaround

Lynx 引擎层的 bug，无法直接 patch Lynx 本身。目前通过两个途径规避：

1. `patches/@tanstack__router-core@1.171.18.patch` — 对 TanStack Router 的 `clearTimeout` 调用点加 `typeof id === 'number'` 守卫（同时修复了 `self` 引用问题）
2. 其他第三方库如遇同样问题，需类似 patch

### 上游修复后需执行

1. 升级 Lynx 到包含修复的版本
2. 检查 `patches/@tanstack__router-core@1.171.18.patch` 中 `self` 修复是否仍需保留（与 clearTimeout 无关的部分）
3. 移除 patch 中 `__safeClearTimeout` 相关代码，或整体删除 patch（如果 TanStack Router 升级后不再需要）
4. 运行 `pnpm install` 重新应用 patch 列表

### 提交内容摘要

Lynx 4.0 中 `clearTimeout(undefined)` 抛出 `TypeError: param 0 should be Number`，而 WHATWG 标准及所有主流运行时（Chrome/Firefox/Safari/Node.js/Deno/Bun）均将其视为 no-op。这破坏了所有传递可选 timer ID 的第三方库。

---

## Issue 3: web-core 事件分发对已卸载的 `currentTarget` 无守卫，TypeError 穿透 wasm 摧毁整棵元素树

- **仓库**: `lynx-family/lynx-stack`
- **组件**: `@lynx-js/web-core`（主线程 WASM 事件分发）
- **影响版本**: 0.23.1（上游 main 分支同未修，含后来新增的 `runElementClosure` 同样无守卫）
- **状态**: 本地已修复（双层 patch），待提 issue

### 现象与根因

Web 上任意带 `global-bind*` 的元素（如 `VerticalSlider` 的 `global-bindmouseup`）卸载后，元素在 flush 时离开 wasm DOM 注册表，但它的 EventInfo 要到**下一次** flush 的 `gc()` 才被清理。这个窗口期里落在任何存活元素上的同型事件，会让 Rust 分发器回调 `publishEvent(target=存活元素, currentTarget=已卸载元素)`——而 `generateTargetObject(currentTarget)` 没有 undefined 守卫（只守卫了 `target ?? currentTarget`）：

```
TypeError: Cannot read properties of undefined (reading 'Symbol(uniqueId)')
    at o.generateTargetObject  ← eventObject.currentTarget = this.generateTargetObject(currentTarget, …)
    at o.publishEvent
```

这个 TypeError 穿越 wasm 边界，污染 wasm-bindgen 的 externref 借用状态：之后每次 `__FlushElementTree` 的 `gc()` / `take_timing_flags()` 全部抛 `recursive use of an object detected which would lead to unsafe aliasing in rust`，最终一次 flush 彻底失败把整棵元素树清空（页面全白、零后续报错）。浏览器实测可稳定复现（音量弹层开→拖→关→微任务时序 mouseup）。

### 当前 workaround

双层修复（两层都要在，闸门 `src/__tests__/web-host-page.test.ts` 锁住）：

1. `patches/@lynx-js__web-core@0.23.1.patch` — `dist/client/mainthread/elementAPIs/WASMJSBinding.js` 的 `runWorklet` / `publishEvent` 改为 `if (!resolvedTarget || !currentTarget) return;`（没有注册者就没有 handler，丢弃事件；dev-middleware 路径）
2. `scripts/patch-web-core-client.mjs`（postinstall）— 对 `client_prod` 的 `web-core-main-chunk.js` 做同语义的压缩态字符串替换 `A=a??o;A&&(` → `A=a??o;A&&o&&(`、`s=o??A;s&&(` → `s=o??A;s&&A&&(`（serve.mjs / build:web 路径）

### 上游修复后需执行

1. 升级 `@lynx-js/web-core` 到含守卫的版本
2. 从 patch 文件与 postinstall 脚本中移除对应替换（注意保留 `nativeModulesMap` 部分，直到 Issue 1 也合入）
3. `pnpm install` 后确认闸门测试对旧形态不再断言失败（守卫改为上游提供后，删除两个闸门 test）

### 附带发现（本地已修）

排查中发现 `serve.mjs` / `copy-bundle-web.mjs` / `patch-web-core-client.mjs` 用 `readdirSync(.pnpm).find(startsWith)` 选 web-core 目录——patch 更新后多个 `patch_hash` 目录共存，`find` 拿到的第一个不一定是 symlink 实际指向的，导致 postinstall 把替换打进了无效目录（本次实际发生过）。三处已统一改为 `realpathSync(node_modules/@lynx-js/web-core)` 解析。

---

## 备注

- Issue 1 的修复最简单（10 行），且与已有的 `onNativeModulesCall` 模式一致，最可能被快速合入
- Issue 2 附带 WHATWG spec 引用，合规性 bug 不容争辩
- `AbortController` 缺失和 `lynx.queueMicrotask` 崩溃暂不提，前者是 feature request 优先级低，后者需先确认最新版是否已修复