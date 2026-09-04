# 审计任务 A04 — 路由、覆盖层、响应式与 Web realm

## 快照与状态

`20260901-main-982291d` · `main@982291d` · Context `9cd06e…a37eae` · 待开始。

## 范围与问题

- 范围：router、Shell、back stack、全局 overlay/dialog/popover、player responsive UI、Web host bridge 与平台/realm 判断。
- 问题：各路由返回、覆盖层 LIFO、虚拟列表菜单、窄宽屏分支和 Web worker → 主线程调用是否可达且不会产生不可见/不可关闭 UI。
- 排除：业务 mutation 正确性由 A03；原生模块实现矩阵由 A05。

## 分区依据与入口

Context 明示 Web worker 无 DOM、`isWebPlatform` 与 `isWebEnvironment` 职责不同、全局覆盖层必须位于 root `ThemeProvider` 内，且返回链为 overlay → route parent → exit。

入口：`src/router.tsx`、`src/shared/nav/`、`src/shared/ui/`、`src/shared/layouts/`、`web/*host*`、`src/native/web-*`。

## 边界与证据策略

枚举叶子路由与父级表，追踪覆盖层 activation/close，检查 Web 标签和主线程桥接，结合 responsive 测试失败定位生产代码或测试契约漂移；对照已有 CSS/渲染测试和平台 guard。
