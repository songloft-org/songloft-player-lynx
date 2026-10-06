# HARNESS — 项目构建与验证契约

本文件是项目构建、验证和执行环境的唯一事实源。
它定义可执行命令、运行条件和验证边界，不替代 `AGENTS.md` 中的行为、安全与修改约束。

## 项目类型
ReactLynx 多宿主音乐播放器客户端

## 编译与启动问题排查

- 工作目录为仓库根目录；Node 版本要求来自 `package.json#engines`，包管理器为 pnpm。
- `pnpm run build` 只验证共享 JS 产物，成功时应同时列出 `File (lynx)` 与 `File (web)`。
- 平台宿主必须使用各自工具链验证；JS 构建成功不能替代 Gradle、Xcode、hvigor、浏览器或设备验证。
- 当前环境若因 pnpm/Corepack 缓存权限失败，可用仓库现有 `node_modules` 中的对应 CLI 做诊断，但不得把这种替代写成项目标准命令。
- 完整环境要求和已知构建问题见 [`docs/guides/build-and-run.md`](docs/guides/build-and-run.md)。

## 自动识别构建命令候选

- **build**: `pnpm run build`
- **test**: `pnpm test`
- **quick**: `pnpm exec tsc -b`
- **bugfix**: `Unknown`
- **full**: `Unknown`

## 已确认命令（人工维护）

- **build**: `pnpm run build`
- **test**: `pnpm test`
- **quick**: `pnpm exec tsc -b`
- **bugfix**: `pnpm exec tsc -b` + `pnpm test`，再按改动路径选择平台闸门
- **full**: `N/A`；四个平台没有单一、可移植的全量命令

| 用途 | 命令 | 前置条件 | 覆盖边界 |
|---|---|---|---|
| Android 编译 | `cd android && ./gradlew --no-daemon assembleDebug` | JDK 17、Android SDK | Kotlin、资源、Manifest 与 APK 组装；不含设备行为 |
| iOS 工程解析 | `xcodebuild -list -project ios/SongloftLynx.xcodeproj` | macOS、Xcode | pbxproj 可解析；不等于 App 可构建 |
| iOS 构建 | `pnpm run ios:build` | macOS、Xcode、CocoaPods | Pods、Swift 与模拟器 App |
| HarmonyOS 构建 | GitHub Actions `build-and-release.yml` 的 HarmonyOS job 或 DevEco Studio Build Hap | HarmonyOS 工具链 | ArkTS、资源与 HAP；本地命令依环境而定 |
| Web 产物 | `pnpm run build:web` | Node、pnpm | standalone 产物；还需浏览器实际打开 |
| Android E2E | `pnpm run test:e2e:android` | 已连接设备、已安装 debug APK | 设备行为场景 |
| iOS E2E | `pnpm run e2e:ios` | macOS、可用模拟器 | iOS 设备行为场景 |
| 发版工具 | `pnpm run test:release` | 先运行生产 `build` | 版本、Git 发布脚本与真实 Web 拷贝产物；不替代原生编译 |

发布构建使用同一 `.build/version.json`，入口为 `build-and-release.yml`。下载包是关闭测试桥的 Release；E2E 需 Debug 宿主 + `SONGLOFT_TEST_BRIDGE=true` 的 JS bundle。详见 [发版指南](docs/guides/releasing.md)。

## 高风险目录
- android/、ios/、harmony/、web/：平台宿主变更需要对应工具链或运行环境验证
- src/native/：TS 与多宿主方法、回调和事件契约交汇处
- patches/ 与 scripts/patch-web-core-client.mjs：依赖安装后的行为修补

## 禁改区域

- `dist/`、`web/dist/`：构建产物，不作为源码修改。
- `node_modules/`、`harmony/**/oh_modules/`：安装生成的第三方依赖。
- `songloft-player/`：Flutter 只读参考（**本工作副本未 checkout**；另行取得后适用）。
- `.codegraph/`：机器本地索引。
- `.git/`：除工具维护的私有运行状态外，不手工编辑。

## 自动识别候选
- package.json scripts：JS、Web、Android、iOS 与 E2E 命令入口
- .github/workflows：Android、iOS、HarmonyOS 的开发构建流水线
- src/__tests__ 与 e2e/scenarios：契约测试和设备行为场景

## 需人工确认

- 四平台没有一个可在当前环境统一执行的 full 命令；宿主发布前需要按改动范围选择对应验证。
- 后端 OpenAPI 契约不在本仓库，接口变更需要从后端 swagger 权威源核对。
- HarmonyOS 本地 hvigor 命令依 DevEco/SDK 安装方式而异，仓库目前以 CI workflow 与 IDE Build Hap 为稳定入口。
