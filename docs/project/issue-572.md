# #572：歌单与收藏的下一首播放

关联 [songloft-org/songloft#572](https://github.com/songloft-org/songloft/issues/572)。用户要求 Flutter 修复时同步核对 Lynx。Lynx 当前实现已经由 `PlaylistDetailSongRow` → `SongListRow` → 根级 `SongRowOverlays` 共用菜单提供「下一首播放」，普通歌单与内置收藏、窄屏与宽屏均调用现有 `playSongNext`，无需重复增加生产入口。

本批新增四项完整行菜单回归：实际点击歌曲行更多操作，经过真实覆盖层状态、菜单构造和命令分发，确认只安排该歌曲、关闭菜单且不触发立即播放或歌单移除。保留现有播放队列规则。测试明确触发 `catchtap` 并手动重渲染覆盖层，遵守当前 ReactLynx 测试渲染器的约束。

验证对象：2026-11-17，基线 `6df678d10c078dcbe495ac47720ce86eab38825a` + 本批测试与既有桌面候选工作树。最终文件/差异哈希见 `/tmp/songloft-572/verification.json`；本批未修改或提交桌面宿主、音频 facade、构建配置等并行改动。

结果（Linux amd64、Node/pnpm、Docker Chrome，真实临时 Go 后端与四段生成的静音 WAV）：

- `pnpm exec tsc -b`、`git diff --check` 通过。
- 最终 `pnpm test`：367 文件、3843 项通过；新增入口与现有队列导航共 37 项定向检查通过。
- 隔离 `SongRowOverlays.tsx` 副本移除 `playNext` 分发，通过临时 Vitest transform 载入；四项检查均因排队命令未被调用而失败。实际工作树未回退或破坏。
- `pnpm run build` 同时产出 Lynx 与 Web；`pnpm run build:web-embedded` 通过。构建仍提示既有的 `touch-action` 不支持。
- 中文实际浏览器操作、未暂停且持续增加的音频时间、完整排队顺序与来源上下文见 `/tmp/songloft-572/lynx-{full,mobile}.json`；菜单截图为相应 `playlistScreenshot.png` / `favoriteScreenshot.png`。验证从原队列跨普通歌单及收藏添加歌曲，保存后的队列仍归属于原歌单。

Not run：Android/iOS/HarmonyOS 原生宿主编译、物理设备及原生音频验收；本批没有原生或生产 TS 改动。新增回归与 Web 检查不能替代原生设备验收。本批已获用户授权提交、推送、同步父指针并回复 #572；不创建正式版本。最终提交与同 SHA CI 状态见 `/tmp/songloft-572/delivery.json`。
