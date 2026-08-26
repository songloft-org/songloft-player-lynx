# API 与 Store 设计规范

本文档定义 songloft-player-lynx 项目的接口设计约定，供新增功能和代码评审时对齐。

---

## 1. Store 方法参数约定

### 规则

| 条件 | 风格 | 示例 |
|------|------|------|
| 单参数，标量类型 | 位置参数 | `setVolume(volume)`, `selectPreset(name)` |
| 2 个标量参数，无可选 | 位置参数 | `adjustBand(index, gainDb)` |
| ≥ 3 个参数，或含可选参数 | 对象参数 | `login({ username, password, apiBaseUrl? })` |
| ID + patch 修改 | 位置 ID + 对象 patch | `editProfile(id, { name?, url? })` |

### 已有方法对照

```typescript
// ✅ 位置参数 — 1-2 个必选标量
setVolume(volume: number)
setSpeed(rate: number)
seek(positionMs: number)
adjustBand(index: number, gainDb: number)
selectPreset(name: EqPresetName)
switchTo(id: string)
removeProfile(id: string)

// ✅ 对象参数 — ≥3 个参数或含可选
login(args: LoginArgs)                       // { username, password, apiBaseUrl?, insecureTls? }
addProfile(params: AddProfileParams)         // { name, url, insecureTls? }
playPlaylist(songs, startIndex?, context?)   // 例外：保持位置参数因为历史原因 + 前两个参数使用频率 100%
                                             // 第三参是 PlaybackContext（歌单 或 7 个分面维度），
                                             // 决定这次播放记进哪个播放历史桶；无上下文时省略

// ✅ ID + patch
editProfile(id: string, patch: { name?; url?; insecureTls? })
```

### 何时新建 interface

当对象参数超过 3 个字段、或被多处复用时，抽取命名 interface 到同文件或 `models/` 目录：

```typescript
export interface LoginArgs {
  username: string
  password: string
  apiBaseUrl?: string
  insecureTls?: boolean
}
```

---

## 2. 数值范围约定

| 值域 | Store 层 | Native 层 | 转换位置 |
|------|----------|-----------|----------|
| 音量 | 整数 0-100 | 浮点 0.0-1.0 | `player-store.setVolume` 内部 `÷ 100` |
| 播放速度 | 浮点 0.25-3.0 | 浮点 0.25-3.0 | 直接传递 |
| EQ 频段增益 | 浮点 dB（如 -12 到 +12） | 浮点 dB | 直接传递 |
| 进度 | 毫秒 (ms) | 毫秒 (ms) | 直接传递 |
| 时长 | 秒 (s) — 来自 API | 毫秒 (ms) — 播放器内部 | Song model 用秒，player state 用毫秒 |

**原则：** Store 层使用对 UI 友好的单位（整数百分比、毫秒），Native 层使用系统 API 期望的单位。转换由 store action 在调用 native 前完成。

---

## 3. 命名规范

| 类别 | 规则 | 示例 |
|------|------|------|
| Store hook | `use` + PascalCase + `Store` | `usePlayerStore`, `useAuthStore` |
| Store action | camelCase 动词 | `playSong`, `toggleMute`, `cyclePlayMode` |
| API 响应字段 | snake_case（后端）→ camelCase（前端） | `access_token` → `accessToken` |
| Zod schema | 变量名 = camelCase + `Schema` | `authTokensSchema`, `serverProfileSchema` |
| 解析函数 | `parse` + PascalCase | `parseAuthTokens`, `parsePlaylist` |
| Native 模块 | `Songloft` + PascalCase | `SongloftAudio`, `SongloftStorage` |
| 类型/接口 | PascalCase | `PlayerState`, `ServerProfile`, `LoginArgs` |

---

## 4. 错误处理约定

| 层 | 策略 |
|----|------|
| Store action | try-catch 包裹，`set({ error: messageOf(e) })`，不向上抛出 |
| Native 调用 | `await` + 在 store action 内 catch，best-effort（如 storage 写入失败不阻塞流程） |
| API 调用 | 由 `HttpClient` 抛 `ApiError`，store action 捕获并设 state.error |
| UI | 读 `store.error` 展示，不自行 try-catch |

---

## 5. E2E 测试 — Store 暴露约定

### 暴露位置

`src/e2e-bridge.ts` 中通过 `globalThis.__E2E_*__` 暴露：

```typescript
__E2E_PLAYER_STORE__   // usePlayerStore
__E2E_AUTH_STORE__     // useAuthStore
__E2E_LYRIC_STORE__    // useLyricStore
__E2E_EQ_STORE__       // useEqStore
__E2E_SERVER_STORE__   // useServerStore
__E2E_APP_CONFIG__     // appConfig
__E2E_ROUTER__         // TanStack router instance
```

### 新增 store 暴露规则

1. 仅暴露需要被 E2E 直接操作/读取的 store
2. 命名格式：`__E2E_` + UPPER_SNAKE_CASE + `__`
3. 在 `e2e-bridge.ts` 顶部 import，底部赋值到 `globalThis`

### 测试中的注意事项

- **Lynx BTS 无 `fetch` / `setTimeout`**：HTTP 请求从 Node.js 测试侧发起，不要在 `evaluateJS` 中调用
- **App 实例共享**：所有 scenario 文件共享同一运行中的 app，每个文件 `beforeAll` 需重新 `login()`
- **重建生效**：修改 e2e-bridge 后需 `pnpm run build:android-bundle` + `installDebug`

---

## 6. Mock Server 配置

| 环境变量 | 默认值 | 用途 |
|----------|--------|------|
| `E2E_API_PORT` | `58091` | Mock server 监听端口 |
| `E2E_API_BASE` | `http://localhost:58091` | 测试侧 API 基地址 |
| `E2E_PLATFORM` | `android` | 测试平台选择 |

当外部服务器已占据端口时，mock server 自动跳过启动并打印 warning。测试将直接使用外部服务器。
