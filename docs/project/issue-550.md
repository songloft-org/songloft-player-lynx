# 内置收藏歌单排序（songloft-org/songloft#550）

2026-11-02；基线 `a90cded03be18426de61c6df436d08a29e7a3077` 加本次未提交工作树。Linux amd64 / Node 22.17.1 / pnpm 11.15.1 / Docker Chrome 121。父仓库基线 `71635ae30ec76a6a0a8bf4efa94304fe2276a057` 加未提交后端修复。

后端错误地用内置歌单身份保护拒绝成员排序，修复后支持 reorder / move / sort。Lynx 同时开放收藏、电台收藏的手动排序入口，保留编辑身份、隐藏和删除限制。进入手动排序前，将视图偏好保存为自定义升序，避免在名称等视图下修改位置后看起来没有变化。

原 `onSortEnd` 取第一个位置变化的条目；`[1,2,3] → [2,3,1]` 因而误发移动歌曲 2 到首位，结果成为 `[2,1,3]`。改为按最大位移识别单次拖动的歌曲，旁边被推开的条目只移动一格；相邻交换的两种单首移动等价。

## 验证

- 新内置普通／电台菜单回归在旧入口下 2 项失败；跨多行向下拖动回归在旧回调下失败；非自定义视图进入排序的回归在旧实现下失败。日志 `/tmp/songloft-550-lynx-{before,move-before,view-before}.log`。
- 最终 `pnpm run build` 同时生成 Lynx/Web；`pnpm run build:web-embedded`、`pnpm exec tsc -b`、`pnpm test` 通过（354 文件、3761 项）。日志 `/tmp/songloft-550-lynx-{build,web,types,tests}-final.log`。
- 1200×900 真实浏览器分别打开收藏与电台收藏，通过更多菜单进入手动排序，将第一首跨三行拖至末尾。真实 `/songs/move` 请求、后端 position 顺序与页面一致，刷新并重新打开后界面顺序仍正确。页面异常为零。认证由隔离测试账号的真实 API 登录及 IndexedDB 会话夹具预置；排序交互使用真实鼠标操作。
- 实际 embedded 产物位于父仓库 `clients/player-build/web-embedded`；不能用旧 `web/dist` 代替最终产物。证据 `/tmp/songloft-550-ui/lynx.js`、`lynx-final.json` 与 `lynx-*.png`；源码指纹 `/tmp/songloft-550-verification.json`。

Not run：Android/iOS/HarmonyOS 真机、原生宿主编译、Safari/Firefox 与远端 CI。未修改原生代码；Web 不代表原生手势验收。尚未提交、推送、发布或回复 Issue；部署需同时升级后端与 Lynx 客户端。
