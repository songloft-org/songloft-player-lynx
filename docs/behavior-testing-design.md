# 自动化行为测试设计

## 目标

在 Android/iOS 真机或模拟器上运行端到端行为测试，验证原生模块（Audio、Storage、Platform、SystemAppearance）与 Lynx TS 层之间的契约在真实运行时环境下正确工作。测试用例跨平台复用，一套定义双端执行。

## 设计原则

1. **可复用的测试定义** — 测试场景用平台无关的 JSON/TS DSL 描述，驱动层按平台适配
2. **分层覆盖** — 契约测试 → 行为场景 → 集成冒烟，复用度从高到低
3. **最小侵入** — 不修改业务代码；通过已有 NativeModules 接口注入控制命令
4. **确定性** — 避免依赖网络/定时器的脆弱性；场景用 mock 后端 + 固定 seed

---

## 架构总览

```
┌──────────────────────────────────────────────────────────┐
│  e2e/scenarios/*.scenario.ts   (平台无关的测试定义)       │
│    - 描述用户意图、预期行为                               │
│    - 复用度: 100% — Android/iOS 共享                      │
└──────────────────────┬───────────────────────────────────┘
                       │ import
┌──────────────────────▼───────────────────────────────────┐
│  e2e/driver/                                              │
│    driver.ts         (统一 Driver 接口)                   │
│    android.driver.ts (ADB + Lynx DevTools Protocol)       │
│    ios.driver.ts     (xcrun simctl + Lynx DevTools)       │
└──────────────────────┬───────────────────────────────────┘
                       │ 控制
┌──────────────────────▼───────────────────────────────────┐
│  设备 / 模拟器                                            │
│    Songloft Player App (debug build, DevTools enabled)    │
│    ↕ NativeModules bridge                                 │
│    原生模块 (Audio/Storage/Platform/SystemAppearance)      │
└──────────────────────────────────────────────────────────┘
```

---

## 一、测试场景定义 (Scenario DSL)

位置：`e2e/scenarios/`

每个文件是一个标准 Vitest 测试文件，但 import 的是平台无关的 Driver 接口而非 DOM/组件。

```ts
// e2e/scenarios/audio-playback.scenario.ts
import { describe, test, expect } from 'vitest'
import { createDriver } from '../driver/index.js'

describe('audio: basic playback', () => {
  const driver = createDriver() // 根据 env 选 android/ios

  test('play a song → state transitions: idle → loading → playing', async () => {
    await driver.launch()
    await driver.login('admin', 'admin')
    await driver.navigate('/library')

    const firstSong = await driver.query('[testID="song-item-0"]')
    await firstSong.tap()

    // 等待原生回调
    await driver.waitFor(() =>
      driver.getPlayerState().then(s => s.state === 'playing')
    , { timeout: 5000 })

    const state = await driver.getPlayerState()
    expect(state.state).toBe('playing')
    expect(state.durationMs).toBeGreaterThan(0)
  })

  test('pause → resume preserves position', async () => {
    await driver.tapPlayer('pause')
    const pos1 = (await driver.getPlayerState()).positionMs

    await driver.sleep(500)
    await driver.tapPlayer('play')

    const pos2 = (await driver.getPlayerState()).positionMs
    // 暂停期间 position 不应前进
    expect(pos2 - pos1).toBeLessThan(200)
  })

  test('next → advances to song 2', async () => {
    await driver.tapPlayer('next')
    await driver.waitFor(() =>
      driver.getPlayerState().then(s => s.index === 1)
    , { timeout: 3000 })
    expect((await driver.getPlayerState()).index).toBe(1)
  })
})
```

### 复用要点

- `createDriver()` 是唯一的平台分支点：通过 `E2E_PLATFORM=android|ios` 环境变量选择实现
- 场景文件零平台耦合，任何人可以像写单测一样补充
- 通用断言基于 `driver.getPlayerState()` / `driver.getStorageItem()` 等抽象方法

