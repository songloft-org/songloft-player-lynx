# E2E 测试执行 — 问题记录

> **时效说明（2026-08-14 复核）**：本文件是 **2026-08-13 那一次** E2E 全量执行的现场记录，**不是**持续维护的缺陷清单——下方各条没有状态标记，读时不要当成「仍然存在」。
>
> 已核实转化为正式约定的两条：**问题 1**（音量 store 层 0-100 整数 / native 层 0-1 浮点）已写入 [`../docs/reference/api-design-conventions.md`](../docs/reference/api-design-conventions.md)；**问题 4**（`addProfile` 参数风格）已改为对象参数（`server-store.ts:25`），同规范也已固化「≥3 个或含可选参数用对象参数」。
>
> 当前**仍未修复**的缺陷清单见 [`../docs/tracking/bug.md`](../docs/tracking/bug.md)，修复排期见 [`../docs/plans/2026-08-14-audit-fix-plan.md`](../docs/plans/2026-08-14-audit-fix-plan.md)。

## 执行概要

- **测试文件**: 27 个（26 passed, 1 iOS-only skipped）
- **测试用例**: 110 个（107 passed, 3 iOS skipped）
- **平台**: Android emulator (emulator-5554)
- **后端**: 真实 songloft 服务器 (localhost:58091)
- **耗时**: ~100s 全量运行

---

## 发现的问题

### 问题 1: Volume API 使用 0-100 整数刻度，非 0-1 浮点

**文件**: `src/features/player/store/player-store.ts:284`

**现象**: `setVolume(0.5)` 实际被 `Math.round()` 后设置为 `1`（而非预期的 50%音量）。

**影响**: 任何 UI 或外部集成使用 0-1 浮点数调用 `setVolume` 都会得到错误结果。

**建议**: 统一约定为 0-100 整数，或在 store 层接受两种格式（检测 ≤1 的值自动乘 100）。

---

### 问题 2: Lynx BTS 环境无 `fetch` / `setTimeout` 全局对象

**文件**: Lynx runtime 限制

**现象**: 在 `evaluateJS` 中调用 `fetch(...)` 或 `setTimeout(...)` 会抛 `ReferenceError`。

**影响**: 
- E2E 测试不能在 app JS 上下文内直接发起 HTTP 请求
- 不能使用标准定时器 API

**解决方案**: 
- HTTP 请求改为从 Node.js 测试侧（vitest 进程）发起
- 延时使用 app 内部的 `lynx.setTimeout` 或从测试侧 `driver.sleep()` 控制

---

### 问题 3: `__E2E_ROUTER__` 需要重新构建才能生效

**文件**: `src/e2e-bridge.ts`

**现象**: 新增的 store 暴露（router, lyricStore, eqStore, serverStore）需要重新 `build:android-bundle` + `installDebug` 才能在运行中的 app 访问到。

**影响**: 开发中修改 e2e-bridge 后需要完整重建流程（~20s build + ~20s install），无法热重载。

**建议**: 可考虑在 e2e-bridge 中支持动态注册（通过 eval 注入 store 引用），但安全性需评估。

---

### 问题 4: `addProfile` 使用位置参数非对象参数

**文件**: `src/features/settings/store/server-store.ts:84`

**签名**: `addProfile(name: string, url: string, insecureTls?: boolean)`

**现象**: 传入 `{ name, url, ... }` 对象会导致 `url.trim()` 中 url 为 undefined。

**影响**: 与其他 store 方法（如 `login({ username, password })`）风格不一致。

**建议**: 如果后续需要扩展参数（如 username/password），考虑改为对象参数风格。

---

### 问题 5: audio-completion 测试在长歌曲下易超时

**文件**: `e2e/scenarios/audio-completion.scenario.ts`

**现象**: 使用真实服务器时歌曲时长 45s（mock 仅 3s），seek 到末尾后等待自动切歌的超时需要设更大值。当多个测试文件共享同一 app 实例，音频资源反复加载/释放可能导致缓冲延迟增加。

**影响**: 在 CI 中可能间歇性失败（flaky）。

**建议**: 
- 超时已从 8s 提升至 15s
- 更好的方案是确保测试使用短时长 mock 音频（通过 mock server 优先于真实服务器启动）

---

### 问题 6: Mock 服务器与真实服务器端口冲突

**文件**: `e2e/fixtures/mock-server.ts`

**现象**: 真实 songloft 服务器占据 58091 端口时，mock server 检测到端口被占用后跳过启动。测试实际运行在真实服务器上。

**影响**: 
- 测试数据不确定（依赖真实库内容）
- 无法控制边界条件（如空列表、错误响应）
- 真实服务器的 API 响应格式字段名可能与 mock 不同（如 `total_songs` vs `songCount`）

**建议**: 
- Mock server 使用不同端口（如 58092）并在 e2e-bridge 启动时强制覆盖 `resolvedBaseUrl`
- 或在 globalSetup 中检测并杀死占用进程

---

### 问题 7: 测试间共享 app 实例导致状态泄漏

**现象**: 所有 scenario 文件共享同一个运行中的 app 进程。一个文件的 `logout()` 会影响后续文件的认证状态。

**影响**: 
- 文件执行顺序会影响测试结果
- 需要每个 scenario 在 `beforeAll` 中重新 `login()`

**建议**: 这是有意设计（`fileParallelism: false`），但可考虑在 `createDriver().launch()` 中加入自动认证恢复逻辑。

---

### 问题 8: login 响应字段不一致

**文件**: `e2e/fixtures/responses/login.json`

**现象**: Mock 返回 `{ token: "..." }`，但 auth store 期望 `{ access_token, refresh_token, expires_in }`（由 zod schema 验证）。

**影响**: 如果未来测试需要使用 mock server（而非真实服务器），login 会因 schema 验证失败。

**建议**: 更新 `e2e/fixtures/responses/login.json` 为正确格式：
```json
{
  "access_token": "e2e-test-jwt-token",
  "refresh_token": "e2e-refresh-token",
  "expires_in": 604800,
  "token_type": "Bearer"
}
```

---

## 无问题的功能区域

以下功能经测试验证工作正常：

- ✅ 认证流程（登录/登出/状态管理）
- ✅ TanStack Router 导航（所有 20+ 路由正确注册和切换）
- ✅ 播放器核心（播放/暂停/seek/上下首/模式切换）
- ✅ 倍速播放（0.25x-3x 范围限制正确）
- ✅ 播放队列管理（加载/切换/清空）
- ✅ 播放模式（顺序/循环/单曲循环）
- ✅ 错误处理（无效 URL → error 状态 → 可恢复）
- ✅ 均衡器（开关/预设/自定义频段/重置）
- ✅ 多服务器管理（添加/删除 profile）
- ✅ 歌词加载（正常歌曲/无歌词歌曲均处理得当）
- ✅ 收藏功能（添加/查询/移除）
- ✅ 所有设置子页面路由可达
