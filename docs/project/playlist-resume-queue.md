# 大歌单续播队列补齐（2026-11-14）

基线：父仓库 bb8cc5c、Flutter 4708c64、Lynx c10e790，加本批工作树。实现、提交及推送沿用本轮歌单续播任务授权；不创建正式版本标签。

## 原因与修复

旧实现先播放临时单曲队列，再串行拉取全部分页，直到最后才更新队列。1000 首放大了等待时间；同曲续播的提前返回还会保留恢复的残缺队列。新增两项回归在旧实现均失败，日志 /tmp/songloft-resume-1000-before.log。

两端改为先取目标附近最多 100 首，每次请求至多 100 首，每批立即更新。加载区间始终连续，优先向后扩展，再向前补齐；按歌曲身份映射索引并保留当前音频对象、时间、模式导航。已加载的下一首可立即播放，无须等待前缀补齐。失败重试最多三次，保留成功批次并提示再次继续收听。复用音频前检查完整有序 ID，残缺队列会重新补齐。

## 验证

- Lynx：tsc -b、双产物 build、嵌入 Web 打包通过；构建后 pnpm test 全量 360 文件、3802 项通过。测试覆盖延迟第二批、逐批公布中间结果、残缺队列续播不重载/seek，以及未加载完时自动进入已加载的下一集。
- Flutter：analyze 无问题；播放器目录 298 项测试通过；嵌入 Web 构建通过。纯 Dart 加载器覆盖 1000 首连续窗口、失败保留、迟到响应取消。
- Docker Chrome：隔离数据库和 1000 首生成 WAV，每次后续分页人为延迟 1 秒。两端初始队列均为 100 首，未完成时点击下一首，实际音频进入第 129 集；最终队列均显示 1000 首，无 pageerror。
- 日志 /tmp/songloft-resume-1000-{all,types-verified,build-verified,flutter-all,flutter-analyze-after,flutter-build}.log；浏览器结果 /tmp/songloft-resume-1000/browser-result.json、flutter-result.json，截图同目录 *-first-window.png 和 *-full.png。
- 最终验证对象与提交身份记录在 /tmp/songloft-resume-1000/；原生设备、后台与投屏 Not run。上轮 Flutter Android CI 在 4708c64 的 JNI 发布校验失败；本次没有修改 Android/ProGuard，不把 Web 通过视为 APK 通过。

后端接口与数据库未变。业务说明以父仓库 docs/playlist-resume.md 为准。
