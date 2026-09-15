# A01 结果 — 启动、会话、存储与网络鉴权

## 结论

在当前快照内未确认启动、会话或鉴权缺陷。启动恢复、token 单飞刷新、服务器切换清理和存储降级链路能够互相闭合；没有把仅靠异常假设的边缘情况升级为问题。

## 实际覆盖

- `src/index.tsx` 的首帧初始化与宿主事件装配。
- auth store、`TokenStore`、API interceptor 的读取、刷新、失效和退出链路。
- server profile 切换后 token、共享 QueryClient 与 base URL 的一致性。
- native → localStorage → IndexedDB → memory 的存储选择与 Web worker realm 约束。

## 反证与缺口

- UI 不允许删除当前 server profile；store 未重复此约束，但未发现当前可达旁路。
- 未连接真实后端验证 refresh token 和切服时序；结论限于仓库内实现与现有测试。
- IndexedDB 事务失败后的内存镜像仅形成低置信度边缘假设，证据不足，未登记。

## 跨模块输入

与 A03 核对 QueryClient 的 server-scoped 清理，与 A05 核对存储宿主实现。无候选 Finding。
