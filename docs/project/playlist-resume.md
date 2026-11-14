# 歌单续播验证（2026-11-14）

本次实现及提交、推送已获用户授权；按客户端先提交、父仓库再更新 gitlink 的顺序交付，不创建正式版本标签。父仓库基线 493e02b，Flutter c0cfa70，Lynx 84a1f56；以下记录绑定提交前已验证的工作树，最终差异摘要保存在 /tmp/songloft-resume/worktrees.json，提交号与远端 CI 结果以本批交付记录为准。

## 行为与契约

普通歌单的收听位置与模式由服务端独立保存；有声书使用系统 label audiobook，首次默认顺序播放。显式点歌从头播放；继续收听恢复毫秒位置和歌单模式。歌单内搜索选中后装入完整歌单，使用持久排序，队列补齐保留当前音频实例和源确认身份。

父仓库 docs/playlist-resume.md 是完整业务/API 说明。旧历史不推算进度，旧服务端缺少新接口时保留基本播放。

## 验证

Linux amd64、Go 1.26、Flutter 3.41.5、Node 22、Docker Chrome：

- 后端：相关 services/database/handlers/app 测试、进度 HTTP 与真实 SQLite 回归、同范围 vet、sqlc 和 Swagger 生成通过。覆盖版本冲突、清除后迟到写、单独保存模式、成员移除、非法参数及不存在歌单。日志 /tmp/songloft-resume-{go,http-tests,go-final}.log。
- Flutter：analyze 无问题，播放器目录 295 项测试通过；新同步测试覆盖源未确认不得写入、串行版本、模式独立保存、冲突停止上传。嵌入 Web 构建通过；日志 /tmp/songloft-resume-flutter-*。
- Lynx：全量 360 文件、3798 项测试通过；之后补充有声书文字展示及补齐期间睡眠计数只处理一次，复跑页面 32 项、最终播放器 88 项、类型与双产物构建。覆盖初始位置随音源准备传递、150 集队列、失效歌曲拒绝播放、原歌曲对象保留、完成状态不被普通 flush 擦除。日志 /tmp/songloft-resume-{lynx-final,playlist-acceptance,player-final,types-final,bundle-final}.log。
- 真实浏览器：隔离数据库与 150 集、每集 900 秒的生成 WAV；音频文件位于 /home/hanxi/.cache/songloft-resume/music，不使用私人曲库。
- Lynx 点击继续收听：从 754 秒恢复到约 760 秒，服务端更新到约 759 秒，保留 single 模式。Flutter 随后读取同一歌单，音频继续到约 764 秒、服务端同步更新。两端无 pageerror，证明实际音频时间与服务端状态一致。
- 搜索验证：Lynx 通过宿主 input 的真实 input 事件设置关键词，后续用鼠标点播及打开队列；显示 150 首，选中 128 集从零播放，下一首实际为 129 集。Flutter 用鼠标和键盘搜索 128 集，点播从零开始，下一首同样为 129 集。结果保存在 /tmp/songloft-resume/browser-search-verified.json、flutter-search-final.json。续播证据 browser-seek-result.json、flutter-play-result.json，截图对应 lynx-seek.png、flutter-play.png。

## 已发现并修复的问题

首次浏览器验证出现界面显示 12:34，而实际音频仅播放约 6 秒、服务端仍为旧位置。原因是命令 Promise 返回早于原生准备完成，紧接着 seek 被加载覆盖。修复为通过 source-load 的 initialPositionMs 事务准备音源，并在有序队列补齐时保留正在加载的 Song 对象；现有普通点播接口的前三个参数保持兼容，新增可选第四参数 initialPositionMs。

## 未跑项目

Android/iOS/HarmonyOS 真机、后台杀进程和投屏续播 Not run：本环境没有对应设备；Web 操作与 Mock 音频不能代替这些验收。未执行正式发布；远端 CI 待推送后按同一提交追踪。
