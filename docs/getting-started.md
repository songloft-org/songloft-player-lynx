# 快速上手

目标：**十分钟内在浏览器里看到登录页并连上后端**。原生平台的构建更重，放在 [构建与运行](./guides/build-and-run.md)。

## 1. 前置

| 项 | 要求 |
|---|---|
| Node | `^20.19.0 \|\| >=22.12.0` |
| 包管理 | pnpm |
| 后端 | Songloft 后端跑在 `http://localhost:58091`（账号 `admin/admin`） |

后端不在本仓库。它的 API 契约（OpenAPI）也不在——权威来源是后端仓库的 `docs/swagger.json`，或开发模式下的 `http://localhost:58091/swagger/index.html`。**刻意不往本仓库复制副本**：复制品必然漂移，而后端是 121 个 path 的活契约。

## 2. 安装

```bash
pnpm install
```

`postinstall` 会自动跑 `scripts/patch-web-core-client.mjs`（Web 宿主需要那个补丁），别跳过。

## 3. 跑起来

最快的路是 Web：

```bash
pnpm run web:sync    # 构建 web 环境 bundle + 拷到 web/dist
pnpm run web:dev     # 起本地静态服务
```

打开提示的地址，应当看到登录页。用 `admin/admin` 登录。

> 若页面**纯黑、控制台却没有任何错误** —— 那是宿主脚本没以 module 加载（`import.meta` 的异常只走 `pageerror`，不进 `console.error`）。现有 vitest 闸门锁住了这件事，正常构建不该出现；真遇到就查 `web/index.html` 的 `<script type="module">`。

设备上跑：见 [构建与运行](./guides/build-and-run.md) 的 Android / iOS / HarmonyOS 三节（Android 需要 `ANDROID_HOME` 与 JDK，iOS 需要 Xcode + CocoaPods，HarmonyOS 需要 DevEco Studio，各有几个必踩的环境坑写在那里）。

## 4. 验收命令

改完代码至少跑这三条：

```bash
pnpm run build        # 必须列出两个产物：File (lynx) 与 File (web)
pnpm run typecheck    # = tsc -b（必须 -b，--noEmit 是空跑）
pnpm test             # 2585 用例 / 242 文件
```

**「build 全绿」不等于「能出包」** —— 这三条只读 JS 产物，不碰 Xcode 工程、不编译 Kotlin、不编译 ArkTS、不验 Web 产物自洽性。改了 `ios/`、`android/`、`harmony/`、`web/` 必须另跑对应平台那条，见 [构建与运行](./guides/build-and-run.md)。这个仓库为此付过三次代价。

## 5. 接着读什么

按你要做的事挑：

| 我想… | 读 |
|---|---|
| 改页面 / 加功能 | [AGENTS.md](../AGENTS.md) §4 Lynx 约束 → [DESIGN.md](../DESIGN.md) 设计 token |
| 加原生能力 | [原生模块开发](./guides/native-development.md) + [模块契约](./reference/native-modules.md) |
| 写测试 | [测试](./guides/testing.md) |
| 查某个 API/Store 该怎么设计 | [API 与 Store 规范](./reference/api-conventions.md) |
| 弄明白某个诡异行为 | [Lynx 约束](./architecture/lynx-constraints.md) + [调试](./guides/debugging.md) |
| 接手这个项目 | [交接文档](./project/handoff.md)（**先读这篇**） |

## 6. 两条最容易踩的

上手阶段最可能撞到的两件事，先知道能省一整轮排查：

1. **判断「当前是不是 Web 平台」不能用 `typeof document !== 'undefined'`。** web-core 把业务代码跑在**真 Web Worker** 里，那里没有 `document` / `localStorage` / `HTMLAudioElement`（`window` 却是 object）—— 所以 DOM 探测**在 Web 上会回答「不是 Web」**。用 `isWebPlatform()`。这条已经踩过三次，详见 [Lynx 约束](./architecture/lynx-constraints.md)。
2. **原生模块方法不返回 Promise。** 写是 fire-and-forget，读靠 callback。`nm.X as SomePromiseInterface` 会让 `.then()` 落在 `undefined` 上 —— DLNA 页就是这么开屏即崩的。
