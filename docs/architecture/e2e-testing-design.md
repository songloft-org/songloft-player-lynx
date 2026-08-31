# E2E 行为测试架构

> **状态**：已实现。33 个场景文件，Driver 双平台，TestBridge 协议可用。
> 最后一次全量结果：2026-08-16（批49 时代）Android 112/120 · iOS 110/120。

## 目标

在 Android/iOS 真机或模拟器上运行端到端行为测试，验证原生模块与 Lynx TS 层之间的契约在真实运行时环境下正确工作。测试场景跨平台复用。

## 设计原则

1. **可复用的测试定义** — 场景用平台无关的 TS 描述，驱动层按平台适配
2. **分层覆盖** — 契约测试 → 行为场景 → 集成冒烟
3. **最小侵入** — 不修改业务代码；通过 `src/e2e-bridge.ts` 暴露的 `__E2E_*__` 把手驱动
4. **确定性** — mock 后端 + 固定 fixture

---

## 架构

```
e2e/scenarios/*.scenario.ts    平台无关的测试定义（33 个文件）
         │ import
e2e/driver/                    统一 Driver 接口 + 平台实现
  types.ts                     E2EDriver + E2EElement 接口
  index.ts                     createDriver() 按 E2E_PLATFORM 选实现
  android.driver.ts            ADB + Lynx DevTools Protocol (WebSocket)
  ios.driver.ts                xcrun simctl + Lynx DevTools Protocol
  lynx-inspector.ts            Lynx DevTools Protocol 封装
  test-bridge-client.ts        TCP 9230 TestBridge 通信
         │ 控制
设备 / 模拟器
  Songloft Player App (debug build, TestBridge enabled)
```

## Driver 统一接口

权威定义在 `e2e/driver/types.ts`。核心能力：

| 类别 | 方法 |
|------|------|
| 生命周期 | `launch()` / `teardown()` |
| 导航 | `login()` / `navigate()` |
| 元素交互 | `query()` / `queryAll()` / `tapPlayer()` |
| 原生状态读取 | `getPlayerState()` / `getStorageItem()` / `getSystemAppearance()` |
| 环境模拟 | `setSystemTheme()` / `setSystemLocale()` / `simulateAudioInterruption()` |

### 平台 Driver 通信方式

| | Android | iOS |
|---|---|---|
| 启动 | `adb shell am start` | `xcrun simctl launch` |
| 连接 | ADB forward tcp:9230 → Lynx DevTools WS | simctl + Lynx DevTools WS |
| 元素查询 | Inspector `DOM.querySelector` | 同左（协议跨平台一致） |
| 主题切换 | `adb shell cmd uimode night yes/no` | `xcrun simctl ui booted appearance` |
| 截图 | `adb exec-out screencap -p` | `xcrun simctl io booted screenshot` |

## 场景分类

| 类别 | 场景文件 | 覆盖点 |
|------|---------|--------|
| 播放器 | `audio-playback` / `audio-queue` / `audio-completion` / `audio-speed` / `audio-error` | 播放/暂停/队列/变速/错误 |
| EQ | `player-equalizer` | 均衡器开关、预设、频段 |
| 存储 | `playback-persistence` / `auth-login` | 播放状态恢复、登录持久化 |
| 外观 | `ios-appearance` / `theme-packs` | 系统主题跟随、主题包 |
| 曲库 | `library-songs` / `library-views` / `library-ops` / `favorites` | 浏览/筛选/批量操作/收藏 |
| 平台特有 | `android-floating-lyric` / `android-video-fullscreen` / `ios-video-fullscreen` | 悬浮歌词/全屏视频 |
| 导航 | `navigation` / `home-page` / `full-player` | 返回键/首页/全屏播放器 |
| 其他 | `settings-general` / `settings-proxy` / `duplicate-check` / `upgrade` / `lyrics` / `play-history` | 设置/去重/升级/歌词/历史 |

## Store 把手

`NativeModules` 在 eval scope 里完全不可达，所以测试通过 `src/e2e-bridge.ts` 暴露的全局变量驱动：

`__E2E_PLAYER_STORE__` · `__E2E_AUTH_STORE__` · `__E2E_LYRIC_STORE__` · `__E2E_EQ_STORE__` · `__E2E_SERVER_STORE__` · `__E2E_APP_CONFIG__` · `__E2E_ROUTER__` · `__E2E_APPEARANCE__` · `__E2E_FLOATING_LYRIC__` · `__E2E_VIDEO__` · `__E2E_SONG_OVERLAYS__` · `__E2E_SONG_CACHE__` · `__E2E_BACK__`

权威清单以 `src/e2e-bridge.ts` 为准。

## 测试基础设施

| 组件 | 位置 | 说明 |
|------|------|------|
| Mock server | `e2e/fixtures/mock-server.ts` | 轻量 HTTP，固定 fixture，外部服务器占端口时自动跳过 |
| 固定响应 | `e2e/fixtures/responses/` | login.json / songs.json |
| 全局 setup | `e2e/fixtures/global-setup.ts` | 启动 mock / 连接设备 |
| Vitest 配置 | `e2e/vitest.config.ts` | 独立于 src 的单测配置，30s timeout，串行 |
| Markdown 报告 | `e2e/reporter/` | 生成可读的测试报告 |
| 测试计划 | `e2e/TEST_PLAN.md` | 场景覆盖清单 |
| 已知问题 | `e2e/ISSUES.md` | E2E 自身的问题 |

## 与单元测试的关系

| 层级 | 工具 | 环境 | 覆盖 |
|------|------|------|------|
| 单测 | Vitest | Node.js | 纯逻辑（domain/store） |
| 契约测试 | Vitest + fs | Node.js | 字符串/接口对齐 |
| **E2E 行为测试** | **Vitest + Driver** | **真机/模拟器** | **原生集成正确性** |

契约闸门是编译期守门员，E2E 是运行时验证——两者互补。

## 相关

- [测试指南](../guides/testing.md) — 怎么跑、跑前四件环境检查、store 把手
- [调试指南](../guides/debugging.md) — 真机 logcat、无头浏览器实测
- `e2e/TEST_PLAN.md` — 场景覆盖清单
