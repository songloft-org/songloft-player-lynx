# 测试

两层：**单元测试**（vitest，无需设备）与 **E2E 行为测试**（TestBridge 驱动真机/模拟器上的 App）。

> 想理解 E2E 为什么是这个架构（Driver 接口、TestBridge 协议、场景分类）→ 读 [E2E 测试架构设计](../architecture/e2e-testing-design.md)。
> 想知道**怎么写**一条不会骗人的断言 → 读 [AGENTS.md §6 测试与闸门原则](../../AGENTS.md)，那是本仓库三次教训的沉淀。

## 单元测试

```bash
pnpm test              # vitest run
pnpm exec tsc -b       # 类型检查（必须 -b）
```

当前：**1981 用例 / 189 文件**（2026-08-26 复核，约 20–35 秒）。

- 技术栈：Vitest + @testing-library
- 测试文件与源码同目录下的 `__tests__/`
- **文件正文禁止字面量 `@vitest-environment`**（Lynx 约束）

## E2E 行为测试

```bash
pnpm run test:e2e:android   # Android（需 adb 连接 + debug APK 已安装）
pnpm run e2e:ios            # iOS 一键：自动 boot 模拟器 + 检查安装 + 跑场景
pnpm run e2e:ios:full       # iOS 全流程（含构建）：build → pod install → boot → install → test
pnpm run e2e:ios:setup      # 仅准备 iOS 环境，不跑测试
```

- **33 个** scenario 文件（`e2e/scenarios/`），约 121 处 `test()` 声明，**全部需要设备**
- 场景跨平台复用；iOS 另有系统外观测试，Android 另有悬浮歌词与全屏视频测试
- 报告 → `e2e/reports/`，截图 → `e2e/screenshots/`（均已 gitignore）

**最后一次全量结果是 2026-08-16（批49 时代）**：Android 112 passed / 8 skipped（120）· iOS 110 passed / 10 skipped（120）。此后有 129 个提交、场景从 29 涨到 33，**没有再跑过** —— 这两个数字只能当历史参考。

### skip 数变了就要查

skip 的构成：Android = 3 例 `ios-appearance` + 5 例 `android-video-fullscreen`（缺视频素材）；iOS = 5 例 `android-floating-lyric` + 5 例 `android-video-fullscreen`（平台门控）。

批48 出现过**门控条件写反、5 例整体静默跳过而报「全绿」**：`E2E_PLATFORM === 'android'` 在裸 `pnpm run test:e2e` 下不成立，而 `createDriver()` 把未设该变量视为 Android。正确写法是 `(process.env.E2E_PLATFORM ?? 'android') === 'android'`。**只有盯着 skip 数才看得出来**。

素材缺失时要让用例**可见地 skip**（模块级 `await fetchVideoSong()` + `test.skipIf`），而不是在每个 test 里 `return` —— 后者是假绿。

### 跑 E2E 前必做的四件环境检查

每一条都真的踩过，且失败时都不报错、只让你得出错误结论：

1. **改了 JS bundle 或原生代码后，`simctl install` 不替换已运行的进程** → 先 `xcrun simctl terminate <udid> org.songloft.lynx`。
2. **跑过 Android E2E 后，残留的 `adb forward localhost:9230` 会抢走宿主侧连接** —— 它绑得比模拟器 App 的 `*:9230` 更具体，于是 iOS 测试**静默连到 Android 上的 App**（表现为 `changeAppTheme is not a function`，因为那份是旧 bundle）。跑 iOS 前先 `adb forward --remove tcp:9230`。
3. **`e2e:ios:setup` 已装就不重装**（`scripts/e2e-ios-setup.mjs` 是 `if (!isAppInstalled(...))`）→ `ios:build` 之后自己 terminate + `xcrun simctl install <udid> ios/build/Debug-iphonesimulator/SongloftLynx.app`。
4. **9230 没被别的残留实例占**：`lsof -iTCP:9230 -sTCP:LISTEN -P`。新实例 bind 失败只打一行 `[TestBridge] bind() failed: 48`。另外**只留一台 Booted 模拟器** —— `getBootedSimulator()` 取 JSON 列表里第一个 Booted 设备，多台并存时选择不确定。

### store 把手

`NativeModules` 在 eval scope 里**完全不可达**（裸的和 `globalThis` 上都没有，实测过），所以原生能力只能经 `src/e2e-bridge.ts` 暴露的把手驱动：

`__E2E_PLAYER_STORE__` · `__E2E_AUTH_STORE__` · `__E2E_LYRIC_STORE__` · `__E2E_EQ_STORE__` · `__E2E_SERVER_STORE__` · `__E2E_APP_CONFIG__` · `__E2E_ROUTER__` · `__E2E_APPEARANCE__` · `__E2E_FLOATING_LYRIC__` · `__E2E_VIDEO__` · `__E2E_SONG_OVERLAYS__` · `__E2E_SONG_CACHE__` · `__E2E_BACK__`（权威清单以 `src/e2e-bridge.ts` 为准）

新增 store 时的暴露约定见 [API 与 Store 设计规范](../reference/api-conventions.md)。

### 需要弄清「宿主到底发了什么」时

写个一次性探针 scenario（如 `zz-probe.scenario.ts`，跑完删）。TestBridge 能直接 eval 到 store，密集轮询 `getPlayerState()` 几秒就能把 tick 节奏、事件时序量化出来。

批46 有两条失败的首次归因是错的，都是「看现象合理推断」——实测推翻后才找到真根因。**先量化再改代码**，比连猜带改省好几轮 iOS 构建。

## 断言要落在可观测状态上

截图只能证明「渲染对了」。交互是否真的生效必须另找证据：

- 点完开关 → `curl` 对应 `/settings/<name>` 端点看值变没变
- 点完「停止计算」→ `pgrep -x ffmpeg` 看子进程归零（**别用 `ps -ef | grep X | wc -l`**，当前 shell 自己的命令行含那个关键字，会稳定多算 1–2 个）
- 悬浮歌词是否真写入文本 → `dumpsys window windows` 的 `Requested h` / `mLayoutSeq` 在写入前后是否变化（当时白字白底，**截图看不出区别**）
- 弹窗被压扁 → `getComputedStyle(el).height` 与 `el.scrollHeight` 的差值（截图会误读成「样式没生效」或「被遮挡」）

## 相关

- [E2E 架构设计](../architecture/e2e-testing-design.md) —— Driver 接口、TestBridge 协议、场景分类
- [调试](./debugging.md) —— 真机与无头浏览器
- `e2e/TEST_PLAN.md` —— 场景覆盖清单
- `e2e/ISSUES.md` —— E2E 自身的已知问题
