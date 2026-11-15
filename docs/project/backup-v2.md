# Web v2 备份兼容验证

- 日期：2026-11-15；仓库 `songloft-org/songloft-player-lynx`。
- 基线：Lynx `1de473505589ec74e358e72bd7b95f06ba5df1a9`，后端 `2326b38a6ab97b194cc7b7cb1595f49d75bcd32b`；加本次未提交工作树，最终差异标识见 `/tmp/songloft-backup-v2/verification.json`。
- 环境：Linux x86_64、Node 22.17.1、pnpm 11.15.1；Docker Chrome、普通 HTTP、临时嵌入式 Web 包与两个独立 SQLite 后端。

## 修复与回归

`data-transfer.ts` 的共用校验同时用于导入文件与导出响应，旧实现只接受 v1。现允许 v1 / v2，保留 `playlists` 数组与版本检查，原样传输文本和标签字段；中英文无效文件提示同步更新。

三项 v2 回归在旧代码因 `invalid_json` 失败，覆盖导入、导出和认证刷新 / 子路径重试；修复后数据传输与数据页共 28 项通过。日志 `/tmp/songloft-backup-v2-{before-final,focused}.log`。

## 实际浏览器流程

1. 实例 A 预置共享标签、歌曲与有声书歌单，从数据管理页实际下载 v2 JSON。下载文件与后端导出内容一致（排除每次变化的导出时间），包含标签定义与歌曲 / 歌单引用。
2. 实例 B 预占标签 ID 1，通过真实文件选择器导入这份下载文件。新歌单 1、合并内置歌单 2、歌曲 1；只读 SQLite 核对标签 ID 1 → 2，颜色、系统标记及歌曲 / 歌单绑定均正确。
3. v1 旧备份成功创建另一歌单；v3 显示更新后的无效文件提示，B 只收到两次导入 POST，未知版本未上传。
4. 导出 / 导入页面异常均为 0。数据和截图：`/tmp/songloft-backup-v2/{browser-export.json,roundtrip.json,downloaded.json,export.png,import.png}`。

## 最终检查

| 命令 | 结果 |
| --- | --- |
| `pnpm run build` | Lynx / Web 双产物通过 |
| `pnpm exec tsc -b` | 通过 |
| `pnpm test` | 360 文件 / 3809 项通过 |
| `pnpm run test:release` | 89 项通过，无跳过 |
| `node scripts/copy-bundle-web.mjs --embedded --out-dir /tmp/songloft-backup-v2/web` | 通过，浏览器使用此临时包 |
| 父仓库 `npm run docs:build`（在 `docs/`） | 通过，197.12 秒 |
| 两仓库 `git diff --check`、UTF-8 | 通过 |

日志前缀 `/tmp/songloft-backup-v2-`：`build-final.log`、`types-final.log`、`tests.log`、`release-tests.log`、`docs.log`。最终对象及结果存于上述 `verification.json`。早期浏览器驱动遇到节点替换和 Worker 请求观测问题，修正驱动后重新验证；不改业务代码绕过验证。

Not run：Android / iOS / HarmonyOS 原生编译与真机、Firefox / Safari，原因是本次修改 Web 共用备份校验，未改原生上传路径。未提交、推送、更新父指针或发布。
