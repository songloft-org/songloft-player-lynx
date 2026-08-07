# AGENTS.md — Songloft Player (Lynx) 协作规则

本仓库是 **Songloft Player 的 Lynx 客户端**，由 Flutter 版整体重写而来。任何 agent/协作者在此工作前必读本文件。

## 1. 目录边界（硬约束）

- `songloft-player/` — Flutter 产品的**只读参考快照**（上游独立仓库 `songloft-org/songloft-player`，含自己的 `.git`）。**禁止修改其中任何文件**，仅作对照参考。已在 `.gitignore` 排除，不纳入本仓库。
- `docs/` — 迁移调研文档（4 篇：overview / capability_matrix / native_modules_spec / roadmap）。改动需谨慎，属决策依据。
- `plan.md` — 分批实现计划。
- `src/` — Lynx 客户端源码，所有新代码落在这里。
- `patches/` + `pnpm-workspace.yaml` 的 `patchedDependencies` — 依赖补丁，**必须提交**（否则真机修复失效）。

> **重写输入映射**：参考 `songloft-player/AGENTS.md` 与 `docs/` 提供了完整的路由表、feature 结构（`data/domain/presentation`）、API 类清单、核心模型（Song/Playlist/AuthTokens/PlayerState）、Provider 职责——作为本项目重写的需求/设计输入。但其中的 **Flutter 特有包袱在 Lynx 已删除**：`flutter_patcher`/`libapp.so` 热更、Dart 契约哈希闸、Kotlin 冻结规则、Riverpod/GoRouter/Dio、WebF（GPL）——见 `docs/lynx_migration_overview.md` §6。**不要照搬这些。**

## 后端与联调

- 后端 API 默认 `http://localhost:58091`，开发账号 **admin / admin**，接口前缀 `/api/v1`。
- 部署模式（沿用现有产品行为）：**standalone** = 前后端分离，登录页显示 API 地址配置 UI + 不安全 TLS 开关；**embedded** = 同域内嵌后端，隐藏地址 UI。批 3 登录页需保留 standalone 的地址配置分支。

## 2. 技术栈（已锁定，实施时不再讨论）

- 构建/框架/语言：**Rspeedy + ReactLynx + TypeScript**
- 状态：**Zustand**（客户端态）；**TanStack Query**（服务端态，需 no-op `focusManager`/`onlineManager`）
- 路由：**TanStack Router**（memory history；当前 code-based，日后可迁 file-based）
- UI：**lynx-ui**（`@lynx-js/lynx-ui`）+ LUNA tokens + `@lynx-js/motion`。**禁止硬编码颜色/尺寸**，一律走 LUNA tokens / 主题 CSS 变量（`src/shared/theme/`）。
- 桌面宿主：Lynxtron（后续批次）
- 包管理器：**pnpm**（勿用 npm/yarn）

## 3. Lynx 无 DOM 铁律（最易踩坑）

Lynx 不是浏览器：**无 `window` / `document` / `self`**，无 DOM，双线程（主线程 / 背景线程 BTS），事件用 `bindtap` 体系，文本必须包 `<text>`，元素用 `<view>/<text>/<image>`（非 div/span/img）。写页面代码前**先查 `lynx-api-docs` skill**，勿凭 web 经验。

- 引入任何第三方库前，警惕它访问裸 `self`/`window`/`document`/`navigator`——真机会崩，而本机 `build`/`tsc`/vitest 都可能测不到。
- **`globalThis.self = globalThis` 兜底在 Lynx BTS 里对裸 `self` 无效**（BTS 裸 `self` 是独立绑定；node:vm/jsdom 会 fallthrough 因此本机测试会骗人）。正确做法：**优先 patch 掉该访问**（`typeof x` 守卫或改走 `globalThis`），而非注入全局。范例：`patches/@tanstack__router-core@*.patch`。
- lynx-ui **按组件包导入**（如 `@lynx-js/lynx-ui-button`），勿用桶入口 `@lynx-js/lynx-ui`（桶入口会 eager 加载全部子包、污染测试环境）。

## 4. 分批工作流

按 `plan.md` **顺序分批**实现，一批一个聚焦范围。**每批过验收后暂停等确认，再进下一批**。

## 5. 验收标准（每批必须全绿）

本机自动验收：
```
pnpm run build          # rspeedy 构建
pnpm exec tsc --noEmit  # 类型检查
pnpm test               # vitest run
```
真机目测：`pnpm run dev` 起 dev server + 二维码，用 **LynxExplorer** 扫码验证。

**验证要忠实**：不要只信 vitest（jsdom/node 环境与 Lynx BTS 语义不同）。凡涉及运行时全局/无 DOM 行为，**静态检查真机实际运行的产物**（build 后 grep `dist/main.lynx.bundle`；dev 则 curl dev server 的 `main.lynx.bundle`），确认危险代码已被守卫。参见 `src/__tests__/background-bundle-self.test.ts`、`router-no-dom.test.tsx`。

- Vitest 测试文件正文中**禁止出现字面量 `@vitest-environment`**（散文里也会被 Vitest 当指令解析而切换环境）。

## 6. Git 提交约定

- 在**关键节点**提交（每批验收通过后）。
- **Conventional Commits** 格式：`type(scope): description`（如 `feat(auth): 登录页与鉴权守卫`、`fix(router): 守卫 self.__TSR_ROUTER__`）；description 用简体中文，简洁说明改动与验收结果。
- **禁止添加 `Co-Authored-By` 尾注。**
- 引用父仓库 issue **必须带完整路径** `songloft-org/songloft#NNN`（只写 `#NNN` 会被 GitHub 解析为本仓库 issue）。
- **禁止提交**：`node_modules/`、`dist/`、`.rspeedy/`、`songloft-player/`、`.claude/settings.local.json`（已在 `.gitignore`）；`patches/`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` **必须提交**。
- 分支：`main`；远程：`origin`（`git@github.com:songloft-org/songloft-player-lynx.git`）。

## 7. 可用 skills

- `lynx-api-docs` — Lynx 元素/CSS/布局文档，**写页面前必查**。
- `lynx-ui` — lynx-ui 组件选型与 API。
- `lynx-check-css-support` — 按后端/版本核实 CSS 属性支持（勿凭浏览器经验）。
