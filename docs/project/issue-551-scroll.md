# 歌单拖动自动滚动（songloft-org/songloft#551）

2026-11-02，针对评论 `6576318751`；只修复现有排序，不新增置顶功能。

## 原因与修改

页面把普通 `SortableRoot` 放在独立 `scroll-view` 中，没有配置拖动的滚动边界。改用组件已有的 `as='ScrollView'`，由排序组件管理真实视口。通过固定版本的 pnpm patch 透出滚动回调、分页阈值和 footer，保留分页与底部导航留白。

真实 Web 长列表还暴露两处问题：

- 组件的 `scrollBy({offset})` 被 Web 直接交给 HTMLElement，浏览器忽略 offset。保留原生 offset，补上 Web 的 top 和即时滚动参数。
- 分页追加行后，已启动的主线程自动滚动定时器仍持有旧的 key 数组回调，画面滚动而落点停在旧页。更新活动循环的回调，并避免追加时重置正在使用的拖动浮层。卸载时停止循环，松手仍按组件原流程结束。

保持原有单曲 move API 与自定义升序语义；后端没有修改。

## 验证对象与结果

- Lynx：`8ed3c6484d6107a5f5fd0dc417b6d984578524fd` + 本批未提交修改；父仓库 `e204855590bdf4c38483ff87ee19769ba91df1fc`，Flutter 配套修复在其工作树中。最终文件哈希见 `/tmp/songloft-551-scroll/verification.json`。
- Linux amd64 / Node 22.17.1 / pnpm 11.15.1 / Docker HeadlessChrome 121.0.6167.85。独立测试数据库、真实临时后端、140 首合成 MP3，经 `/scan` 生成 Scroll551 歌单；未使用用户曲库。
- `pnpm exec tsc -b`、`pnpm run build`（Lynx/Web 双产物）、`pnpm run build:web-embedded` 均通过。全量 355 文件 / 3768 项通过，页面及源/发布代码控制器的定向 36 项通过。
- 隔离旧页面：新滚动边界回归因未配置 ScrollView 失败。未打补丁的上游组件：6 项控制器测试中 4 项失败、2 项原生参数用例通过，分别抓住 Web 不滚动与分页回调不更新；新实现全部通过。日志 `/tmp/songloft-551-scroll-lynx-{negative-final,controller-negative-delivery,focused-delivery,all-final,types-final,build-final,web-final}.log`。
- 真实浏览器 1200×900：同一页面首曲一次拖到第 46 位，实际 scrollTop 从 0 到 2030；期间请求 offset=20/40 等后续页。再把第 43 位的歌曲一次拖到第 2 位，scrollTop 从 2031 到 69；两次均核对后端落点，刷新后完整 140 首顺序不变、页面异常为 0。另一个独立向上场景从第 20 位移到第一位，也通过刷新验证。
- 浏览器证据 `/tmp/songloft-551-scroll/lynx-ui.json`、`lynx-{drag,beforeUp,saved,reloaded}.png`，独立向上证据 `lynx-up.json`。失败的中间浏览器结果保留：首次只有配置开关时未滚动；补 Web 参数后追加页仍停在旧落点；连续拖动首轮在上一轮数据尚未稳定时取坐标失败，等待该次异步更新稳定后同一源码通过。它们没有被当作通过证据。隔离副本早期依赖路径失败也不计反向验证。
- `git diff --check`、UTF-8 与双语配对检查通过；pnpm patch 曾自动升级无关传递依赖，已恢复，只保留 sortable patch 的锁文件变化。

Not run：Android/iOS/HarmonyOS 原生编译、真机手势和报告人 Windows 客户端验收；Lynx 原生参数仅由控制器测试与双产物检查覆盖。Flutter 另有 813 项全量、宽/窄屏双向实际 Widget 手势、分析和嵌入 Web 构建通过，见其 `docs/cn/issue-551.md`。本批未提交、推送、更新父指针、发布或写 Issue。

建议提交：`fix(playlist): 修复拖动排序跨屏自动滚动`，`Ref songloft-org/songloft#551`。
