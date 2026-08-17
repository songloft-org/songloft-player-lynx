# 上游 Issue 草稿

> 待提交到 Lynx 官方仓库，复制到另一台有 gh 权限的机器上执行。

---

## Issue 1: `nativeModulesMap` 类字段覆盖预升级值

**仓库**: `lynx-family/lynx-stack`
**类型**: Bug Report
**标题**: `[Bug]: LynxViewElement.nativeModulesMap class field overwrites pre-upgrade value`

### 提交流程

```bash
# 1. 获取 System Info
npx envinfo --system --npmPackages '@lynx-js/*' --binaries --npmGlobalPackages 'pnpm'

# 2. 创建 issue
gh issue create \
  --repo lynx-family/lynx-stack \
  --title "[Bug]: LynxViewElement.nativeModulesMap class field overwrites pre-upgrade value" \
  --label "pending triage" \
  --body-file /path/to/issue-1-body.md
```

### issue-1-body.md

```markdown
### System Info

```
<!-- 粘贴 npx envinfo --system --npmPackages '@lynx-js/*' --binaries 的输出 -->
```

### Details

`@lynx-js/web-core` 的 `LynxViewElement` 将 `nativeModulesMap` 声明为裸类字段（无初始值）：

```ts
// packages/web-platform/web-core/src/client/mainthread/LynxView.ts line 74
nativeModulesMap;
```

这等价于构造函数中 `this.nativeModulesMap = undefined`。当用户在 `<lynx-view>` 升级前通过脚本设置 `nativeModulesMap` 时，构造函数会将其静默覆盖为 `undefined`。

**同类中 `onNativeModulesCall` 已经正确处理了这个问题**（lines 270–278），它使用 getter/setter 模式：

```ts
#onNativeModulesCall;
get onNativeModulesCall() { return this.#onNativeModulesCall; }
set onNativeModulesCall(handler) {
  this.#onNativeModulesCall = handler;
  // drain cached calls ...
}
```

`nativeModulesMap` 应使用相同的模式。

**影响**：所有通过 `nativeModulesMap` 注册的自定义原生模块全部丢失。Worker 端 `NativeModules` 只剩 web-core 自带的 `bridge` 和 `LynxExposureModule`。用户看不到任何错误——`Promise.all` 对空 map 成功返回。这导致剪贴板写入、文件选择器、自定义音频模块全部静默失效。

**建议修复**（10 行改动）：

```diff
-    nativeModulesMap;
+    #nativeModulesMap;
+    get nativeModulesMap() {
+        return this.#nativeModulesMap;
+    }
+    set nativeModulesMap(val) {
+        this.#nativeModulesMap = val;
+    }
```

该 bug 在 0.23.1 和 0.24.1（latest）中均存在。

### Reproduce Steps

1. 创建 host 页面，在 `<lynx-view>` 升级前设置 `nativeModulesMap`：

```html
<lynx-view id="app"></lynx-view>
<script>
  document.getElementById('app').nativeModulesMap = {
    MyModule: '/my-module.js',
  };
</script>
<script type="module" src="/web-core/static/js/client.js"></script>
```

2. 在 worker 中打印 `NativeModules`
3. 观察：`MyModule` 不存在，`nativeModulesMap` 为 `undefined`
```

---

## Issue 2: `clearTimeout(undefined)` 抛异常

**仓库**: `lynx-family/lynx`
**类型**: Bug Report
**标题**: `[Bug]: clearTimeout(undefined) throws TypeError instead of being a no-op`

### 提交流程

```bash
# 1. 获取 System Info
npx envinfo --system --npmPackages '@lynx-js/*' --binaries --npmGlobalPackages 'pnpm'

# 2. 创建 issue
gh issue create \
  --repo lynx-family/lynx \
  --title "[Bug]: clearTimeout(undefined) throws TypeError instead of being a no-op" \
  --label "pending triage" \
  --body-file /path/to/issue-2-body.md
```

### issue-2-body.md

```markdown
### System Info

```
<!-- 粘贴 npx envinfo --system --npmPackages '@lynx-js/*' --binaries 的输出 -->
```

### Details

Lynx 4.0 中 `clearTimeout(undefined)` 抛出异常：

```
TypeError: param 0 should be Number
```

根据 [WHATWG HTML Standard](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers)：

> If handle is not provided, the clearTimeout() method call does nothing.

所有其他 JavaScript 运行时行为一致：

| 运行时 | `clearTimeout(undefined)` 行为 |
|--------|-------------------------------|
| Chrome | no-op |
| Firefox | no-op |
| Safari | no-op |
| Node.js | no-op |
| Deno | no-op |
| Bun | no-op |
| **Lynx 4.0** | **TypeError** |

**影响**：破坏所有传递可选 timer ID 的第三方库。例如 TanStack Router 的 `offerPending` 函数：

```ts
clearTimeout(session?.[3]); // undefined when session is null
```

目前需要 patch 每个受影响的库来包裹 `clearTimeout` 调用。

**建议修复**：在 `clearTimeout` 入口加类型守卫：

```cpp
// pseudo-code
if (!handle || typeof handle !== 'number') return;
```

### Reproduce Steps

1. 在 Lynx 4.0 环境中执行：
```js
clearTimeout(undefined);
```
2. 观察：抛出 `TypeError: param 0 should be Number`
3. 期望：无操作（no-op）
```

---

## 备注

- Issue 1 的修复最简单（10 行），且与已有的 `onNativeModulesCall` 模式一致，最可能被快速合入
- Issue 2 附带 WHATWG spec 引用，合规性 bug 不容争辩
- `AbortController` 缺失和 `lynx.queueMicrotask` 崩溃暂不提，前者是 feature request 优先级低，后者需先确认最新版是否已修复