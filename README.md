# Songloft Player (Lynx)

Songloft Player 的 Lynx 客户端，从 Flutter 版整体重写为 ReactLynx + TypeScript。

## 技术栈

| 层 | 选型 |
|---|---|
| 构建/框架 | Rspeedy + ReactLynx + TypeScript |
| 状态 | Zustand（客户端态）· TanStack Query（服务端态） |
| 路由 | TanStack Router（memory history，code-based） |
| UI | lynx-ui 按组件包导入 + Muse design tokens + @lynx-js/motion |
| 数据模型 | zod（snake→camelCase transform） |
| i18n | i18next + react-i18next（en / zh） |
| 测试 | Vitest + @testing-library（单元）· TestBridge + Vitest（E2E） |
| 原生 | Android Kotlin（ExoPlayer）/ iOS Swift（AVPlayer） |
| Web | `@lynx-js/web-core`（`<lynx-view>` 在浏览器渲染 Lynx bundle） |

## 快速开始

### 环境要求

- Node.js、pnpm
- Android：`ANDROID_HOME` 指向 commandlinetools
- 后端服务运行在 `http://localhost:58091`（账号 `admin/admin`，接口 `/api/v1`）

### 安装与运行

```bash
pnpm install              # 安装依赖
pnpm run dev              # 开发模式（热重载）
pnpm run build            # 生产构建（含类型检查）
```

### 真机调试（Android）

```bash
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
pnpm run android:install  # 构建 bundle + 安装 debug APK
adb reverse tcp:58091 tcp:58091
adb logcat -s lynx:V LynxUISVG:E AndroidRuntime:E
```

### iOS

```bash
pnpm run ios:pods         # 首次 / 依赖变更时
pnpm run ios:run          # 构建 + 装进已启动的模拟器 + 启动
```

### Web

```bash
pnpm run web:sync         # 构建 web 环境 bundle + 拷贝产物到 web/dist
pnpm run web:dev          # 本地静态服务
pnpm run build:web        # standalone 部署产物
pnpm run build:web-embedded   # 供后端嵌入的产物
```

## 测试

```bash
pnpm test                 # 单元测试（900 用例 / 97 文件）
pnpm exec tsc -b          # 类型检查（必须带 -b；--noEmit 对本仓库是空跑）
pnpm run test:e2e:android # E2E 行为测试（Android，需 adb + debug APK）
pnpm run e2e:ios:full     # E2E 全流程（iOS，含构建）
```

- 单元测试：Vitest + @testing-library
- E2E 测试：TestBridge（TCP 9230）驱动真机 App，跨平台复用场景文件，27 个场景
- 测试报告 → `e2e/reports/`，截图 → `e2e/screenshots/`（均已 gitignore）

> ⚠️ 以上命令**只覆盖 JS 产物**，不读 Xcode 工程也不检查 Web 产物自洽性。改 `ios/` 或 `web/` 时另见 [AGENTS.md](./AGENTS.md) §3 的补充闸门。

## 项目结构

```
src/              Lynx 客户端源码
  core/           网络、存储、配置
  features/       功能模块（auth/home/library/player/playlist/settings/...）
  models/         zod 数据模型
  native/         原生模块 TS 层
  shared/         共享组件、主题、布局
android/          Android 宿主 + 原生模块（Kotlin）
ios/              iOS 宿主 + 原生模块（Swift）
web/              Web 宿主页 + 本地静态服务
e2e/              E2E 测试（driver + scenarios + fixtures）
docs/             项目文档（见下）
```

## 文档

完整文档索引见 [docs/README.md](./docs/README.md)，按类别组织：

- [docs/reference/](./docs/reference/) — [API 设计规范](./docs/reference/api-design-conventions.md)（后端 OpenAPI 契约在后端仓库，不在此）
- [docs/plans/](./docs/plans/) — [当前修复与开发计划](./docs/plans/2026-08-14-audit-fix-plan.md)
- [docs/migration/](./docs/migration/) — 迁移调研历史
- [docs/testing/](./docs/testing/) — [E2E 测试架构设计](./docs/testing/behavior-testing-design.md)
- [docs/tracking/](./docs/tracking/) — 开发进展与 bug 跟踪

另外两份根目录文档：

- [AGENTS.md](./AGENTS.md) — 开发规范（给 AI agent 与贡献者）：目录边界、Lynx 约束与铁律、验收闸门、原生模块调用约定
- [DESIGN.md](./DESIGN.md) — Muse 设计语言：色彩/间距/圆角 token、图标规范、对比度要求

## 状态

迁移路线 P0–P2 已完成，P3 平台特性约 55%，P4 双轨发布未开始。

**当前各平台可用性**（批41 后）：Android ✅ 真机验证通过；iOS ✅ 可构建；Web ⚠️ 可加载渲染但**无音频**。逐项状态见 [docs/README.md](./docs/README.md#平台可用性2026-08-14-审计后的真实状态)，剩余修复排期见 [修复计划](./docs/plans/2026-08-14-audit-fix-plan.md)，历史进展见 [PROGRESS.md](./docs/tracking/PROGRESS.md)。
