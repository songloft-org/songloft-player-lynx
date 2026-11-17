# #573 扫描排除提示

2026-11-17；基线 `034cf838a46e59a26d1c24df91bf6326f0562e6b` 加本批未提交工作树，关联 songloft-org/songloft#573。既有桌面候选改动保留，不属于本批。

下述状态记录本地验证阶段。用户随后已授权提交、推送及父仓库 Issue 回复，精确提交、隔离检出验证及同 SHA CI 以 `/tmp/songloft-573-exclusions/delivery.json` 为准；不创建正式版本。

扫描页通过后端 `POST /scan/validate` 获取所选起点及命中规则，开始前重新获取；全排除、校验失败时不启动，部分排除时解释跳过项。进度模型兼容旧进度缺少 `excluded_directories` 的情况，终态单独显示被剪枝目录，不把它们算成已有歌曲跳过。设置保存后使校验缓存失效；启动拒绝用 toast 说明原因并保留操作控件。设置说明扫描排除与自动创建歌单排除的区别，无临时豁免参数。

Linux amd64、Node 22.17.1 / pnpm 11.15.1：230 项相关测试、368 文件/3854 项全量测试、`tsc -b`、Lynx/Web 双产物及 embedded Web 构建通过。移除显示与拦截的隔离副本中，两项界面回归因缺少诊断按预期失败。首轮桌面类型错误及隔离依赖解析失败不计通过；后续检查与反向验证另有成功记录。

证据目录 `/tmp/songloft-573-exclusions/`：`lynx-{targeted-final,tests,types-final,build,web-build}.log`、`negative-lynx.log`；源码摘要 `source-identities.json`。浏览器页面事件与真实后端联调通过，全排除及混合两次按钮动作共一次扫描请求，结果保留规则；`ui-lynx-results.json`、`ui-lynx-final.js`、`lynx-{blocked,result}-desktop.png`。鼠标/触摸路径因 Chrome 121 焦点委托跳到下方输入框而失败，后续使用 DOM `click()` 隔离默认焦点动作，不算真实鼠标验收；原始失败保留，通用焦点代码未修改。后端、HTTP 与完整边界见[主仓库记录](https://github.com/songloft-org/songloft/blob/main/docs/issue-573-scan-exclusions.md)。Not run：Android/iOS/HarmonyOS 真机、报告人的 Docker 与私人音频。未提交、推送、发布或评论 Issue。
