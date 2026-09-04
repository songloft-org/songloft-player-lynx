# A03 结果 — 曲库、歌单与破坏性数据操作

## 结论

分页 key、歌单 mutation 和模型解析总体一致；全局歌曲删除成功后使用了仓库中不存在的 query key，导致缓存不会刷新。

## 已确认问题

- [AUD-003](../Findings.md#aud-003-p2-全局删除歌曲后失效了不存在的查询键)：`['songs']` 与实际 `['library','songs', filters]`、`['playlist','songs', id, filters]` 不匹配。

## 实际覆盖与反证

- 从全局歌曲菜单的确认动作追到 API、成功/失败 UI 和 TanStack Query 缓存。
- 全仓搜索仅找到该处使用裸 `['songs']`；没有隐藏的同名 query 可被命中。
- 歌单自身 mutations 使用 `playlistQueryKeys`，因此未把独立正确路径并入此问题。

## 证据缺口

后端 swagger 不在当前机器给定路径，未验证服务端删除副作用；问题只主张客户端缓存失效无效。
