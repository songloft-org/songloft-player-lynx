# 审计任务 A03 — 曲库、歌单与破坏性数据操作

## 快照与状态

`20260901-main-982291d` · `main@982291d` · Context `9cd06e…a37eae` · 待开始。

## 范围与问题

- 范围：library、library-ops、playlist、相关 models/query/mutations、导入导出与 server-scoped 数据。
- 问题：筛选/分页/排序、歌单 CRUD、删除与扫描等链路是否使用正确 API 契约，并在成功、失败、切服和缓存失效时维持一致状态。
- 排除：后端 swagger 实现不在仓库；全局歌曲菜单的布局由 A04。

## 分区依据与入口

Context 将 TanStack Query 定义为服务端态 owner、Zustand 定义为客户端态 owner，并要求 ≥3 个或含可选参数的 store 方法使用对象参数。

入口：各 feature `api/`、`data/`、页面 mutation 调用点，`src/models/`、`src/lib/query/`。

## 边界与证据策略

从用户动作追踪到 mutation/API/model parse/cache invalidation 与错误 UI；检查删除确认、跨服 key、分页边界和替代入口。与 A01 复核 server/token 边界，与 A04 复核全局菜单上下文快照。
