# 工作交接（2026-10-09）

本文维护当前范围和验证边界；逐批证据见 [progress.md](progress.md)，已知问题见 [bugs.md](bugs.md)。旧记录中的「未提交」和验数仅代表当时快照。[English](../en/project/handoff.md)。

## 1. 当前完成度

用户已确认提交本轮 Tab 水滴动画与移动玻璃透镜修复；验证与自审完成，提交状态以 Git 历史为准，尚未推送。下方「未提交」描述保留为实施时快照。

移动 Tab 胶囊已补清晰玻璃透镜，边缘折射真实底栏材质与图标，随水滴形变改变，停稳后恢复选中填色。Android 13+ 使用独立能力门控、固定全栏硬件 RenderNode 与 AGSL；Chromium 使用实时 SVG 背景位移，iOS clear glass 已接入但未设备验收。两条光学路径均共享弹簧关键帧及起始时间，旧壳/无能力保留填色，辅助功能继续生效。最终截图与录屏见 `/tmp/lynx-tab-lens-native-proof.png`、`/tmp/lynx-tab-lens-comparison.gif`，验证明细见 progress。真机帧率/能耗及 iOS/HarmonyOS 仍待验收；本轮保留未提交改动，上一轮 `95ec1dc` 不变。以下为此前批次快照。

底栏 Tab 的「水滴」切换已对照当前 Flutter 实现和原生录屏完成：350ms snappy spring（bounce .15）同步位移与速度驱动压缩/拉伸，连续点击继承当前姿态与速度，减少动画实时取消并落位。只动画选中背景，底栏/文字/模糊稳定；未复制前景透镜变形或拖拽手势。类型、**299 文件 / 3238 项**、生产双 bundle/Web、**70 项**发布工具和 Debug APK 通过；API 34 明暗真实点击、快速反向切换、系统关闭动画，以及 Chrome 逐帧/停留、五槽位/「更多」已实测。对比 `/tmp/lynx-tab-comparison.gif`，完整证据见 progress。真机帧率/能耗及 iOS/HarmonyOS 仍待验收；本轮未授权提交或推送，上一轮光学修复已提交 `95ec1dc`。以下为此前批次快照。

对照当前 Flutter 原生截图/录屏修复底栏和迷你播放器：移除重复填色、整面渐变及定时 breathing，紧凑材质与菜单分离；Android 13+ 显式能力门控实时 AGSL 边缘折射，透镜 blur 6px、普通胶囊 12px，填色沿用 Flutter 基线及 shader .7 系数。圆角显式透明裁剪修复录屏发现的纵向色带，按压只淡化前景，保留光学材质及 Lynx 行控件不缩放约束。系统/本机辅助功能与低版本降级保留。类型检查、**297 文件 / 3231 项**回归覆盖（最后的 CSS 匹配误报已通过 **34 项**定向复测）、针对性 **111 项**、**43 项** Android JVM、**70 项**发布工具及生产双 bundle/Web、Debug APK 已通过。API 34 arm64 native bridge 明暗滚动/切页/迷你播放器和 Docker Chrome 已实测，Flutter 同夹具原生参考源码未改；临时服务/模拟器失败片段排除，完整证据与最终产物 hash 见 progress。用户真机帧率/能耗及 iOS/HarmonyOS 光学质量尚未验收；用户已授权本轮提交，尚未授权推送；实际提交以 Git 历史为准。以下为此前批次快照。

Android 胶囊修复已完成提交前自审，未发现新增问题；运行时代码未再修改，沿用下段验收证据。最终 diff/编码复查通过，用户已授权提交和推送，实际提交状态以 Git 历史为准。

Android 导航胶囊页面间材质差异已修复，提交与推送已获用户授权。capture target 补齐不透明采样底；底栏/迷你播放器明确 blur(-2) → tint(-1) → controls，填色与高光直接消费有效材质。首页不再漏出清晰图标/文字，其他页面保留模糊颜色响应。类型检查、81 项针对性检查、完整 **297 文件 / 3226 项**、生产双 bundle/Web、70 项发布工具与最终 APK 编译/内嵌产物核对通过。API 34 arm64 native bridge 的三页明暗实际滑动、四档画面差异、减少动画/透明度、增强对比度和真实导航/迷你播放器点击通过；用户 Android 13 真机、其他原生平台及帧率/能耗仍待验收。证据和反向验证见 progress。

液态玻璃优化已提交并推送 `be1ee84`（skill `1825e34` 同步推送）；父仓库指针已提交 `1986a46`，尚未推送。MIoT 迷你播放器适配已完成验收与自审，用户授权提交：本仓库向 WebView 推送有效材质、减少透明度与增强对比度，订阅材质与辅助功能变化并在离页释放。类型检查、生产双 bundle/Web、完整 **296 文件 / 3221 项**和 **70 项**发布工具检查通过；插件自身渲染验证见 progress。Flutter 同期完成两个本机辅助功能开关与有效偏好下推，完整 **557 项**和 **6 个**浏览器联调场景通过。本批不含推送授权；实际提交状态以 Git 历史为准。以下液态玻璃待确认表述为此前阶段快照。

液态玻璃优化 P0/P1/P2 实施结果已确认，提交前自审完成，等待自审结果确认。运行时 SDK、宿主注册、OS 能力共同门控；系统与本机透明度/对比度作 OR，本机“降低透明度”启动恢复。P2 根节点与 blur 叶节点共享 useSurfaceAppearance，按有效快照去重、最后消费者退出时释放。未调暗菜单消费独立 fill（亮 .99、暗 .92），保留 blur/边缘高光并移除全文字面渐变，四档导航/模态材质保持原规则。全屏 scrim 使用 themed blur，紧凑 chrome 保留 regular glass；装饰层关闭 glass-interactive、不进入无障碍树，当前强 veil 播放器不启用 clear。P0 固定菜单外壳/内部滚动、P1 能力/辅助功能/capture target/销毁保护继续保留。

