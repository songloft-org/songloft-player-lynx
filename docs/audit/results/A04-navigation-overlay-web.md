# A04 结果 — 路由、覆盖层、响应式与 Web realm

## 结论

路由父级、overlay LIFO、root 挂载和 Web 主线程桥接未发现新的已确认生产缺陷；播放器响应式测试门禁当前稳定失效，无法继续承担其声明的回归保护职责。

## 已确认问题

- [AUD-004](../Findings.md#aud-004-p2-播放器响应式测试门禁稳定失败)：测试 lyric mock 激活自动滚动，testing-library 不实现 `NodesRef.invoke`，首例失败后同文件继续出现 13 个级联失败。

## 实际覆盖与反证

- 核对 route-back 声明、覆盖层挂载点、popover/dialog 关闭语义和 Web worker/DOM 分界。
- `full-player-responsive` 隔离运行仍为 14 失败、5 通过；首个失败是明确的测试环境能力缺口。
- player layout 纯函数测试和构建通过，因此没有把这 14 项直接解释为生产布局回归。

## 证据缺口

未打开浏览器产物做响应式实测，也未跑设备返回键/overlay 行为；这些边界保持为未覆盖，不影响测试门禁自身已坏的结论。
