# songloft-org/songloft#549：曲库全选与批量删除

[Issue](https://github.com/songloft-org/songloft/issues/549) 的截图对应 Lynx 曲库，正文要求增加全选和删除，没有评论或关联修复。2026-11-01 核对远端 main 与本地均为 `ea55033d73456d9268d8e31069ced1e144511dce`；父仓库基线 `2ef6118cf3436792b7d5c4d231ed5770f07c2978`。[English](../en/project/issue-549.md)。

## 行为

- 全部、本地、网络、电台视图进入多选即显示操作栏，零选择也能全选。全选通过 `/songs/ids` 获取当前来源、搜索、排序及隐藏歌曲设置下的完整 ID，包含尚未加载的分页；再次点击取消全选。
- 切换筛选、输入新搜索、退出选择或卸载后，旧请求不能恢复选择；请求失败保留原选择并提示错误。旧删除完成回调也不能退出后来的新选择状态。
- 删除复用根级确认弹窗，显示所选数量；默认只删除曲库记录，本地文件删除须主动开启。取消和失败保留选择，成功退出选择并刷新曲库、分类、统计与歌单缓存。
- 保留添加到歌单及支持宿主的设备缓存。缓存全选结果时补齐离屏歌曲元数据，仅提交选中的 ID，复用会话检查和一万首上限；当前可见页不是批量操作的数据边界。
- 操作栏允许换行并保留导航避让。Flutter 已有全选/批量删除；本批未改 Flutter、后端接口或原生宿主。

## 验证

环境：Linux x86_64、Node 22.17.1、pnpm 11.15.1、Go 1.26.0；Docker Chromium 121 与 Linux WebKit 18.4。对象为上述客户端基线 + 未提交工作树，父 gitlink 不变。最终源码/工作树标识及产物哈希保存到 `/tmp/songloft-549-ui/verification.json` 和 `worktrees.json`。

- 新增的首批三个全选回归在旧实现下均因入口缺失失败，原有 15 项通过：`/tmp/songloft-549-before.log`。覆盖零选择、完整 ID、迟到响应、失败、筛选范围、删除确认与选择生命周期、缓存离屏歌曲及弹层互斥。
- `pnpm test --maxWorkers=2` 完整快照：354 文件 / 3754 项通过，日志 `/tmp/songloft-549-tests.log`。随后补充旧完成回调隔离、批量确认按钮文案与两项测试；最终五个受影响文件 / 72 项通过：`/tmp/songloft-549-final-focused.log`。不将早期全量快照当成最终代码的全量重跑。
- 最终 `pnpm exec tsc -b`、`pnpm run build`（Lynx/Web 双产物）、`pnpm run build:web`、`pnpm run test:release`（89 项）及 diff 检查通过；日志 `/tmp/songloft-549-{types-final,build-final,web-final,release-tests}.log`。构建保留已有 `touch-action` 编码警告。
- 临时真实 Go 后端、独立 SQLite 与 48 首测试曲库：45 首网络歌曲、2 首合成本地 MP3、1 个电台。音乐目录位于 `/home/hanxi/work/songloft-review/issue-549/music`，不在 `/tmp`，未操作用户数据。
- Chromium 390×844 英文：仅加载 40 首时全选 45 首；取消后仍选中 45 首。代理故意让一次删除返回 500，错误可见且选择保留；重试成功，后端仅删除这 45 首。实际中文本地流程分别发送 `delete_files=false/true`；前者记录删除而 `keep.mp3` 保留，后者 `delete.mp3` 消失，最终数据库仅剩未操作的电台。证据：`browser-final-result.json`、`local-result.json`、`backend.log` 与对应 PNG，均在上述临时目录。
- WebKit 中文：全选 2 首、取消全选为 0、取消删除保留 2 首；390×844、320×568、390×420 的全部操作按钮均在视口和底部导航之上。页面异常为空。证据：`webkit-result.json`、`webkit-confirm.png`。
- 保留早期驱动/环境失败：登录控件及内存路由前置状态、对无尺寸 raw-text 的点击、未等 Worker 更新的断言；改为临时账号会话预置、实际导航和可点击容器后通过。WebKit 首次缺 EGL vendor/驱动路径，显式指定临时依赖和系统 DRI 后通过。失败日志保留于同一目录，不计为产品验收通过。

Not run：报告人的 iPhone Safari、Android/iOS/HarmonyOS 宿主构建与设备、原生设备缓存下载、后端全量测试及远端 CI。浏览器和共享 JS 不能替代真机；后端源码未变，仅构建并运行真实 HTTP 链路。未提交、推送、发布、评论或关闭 Issue；子模块保持 dirty，父指针不伪造更新。

建议提交：`feat(library): 补齐曲库全选与批量删除 (songloft-org/songloft#549)`。

上述为本地验证快照。用户随后明确授权本批提交、推送并回复 Issue，包含先提交子仓库再同步父 gitlink；正式版发版与关闭 Issue 不在授权内。实际提交、同一 SHA 的 CI 与评论链接保存到 `/tmp/songloft-549-ui/delivery.json`，以 GitHub 记录为准。