自审核对所有改动与调用点、订阅及宿主监听清理、SDK/辅助功能降级、capture 销毁保护、菜单/滑块交互和测试证据，未发现新增运行时问题。修正一项文档漂移：底栏选中背景使用 tint-fill，glow 仅为装饰；AGENTS 中英和 DESIGN 已同步。运行时代码与测试未再改，下段通过数及设备证据沿用实施阶段，未重复执行；diff/编码复查通过。提交信息、应用提交、推送及父仓库指针更新尚未授权。

2026-10-08 14:34:50 开始的完整 **296 文件 / 3218 项**通过，类型检查、最终生产双 bundle/Web、70 项发布工具和最终生产产物 3 项通过；订阅反向验证使 2 项失败，恢复后 5/5 通过。Chrome 验证明暗 × 四档菜单、系统偏好、本机开关/刷新持久化，以及小屏滚动的固定 blur/末项选择/真实音量手势。Android APK 与最终 HarmonyOS HAP 编译通过，包内 bundle 已核对；API 34 arm64 native bridge 实测 capture source/菜单框、减少动画、实际开关/冷启动持久化，最终 AndroidRuntime 日志为空。首次默认 x86_64 安装的 SVG 链接异常在旧 APK 同样出现，改回原 arm64 验收 ABI 后通过，未修改应用依赖。原生光学质量、帧率/能耗、API 21–23、iOS 26/旧 iOS 与 HarmonyOS 设备矩阵仍开放，本机无 Xcode，Swift 未编译。应用与父仓库指针未提交、推送；证据和边界见 progress。

Lynx 4.0 skills 已核对官方文档并提交 `1825e34`：补齐原生玻璃属性、宿主/OS/Web 边界，修正 `@media` 的版本与 `enableCSSRule` 前提，离线 CSS 数据同步为 0.0.18，lynx-ui 导入规则对齐项目约束。当前 bundle 仍为 `engineVersion: '2.14'` 且未开启 CSS Rule encoding；skill 批次没有改 UI、构建配置或宿主依赖，后续 UI 实施见上段。skill/数据/查询验证见 progress；未推送，父仓库指针未提交。

客户端自动热更新已按确认方案实现：关于与更新页的「自动检查更新」默认关闭并按设备保存，启动/每 6 小时/前台恢复检查，兼容且已验签的 bundle 自动下载，冷启动生效。共用手动更新任务，增加退避、取消/关闭竞态隔离、失败包跳过和恢复内置时关闭开关。类型检查、双 bundle、完整 291 文件 / 3170 项、更新相关最新 105 项与发布工具 70 项通过；Android APK 构建、原生更新器 14 项与实际开关/真实签名 dev 下载/冷启动激活验证通过，本地偏好跨重启保留。测试壳故意使用旧构建身份，生产后端未变；临时测试服务已停止，iOS/HarmonyOS 设备未验证。提交前自审未发现新增问题，用户已授权提交并推送，本批同步父仓库子模块指针；提交结果以 Git 记录为准，证据及验证边界见 progress。

按用户确认规则，服务端明确返回 `dev` 时，所有插件跳过最低宿主版本检查；正式版和读取失败的规则不变。仅跳过版本门槛，插件校验、已安装信息检查及安装确认继续生效。

社区发现已取消 Release 标签与清单版本必须相等的限制，两端兼容 `v0.17` / `0.17.0`；仍校验下载 URL 对应的实际 Release 与上传资产，以及更新清单链的版本一致性。Lynx API 34 项、类型检查和 Flutter API 11 项、静态检查通过。本地 ytdlp 清单和发布回写工作流同步修复，另两插件的空哈希分别记录在 go-music-dl#7 和 iwebplayer#9；详情见 progress。

原生 GitHub 发现的「全部过滤」问题已定位并修复：PrimJS 缺少浏览器 `URL` 构造器，现改为严格公开仓库 URL 解析，缺少 `URL` 的回归测试通过；完整 3139 项测试、双 bundle 和 Android APK 构建通过。隔离 Android 模拟器真实查询显示 7 个仓库中 3 个有效、4 个过滤、0 个暂未验证；原生确认安装标签刮削 2.3.1 后，真实临时后端记录与页面已安装状态一致。详情列表隐藏残影也已补充隐藏样式，新 APK 的内嵌 bundle 与当前构建一致，覆盖安装后复验确认残影消失、已安装按钮禁用。iOS/HarmonyOS 设备未验证；初版 `06702e8` 已推送，本轮修复尚未提交。下段保留初版验收快照，最新证据见 progress。

GitHub 社区插件发现已按确认方案实现，仅修改 Lynx 客户端。入口为设置 → 插件管理 → ⋯ → 插件商店 → 地球选源菜单 →「GitHub 发现」；独立页面支持搜索、排序、分页、详情和未经审核的安装确认，宽屏留在设置右侧，返回恢复原商店状态。客户端校验公开 topic 仓库的根清单、同仓库更新链与匹配的稳定 Release 资产，区分格式不合规和暂未验证；GitHub 请求不带 Songloft JWT，格式校验不代表安全审核。类型检查、双 bundle/Web 构建、290 文件 / 3138 项测试、70 项发布工具测试和 ReactLynx 扫描通过。Docker Chromium 的中文窄屏、英文宽屏及最终生产 Web 产物安装夹具流程通过；真实 GitHub 的 7 个仓库中显示 3 个、过滤 4 个。夹具安装不代表真实后端持久化；原生设备未验证。用户已确认实施结果并授权提交、推送，提交前复查未发现新增问题，提交范围为本功能及对应记录；既有文档经核验单独提交 `39ec94b`。详情与截图见 progress。