---

## 二、Driver 统一接口

```ts
// e2e/driver/types.ts
export interface E2EDriver {
  // ── 生命周期 ──
  launch(): Promise<void>
  teardown(): Promise<void>

  // ── 导航 ──
  login(user: string, pass: string): Promise<void>
  navigate(path: string): Promise<void>

  // ── 元素交互 ──
  query(selector: string): Promise<E2EElement>
  queryAll(selector: string): Promise<E2EElement[]>
  tapPlayer(action: 'play' | 'pause' | 'next' | 'prev' | 'stop'): Promise<void>

  // ── 原生状态读取 ──
  getPlayerState(): Promise<PlayerStateSnapshot>
  getStorageItem(area: 'prefs' | 'secure', key: string): Promise<string | null>
  getSystemAppearance(): Promise<{ theme: 'light' | 'dark'; locale: string }>

  // ── 原生状态注入 (模拟环境变化) ──
  setSystemTheme(theme: 'light' | 'dark'): Promise<void>
  setSystemLocale(locale: string): Promise<void>
  simulateAudioInterruption(type: 'call' | 'alarm'): Promise<void>
  simulateNetworkCondition(condition: 'offline' | 'slow' | 'normal'): Promise<void>

  // ── 工具 ──
  waitFor(predicate: () => Promise<boolean>, opts?: { timeout?: number }): Promise<void>
  sleep(ms: number): Promise<void>
  screenshot(name: string): Promise<string> // returns file path
}

export interface PlayerStateSnapshot {
  state: 'idle' | 'loading' | 'playing' | 'paused' | 'completed' | 'error'
  positionMs: number
  durationMs: number
  index: number
  songTitle: string
}

export interface E2EElement {
  tap(): Promise<void>
  longPress(): Promise<void>
  swipe(direction: 'left' | 'right' | 'up' | 'down'): Promise<void>
  getText(): Promise<string>
  isVisible(): Promise<boolean>
  getAttribute(name: string): Promise<string | null>
}
```

---

## 三、平台 Driver 实现

### Android Driver

```ts
// e2e/driver/android.driver.ts
// 通信方式: ADB + Lynx DevTools Protocol (CDP-like WebSocket)
//
// 1. adb shell am start -n org.songloft.lynx/.MainActivity
// 2. adb forward tcp:9229 localabstract:lynx_devtools_org.songloft.lynx
// 3. WebSocket 连接 ws://localhost:9229 (Lynx Inspector Protocol)
// 4. 通过 Inspector 执行 JS 表达式读取/操控状态
```

核心能力：
| 需求 | 实现 |
|------|------|
| 启动 App | `adb shell am start` |
| 登录 | Inspector JS: 调用 auth store |
| 元素查询 | Inspector `DOM.querySelector` (by testID) |
| 点击 | Inspector `Input.dispatchTapEvent` |
| 读播放器状态 | Inspector JS: `usePlayerStore.getState()` |
| 读 Storage | Inspector JS: `NativeModules.SongloftStorage.getItem(...)` |
| 主题切换 | `adb shell cmd uimode night yes/no` |
| 网络模拟 | `adb shell svc wifi disable` / iptables |
| 截图 | `adb exec-out screencap -p` |

### iOS Driver

```ts
// e2e/driver/ios.driver.ts
// 通信方式: xcrun simctl + Lynx DevTools Protocol
//
// 1. xcrun simctl launch booted org.songloft.lynx
// 2. Lynx DevTools over USB/simctl (同协议)
// 3. WebSocket 连接
```

核心能力：
| 需求 | 实现 |
|------|------|
| 启动 App | `xcrun simctl launch booted org.songloft.lynx` |
| 元素查询 | 同 Android — Lynx Inspector Protocol 跨平台一致 |
| 主题切换 | `xcrun simctl ui booted appearance dark/light` |
| 语言切换 | 通过 Inspector 触发 `sendGlobalEvent` |
| 网络模拟 | Network Link Conditioner / `xcrun simctl status_bar` |
| 截图 | `xcrun simctl io booted screenshot` |

