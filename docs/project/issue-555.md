# 重开页面后恢复已保存歌词（songloft-org/songloft#555）

2026-11-03，目标为 Docker 默认 Lynx Web。报告人未确认具体客户端或提供队列快照；以下是已复现路径，不把它外推为其环境的唯一根因。

## 原因与修改

播放队列保存的是歌曲快照。若快照缺少 `lyric_url`，手动重新抓取只给歌词 store 临时补上端点，没有修改队列中的 Song。重开页面恢复旧快照后，`loadForSong` 在读缓存前就清空歌词，导致数据库和客户端缓存里都有内容也不显示。

正常加载本地歌曲时也补齐 `/api/v1/songs/{id}/lyric`：先读有效缓存，缺失才请求普通端点，不加 `refresh=1`。服务端普通请求优先读取数据库，不要求再次刮削。404 表示无歌词；其它错误仍显示加载失败。离线缓存快照、无 URL 的电台和远程歌曲、无效 ID 不进入新增兜底。

## 验证

- 仓库：songloft-org/songloft-player-lynx；基线 `07eb9b25c851b19eadb005f8345f2493aab72b2b`。主仓库后端 `88c0b4138aea53a0caf65c3c29c1713c72586177` 未修改。源码与三个测试文件的 `git diff -- <四个文件> | sha256sum` 为 `e3f2727d7377e745c7cc5de165e19c09141fdf99be1f6bac0d2bc1dc2aab5a1a`。
- Linux amd64、Node 22.17.1、pnpm 11.15.1、Docker Headless Chrome，1280×800。临时后端、真实 SQLite、10 秒合成 MP3；未访问用户曲库。
- 旧实现新增两项回归失败：持久队列恢复后不发请求、手动抓取后无法恢复有效缓存。日志 `/tmp/songloft-555-before.log`；修复后歌词 store 16 项包含这两项及离线隔离、404/502 区分，结果见 `/tmp/songloft-555-tests-final2.log`。
- `pnpm run build`（Lynx/Web 双产物）、`pnpm run build:web`、`pnpm exec tsc -b` 通过，日志 `/tmp/songloft-555-{build,web,types-final}.log`。
- 主仓库 `go build -tags dev,lite -o /tmp/songloft-555-server .` 通过，生成真实 HTTP 验证用后端；未修改 Go 代码。
- 前两轮全量分别为 3771 项通过、1 项失败：先是桌面小组件命令，再是播放位置持久化。这些测试没有模拟歌词请求，新兜底进入真实认证流程影响状态断言。两份测试增加歌词 fetcher 隔离，保留全部行为断言；失败日志 `/tmp/songloft-555-tests.log`、`/tmp/songloft-555-tests-final.log`，最终全量结果见 `/tmp/songloft-555-tests-final2.log`。
- 浏览器把缺少歌词地址的歌曲写入 IndexedDB 队列，服务端同曲保存 `lyric_source=scraped`。两次整页加载均渲染两行歌词，总计一次普通 `/lyric` 请求、零次强制刮削。第二次从持久缓存恢复；点击播放后时间到 `00:01`，首句歌词高亮，页面异常为零。证据 `/tmp/songloft-555-runtime/browser-summary.json`、`reload.png`。首次浏览器夹具的 gzip 转发和不可见 Audio 元素查询分别修正；它们不是产品失败或通过证据。
- `git diff --check`、UTF-8 和中英文件配对检查通过。
- 最终 `pnpm test`：355 文件、3772 项全部通过（134.44 秒）。完整工作树文件哈希记录 `/tmp/songloft-555-runtime/verification.json`。

Not run：Flutter Web、报告人 NAS/Docker 实例、Android/iOS/HarmonyOS 真机及原生编译、后端全量测试；本次只修改 Lynx 共享歌词加载逻辑，没有改变后端或原生宿主，后端采用编译和真实 HTTP 验证。

未提交、推送、更新父仓库指针、发布或评论。建议提交：`fix(lyrics): 恢复旧播放队列中的已保存歌词`，引用 `Ref songloft-org/songloft#555`。
