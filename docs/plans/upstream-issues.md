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

## 备注

- Issue 1 的修复最简单（10 行），且与已有的 `onNativeModulesCall` 模式一致，最可能被快速合入
- Issue 2 附带 WHATWG spec 引用，合规性 bug 不容争辩
- `AbortController` 缺失和 `lynx.queueMicrotask` 崩溃暂不提，前者是 feature request 优先级低，后者需先确认最新版是否已修复