---

## 四、测试场景分类 (全部跨平台复用)

### 4.1 播放器行为

| 场景文件 | 覆盖点 |
|---------|--------|
| `audio-playback.scenario.ts` | play/pause/stop/seek/resume |
| `audio-queue.scenario.ts` | next/prev/play-mode(order/loop/single/shuffle) |
| `audio-completion.scenario.ts` | 播完自动切歌、单曲循环、列表结束停止 |
| `audio-sleep-timer.scenario.ts` | 定时停止、N 首后停止 |
| `audio-speed.scenario.ts` | 变速 0.5x–3x |
| `audio-background.scenario.ts` | 后台播放不中断、锁屏控制 |
| `audio-interruption.scenario.ts` | 来电暂停恢复、闹钟打断 |
| `audio-error.scenario.ts` | 无效 URL → error 状态 → UI 提示 |
| `audio-eq.scenario.ts` | EQ 开关、预设切换、频段增益 |

### 4.2 存储行为

| 场景文件 | 覆盖点 |
|---------|--------|
| `storage-prefs.scenario.ts` | 设置写入/读取持久化、App 重启后恢复 |
| `storage-secure.scenario.ts` | token 存入 secure、prefs 读不到 |
| `storage-playback-state.scenario.ts` | 退出后恢复播放位置/队列 |

### 4.3 系统外观

| 场景文件 | 覆盖点 |
|---------|--------|
| `appearance-theme.scenario.ts` | 系统切换 dark/light → App 实时跟随 |
| `appearance-locale.scenario.ts` | 系统语言切换 → i18n 刷新 |
| `appearance-startup.scenario.ts` | 冷启动首帧就是正确主题(非闪白) |

### 4.4 平台能力

| 场景文件 | 覆盖点 |
|---------|--------|
| `platform-open-url.scenario.ts` | 外部 URL 打开 |
| `platform-file-pick.scenario.ts` | 文件选择器调起 |

### 4.5 集成冒烟

| 场景文件 | 覆盖点 |
|---------|--------|
| `smoke-cold-start.scenario.ts` | 冷启动 → 登录 → 首页渲染完成 < 3s |
| `smoke-full-flow.scenario.ts` | 登录 → 浏览曲库 → 播放 → 暂停 → 添加歌单 |
| `smoke-offline.scenario.ts` | 断网 → 已缓存歌曲仍可播放 |

---

## 五、测试基础设施

### 5.1 Mock 后端

```ts
// e2e/fixtures/mock-server.ts
// 在宿主机 :58091 启动一个轻量 HTTP server
// 返回固定 fixture 数据，保证测试确定性
// - /api/v1/auth/login → { token: "test-jwt" }
// - /api/v1/songs → 5 首固定歌曲 (含 .mp3 fixture)
// - /api/v1/songs/:id/stream → 固定 3s 静音 mp3
```

### 5.2 TestID 约定

在需要定位的 UI 元素上统一添加 `testID` 属性（Lynx 支持）：

```tsx
<view testID="song-item-0">...</view>
<view testID="player-play-btn">...</view>
<view testID="player-progress">...</view>
```

仅在 `__DEV__` build 时注入，生产包不带。

### 5.3 App 侧测试桥 (Test Harness Module)

在 debug build 中注册一个额外的 `SongloftTestHarness` 原生模块：

```kotlin
// Android: SongloftTestHarnessModule.kt
@LynxMethod
fun getPlayerState(): String { /* JSON serialize ExoPlayer state */ }

@LynxMethod
fun simulateInterruption(type: String) { /* AudioFocusRequest loss */ }
```

```swift
// iOS: SongloftTestHarnessModule.swift
func getPlayerState() -> String { /* JSON serialize AVPlayer state */ }
func simulateInterruption(_ type: String) { /* AVAudioSession.interruptionNotification */ }
```

