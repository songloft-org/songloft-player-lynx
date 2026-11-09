# 手机歌曲行排版（songloft-org/songloft#562）

2026-11-09。报告为荣耀 30 Pro、鸿蒙 4、Bundle dev；截图中的横向更多按钮、独立移除按钮与 Lynx 歌曲行一致。未取得报告人安装版本，未在该设备复现。

## 修改

- 窄屏时长移到歌手/专辑所在的第二行，长副标题省略时仍保留完整时长；缺少歌手/专辑时仅显示时长。
- 收藏与更多相邻靠右排列，各保留 44×44px 点击区域；收紧左右及封面后间距，保留原序号栏宽度与首字母提示。
- 手机普通歌单的独立 `×` 移入根级歌曲菜单，复用原有移除确认和成员 API。移除成员与删除曲库歌曲仍是两个动作。桌面快捷按钮、内置歌单保护、多选和手动排序保持原有行为。
- 标题的裁剪/静态省略由 `ScrollingText` 控制，外层分配可收缩宽度，MV 标记不收缩。未修改滚动开关或动画实现。基线浏览器已能滚动，不能据此证明报告人设备的“不滚动”原因已修复。

## 验证

- 对象：`songloft-org/songloft-player-lynx` 基线 `5e6fe23055eb6512fe185e2fcb9b3acaf9e73497` + 本次未提交工作树。主仓库 `7089a9b032591dd305b26e1d22636bc9f6562f8b`、Flutter 源码和父 gitlink 未修改。最终文件哈希、diff、工具版本与结果见 `/tmp/songloft-562/verification.json`。
- 环境：Linux amd64、Node 22.17.1、pnpm 11.15.1、TypeScript 6.0.3、Docker Headless Chrome。浏览器使用实际 Web 产物及独立 HTTP 夹具；歌曲、收藏和歌单成员均为合成数据，不代表真实后端、私人曲库或鸿蒙原机验收。
- 反向验证：隔离旧源码运行新增测试，3 项按预期失败，分别为窄屏时长位置、上下文移除回调和菜单项。日志 `/tmp/songloft-562/before-tests.log`。首次副本因 Vite 禁止访问副本外依赖而未执行测试，补充副本文件读取白名单后才得到有效失败，未覆盖当前工作树。
- `pnpm exec tsc -b`、Lynx/Web 双产物与嵌入 Web 构建通过；原生编码保留两条既有 `touch-action` 告警。最后 CSS 间距调整后，最终 84 项定向与完整 355 文件 / 3,779 项均通过，日志见 `final-focused.log`、`full-tests-final.log` 和 `verification.json`。定向覆盖菜单分发、歌单确认、桌面快捷按钮、内置歌单及滚动开关。
- Chrome 验证 390px 手机歌单/曲库、320px/1.3 倍字体暗色、1440px 桌面、关闭滚动与系统减少动画。390px 歌单标题区约 104px → 194px，曲库约 188px → 226px。长标题在两次采样间实际移动；关闭或减少动画时保持静态省略。结果与截图：`/tmp/songloft-562/*-browser.json`、`*.png`。
- 实际点击收藏后夹具收藏成员包含目标歌曲；更多 → 移除 → 取消无 DELETE；再次确认后仅发出 `DELETE /api/v1/playlists/9/songs/11`，夹具状态与页面均移除该成员，曲库歌曲仍保留。请求证据为 `mobile-zh-browser.json` 的 `interactions.audit`。

## 交付边界

Not run：荣耀/鸿蒙原机、Android/iOS/HarmonyOS 原生包与设备、WebKit、真实后端和音频播放。仅修改共享 UI、菜单接线及文档，宿主接口、原生代码和后端未变，未触发远端 CI。

上述本地验证结束时尚未提交、推送、正式发布、更新父 gitlink 或写 Issue。用户随后授权本批提交、推送、同步父 gitlink 并回复 Issue；实际提交、同一 SHA 的 CI 与评论以 GitHub 交付记录为准，不包含正式发版或关闭 Issue。
