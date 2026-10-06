# 构建与运行

四个目标平台的构建命令，以及每个平台上真实踩过的环境坑。命令与 `package.json` 的 `scripts` 一一对应。

> 只想快速跑起来看一眼 → 先读 [快速上手](../getting-started.md)。
> 想知道各平台**能力差异**（而不是怎么构建）→ 读 [平台差异](../architecture/platform-differences.md)。

## 环境要求

| 项 | 要求 |
|---|---|
| Node | `^20.19.0 \|\| >=22.12.0`（`package.json` 的 `engines`） |
| 包管理 | pnpm（`pnpm-lock.yaml` 必须提交） |
| 后端 | `http://localhost:58091`，账号 `admin/admin`，接口前缀 `/api/v1` |
| Android | `ANDROID_HOME` + `JAVA_HOME`（本机已有 openjdk 17，见下方 Android 一节） |
| iOS | macOS + Xcode + CocoaPods |
| HarmonyOS | DevEco Studio 5.0+（含 hvigor 构建工具链） |

```bash
pnpm install
```

`postinstall` 会跑 `scripts/patch-web-core-client.mjs`，别跳过 —— Web 宿主依赖那个补丁。

## 通用（JS 产物）

```bash
pnpm run dev        # 开发模式
pnpm run build      # 生产构建（含类型检查）
pnpm exec tsc -b    # 独立类型检查
pnpm test           # vitest
```

两条铁律：

- **`pnpm run build` 必须列出两个产物** —— `File (lynx)` 与 `File (web)`。只有 web 那一行，说明 `lynx.config.ts` 的 `environments` 少了 `lynx: {}`：该字段是**替换**隐式默认环境而非扩展它，漏掉不会让构建失败，只会静默停止产出 `dist/main.lynx.bundle`，而 copy-bundle 脚本照拷 `dist/` 里的陈旧文件。`scripts/assert-bundle-fresh.mjs` 现在会拦住这种情况（判据是产物**年龄**，因为 `existsSync` 抓不到「文件在但是旧的」）。
- **类型检查必须带 `-b`**。`tsc --noEmit` 对本仓库是空跑。改动没被检测到时用 `--force`（`-b` 会写 `.tsbuildinfo`，已 gitignore）。