iOS CI 耗时优化的实施结果已确认，提交前自审未发现新增问题：逐文件核对缓存 key/保存条件、Release 安装入口、共用 sandbox 的 xcconfig/锁文件检查路径、两套运行时版本及原生调用点，应用未直接依赖被移除的调试库。启用 Xcode 编译结果缓存及耗时/命中诊断，Release 使用独立锁文件移除四个调试 Pod 和 PrimJS 调试 subspec，Debug 保留 Inspector；两种入口共用 `ios/Pods`，运行时 SDK 版本保持一致。类型检查、双 bundle 构建、307 项原生契约、70 项发布工具及工作流/语法检查沿用实施阶段通过结果，未重复执行；diff/编码复查通过。CocoaPods 1.16.2 对官方锁定 specs 快照完成两套依赖解析、锁文件生成及 deployment 模式校验。在线 CDN 遇到 nightly 超时和截断 JSON，完整下载/工程生成未完成；本机无 Xcode，IPA 编译、macOS 缓存命中及实际提速仍待 CI。保留其他任务改动，自审结果与提交信息已获用户确认，本批未提交、推送或触发 CI，等待暂存内容及提交确认；详情见 progress。

首页插件网格按用户确认方案改为 72–88px 弹性卡片与整体居中；普通/排序两种模式共用曲库的末行占位组件，占位数随 shell 宽度增加以覆盖宽屏。类型检查、双 bundle/Web 构建和全部 288 文件 / 3091 项测试通过，diff/编码检查通过。Docker Chromium 的 14 组几何与 4 组不刷新缩放检查、跨行拖动及夹具排序请求通过；旧布局在 375px 下复现右侧多出 19px，修复后左右一致。实施结果已由用户确认，提交前自审核对卡片/占位尺寸、宽度订阅与卸载、所有调用点、拖动命中及排序提交，未发现新增问题。运行时代码未再改，沿用实施阶段验证结果，未重复测试；diff/编码复查通过。临时浏览器缺少中文字体，截图仅作布局证据；原生设备未验证，夹具写入不代表真实后端持久化。自审、提交信息及本批提交均已获用户确认；提交范围为网格代码与对应记录，既有文档改动保留在工作区，推送和父仓库子模块指针更新尚未操作；详情见 progress。

长歌名滚动开关（songloft-org/songloft#504）的实施结果已确认，提交前自审未发现新增问题：已逐文件核对默认值、偏好读写顺序与初始化竞态、滚动销毁与过期回调、系统减弱动效、所有现有调用点及翻译生成文件。运行时代码无需再改，508 / 3091 项测试与双 bundle 构建沿用实施阶段结果，未重复执行；diff/编码复查通过。浏览器与原生设备实测仍未执行，Lynx 单元测试仅证明主线程命令派发。未提交、推送或操作 Issue，等待审查确认；下段实施阶段的待确认标记为当时快照。

songloft-org/songloft#504 的长歌名滚动开关已在 Flutter 与 Lynx 两端实现：播放设置中默认开启，关闭后切回单行省略号，选择按设备本地保存；Lynx 保留系统减弱动效优先级。共享滚动组件接入实时状态、启动恢复及串行保存，防止旧读取覆盖用户选择；关闭会发送主线程归零命令。Flutter 静态分析、格式检查与全部 508 项测试通过；Lynx 类型检查、双 bundle 构建、全部 288 文件 / 3091 项测试及 ReactLynx 扫描通过，diff/编码检查通过。忽略开关的反向版本触发 Flutter 1 项、Lynx 2 项预期失败，已恢复实现。Lynx 单元测试验证主线程命令派发，不代表设备动画执行；本批未做浏览器或原生设备实测，未修改原生模块。已有文档改动保留，未提交、推送或操作 Issue，等待实施结果确认，详情见 progress。

