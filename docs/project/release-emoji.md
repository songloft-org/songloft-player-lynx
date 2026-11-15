# 关于／升级页 Release emoji 验证

日期：2026-11-15。仓库 `songloft-org/songloft-player-lynx`，基线 `1de473505589ec74e358e72bd7b95f06ba5df1a9` 加本批未提交工作树（含同会话的备份修复）。最终差异及产物哈希见 `/tmp/songloft-release-emoji/verification.json`。

## 行为与回归

用户确认 Android 显示 `:sparkles:` 原文。`marked` 的 GFM 词法解析不展开这些短码，客户端和后端更新说明共用的 `Markdown.tsx` 直接输出文本。现按 `gemoji` 名称表转换普通正文节点，涵盖标题、强调、表格和链接文字；不预处理原始 Markdown，代码、转义短码、自动链接、链接地址及未知名称保持原文。字典只读自有属性。新增依赖同步 MIT 许可证，lockfile 仅增加 `gemoji`；许可证检查兼容 package.json 的 GitHub 仓库简写。

旧代码三项回归因仍显示短码而失败：共享 Markdown、关于页后端说明、客户端更新说明。修复后 36 项定向通过；代码、链接点击及未知名称回归同时通过。日志 `/tmp/songloft-release-emoji-{regression-before,focused-final}.log`。

## 验证矩阵

| 检查 | 结果 |
| --- | --- |
| `pnpm exec tsc -b` | 通过 |
| `pnpm run build` | Lynx / Web 双产物通过 |
| `pnpm test` | 360 文件 / 3811 项通过 |
| `pnpm run test:release` | 89 项通过，无跳过 |
| 临时 embedded Web，1100px / 390px | 旧包保留短码，新包 12 个真实 changelog 分类标题转为 emoji；代码和目标 URL 保留，页面异常 0 |
| Android 34 x86_64 原生关于页 | 手工触控登录、设置、关于、滚动；✨、🐛、📝、🔧、⚡、✅ 等实际字形正常 |
| 完整 Android 原生重编译 | **已尝试后取消**：Gradle 8.7 下载未完成，不计为通过 |

环境：Linux、Node 22.17.1、pnpm 11.15.1。网页和 Android 使用临时服务端；更新检查响应为基于仓库真实分类标题的可控夹具，不执行升级。Web 截图和断言在 `/tmp/songloft-release-emoji/{browser.json,before-1100.png,after-1100.png,after-390.png}`。

Android 复用工作区已有的 debug APK（原生壳 0.1.6），只替换 `assets/main.lynx.bundle`，保留原生类、库和宿主身份后用临时密钥签名。哈希在 `android-artifact.json`；截图 `android-emoji.png` 证明实际原生字形，不能当作当前原生源码重新编译通过。先前模拟器中断，独立只读 AVD 的 Vulkan 启用时宿主崩溃；关闭 Vulkan 后通过。快速输入曾漏掉端口字符，确认输入框值后经 adb reverse 完成真实登录。以上均为验证环境／驱动问题，没有修改业务逻辑绕过。

Not run：报告人的原机、其他 Android 版本、iOS / HarmonyOS、Firefox / Safari 的本次 emoji 验收、真实 Release 元数据下载和升级安装、远端 CI。改动未提交、推送、更新父指针或发布。
