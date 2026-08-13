# 补充 iOS 模拟器测试环境

## Context

Phase 1 已搭建了 e2e 框架骨架，iOS driver 可以基本工作，但缺少模拟器生命周期管理、系统状态模拟（主题/语言/网络）、自动构建安装流程等完整测试环境支持。本次补充使 iOS e2e 达到与 Android 同等的可用状态：一键 `pnpm run e2e:ios` 即可跑完全部场景。

---

## 实施步骤

### 1. 创建 iOS 模拟器管理工具 `e2e/driver/ios-simulator.ts`

提供以下能力：
- `findSimulator(name?: string)` — 查找可用模拟器（默认 iPhone 15/16），返回 UDID
- `bootSimulator(udid: string)` — 启动模拟器（如果未 booted）
- `shutdownSimulator(udid: string)` — 关闭模拟器
- `installApp(udid: string, appPath: string)` — 安装 .app 到模拟器
- `isAppInstalled(udid: string, bundleId: string)` — 检查 app 是否已安装
- `waitForBoot(udid: string)` — 等待模拟器完全启动（状态 Booted）
- `getBootedSimulator()` — 获取当前 booted 的模拟器 UDID

### 2. 增强 iOS Driver (`e2e/driver/ios.driver.ts`)

扩展现有 driver：
- `launch()` 增加逻辑：如果没有 booted simulator，自动查找并 boot 一个；如果 app 未安装，报错提示先运行 `pnpm run ios:build`
- 增加 **系统模拟方法**（iOS 独有）：
  - `setSystemTheme(theme)` — `xcrun simctl ui booted appearance <light|dark>`
  - `setSystemLocale(locale)` — 通过 Inspector evaluateJS 触发 `sendGlobalEvent`（模拟器无直接 locale 切换命令，用 globalEvent 模拟）
  - `simulateNetworkCondition(condition)` — `xcrun simctl status_bar booted override --dataNetwork <wifi|3g|none>`（视觉级，不影响真实网络；真实断网需 Network Link Conditioner 配置文件）
  - `openURL(url)` — `xcrun simctl openurl booted <url>`（测试 deep link）
  - `setStatusBar(overrides)` — 设置状态栏时间/电池等（截图一致性）
  - `clearAppData()` — 卸载重装以重置所有 UserDefaults/Keychain

### 3. 添加 iOS 专属场景 `e2e/scenarios/ios-appearance.scenario.ts`

验证 iOS 模拟器上的系统外观跟随：
- 切换 dark mode → App UI 跟随
- 切换回 light mode → App UI 恢复
- 冷启动时首帧主题正确

### 4. 创建 e2e 一键脚本 `scripts/e2e-ios-setup.mjs`

自动化准备流程：
1. 检测 booted simulator（没有则自动 boot iPhone 16）
2. 检测 app 是否已安装（没有则提示需要先 `pnpm run ios:build`）
3. 设置 status bar 为固定状态（截图一致性）
4. 输出环境信息

### 5. 添加 package.json 脚本

```json
"e2e:ios:setup": "node scripts/e2e-ios-setup.mjs",
"e2e:ios": "pnpm run e2e:ios:setup && E2E_PLATFORM=ios pnpm run test:e2e",
"e2e:ios:full": "pnpm run ios:build && pnpm run e2e:ios"
```

### 6. 在 Driver 接口 (types.ts) 中增加系统模拟方法

扩展 `E2EDriver` 接口，添加可选的平台模拟能力：
```ts
setSystemTheme?(theme: 'light' | 'dark'): Promise<void>
setSystemLocale?(locale: string): Promise<void>
simulateNetworkCondition?(condition: 'offline' | 'slow' | 'normal'): Promise<void>
openURL?(url: string): Promise<void>
clearAppData?(): Promise<void>
```

用可选方法避免破坏 Android driver 的实现约束。

---

## 修改的文件

| 文件 | 动作 |
|------|------|
| `e2e/driver/ios-simulator.ts` | **新建** — 模拟器管理工具 |
| `e2e/driver/ios.driver.ts` | **重写** — 增加模拟器管理 + 系统模拟 |
| `e2e/driver/types.ts` | **修改** — 增加可选系统模拟方法 |
| `e2e/scenarios/ios-appearance.scenario.ts` | **新建** — iOS 外观跟随场景 |
| `scripts/e2e-ios-setup.mjs` | **新建** — 一键环境准备 |
| `package.json` | **修改** — 添加 e2e:ios 脚本 |
| `AGENTS.md` | **修改** — 补充 iOS e2e 说明 |

---

## 验证方式

1. `pnpm exec tsc -p e2e/tsconfig.json --noEmit` — 类型检查通过
2. `pnpm test` — 现有单测无回归
3. `node scripts/e2e-ios-setup.mjs` — 在有 Xcode 的 Mac 上能正确检测/boot 模拟器
4. `pnpm run e2e:ios`（需要 booted simulator + 已安装 app）— 场景跑通