热更新签名已按用户授权配置：RSA 3072 位，key ID `4c2fabb72ee966ce`；GitHub Variable `LYNX_UPDATE_PUBLIC_KEY` 与 Secret `LYNX_UPDATE_PRIVATE_KEY` 已写入，本机备份在 Git 忽略的 `.env.lynx-update-signing/`（目录 700、密钥 600）。源码 `a6291a9` 的 CI [37575231925](https://github.com/songloft-org/songloft-player-lynx/actions/runs/37575231925) 全部通过，构建号 213513212，[dev Release](https://github.com/songloft-org/songloft-player-lynx/releases/tag/dev) 已发布五平台包、2874872 字节热更新 bundle、清单签名和校验文件。共享宿主公钥与本机一致；真实发布文件的 RSA 签名、bundle 大小/哈希和校验和验证通过，JSON 有效的篡改清单被拒绝。前一 CI [37571012905](https://github.com/songloft-org/songloft-player-lynx/actions/runs/37571012905) 已实跑通过新增 Apple 冷恢复回归及 IPA 构建。旧无公钥壳需安装本次新壳一次，设备安装/热更新回退验收仍开放；未新增代码提交，本批记录尚未提交，详情见 progress。

缓存冷恢复批次提交前自审未发现新增问题：目录哈希与持久写入规则一致，调用接口、身份/文件大小检查保持兼容；任务回调前落盘，隔离测试副本退出清理已覆盖复制失败路径。代码无需再改，307/70 项通过数沿用实施阶段，未重复测试；diff/编码复查通过。Apple 编译、新增行为回归和缺陷版本反向执行仍待验证，本批未提交或推送，等待审查确认。

Python 夹具修复 `5900940` 已推送，CI [37569104168](https://github.com/songloft-org/songloft-player-lynx/actions/runs/37569104168) 的缓存夹具 417ms 就绪，Apple 验证程序编译通过，但执行在 `cold_lookup` 失败并退出 133，IPA/发布未通过，其他平台通过。当前批次将冷恢复的 URL 对象相等判断改为 namespace/key 目录哈希校验，保留身份、普通媒体文件与大小检查；补三种 root URL 表示下的有效缓存恢复，以及七种错位/损坏条目的清理和有效身份保留回归。307 项原生契约与 70 项发布工具测试通过，diff/编码检查通过；本机无 Swift/Xcode（`xcodebuild -list` 退出 127），新增 Swift 回归未编译或执行，URL 表示假设与实际修复效果均待后续 macOS CI 确认。中英同步，本批未提交或推送，等待实施结果确认，详情见 progress。

本批 Python 夹具提交前自审通过，未发现新增问题；另从 `/tmp` 以绝对路径执行两脚本的 `--help`，确认直接 CLI 启动的共享模块导入和参数正确，不据此宣称监听已就绪。70 项测试为实施阶段的真实验证结果，未重复执行；等待自审确认，本批未提交或推送，Apple/实际 CI 边界保留。

前一批 `3bf291b` 已推送，但 CI [37566472108](https://github.com/songloft-org/songloft-player-lynx/actions/runs/37566472108) 的 iOS 夹具仍在启动阶段等待 30 秒后失败：Python 存活、没有端口文件、尚未进入 Swift 编译，其他平台通过。两个旧夹具在明确拒绝 DNS 反查的真实回归中均失败，已补共享回环 HTTP server 避免不必要的 `getfqdn`；导入前启动栈诊断、阶段日志、就绪/异常取消诊断和监听器关闭也已落地。新增 5 项真实 HTTP/HTTPS、启动阻塞栈和证书失败测试通过，全部 70 项发布工具测试（沙箱外）、语法/编码/diff 检查通过。runner 实际阻塞点仍缺 Python 栈，DNS 原因尚未确认；本批未提交或推送，macOS 启动、Apple 验证与 IPA 构建仍待新 CI 验证，详情见 progress。

iOS CI [37564042104](https://github.com/songloft-org/songloft-player-lynx/actions/runs/37564042104) 的缓存验证静默退出 1，证据指向 HTTP 夹具等待超时，但原日志未确认具体退出命令或启动变慢原因。缓存/模板两处改用最多 30 秒的共享等待脚本，检查进程存活并明确报告超时/文件错误，增加启动/编译/执行日志和进程回收。新增 9 项子进程与实际工作流 shell 测试、全部 65 项发布工具测试（沙箱外重跑）、YAML/shell/JS 语法及编码/diff 检查通过。自审修复测试失败时先删除 PID 文件的清理顺序问题，受影响 9 项在沙箱外复跑通过，等待审查确认。shell 测试中的服务/编译器是替身，不代表 Apple 编译或业务验收；本机无 Swift/Xcode，实际 Apple 验证、IPA 构建与 CI 仍待执行。未提交、未推送、未触发工作流，详情见 progress。

Android 封面/时长补充回归沿用 `1cfe401` APK，重新读取安装哈希一致。在 API 34 / Mesa 模拟器上，两种通知歌词布局、暂停空行、无封面/歌词切歌、返回歌曲和实际锁屏封面均已观察；7 组选定媒体/系统 UI 观测通过，系统总时长保持 03:00。新回执为 `/tmp/lynx-local-delivery/1cfe401/cover-device-acceptance.json`，未覆盖旧回执；未改代码或重建包。另 Firefox 134 的 20 组加载/快速刷新和 10 组认证流程（30 次会话刷新）未复现 Blob 异常，条目继续开放。失败样本与夹具边界见 progress；实体设备、听感和长后台仍待验，仅本地提交，不 push。

Android 暂停时系统定位遗漏歌词同步已修复，源码 `1cfe401`；新 Debug APK 构建号 `213499686` 在 `/tmp/lynx-local-delivery/1cfe401/`，实际安装哈希与交付一致。通知标题/第二行、暂停定位到新行/空行、实际锁屏播放/暂停/定位、无歌词切歌/上一首、12 秒熄屏跨歌词与退出清理均通过；18 次本应用媒体观测无错误，PID 不变。3082 项 JS、56 项发布工具、类型/双 bundle、42 项 JVM 与 APK 通过，首轮元数据命令错误被严格校验拒绝，失败包未安装。锁屏设置已恢复，自有测试服务已停止。新包身份/证据和可听输出/长后台等边界见 progress；模拟器封面补充验收见首段；HarmonyOS 媒体卡片、Apple 编译/设备仍开放，P6b 不整体勾选，不 push。

Web 目录挂载已补齐：源码 `f5d00c0`、构建号 `213498463` 的 standalone/embedded 两包在 `/tmp/lynx-local-delivery/f5d00c0/`。Chrome 根路径两种模式登录、子路径两种模式登录/已安装 Lynx/WebView 夹具桥接，以及 Linux WebKit 两种子路径模式的 P4/P5 已用新包复验；实际归档/源码身份与浏览器服务目录一致。恢复 embedded 会话忽略旧服务器地址，Web 无 location 的主线程使用同一宿主目录。287 文件 / 3081 项 JS、56 项发布工具、类型、双 bundle 与 build:web 通过。旧包不修改，Android 后续新包见首段，最新 HAP 仍为下面的 `1d86b77`。自有测试服务已停止；真实 Safari、Firefox 间歇 Blob 异常及各原生未验项继续开放，不 push。哈希/回执见 progress。

已为 `1d86b77` 生成含 `pluginFrame.templates.v1` 的新 APK/HAP，统一构建号 `213496964`，保存到 `/tmp/lynx-local-delivery/1d86b77/`；旧包哈希不变。42 项 Android JVM、34 个全部执行的 HarmonyOS clean HAP 任务、3063 项 JS、56 项发布工具及类型/双 bundle 通过。新 APK 的实际安装哈希与交付一致，A/B 插件初始通知、五次 HOME、退出不再推送与新标识重入复验通过。APK 为 Debug、HAP 未签名、正式更新公钥仍为 0；Apple 编译、两端设备及 MIoT 长后台/断网重连继续开放。自有测试服务已停止，不 push，详细哈希/回执见 progress。

Android/HarmonyOS 已新增实际更新器的 RSA 签名回归，验证 bridge 3/schema 2 不变时，缺少 `pluginFrame.templates.v1` 的旧壳拒绝新版 bundle，新壳接受，旧实例快照保持不变；公共历史签名向量不改写。14 项 Android 更新器 JVM、7 项 HarmonyOS 源码适配器及 56 项发布工具测试通过；隔离副本移除能力检查后新用例按预期失败。设备与 Apple 编译边界保留，见 progress。

iOS 已在源码中补远程插件模板加载：同一个 `SongloftTemplateProvider` 由控制器持有，接到根 config、动态 fetcher 和新版模板 fetcher；根资源选择/验签更新回退保留。新增独立 URLSession 流式下载器，50 MiB/30 秒、最多五次重定向，不继承账号 Cookie/凭据，TLS 设置变化取消在途请求并清理监听。Apple CI 新增实际 Foundation/TLS 下载验证程序，尚未编译或执行；本机 `xcodebuild -list` 因工具缺失退出 127。结构闸门和本地 HTTP/TLS 夹具通过不代表 Swift/SDK/设备通过，详见 progress。兼容契约新增 `pluginFrame.templates.v1`，旧壳检查后续 bundle 会引导同通道新安装包，既有快照不改写。三端加载器接线源码现已补齐，但 iOS 编译、iOS/HarmonyOS 新壳安装与插件恢复验收继续开放；仅本地提交，不 push。

HarmonyOS 已补远程插件模板 fetcher，并在 `Index.ets` 的 LynxView 中注册。根模板仍由 `BundleUpdateStore` 选择后直接构造 `TemplateBundle`；远程下载采用独立 RCP session、50 MiB 流式限额、30 秒传输时限、最多五次重定向，不附账号凭据，复用用户 TLS 开关并在设置变化时取消在途请求。8 项实际源码 Node HTTP/TLS 适配器测试及真实 SDK clean HAP 编译通过，详见 progress；适配器不是设备验证。需要安装包含此修复的新原生壳，旧 `e09592b` HAP 不含本次接线且哈希未改。HarmonyOS 设备加载/恢复仍开放，iOS 后续已补远程模板接线源码，编译与设备验收仍开放。仅本地提交，不 push。

Android 新增原生插件模板加载修复，源码提交 `f91d861` / `9bfd35c`。`e09592b` 真实安装插件时 frame 报 160101；仅注册新 fetcher 仍失败，现按 Lynx 4.0 当前资源模式同时接动态入口，保留根更新选择器与图片/字体路径。新 APK 在 `/tmp/lynx-local-delivery/9bfd35c/`，构建号 `213494756`；41 项 JVM、3061 项 JS、47 项发布工具、类型/双 bundle/APK 通过。真实 SDK 插件初始恢复通知、A/B 共五次 HOME 每次一次、退出后不再推送与新 frame 标识重入通过。完整证据/哈希见 progress，MIoT 长后台/断网重连、歌词卡片/锁屏、iOS 编译及两端设备验收继续。测试服务已停止，旧四种固定包哈希未变；仅本地提交，不 push。

已订正缓存、更新协议和原生模块参考页遗漏的 HarmonyOS 编译现状，中英对应页同步。剩余验收按平台/证据归组，见[计划检查表](plans/2026-10-06-feature-completion.md)。模拟器 CLI 已能查询 API 13 镜像，但华为许可仍待用户明确授权接受，尚未下载/创建/启动；宿主账号无 KVM 读写权限，独立 Android 容器内 KVM 检查和开机已通过，未改宿主权限。这不证明 HarmonyOS 运行和调试签名可用。旧 SDK 兼容性已对照 P6c 前源码核查，未发现既有原生状态推送被破坏的证据；新增推送仍须插件重建。

上一批 `e09592b` APK 在独立 API 34 / 4 KB、arm64 native bridge、Emulator 35.6.11 / Mesa llvmpipe 环境完成两处跨应用系统粘贴（提示词 409 字节、歌曲路径 55 字节）、三轮 HOME 根恢复事件每轮一次，以及真实播放后的系统暂停/通知标题回归。SwiftShader 下的宿主 SIGSEGV 仍开放；35.6.11 原初始化失败已绕过，不能继续描述为无法开机。该批只覆盖根事件和基础无歌词通知，未改应用源码或固定包；后续子 frame 修复/收件/退出验证见本节首段。长后台/断网重连、歌词布局/锁屏与其他跨批回归继续。脚本、负例、core 诊断和边界见 progress；测试服务/显示均已退出，用户 `58091` 保留。

Linux Playwright WebKit 18.2 已完成当前交付包的 P4 standalone/embedded 根路径数据流程和 P5 播放/快捷键/持久化/菜单保护回归，两个 Worker、最终页面/媒体错误为零。临时 Mesa/GStreamer 修正、空输出、375px 中文与输入/IME 夹具边界见 progress；真实 Safari、扬声器及设备验收继续开放，本批未改应用源码或交付包。

HarmonyOS 已完成 Linux CLI 的 clean release HAP 编译与包内容校验，修复了缓存/更新器 5 处 ArkTS 异常重抛。使用 SDK `26.0.0.105`，最低兼容声明保留 `5.0.1(13)`；包未签名，API 13 及设备行为仍待验。15 项缓存/更新器适配器与 306 项原生契约通过，详见 progress。

上一轮四种可审核包固定对应客户端 `e09592b`，位于 `/tmp/lynx-local-delivery/e09592b/`：Android 调试 APK、未签名 HarmonyOS HAP 与 standalone/embedded Web 压缩包。统一构建号 `213487589` 的类型、双产物、三端复制、Android 编译、HarmonyOS clean 编译（34 个任务全部执行）及 47 项发布工具均通过，包内版本/bundle/宿主身份一致；APK 为 debuggable，HAP/Web 通过包内容校验器。iOS 只有资源复制；原交付回执的未安装字段是当时快照，后续 Android 安装及 Web 浏览器行为证据见 progress，HAP 仍未安装。模板加载修复的新 Android 包见首段，须安装新 APK，不能只靠 bundle 热更新；旧包身份和哈希不变。

P6c 已补 iOS scene 与 HarmonyOS ability 的恢复事件，等待根视图首屏、去重并清理旧上下文；原生 WebView 与 Lynx frame 均有消费点。frame 宿主按 SDK 就绪通知发送最新播放器/主题状态与恢复事件，切插件换标识，退出后丢弃迟到 RPC。SDK 已修复仅订阅事件时未注册子 frame 的问题，现有插件需重新构建；SDK 尚未发布。真实 Chrome 子 frame 完成初始/重入通知与保活；后续官方 Firefox 134 / geckodriver 在虚拟显示中完成真实标签页 hidden→visible（全部 isTrusted=true）、活跃过滤、隐藏保活和关闭重建，页面异常为空，详见 progress。测试使用 SDK 子插件和宿主入口夹具，未证明操作系统恢复或已安装 MIoT 重连。最终 286 文件 / 3061 项 JS、47 项 Node、SDK 3 项测试，以及类型/双产物/Android APK 均通过。HarmonyOS HAP 已编译；iOS 编译与 MIoT 长后台/断网重连设备验收仍开放；本轮计划的源码批次已落地，验收状态见 progress 和计划，仅本地提交，不 push。

P6b 已接入 HarmonyOS 队列元数据、AVSession 歌词 title/subtitle 与清空恢复，补系统播放/暂停/定位/速度参数和实际音量回报；写入按快照串行，SDK 卡片失败不阻止音频。共享歌词按方法安全降级，iOS 新布局接口保留旧单参数选择器，HarmonyOS EQ 入口/调用明确禁用。音频方法/事件/状态及空实现反例闸门已覆盖三端，源码 SDK 适配器覆盖时序、单位、故障与退出清理。最终构建和回归见 progress；HarmonyOS HAP 已编译；iOS 编译及真实媒体卡片/锁屏验证仍开放，继续 P6c，只本地提交，不 push。

P6a 已补 HarmonyOS Pasteboard 写入和四端确认回调，旧方法保留且共用实现；复制 facade 等待明确成功，缺方法/拒绝/空回调/15 秒超时不报成功。代理提示词与歌曲编辑只在确认后显示成功、失败可重试。Chrome 真实两处按钮复制后的粘贴文本一致，权限/降级失败夹具显示失败并能重试，临时输入归零；Android 当前包两处复制到系统 Settings 输入框也逐字一致，未用应用 Input 的 140 字符上限误判剪贴板。源码适配器与 UI/回调验证见 progress。HarmonyOS HAP 已编译；其系统粘贴、Apple 编译/设备回归仍开放；只本地提交，不 push。

P5 已补 Web 固定播放快捷键、播放设置开关/映射和本地持久化。主线程识别应用焦点、Shadow DOM 交互目标、组合输入和重复按键，返回栈覆盖层/选择编辑/宽屏设置子页阻止响应；Worker 复用原有播放器控制。实际音量查询也已接通，首次调整不再从 100% 跳到默认 50%。Chrome 已实测播放/切歌/音量、重复加载/长按、禁用及刷新持久化、真实播放器菜单保护，中英最大字号三个宽度已检查；输入/iframe/IME 夹具边界和最终回归见 progress。Firefox 134 的控制流程在临时 PulseAudio 空输出下也已通过，128 kbps/输入夹具/间歇 Blob 异常边界见 progress；扬声器、Safari、操作系统输入法和已安装插件完整验收仍开放。下一批 P6 原生能力，仅本地提交，不 push。

P4 已补 Web 歌单 JSON 导入/导出：方法级入口、主线程文本文件桥、激活过期时的可点击控件、认证 multipart/Blob 下载、401 刷新重试、取消/错误与重复点击保护，以及歌单/曲库查询失效。最终 279 文件 / 3012 项 JS 回归、35 项发布工具、类型/双产物/Android APK 通过。真实 Chrome 153 的 standalone 跨源与 embedded 根路径同源均完成选文件、后端新增歌单/歌曲、中文/emoji 下载、空/坏文件、取消、服务器失败和认证刷新/失效检查；中英最大字号六组数据页与英文 320px 选择控件通过。Firefox 134 两种根路径部署的数据传输流程已通过，激活失效用夹具；间歇 Blob 启动异常保留观察；原生 Audio 输出端失败已定位并在临时空输出环境修正，Safari 未运行。原生继续旧传输流程；前端子路径挂载已实测 404/黑屏，根路径 standalone 连接带前缀后端的 P4/P5 流程已通过，详见部署指南。后续继续 P5/P6，仅本地提交，不 push。

P3c 已接入当前身份设备缓存列表、本地搜索/空间/删除/清理、登录失效后的离线入口和独立本地队列。过期认证与显式登出区分处理，离线播放不请求远端详情/收藏/历史或预取；旧 bundle 忽略本地队列。最终 277 文件 / 2989 项 JS 回归、35 项发布工具、类型/双产物/Android APK 通过。Android 实测断网文件播放、控制/seek、结束重播、冷启动恢复、当前项删除、分账号/旧文件清理及登出后冷启动隐藏；中英最大字号三个宽度的六组界面通过，最终证据见 progress。HarmonyOS HAP 已编译；iOS 编译及两端设备验收仍开放，后续按计划继续 P4/P5/P6，仅本地提交，不 push。

慢代理的实际设备界面取消也已复验：235 项取消，流式连接在 12288 字节后中断，活动请求/暂存归零，并恢复原测试档案。证据见 progress；没有把全量主动取消或模拟器环境修正写成所有原生平台验收完成。

P3b 共享源码已接入整歌单/多选批量缓存和任务页，支持完整分页、变体冻结、缓存跳过、去重、容量暂停、真实宿主取消和失败/中断重试；历史按身份保存且不含 URL/token。最终 273 文件 / 2960 项 JS 回归、35 项发布工具、双产物与 Android APK 编译通过（2026-10-07 02:49）。Android arm64 ABI 实际 UI 验证 235 首入队、94 完成（36 缓存跳过）、取消剩余 141 项及暂存清理；x86_64 SVG 缺库/原生崩溃和模拟器环境问题见 bugs，不宣称该 ABI 已修复。HarmonyOS HAP 已编译；iOS 编译及两端设备验收仍继续，详细证据见 progress。

定位为预览版。核心播放、曲库/歌单、歌词、插件、主题、多服务器和管理设置已有实现，四端都有宿主代码。关于页已分开提供客户端和服务器更新；客户端严格按壳通道检查 dev 或最新正式发布，三端更新器源码已接入，Android/Web 有本地流程证据。当前五平台 CI、Apple 验证与 IPA 构建通过，热更新签名已配置并完成真实 dev 资产验签；两端设备验收仍开放。**原生桌面客户端与 Bundle 本地后端不在本轮范围**。未消费的 `bundleMode/systemTray` 能力探测不代表功能完成。

Android、HarmonyOS 和 iOS 的当前源码已有 CI 编译及包检查证据，Android/HarmonyOS 发布签名检查与 dev 热更新资产验签通过；旧本地未签名包不能代替本次发布包。后台播放、投屏、通知与视频需要设备验证，不能从 JS 测试推断。

## 2. 开源与发布准备

已补 Apache-2.0 许可证和双语 README、贡献、安装、构建、测试、发版指南。中文历史审计保留原文，英文索引标明。入口见 [文档索引](../README.md)。

统一 [build-and-release.yml](../../.github/workflows/build-and-release.yml)：

- main 代码推送自动更新 dev；dispatch 可重跑；v\* tag 发布正式版或预览版。
- APK、未签名 IPA、HAP、standalone/embedded Web 压缩包共用版本与构建元数据。
- JS、签名、版本和包内容检查、五个产物全部成功后才发布。
- `pnpm release patch --dry-run` 审核计划；实际发版同步版本、提交、打 tag 并原子推送。见 [发版指南](../guides/releasing.md)。
- Android/iOS TCP 测试桥仅 Debug 注册且绑定 loopback；JS E2E 需显式 `SONGLOFT_TEST_BRIDGE=true`，发布包禁止包含。
- Web 打包先清理再复制，修复 embedded 复制后删除 bundle/引擎的问题。

实现、本地验证与本次云端发布已完成，下载资产以 GitHub Actions/Release 为准；仓库可见性需独立管理。Android/HarmonyOS 发布签名检查与独立 RSA 热更新签名已在 CI 通过，dev 资产下载验签通过；iOS IPA 仍需自行签名，不能直接安装。

## 3. 本次验证

Linux 可验证 JS、脚本与 Android；iOS/HarmonyOS 需各自工具链。最终验证记录见 [progress.md](progress.md) 本次条目。工作流静态校验不能替代真实云端签名与编译。

投屏诊断已接入现有客户端日志，覆盖设备、媒体 URL/MIME、操作、原生 SOAP 错误码及播放状态变化，token 脱敏、轮询去重。全量 JS 258 文件 / 2786 项、类型检查及 Lynx/Web 双产物通过；未新增原生方法。直接测试电视时，Flutter 内嵌 DIDL 触发 716，转义后的同一 HTTPS MP3 请求被接受，Flutter 已修正；电视随后仍持续 TRANSITIONING，无鉴权的 HTTP MP3 也没有被拉取。用户确认电视提示「当前场景不能投屏」，需处理电视接收端的场景限制。真实客户端日志导出与成功播放尚未验证，改动尚未推送或发布。

## 4. 剩余工作

1. 全平台 CI 与签名发布已通过；真机检查含公钥的新 APK/HAP 安装升级、iOS 重签安装及后续热更新。
2. Android/iOS 全量 E2E，以及通知歌词、后台连播、插件恢复前台、长请求与 DLNA 实测。
3. P6a 剪贴板、P6b 通知歌词与 P6c 插件恢复源码已补，原生编译通过；HarmonyOS 系统粘贴/媒体卡片及插件长后台/断网重连验收仍开放。Lynx 插件须使用本地更新的 SDK 重新构建，SDK 尚未发布，见 [bugs.md](bugs.md)。
4. iOS 字体大小、HLS 自签名地址等开放问题仍以 bugs 为准。
5. Web 前端子路径已修复，Chrome 两种模式的登录/插件与 Linux WebKit 两种模式的 P4/P5 通过；真实 Safari、Firefox 间歇 Blob 异常仍开放，见[部署指南](../guides/web-deployment.md)。插件排序需要支持 `/settings/plugin-order` 的新后端，旧后端返回 404。
6. 桌面端、Bundle 本地后端和视频不在本轮交付范围；设备批量缓存、离线列表、Web 数据传输/快捷键及原生补齐已完成源码批次，按批准计划保留未完成的平台验收。

### 现状核查（2026-10-07）

P1 已改用 `/songs/{id}/audio-tracks` 的 `{tracks: [...]}` 完整契约，播放器更多菜单提供多音轨面板；按真实 index 切换并保留进度和播放意图。四端源准备契约已同步源码，旧壳禁用切轨并提示升级。Android 双音轨设备测试与 Web 真浏览器播放已通过；HarmonyOS HAP 已编译；iOS 编译和两端设备验收仍开放，视频仍按用户要求暂缓。详细证据与剩余项见 [progress.md](progress.md)。

P2a 已加入独立 bundle/清单签名、兼容模型和 prepare 阶段的不可变壳快照，见 [客户端更新协议](../reference/client-updates.md)。全量 JS 与 Node/Java 协议回归通过；真实发布密钥尚未配置。该阶段尚无客户端内更新入口，后续 P2b/P2c 的证据如下。

P2b 第一批已接入 Android 模块、APK 不可变信息与根模板加载器；共享 TS facade 有超时/取消、真实路由启动确认与错误边界。Android JVM 用真实 TLS/文件测试 11 项通过，包含取消、磁盘篡改、未确认回退、通道新旧和安装新壳；全量 JS **263 文件 / 2849 项通过**，Node 发布工具 **19 项通过**。iOS/HarmonyOS 模块和 P2c 界面继续实施，尚不能声称三端热更新完成；本地模拟器证据与最终编译见 progress 本批条目。

P2b 第二批已接入 iOS 验签、流式下载、磁盘状态机、根模板和 fatal 启动错误回调，并加入 Xcode 源文件/资源与模块注册。Apple CI 新增直接执行原生核心的验证程序，但本机 Linux 没有 Xcode/swiftc，**尚未编译或执行，设备验收仍开放**。CI 漏传 bundle 宿主快照已修复，三端 copy 和包内身份/公钥回归已补齐；共享契约 298 项、Node 发布工具 20 项通过。HarmonyOS 和 P2c 继续实施，证据见 progress。

P2b 第三批已接入 HarmonyOS 8 方法、不可变 rawfile 身份、公钥验签、独立系统 TLS 流式下载、根模板选择和 fatal 回调；关闭自动重定向后逐跳验证 HTTPS，支持取消、下次冷启动确认/回退及恢复内置。转译后的实际源码在 Node 真实 RSA/HTTPS/文件系统适配器下 **5 项核心回归通过**，原生结构闸门 286 项、发布工具 25 项通过；该批测试本身不证明 ArkTS/HAP 或设备行为；现另已完成 HAP 真编译，设备验收仍开放。三端源码接入后继续 P2c 页面，P2b 的未验收项仍保留。

80% 进度处已有下一曲 Range GET 预取，不能再列为完全缺失。P4 已接通 Web JSON 文件桥接，`dataTransfer` 按方法判断可用性。HarmonyOS `Index.ets` 已注册视频模块并创建 XComponent，iOS 视频已使用 AVPlayerLayer 下层表面；源码存在不代表设备验收完成。

P2c 关于页入口已接入客户端通道检查、壳/bundle 版本、原生验签后下载、进度/取消、下次冷启动/恢复内置提示及 APK/IPA/HAP/Web 部署包链接。bridge 2 新增 `fetchMetadata`，独立系统 TLS，不继承业务证书跳过设置；旧八方法壳只提供发版页。Android 本地签名夹具验证实际界面下载、播放不中断、取消清理、冷启动 B/壳 A 和恢复内置；Web Worker 检查使用无凭据请求，中英最大字号及三个宽度通过。HarmonyOS HAP 已编译；正式签名、Apple 编译及两端设备验收仍开放。按用户批准的计划继续 P3 缓存，不 push；细节及回归计数见 progress。

P3a 第一批已接入共享缓存身份/变体模型、Callback facade 和 Android v2 持久索引/任务调度。下载冻结身份及音轨/音质/归一化，索引快照不含凭据，旧文件保留并计入容量；取消真实连接且排队取消不开连接。恢复播放前读取身份，切换服务器使用 token 绑定的用户名。设备界面缓存默认/第 1 条音轨得到两个独立 MP3 文件；后端端口不可达时冷启动播放、暂停/继续通过，并修正了 HTTP 数据源无法打开本地文件的问题。iOS/HarmonyOS v2、批量与离线列表仍继续实施；详细契约见 [设备缓存](../reference/device-cache.md)，验证计数见 progress。仅本地提交，不 push。

P3a 第二批已接入 iOS v2 源码：Documents 持久目录、身份/实际容器索引、串行调度、流式字节/空间限制、真实 task 取消和数组进度事件；旧五方法与新九方法共用同一调度器。原生模块已改为 LynxContextModule 并加入 Xcode 源文件引用。Apple CI 已配置实际核心验证程序与本地 HTTP 夹具，但 Linux 无 Swift/Xcode，程序尚未编译/执行，不将语法解析或 293 项方法闸门视为设备证据。全量 JS 269 文件 / 2933 项、发布工具 26 项通过；HarmonyOS v2 和 P3b/P3c 继续，iOS TLS/下载/后台/播放设备验收仍开放。

P3a 第三批已接入 HarmonyOS v2 源码：持久目录、身份/实际容器索引、串行新旧下载、RCP 流式限额/空间检查、真实连接取消和重启清理；十四个 public Callback/void 接口与数组事件已纳入闸门。转译实际源码在 Node 真实文件/HTTP/TLS 适配器下 8 项通过，覆盖队列上限/去重、未知长度、媒体响应、清理和 TLS 策略切换；现另已完成 HAP 真编译，设备 SDK 行为仍待验。当前发布契约升级 bridge 3 / schema 2 / `songCache.v2`，旧壳只能安装本通道新包；历史验签向量保持原样。详细最终构建、设备复验及计数见 progress。三端源码接入后继续 P3b/P3c，HarmonyOS HAP 已编译；Apple 编译和两端设备验收保持开放，不 push。

## 5. 接手与验证

先读 [AGENTS.md](../../AGENTS.md)、[pitfalls.md](pitfalls.md)，再按 [构建](../guides/build-and-run.md)、[测试](../guides/testing.md) 执行。

```bash
pnpm run typecheck
pnpm run prepare:build
SONGLOFT_BUILD_METADATA="$PWD/.build/version.json" pnpm run build
pnpm test
pnpm run test:release
```

原生改动需同步新 bundle 后真编译。Debug E2E 显式启用 JS 桥并通过 adb forward/iproxy 连接；发布检查使用无桥 bundle，不能混用。

### GitHub 发现：跨仓库发布包（2026-10-08）

允许清单的下载地址和公开更新清单来自其他 GitHub 仓库。客户端按下载地址验证目标仓库的稳定 Release 和真实非空资产，保留版本、入口、哈希和 URL 校验。详情显示下载地址，安装确认显示发布包来源；已安装与更新状态按实际发布包仓库判断。

### GitHub 发现：根清单空哈希（2026-10-08）

根目录 plugin.json 的 entryHash、zipHash 可省略或留空；非空值继续校验格式。发现页不要求构建产物哈希回写到源码根清单，实际安装包仍由服务器校验。
