# #545 · Safari 本地插件安装一直加载

目标：[songloft-org/songloft#545 最新反馈](https://github.com/songloft-org/songloft/issues/545#issuecomment-6488524640)。2026-10-29，客户端基线 `645717f254481baffd13a21da1ff5ba0191d29d4`，父仓库基线 `deaf6342e0bac964eb8db7ddcb9ff825575b85b7`，加本次未提交工作树。环境：Linux x86_64、Node 22.17.1、pnpm 11.15.1、Docker Chrome 121。

## 调查与修改

报告人补充 iOS 18.6 Safari、后端 v2.13.7、客户端 0.1.7 仍有问题。此前 `1d9317a` 修复 iOS 原生 delegate 生命周期，已包含在 0.1.7 历史中，但不经过浏览器上传链路。Web 业务在 Worker 执行，经 RPC 到主线程后调用隐藏 input 的 click；打开被阻止时不会有 change/cancel，Promise 与安装态持续等待。

Web 上传统一使用 `web/file-transfer-host.js` 的可见文件面板，直接点击文件控件以取得主线程手势。保留 URL、multipart 字段和 same-origin Cookie。ZIP 同时接受扩展名和 MIME；取消、HTTP 错误、网络错误、四分钟上传超时均结束本次操作，清理 DOM、计时器和请求，允许重试。选择文件阶段没有超时。DOM fallback 复用同一实现；文本取消方法不会取消上传。原生 ABI 没有变化。

完整页面验收进一步证实共享客户端传入 `plugin` 字段，而 Swagger 与 `internal/handlers/jsplugin.go` 均要求 `file`；真实后端因此返回 400。修正共享调用点为 `file`，影响 Web 和各原生客户端的本地插件安装。新增页面回归对旧字段按预期失败，日志 `/tmp/songloft-545-field-before.log`。此处是契约修复，未修改后端 API。

这是已复现的 Web 缺陷；尚不能证明报告人的真机只有此根因。主线程用户激活约束参见 [WebKit](https://webkit.org/blog/13862/the-user-activation-api/)。

## 验证记录

- 新增主线程 RPC 回归在旧代码下因仍点击隐藏 input、缺少可见/取消控件而失败；日志 `/tmp/songloft-545-web-before.log`。修复版覆盖上传、取消/重试、HTTP/网络失败、在途取消与迟到结果、上传超时及 DOM fallback；最终汇总见 `/tmp/songloft-545-verification.json`。
- Docker Chrome 的真实 Worker / 主线程桥接夹具：无用户激活时，旧实现停在 loading，只有 display:none input。修复版显示文件控件；真实点击取消后重试，系统文件选择器接受文件，服务端收到 multipart 的 plugin 字段、文件名、内容与 HttpOnly 网关 Cookie，页面收到成功回执，面板清理、无页面异常。结果 `/tmp/songloft-545-browser-result.json`、服务端证据 `/tmp/songloft-545-browser-uploads.json`、截图 `/tmp/songloft-545-browser-panel.png`。此夹具没有安装真实插件，不冒充完整安装或 Safari 真机验收。
- 完整页面：使用最终 `build:web` 产物与临时数据库、既有真实后端验证二进制 `/tmp/songloft-543/songloft`（非本次重新编译后端），界面登录 → 设置 → 导航与插件 → 从文件安装 → 取消 → 重试 → 真实文件选择器上传测试 ZIP。旧字段实收 400，修复后实收 201，列表显示已安装 `Gateway Cookie Fixture` 与成功 toast，无页面异常。`/tmp/songloft-545-app/browser-final.json`、`requests.jsonl`、`panel.png`、`screenshot.png`；临时后端与源码指纹见汇总。
- 初次并行验证出现构建/类型检查被 SIGKILL、扫描测试超时以及缺失构建产物；保留 `/tmp/songloft-545-web-{build,build-final,types-final,tests-final}.log`，不记作通过。清理本批遗留进程后串行重验，最终命令与结果另列汇总。
- 最终类型检查通过（`/tmp/songloft-545-types-delivery.log`）；双产物与 Web 部署构建通过（`/tmp/songloft-545-build-delivery.log`、`/tmp/songloft-545-deploy-final-verified.log`）；45 项定向回归通过（`/tmp/songloft-545-targeted-final.log`）。全量 `pnpm test --maxWorkers=4` 为 3732 通过 / 1 失败：`build:web` 清理 `dist/main.lynx.bundle`，产物闸门报 ENOENT。之后重新双构建，原失败文件 3 项全部通过（`/tmp/songloft-545-artifacts-delivery.log`）；未把原全量命令改记为通过，也未为此放宽断言。完整日志 `/tmp/songloft-545-tests-delivery.log`。

Not run：报告人的 iOS 18.6 Safari / PWA 与原生 App 真机。Linux WebKit 尝试因 WPE EGL 初始化失败关闭页面，不能计作 Safari 通过。没有改原生宿主代码，未追加各端原生编译；共享字段修复仍需原生设备复验。未运行全量后端测试。尚未提交、推送、发布、更新父 gitlink 或发表评论；并行 #540 的 library、宿主页及相关文档修改保留。

以上为实现阶段的提交前快照。用户随后明确授权本批提交、推送、同步父指针并回复 Issue；仅提交 #545 的代码与文档，保留 #540 改动。最终提交、同 SHA 的 CI 与评论以 GitHub 交付记录为准；未授权正式发布或关闭 Issue。
