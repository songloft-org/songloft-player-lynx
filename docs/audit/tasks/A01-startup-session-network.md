# 审计任务 A01 — 启动、会话、存储与网络鉴权

## 快照与状态

`20260901-main-982291d` · `main@982291d` · Context `9cd06e…a37eae` · 待开始。

## 范围与问题

- 范围：`src/index.tsx`、auth store、app config、storage、API client、token/interceptor 与 server profile。
- 问题：启动异步链、服务器切换、token 读写与刷新失败是否能稳定收敛到一致会话，且不会把错误服务器或旧凭据带入请求。
- 排除：播放器原生生命周期由 A02；平台存储实现配对由 A05。

## 分区依据与入口

Context 将 `src/index.tsx` 定义为启动与宿主事件装配入口，将 `src/core/network/api-client.ts` 定义为后端请求入口；架构链路为页面/store → core network/storage → 后端/宿主。

入口：`src/index.tsx`、`src/features/auth/store/`、`src/core/network/api-client.ts`、`src/core/storage/index.ts`。

## 边界与证据策略

| 边界 | 当前侧 | 另一侧 | 相关任务 |
|---|---|---|---|
| token 持久化 | auth/network | native/Web storage | A05 |
| 启动状态 | startup/auth | router guard/UI | A04 |
| server profile | settings/auth | API base URL | A03 |

依次追踪启动调用链、token refresh 并发与错误路径、服务器切换清理、各存储 fallback；搜索保护、旁路调用和对应测试。完成门禁为覆盖与缺口写入结果、候选项按状态契约处理、快照有效。
