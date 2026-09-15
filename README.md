# Songloft Player (Lynx)

Songloft Player 的 Lynx 客户端，从 Flutter 版整体重写为 ReactLynx + TypeScript。支持 Android / iOS / HarmonyOS / Web 四端。

## 技术栈

| 层 | 选型 |
|---|---|
| 构建/框架 | Rspeedy + ReactLynx + TypeScript |
| 状态 | Zustand（客户端态）· TanStack Query（服务端态） |
| 路由 | TanStack Router（memory history，code-based） |
| UI | lynx-ui 按组件包导入 + Apple 语义色 design tokens（`src/shared/theme/tokens.css`）+ @lynx-js/motion |
| 数据模型 | zod（snake→camelCase transform） |
| i18n | i18next + react-i18next（en / zh） |
| 测试 | Vitest + @testing-library（单元）· TestBridge + Vitest（E2E） |
| 原生 | 10 个自研模块在契约闸门内（Audio/Storage/Platform/Dlna/Video/SongCache/Navigation/PluginBridge + Android FloatingLyric + iOS LiveActivity） |
| Web | `@lynx-js/web-core`（`<lynx-view>` 在浏览器渲染 Lynx bundle） |

## 快速开始

需要 Node `^20.19 || >=22.12`、pnpm，以及跑在 `http://localhost:58091` 的 Songloft 后端（账号 `admin/admin`）。

```bash
pnpm install
pnpm run web:sync && pnpm run web:dev   # 最快看到界面的路径
```

验收三条：

```bash
pnpm run build        # 必须列出两个产物：File (lynx) 与 File (web)
pnpm run typecheck    # = tsc -b（必须 -b，--noEmit 是空跑）
pnpm test             # Vitest 单元测试与契约闸门
```

> ⚠️ 以上**只覆盖 JS 产物** —— 不读 Xcode 工程、不编译 Kotlin/ArkTS、不验 Web 产物自洽性。改了 `ios/`、`android/`、`harmony/`、`web/` 必须另跑对应平台那条。

**完整步骤 → [docs/getting-started.md](./docs/getting-started.md)** · **四平台构建与环境坑 → [docs/guides/build-and-run.md](./docs/guides/build-and-run.md)**

## 项目结构

```
src/              Lynx 客户端源码
  core/           网络、存储、配置
  features/       8 个功能模块（auth/home/library/library-ops/player/playlist/settings/jsplugin）
  models/         zod 数据模型
  native/         原生模块 TS 层
  shared/         共享组件、主题、布局、导航策略
  store/          Zustand 状态
  i18n/           多语言（en/zh）
android/          Android 宿主 + 原生模块（Kotlin）
ios/              iOS 宿主 + 原生模块（Swift）
harmony/          HarmonyOS 宿主 + 原生模块（ArkTS）
web/              Web 宿主页 + 宿主模块 + 本地静态服务
demo-frame-plugin/ Lynx 原生渲染插件演示工程
e2e/              E2E 测试（driver + 跨平台 scenario）
scripts/          构建脚本（bundle 拷贝、闸门、i18n 转换）
patches/          上游本地补丁（必须提交）
docs/             项目文档
```

## 文档

**入口：[docs/README.md](./docs/README.md)** —— 按 Diátaxis 组织（上手 / 操作指南 / 规范速查 / 背景解释 / 项目管理 / 归档）。

常用直达：

| 我想… | 去 |
|---|---|
| 从零跑起来 | [快速上手](./docs/getting-started.md) |
| 构建某个平台 | [构建与运行](./docs/guides/build-and-run.md) |
| 写/跑测试 | [测试](./docs/guides/testing.md) |
| 加原生能力 | [原生模块开发](./docs/guides/native-development.md) · [模块契约](./docs/reference/native-modules.md) |
| 查规范 | [API 与 Store](./docs/reference/api-conventions.md) · [返回导航](./docs/reference/back-navigation.md) |
| 理解某个诡异行为 | [Lynx 约束](./docs/architecture/lynx-constraints.md) · [调试](./docs/guides/debugging.md) |
| **接手项目** | [交接文档](./docs/project/handoff.md) |

根目录另有四份项目级文档：

- **[AGENTS.md](./AGENTS.md)** —— 开发规范与铁律（给 AI agent 与贡献者）：目录边界、Lynx 约束、验收闸门、原生模块调用约定、测试闸门原则
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** —— 面向代码探索的架构摘要；详细解释仍以 `docs/architecture/` 为准
- **[HARNESS.md](./HARNESS.md)** —— 构建、测试和平台验证入口及其覆盖边界
- **[DESIGN.md](./DESIGN.md)** —— Apple Human Interface Guidelines 总结（颜色/排版/布局/材质与 Liquid Glass/无障碍/Menus/组件规格），并附本仓库的落地注记

后端 API 契约（OpenAPI）**不在本仓库**：见后端仓库的 `docs/swagger.json`，或 `http://localhost:58091/swagger/index.html`。

## 状态

当前交付状态、最近一次验证结果和未完成事项统一维护在[交接文档](./docs/project/handoff.md)；逐批历史见[进展记录](./docs/project/progress.md)，平台能力与降级边界见[平台参考](./docs/reference/platforms.md)。根 README 不再复制易漂移的测试数量、产物大小和平台验收快照。