这让 Driver 不仅能读 TS store 状态，还能读真实原生播放器状态（验证桥接一致性）。

### 5.4 运行配置

```jsonc
// e2e/vitest.config.ts — 独立于 src 的单测配置
{
  "test": {
    "include": ["e2e/scenarios/**/*.scenario.ts"],
    "testTimeout": 30000,
    "hookTimeout": 15000,
    "sequence": { "concurrent": false }  // 行为测试串行
  }
}
```

### 5.5 CI 集成

```yaml
# .github/workflows/e2e.yml
jobs:
  e2e-android:
    runs-on: ubuntu-latest  # 或 macOS for emulator
    steps:
      - uses: reactivecircus/android-emulator-runner@v2
      - run: pnpm run build:android-bundle
      - run: ./gradlew installDebug
      - run: E2E_PLATFORM=android pnpm run test:e2e

  e2e-ios:
    runs-on: macos-latest
    steps:
      - run: xcrun simctl boot "iPhone 15"
      - run: pnpm run ios:run
      - run: E2E_PLATFORM=ios pnpm run test:e2e
```

---

## 六、目录结构

```
e2e/
  vitest.config.ts              独立 vitest 配置
  driver/
    types.ts                    Driver + Element 接口定义
    index.ts                    createDriver() 工厂
    android.driver.ts           ADB + Lynx Inspector 实现
    ios.driver.ts               simctl + Lynx Inspector 实现
    lynx-inspector.ts           Lynx DevTools Protocol 封装
    utils.ts                    waitFor / retry / screenshot
  scenarios/
    audio-playback.scenario.ts
    audio-queue.scenario.ts
    audio-completion.scenario.ts
    audio-sleep-timer.scenario.ts
    audio-speed.scenario.ts
    audio-background.scenario.ts
    audio-interruption.scenario.ts
    audio-error.scenario.ts
    audio-eq.scenario.ts
    storage-prefs.scenario.ts
    storage-secure.scenario.ts
    storage-playback-state.scenario.ts
    appearance-theme.scenario.ts
    appearance-locale.scenario.ts
    appearance-startup.scenario.ts
    platform-open-url.scenario.ts
    platform-file-pick.scenario.ts
    smoke-cold-start.scenario.ts
    smoke-full-flow.scenario.ts
    smoke-offline.scenario.ts
  fixtures/
    mock-server.ts              确定性 mock 后端
    songs/                      3s 静音 mp3 fixture
    responses/                  固定 API 响应 JSON
  harness/
    android/
      SongloftTestHarnessModule.kt
    ios/
      SongloftTestHarnessModule.swift
```

---

## 七、与现有测试的关系

| 层级 | 工具 | 运行环境 | 复用率 | 覆盖重点 |
|------|------|---------|--------|----------|
| 单测 (现有) | Vitest | Node.js | N/A | 纯逻辑 (domain/store) |
| 契约测试 (现有) | Vitest + fs | Node.js | N/A | 字符串/接口对齐 |
| **行为测试 (新)** | **Vitest + Driver** | **真机/模拟器** | **100% 跨平台** | **原生集成正确性** |

现有的 `native-module-contract.test.ts` 和 `device-host-contract.test.ts` 是静态契约守门员（编译期），新的行为测试是运行时验证层——两者互补，不重叠。

---

## 八、优先实现路径

1. **Phase 1**: Driver 接口 + Lynx Inspector 封装 + Android driver（成本最低，本机可跑）
2. **Phase 2**: 播放器核心场景 5 个（play/pause/next/completion/error）
3. **Phase 3**: iOS driver（协议相同，适配 simctl 命令）
4. **Phase 4**: 存储 + 外观场景
5. **Phase 5**: CI 集成 + 冒烟测试
6. **Phase 6**: TestHarness 原生模块 + 中断/后台高级场景
