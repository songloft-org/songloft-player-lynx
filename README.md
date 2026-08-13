# Songloft Player (Lynx)

Songloft Player 的 Lynx 客户端，从 Flutter 版整体重写为 ReactLynx + TypeScript。

## 技术栈

| 层 | 选型 |
|---|---|
| 构建/框架 | Rspeedy + ReactLynx + TypeScript |
| 状态 | Zustand（客户端态）· TanStack Query（服务端态） |
| 路由 | TanStack Router（memory history，code-based） |
| UI | lynx-ui 按组件包导入 + LUNA tokens + @lynx-js/motion |
| 数据模型 | zod（snake→camelCase transform） |
| i18n | i18next + react-i18next（en / zh） |
| 测试 | Vitest + @testing-library（单元）· TestBridge + Vitest（E2E） |
| 原生 | Android Kotlin（ExoPlayer）/ iOS Swift（AVPlayer） |

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

## 测试

```bash
pnpm test                 # 单元测试（811 用例）
pnpm run test:e2e:android # E2E 行为测试（Android，需 adb + debug APK）
pnpm run e2e:ios:full     # E2E 全流程（iOS，含构建）
```

- 单元测试：Vitest + @testing-library
- E2E 测试：TestBridge（TCP 9230）驱动真机 App，跨平台复用场景文件，27 个场景 / 110 用例
- 测试报告 → `e2e/reports/`，截图 → `e2e/screenshots/`

## 项目结构

```
src/              Lynx 客户端源码
  core/           网络、存储、配置
  features/       功能模块（auth/home/library/player/playlist/settings/...）
  models/         zod 数据模型
  native/          原生模块 TS 层
  shared/         共享组件、主题、布局
android/          Android 宿主 + 原生模块（Kotlin）
ios/              iOS 宿主 + 原生模块（Swift）
e2e/              E2E 测试（driver + scenarios + fixtures）
docs/             项目文档（见下）
```

## 文档

完整文档索引见 [docs/README.md](./docs/README.md)，按类别组织：

- [docs/reference/](./docs/reference/) — 规范与参考（[API 设计规范](./docs/reference/api-design-conventions.md)、OpenAPI）
- [docs/migration/](./docs/migration/) — 迁移调研历史
- [docs/testing/](./docs/testing/) — [E2E 测试架构设计](./docs/testing/behavior-testing-design.md)
- [docs/tracking/](./docs/tracking/) — 开发进展与 bug 跟踪

开发规范（给 AI agent 与贡献者）见 [AGENTS.md](./AGENTS.md)。

## 状态

迁移路线 P0–P2 已完成，P3 平台特性 60%，P4 双轨发布未开始。详见 [docs/tracking/PROGRESS.md](./docs/tracking/PROGRESS.md)。
