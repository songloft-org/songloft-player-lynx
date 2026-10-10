# 更新日志

此文件记录 Songloft Player（Lynx）的版本变更，仅提供中文版本。版本 tag 的 Release 发布成功后，由 CI 根据 Conventional Commits 分类追加记录并提交到 `main`；滚动 dev 记录见 [GitHub Releases](https://github.com/songloft-org/songloft-player-lynx/releases/tag/dev)。

## 开发记录（截至 2026-10-10）

以下列出近期变化，完整开发历史见 [Git 提交记录](https://github.com/songloft-org/songloft-player-lynx/commits/main/)。

### 新增功能

- [`086485f`](https://github.com/songloft-org/songloft-player-lynx/commit/086485faa26d24fa89d0b22067e408d5423bd6b2) — 支持下一首播放与随机历史导航。
- [`ee5e73d`](https://github.com/songloft-org/songloft-player-lynx/commit/ee5e73d5959d741d2893bfc88487e7a15a7f719d) — 支持 Android 自定义歌曲缓存目录。

### 问题修复

- [`35b42fe`](https://github.com/songloft-org/songloft-player-lynx/commit/35b42febd19a1526c2e189a9c8474c4af68cc0f5) — Release 增加分类提交记录和中英双语安装说明。
- [`0bbf12c`](https://github.com/songloft-org/songloft-player-lynx/commit/0bbf12c10658584aa810084d5f26ffb64f24dc4c) — 修复列表拖动排序时页面跟随滚动。
- [`b8cada4`](https://github.com/songloft-org/songloft-player-lynx/commit/b8cada49459ddd8e48ef2edb9f82c2f9dff6a8e7) — 同步 Android Tab 玻璃透镜与胶囊动画。
- [`928435c`](https://github.com/songloft-org/songloft-player-lynx/commit/928435cdbe8298c7b3b98180654e231513e50726) — 补齐歌曲和歌单显隐入口。

### 重构

- [`2c5c37f`](https://github.com/songloft-org/songloft-player-lynx/commit/2c5c37fe736a10525f729e82614fca1949b24a6a) — 合并导航与插件设置。
- [`dcbf7c3`](https://github.com/songloft-org/songloft-player-lynx/commit/dcbf7c397f6e6453e31fbe238a2747059717b9be) — 将插件导航设置集中到插件管理页。