> ⚠️ **以上命令只覆盖 JS 产物**，不读 Xcode 工程、不验 Web 产物自洽性、不编译 Kotlin、不编译 ArkTS。「build 全绿」不等于「能出包」——这个仓库为此付过三次代价，见 [闸门原则](../../AGENTS.md#53-测试原则)。改了 `ios/`、`android/`、`harmony/`、`web/` 就必须跑对应平台那一条。

## Android

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools   # macOS
pnpm run android:install    # build + copy bundle + gradlew installDebug
adb reverse tcp:58091 tcp:58091
adb logcat -s lynx:V LynxUISVG:E AndroidRuntime:E
```

- **`adb reverse` 不能省**：设备上的 `localhost:58091` 得转回开发机的后端。
- **`JAVA_HOME` 必须显式导出**：`export JAVA_HOME=/opt/homebrew/opt/openjdk@17`。本机 JDK 是 Homebrew 的 **openjdk 17.0.18**（`/opt/homebrew/bin/java`）。
  > ⚠️ **别用 `/usr/libexec/java_home` 判断有没有 JDK。** 它只查**系统注册**的 JDK，对 Homebrew 那份报 `Unable to locate a Java Runtime`。这份文档一度据此断言「本机没有 JDK」——是错的，`java -version` 才是判据。实测 `compileDebugKotlin` 与 `android:install` 都能跑通。
- 只验编译（不装设备）：`cd android && ./gradlew --no-daemon assembleDebug`。

Linux 环境（另一台开发机）的路径：

```bash
export JAVA_HOME=/home/ejoydev/.local/share/mise/installs/java/temurin-17
export ANDROID_HOME=/home/ejoydev/.local/share/mise/installs/android-sdk/22.0
export PATH="$JAVA_HOME/bin:$PATH"
```

## iOS

```bash
pnpm run ios:pods    # 首次 / 依赖变更时
pnpm run ios:build   # 双 JS 产物 + Pods + app
pnpm run ios:run     # build + 装进已启动的模拟器 + 启动
```

三个坑都已经写进 `package.json` 的 `//ios:*` 注释键里，这里复述要点：

- **`ios:pods` 带 `GIT_CONFIG_GLOBAL=/dev/null`**，因为本机 `~/.gitconfig` 有 `url.git@github.com:.insteadOf https://github.com/`，会把 CocoaPods 的每个 https clone 重写成 ssh —— 而这台机器 **22 端口不通**，于是 MJRefresh / SDWebImage / PrimJS / ServalSVG 全部以 `ssh: connect to host github.com port 22` 失败。报错完全不指向真因，值得记住。
  - 若 `pod install` 改为死在 `JSON::ParserError - Failed to parse JSON at file: ~/.cocoapods/repos/trunk/...podspec.json`，是 CDN spec 缓存里有一份截断的下载：删掉那个文件，或用 `CP_HOME_DIR=/tmp/songloft-cp-home` 换一个一次性 spec 缓存。
- **`ios:build` 是两次 `xcodebuild -project/-target` 而不是一次 `-workspace/-scheme/-destination`**：这台 Xcode（26.6 / SDK iphoneos26.5）报告**没有**可用运行目标（`iOS 26.5 is not installed`，缺 iOS 平台组件，只有独立的 18.3 / 26.0 模拟器运行时），所以任何 `-destination` 形式都会失败。legacy 的 `-target + -sdk` 路径不需要 destination。因为 app target 在 CocoaPods workspace 之外构建，必须先构建 Pods aggregate，且两次构建**共享 `SYMROOT`**，app 才能在它的 xcconfig 指定的 `PODS_CONFIGURATION_BUILD_DIR` 找到 `libPods-*.a`。装上 iOS 平台组件后，优先改回 `-workspace ... -destination 'generic/platform=iOS Simulator'`。
- **`ios:run` 需要已 boot 的模拟器**（`xcrun simctl boot <udid>; open -a Simulator`）。模拟器的 localhost **就是**开发机，所以没有 `adb reverse` 的对应步骤。

**改了 bundle 或原生代码后，`simctl install` 不会替换已在运行的进程** —— 必须先 `xcrun simctl terminate <udid> org.songloft.lynx`。`e2e:ios:setup` 也是「已装就不重装」（`scripts/e2e-ios-setup.mjs`），所以 `ios:build` 之后要自己 terminate + install，否则测的是旧包。这条曾导致「修了也没用」的错误结论。

## HarmonyOS

本地构建需要 DevEco Studio/CLI（含 hvigor）。CI 的 `build-and-release.yml` 会安装 HarmonyOS 工具链并打包 HAP；有工作流不等于当前源码已通过 HAP 构建，需检查实际运行结果。

```bash
pnpm run build:harmony-bundle # 构建并拷贝 JS bundle
# 安装 ohpm 依赖后运行 pnpm run harmony:postinstall
# 在 DevEco Studio 中打开 harmony/ 目录，Build > Build Hap(s)/APP(s)
```

- **bundle 拷贝**：JS bundle 需拷贝到 `harmony/entry/src/main/resources/rawfile/`，与 Android 的 `assets/` 同理。
- **模块注册**：HarmonyOS 侧的模块注册在 `pages/Index.ets`（`this.modules.set(name, { moduleClass, param })`，**按 LynxView 逐视图注册**，不是 Android/iOS 那种全局 `registerModule`）；HTTP service 替换仍在 `EntryAbility.ets`。两处分工由契约闸门锁定（`native-module-contract.test.ts` 的 `harmonyIndex` / `harmonyEntry` 两个 read）。
- **无等价 API 的模块**：FloatingLyric、LiveActivity 在鸿蒙上无对应能力，TS 侧由 `NativeModules` 探测降级为 no-op。
- **验证方式**：DevEco Studio 内 Build > Build Hap(s)/APP(s)。真机调试需 HarmonyOS NEXT 设备或模拟器 + `hdc`（类似 `adb`）。

## Web

```bash
pnpm run web:sync            # = rspeedy build --environment web + 拷贝产物到 web/dist
pnpm run web:dev             # 只为 web/dist 起静态服务（不构建，先跑 web:sync）
pnpm run build:web           # 与 web:sync 同一条命令（standalone 部署产物）
pnpm run build:web-embedded  # 同上 + --embedded：供后端嵌入（父仓库 clients/player-build/web-embedded）
```

- **验证 Web 改动至少跑一次 `build:web` 并真的在浏览器里打开产物**。`web:dev` 只起静态服务、不构建，所以「`web:dev` 能跑」证明不了产物是新的。（2026-08 这条吃过两次亏，当时两者取的静态资源目录不同：`web:dev` 读 dev-middleware 的 IIFE 入口，产物用 `client_prod` 的 ESM 入口；现在 `web:sync` / `build:web` 已是同一条命令。）
- 宿主脚本必须用 `<script type="module">`：`client_prod` 入口用了 `import.meta`，当作传统脚本加载会抛 `Cannot use 'import.meta' outside a module`，而这个异常**不进 `console.error`**（只走 `pageerror`），表现是「资源全 200、零 console 错误、`<lynx-view>` 就是不 upgrade、整页纯黑」。现有 vitest 闸门锁住了「index.html 每个本地引用都存在」+「入口以 module 加载」。

## 子路径部署

宿主中仍有根路径资源 URL，API 也尚未完成带前缀的适配，因此 Lynx 子路径部署**未验证**。下述后端参数并不能独自保证本客户端在子路径下可用。

后端启动时用 `-base-path /xxx` 或 `BASE_PATH=/xxx`；前端不读子路径参数 —— embedded 部署下 API base 取自 worker realm 的 `self.location.origin`（页面 origin 即后端 origin，`src/core/config/app-config.ts:35-47`），standalone 与 embedded 由 `deployMode` global prop 区分。

## 相关

- [安装](installation.md) / [发版](releasing.md) / [English](../en/guides/build-and-run.md)

- [测试](./testing.md) —— 单元与 E2E 怎么跑
- [调试](./debugging.md) —— 真机 logcat、无头浏览器实测
- [Web 部署](./web-deployment.md) —— standalone 与 embedded 两种产物
- [AGENTS.md §5](../../AGENTS.md) —— 验收闸门的完整清单与边界
