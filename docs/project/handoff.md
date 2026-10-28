# 工作交接（2026-10-14）

## 2026-10-28 · songloft-org/songloft#546

永久访问 Token 的设置入口、生成/复制/撤销及配套后端已实现。全量 3724 项、89 项发布工具、类型/双产物/Web 与实际 Chrome 流程通过；两个旧 Markdown 断言改用独立夹具后通过，断言未放宽。验证与未跑项见 [#546](issue-546.md)。本批已获提交、推送、同步父 gitlink 及带截图回复 Issue 的授权，正式发布与关闭不在授权内。

English: Permanent token settings, generation/copy/revocation and the server implementation are complete. All 3724 tests, 89 release-tool checks, types, dual outputs, Web build and actual Chrome flow pass. Two stale Markdown tests now use independent fixtures with assertions preserved. Evidence and Not run: [#546](../en/project/issue-546.md). Commit, push, parent gitlink synchronization and an Issue reply with screenshots are authorized; formal release and Issue closure are outside scope.

## 2026-10-27 · songloft-org/songloft-player#53

两客户端已精简 Release 正文，保留一行中英文安装/选包链接与分类变更记录，安装步骤并入 README。20 项正文场景、YAML/Bash/链接检查与 Lynx 89 项发布工具检查通过；基线、源码指纹和 Not run 见 [进展记录](progress.md#2026-10-27--精简客户端-releasesongloft-orgsongloft-player53)。尚未提交、推送或发布，父指针未更新；下方授权属于历史批次。

English: Both clients now publish concise release bodies with one line of bilingual installation links and categorized changes; installation steps live in README. Twenty body scenarios, YAML/Bash/link checks and all 89 Lynx release-tool checks pass. Baselines, source identity and Not run: [progress](progress.md#2026-10-27--精简客户端-releasesongloft-orgsongloft-player53). No commit, push, publication or parent gitlink update; authorizations below belong to historical batches.

## 2026-10-27 · songloft-org/songloft#543

Web 插件 iframe 移除 `credentialless`，保留网关登录 Cookie；旧版在三种 HttpOnly Cookie 网关夹具中均返回 403，修复版均通过。最终 350 文件 / 3714 项、类型、双产物、Web 与发布工具检查通过；实际界面、源码指纹与未跑项见 [#543](issue-543.md)。报告人的真实飞牛环境待复验。用户随后已授权本批提交、推送、同步父指针并回复 #543；实际提交、CI 与评论以 GitHub 交付记录为准，未授权正式发布或关闭 Issue。

English: Web plugin iframes no longer set `credentialless`, retaining gateway login cookies. The old script returns 403 in all three HttpOnly-cookie gateway fixtures; the fixed script passes. All 350 files / 3714 tests, types, dual outputs, Web and release-tool checks pass. Actual UI, source identities and boundaries: [#543](../en/project/issue-543.md). The reporter's NAS remains unverified. The user subsequently authorized this batch's commit, push, parent gitlink update and reply to #543. GitHub delivery records govern commits, CI and comment status; no formal release or Issue closure is authorized.

## 2026-10-27 · songloft-org/songloft#542

本批补齐 Web 鼠标拖动滚动，修复歌单分页时旧行重复更新和 loading 替换 inset 的高度抖动。161 首合成歌单浏览器验收到末尾；共享 JS、反向回归、工作树指纹和平台边界见 [#542](issue-542.md)。Chromium 150 与报告人实际曲库待复验。本会话已授权提交、推送、同步父指针并回复 #542；实际提交、CI 和评论以 GitHub 交付记录为准，未授权正式发布或关闭 Issue。

English: This batch restores Web mouse drag scrolling and fixes repeated old-row updates plus footer-height jitter during playlist pagination. Browser acceptance reaches the end of a 161-song synthetic playlist. Shared JS, negative regressions, worktree fingerprints and platform boundaries: [#542](../en/project/issue-542.md). Chromium 150 and the reporter's real library remain unverified. This session authorizes commit, push, parent gitlink update and a reply to #542; GitHub delivery records govern actual commits, CI and comment status. No formal release or Issue closure is authorized.

## 2026-10-25 · songloft-org/songloft#540

本次修复歌单滑块在分页等待时回到顶部、原生定位过早结束的问题，并复用重叠分页请求。最终 348 文件 / 3704 项、类型、双产物和 Android 构建通过；Web 触摸/鼠标和 Android 模拟器复验通过。最终验证、实际界面与平台边界见 [#540](issue-540.md)。用户已授权本批提交、推送、同步父指针并回复 #540；提交、CI 与评论以 GitHub 交付记录为准，不发布正式版或关闭 Issue，不沿用下方历史授权。

English: This batch fixes the playlist thumb returning to the top while pagination is pending and native seeks finishing prematurely, reusing overlapping page requests. Final 348 files / 3704 tests, types, dual outputs and Android build pass; Web touch/mouse and Android emulator reruns pass. Final validation, actual UI evidence and platform boundaries: [#540](../en/project/issue-540.md). The user authorized this batch's commit, push, parent gitlink update and reply to #540; GitHub delivery records govern actual commits, CI and comment status. No formal release or Issue closure; permissions below belong to historical batches.

## 2026-10-24 · iOS Web PWA 状态栏黑边（songloft-org/songloft#538）

当前未提交工作树修复 Lynx Web 宿主页在 iOS 的两处配色：standalone PWA 状态栏那条带画的是 body 背景，写死 `#000` 在浅色主题下成为黑边，改为按系统亮暗给初值并在首帧后由宿主脚本把应用解析后的 `--system-background` 同步回写 body 与 theme-color meta（覆盖外观强制与主题包）；浏览器模式补 media 亮暗两条 `theme-color`，Safari 顶/底栏不再回落默认灰。`black-translucent` 因状态栏文字钉白被拒。348 文件 / 3702 项全量测试、`tsc -b`、`build:web` / `build:web-embedded` 通过；Docker 无头 Chrome 验证亮/暗初值、首帧同步与 token 翻转传播，截图 `/tmp/issue538/state-{light,dark}.png`。iOS 设备未实测；登录页等自带整页背景的页面与状态栏带仍有色差。本批未提交、推送、发布或写 Issue 评论。

English: The current uncommitted worktree fixes two color issues in the Lynx web host page on iOS: the standalone-PWA status-bar strip paints the body background (a hard-coded `#000`, the reported black edge on light themes) and now follows the system scheme with a post-first-frame host script that syncs the app-resolved `--system-background` back to the body and the theme-color metas (covering in-app theme overrides and theme packs); browser mode gains media-scoped light/dark `theme-color` metas so Safari's bars stop falling back to grey. `black-translucent` was rejected for pinning white status text. The 348-file / 3702-test suite, `tsc -b`, `build:web` / `build:web-embedded` pass; headless Chrome verifies light/dark initial values, first-frame sync and token-flip propagation, screenshots `/tmp/issue538/state-{light,dark}.png`. iOS devices not run; pages painting their own full-bleed background still differ from the strip. No commit, push, release or issue comment.

## 2026-10-24 · mini player 更多菜单弹层隔离

当前未提交工作树修复 Lynx mini player「更多」菜单的歌曲信息 / 均衡器 / 睡眠定时：`PopoverSurface` 在 `stopTriggerPropagation` 下把面板与遮罩也切到 `catchtap`，阻止行点击和遮罩点击继续冒泡到胶囊根的 `/player` 导航。348 文件 / 3698 项全量测试、`tsc -b`、双产物通过；无头 Chrome 1024×768 实测歌曲信息原地打开、均衡器进入 EQ 页、睡眠定时面板弹出、遮罩关闭不导航。截图 `/home/hanxi/songloft-ui-verify/mini-menu-*.png`，脚本 `mini-player-menu-fix.js`，详见 [progress](progress.md#2026-10-24--mini-player-更多菜单弹层隔离)。iOS/Android/HarmonyOS 设备未跑；本批未提交、推送、发布或写 Issue 评论。

English: The current uncommitted worktree fixes the song info / equalizer / sleep-timer entries in the Lynx mini player's "more" menu: under `stopTriggerPropagation`, `PopoverSurface` now switches the panel and backdrop to `catchtap` too, so row and backdrop taps no longer bubble into the capsule root's `/player` navigation. The 348-file / 3698-test suite, `tsc -b` and the dual build pass; headless Chrome at 1024×768 confirms song info opens in place, the equalizer page renders, the sleep-timer sheet appears, and backdrop dismissal does not navigate. Screenshots `/home/hanxi/songloft-ui-verify/mini-menu-*.png`, script `mini-player-menu-fix.js`; see [progress](progress.md#2026-10-24--mini-player-更多菜单弹层隔离). iOS/Android/HarmonyOS devices were not run; no commit, push, release or issue comment was made.

## 2026-10-23 · mini player 按钮对齐 Flutter

当前未提交工作树为 mini player 按钮对齐批次：宽屏新增队列与「更多」弹层、窄屏播放模式 340px 降级、共享弹层触发器支持 catchtap。347 文件 / 3693 项全量测试、`tsc -b`、双产物、嵌入 Web 打包与 Go 构建通过；无头 Chrome 验证 390/1024/320 三档按钮集、队列抽屉与更多菜单。截图 `/home/hanxi/songloft-ui-verify/mp-mini-*.png`，详见 [progress](progress.md#2026-10-23--mini-player-按钮对齐-flutter)。iOS/Android/HarmonyOS 设备未跑；本批未提交、推送、发布或写 Issue 评论，上下方其他授权均不适用于本批。

English: The current uncommitted worktree is the mini-player button parity batch: a wide-only queue entry and "more" popover, a 340px play-mode gate on narrow screens, and a catchtap-capable shared popover trigger. The 347-file / 3693-test suite, `tsc -b`, dual build, embedded Web packaging and Go build pass; headless Chrome verifies the button sets at 390/1024/320 plus the queue drawer and more menu. Screenshots `/home/hanxi/songloft-ui-verify/mp-mini-*.png`; see [progress](progress.md#2026-10-23--mini-player-按钮对齐-flutter). iOS/Android/HarmonyOS devices were not run; no commit, push, release or issue comment was made, and other authorizations above and below do not apply.

## 2026-10-23 · songloft-org/songloft#536 音量 / 登录滚动 / 歌单加歌

当前未提交工作树补齐三项：#536 的应用音量持久化与宽屏 mini player 音量入口、登录页短视口滚动、歌单详情「添加歌曲」选择器（已加入歌曲默认隐藏）。347 文件 / 3688 项全量测试、`tsc -b`、Lynx/Web 双产物、嵌入 Web 打包与 Go 后端构建通过；Docker 无头 Chrome 已实际验证登录页滚动、音量 50%→30% 整页刷新保持、选择器排除已加入歌曲并添加两首。截图与脚本在 `/home/hanxi/songloft-ui-verify/`，详见 [progress](progress.md#2026-10-23--songloft-orgsongloft536-lynx-缺口补齐)。iOS/Android/HarmonyOS 设备未跑；本批未提交、推送、发布或写 Issue 评论，下方历史授权不适用于本批。

English: The current uncommitted worktree closes three #536 items: app-level volume persistence plus a wide mini-player entry, login scrolling on short viewports, and a playlist "add songs" picker that hides already-added songs. The 347-file / 3688-test suite, `tsc -b`, dual Lynx/Web build, embedded Web packaging and Go backend build pass; headless Chrome verifies login scrolling, volume 50%→30% surviving a reload, and the picker excluding an added song before adding two. Evidence is in `/home/hanxi/songloft-ui-verify/`; see [progress](progress.md#2026-10-23--songloft-orgsongloft536-lynx-缺口补齐). iOS/Android/HarmonyOS devices were not run; no commit, push, release or issue comment was made, and older authorizations below do not apply.

功能移植提交授权（2026-10-21）：用户现已明确要求「提交推送」。只提交并推送本批功能移植及父指针，保留并发首页/Flutter 工作；不继承其他任务的写授权。最终提交与 CI 以交付记录为准，下方未提交描述保留为历史验收快照。

功能移植最终追加（2026-10-21）：修复 Android 首次桌面播放丢失及 MV 切音频后的空白视频页；独立副本的类型、双产物/Web、421 项相关回归、89 项发布检查和 4 项原生单测/Android 构建通过。最终 APK `4f0f5870…c76ba1` 的 9 项桌面实测与 Web/Android MV 结束返回均通过，11 张新截图见 `/home/hanxi/work/songloft-review/lynx-current-device-20261021/review.html`。独立副本不含并发首页任务的新功能；共享目录改动保留。全量重跑中止及各次失败已留档，iOS/HarmonyOS 设备与签名、真机、默认玻璃仍未验。未提交/推送/发布；详情以 [本批最终记录](feature-port-20261021.md) 为准，下方功能移植段落是前一阶段快照。

#532（2026-10-21）：已补齐独立的首页「收藏／电台收藏」显示开关，与歌单 `hidden` 标签分离；按服务器和账号保存在本机。65 项相关测试、类型、双产物及真实 Web 操作通过，全量 3661 项与一个依赖加载超时文件的 3 项复跑共同完成覆盖；首轮失败保留。记录见 [#532](issue-532.md)，截图 `/home/hanxi/work/songloft-review/issue-532-20261021/review.html`。本会话已明确授权提交、推送并回复 #532；正式发布和原生设备验收另行核对。

功能移植（2026-10-21）：当前批次仅授权实现、验证和提供审核截图，未授权提交/推送/发布；不继承下方历史授权。五项优先功能与 MV 字幕、Web 全屏、平滑歌词、Android/iOS 小组件源码已补齐；先前 3653 项全量测试和最后歌单调整的 124 项复验通过。追加 iOS 冷启动回调/封面修正后，319 项相关测试、类型、生产双产物、89 项发布检查通过；最新 Android Debug、HarmonyOS clean release HAP 和带 Xcode 27 兼容条件的 iOS app/WidgetKit 编译通过。14 张真实浏览器/Android RemoteViews 截图保存在 `/home/hanxi/work/songloft-review/lynx-features-20261021/review.html`，新包/日志另存 `lynx-native-followup-20261021`；旧桌面截图不冒充新 APK 设备实测。iOS/HarmonyOS 签名、设备与新增截图，真机及默认玻璃效果仍开放。范围、契约与证据见 [本批记录](feature-port-20261021.md) / [English](../en/project/feature-port-20261021.md)。

#531 后续（2026-10-20）：本会话已授权 Flutter/Lynx 修复、提交、推送并回复 Issue。Lynx 直播断流保持当前台无限重连，系统暂停/播放意图经四端宿主明确传递；验证对象、实际播放与 Not run 见 [记录](issue-531.md)。本批授权优先于下方历史快照，最终 SHA/CI/评论以交付为准；不打正式版 tag、不关闭 Issue。

升级补审（2026-10-21）：首批 CI 已通过；继续以原授权补齐 `audio.remoteIntent.v1` 不可变宿主能力门控，防止旧壳只更新 JS 后缺少系统控制事件。88 项发布检查通过；最终构建、提交、父指针、CI 与评论以同一验证记录为准，播放核心未再改动。

提交交接（2026-10-20）：用户在获知原生视觉与环境限制后明确要求“直接提交”。本批按该授权提交客户端改动及主仓库公共桥接/子模块指针；未授权推送或发布。以下验证记录为提交前快照，未通过与 Not run 项保持开放。

渲染对照（2026-10-20）：SDK/APK 未再修改；Mesa / Android 34 的 19 项功能复验通过，视觉仍未全部通过。新 Android 35 镜像在安装客户端前段错误，Vulkan 重试 OOM，确认测试环境存在独立失败。证据 `/tmp/songloft-sdk-e2e/rendering-validation.json`。仍需稳定 Android 设备完成默认效果与持续显示验收；未提交、推送或发布。

最新 Android 补修（2026-10-20）：升级 `servalsvg` 至 0.2.4 补齐 x86_64 库，原生图标恢复，APK 构建与官方插件 19 项功能复验通过。插件控制文字刷新后正常、静置后再次缺失，视觉未全部通过。证据 `/tmp/songloft-sdk-e2e/svg/validation.json`。默认玻璃效果仍使模拟器宿主退出 139，功能成功仍以开启“减少透明度”为条件。其他平台/真机/长后台未验；未提交、推送或发布。下方是此前快照。

Android 补验（2026-10-20）：同一 APK 在 Emulator 35.6.11 / Android 34 / WebView 113、开启“减少透明度”时通过 19 项原生 SDK/插件断言，含真实 HttpOnly Cookie、加载回执和播放进度。证据 `/tmp/songloft-sdk-e2e/native-validation.json`。默认效果与部分控制符号的绘制仍有验收缺口；iOS/HarmonyOS、真机、长后台未跑。未改业务实现，未提交/推送/发布。

最新复验（2026-10-20）：审核后全量 3611 项、类型、生产双产物及 87 项发布检查通过；官方「正在播放」16 项 Web 实测及桌面/手机截图已更新。Android 新 JS/壳构建和安装成功，模拟器运行被宿主 OOM/渲染崩溃阻塞，原生插件和 Cookie 尚未验收。最新证据 `/tmp/songloft-sdk-e2e/continued-validation.json`；未提交、推送或发布。

审核补充（2026-10-20）：SDK 原生启动回执、执行异常与 HarmonyOS Cookie 特殊键已补修，575 项相关回归、类型和双产物构建通过。最新验证对象见 `/tmp/songloft-sdk-e2e/review-validation.json`；之前 3610 项全量测试和 Web 截图是补修前快照，平台验收缺口不变。详见 [审核记录](../reference/plugin-client-sdk.md#同日审核补修)。

## 2026-10-20 · 客户端 SDK 补齐

Flutter 对齐的 `host/player/favorite/cookies` 已实现，WebView / frame 共用模型解析、分发与完整状态。3610 项测试、类型、双产物、Web、87 项发布检查、Android 编译和官方「正在播放」1.0.31 的 16 项真实浏览器断言通过；桌面/手机截图及源码指纹在 `/tmp/songloft-sdk-e2e/`。接口、旧实现反向验证、服务器公共资源/原生壳依赖与 Not run 见 [记录](../reference/plugin-client-sdk.md#2026-10-20-本批结果) / [English](../en/reference/plugin-client-sdk.md#results-for-2026-10-20)。iOS/HarmonyOS 编译及原生 Cookie store/设备验收仍开放。此批没有提交/推送/发布授权，保留未提交工作树，父 gitlink 不变。

## 2026-10-17 · #523 封面背景加深

基线 `364607b0cb7a0ed07378e59b27ff6827549fde3e` + 未提交工作树：减少遮罩，封面保留比例提高至 18%–30%，以独立色差回归补足原有文字对比度检查；未改宿主或 CSS。旧实现浅/深模式均反向失败，真实浏览器切歌、回退、辅助功能恢复另行检查。完整最终验证及 Not run 见 [记录](issue-523.md#2026-10-17--加深封面背景) / [English](../en/project/issue-523.md#2026-10-17--stronger-cover-backgrounds) 与 `/tmp/songloft-523-followup-20261017/validation.json`。Flutter 同步修复取色及加深背景。上述未提交状态是验证快照；用户已获知 Flutter 停止播放测试失败与原生切歌验收缺口，明确授权本批提交、推送并回复 songloft-org/songloft#523。最终提交、CI、dev 包和评论按同一 SHA 核对；不新打正式版 tag、不关闭 Issue。

## 2026-10-16 · 键盘弹出时收起悬浮胶囊

继续修复用户反馈的「键盘把胶囊顶上去」：旧 dev 在 IME 打开时导航上移 312px 且可点击，新宿主根据编辑焦点和键盘几何/视口占用隐藏底部 tab 与窄屏迷你播放器，收键盘后恢复；音频与组件不卸载。普通聚焦、地址栏变化、缩放、旋转及清理有宿主事件回归，Android 实测包含多行/切换输入框/返回键恢复/旋转往返与真实音频时间。最终构建、工作树指纹、设备验收和 CI/dev 以 `/home/hanxi/work/songloft-review/android-web-keyboard-nav-20261016/validation.json` 与交付为准。HTTP 回退属于启发式；真机、最新 Chrome、真实外接键盘与任意厂商输入法 Not run。详细边界见 [记录](web-android-input-viewport.md#后续键盘弹出时收起悬浮胶囊) / [English](../en/project/web-android-input-viewport.md#follow-up-hide-floating-capsules-while-the-keyboard-is-open)。

## 2026-10-16 · Android Chrome 输入与底栏

已在实际 Android 34 / Chrome 113 / Gboard 模拟器复现已发布 dev 的两处问题：临时 readonly 收起 IME，100vh 使胶囊超出视口 48px。Web 输入组件补丁同时解决异步旧 value 回写丢字，原生锁保留；宿主使用 100dvh 与 resizes-content。3580 项测试、类型、双 bundle、Go 嵌入和 87 项发布检查通过，Android 根路径/局域网/子路径与多行/横竖屏/360px 共 28 项检查通过。详见 [记录](web-android-input-viewport.md) / [English](../en/project/web-android-input-viewport.md)。证据与源码指纹 `/home/hanxi/work/songloft-review/android-web-input-20261016/validation.json`；真机、最新 Chrome、实际拼音候选与 Safari/iOS/HarmonyOS 运行 Not run。沿用本会话默认 Web 切换的提交推送授权；先子仓库，再父 gitlink，最终 SHA/CI/dev 产物验收以交付为准，不打正式版 tag、不操作 Issue。

## 2026-10-16 · 完整版默认嵌入 Lynx Web

后续 CI 暴露归档检查器将 base 标签当空资源路径：改用 HTMLParser 区分文档基准与资源，新增真实打包→归档→验证及缺文件拒绝回归。旧 verifier 在新用例失败，修复后 85 项发布检查与 CI 同款归档命令通过；旧运行不算最终验收，后续提交/CI 见交付。

base 标签进一步限定为父仓库的 `--go-embed` 专用选项，保留普通 embedded 静态归档的子目录部署；新增两种模式隔离与非法组合回归。最终发布检查为 87 项，最终源码与产物按后续提交/CI 验收。

用户已测试隔离预览并授权完成切换、提交推送及 dev 包验收。嵌入打包增加 Go 可替换的 base 标签，修复旧 SPA 书签回退时的相对资源路径；新增实际打包/旧资源清理/独立模式与异步 RPC 审计闸门，修正双语部署要求。类型、3543 项测试、双 bundle/Web 构建、84 项发布检查与本地根路径/子路径浏览器通过；旧脚本在新 base 回归中失败。证据 `/home/hanxi/work/songloft-review/lynx-default-20261016/`；最终提交及 CI/dev 验收以本次交付为准。原生、Firefox、真实 Safari、插件和长后台 Not run。父仓库在子仓库提交后更新默认构建及 gitlink；不打正式版 tag、不操作 Issue。

## 2026-10-16 · #523 纯白歌词背景反馈

用户现已授权本批提交、推送和回复 #523；先提交客户端，再更新父 gitlink。下段未提交状态为验证阶段快照，交付以 Git/GitHub 同一 SHA 为准，不打正式版 tag、不关闭 Issue。

实际 Web 构建分别开启增强对比度/降低透明度复现纯白背景，在设置关闭后恢复封面；截图与反馈吻合，报告人的设备开关仍待确认。本次仅补充两项中英文开关说明，保留无障碍策略。基线 `1ad0eaf1cba340d644660f64198fed6b8b6d6d6d`，证据与验证边界见 [#523 后续记录](issue-523.md) 和 `/tmp/songloft-523-followup/validation.json`。未提交、推送、发布或操作 Issue；父 gitlink 不变。以下历史授权不适用于本批。

## 2026-10-15 · #525 3 万首队列修复

用户已授权本批 Flutter/Lynx 与父仓库提交、推送和 #525 回复；下段未提交描述为验证阶段快照，交付以 Git/GitHub 同一 SHA 与评论为准，不打正式 tag、不关闭 Issue。

已在未提交工作树修复全量行创建和周期性全队列保存：视口窗口保留完整队列范围，行高跟随字体，进度只保存小键，队列变化分批编码。最终 3,543 项测试、类型、生产双 bundle / Web 部署、Android Debug 构建与 81 项发布检查通过。3 万首 Web 手机约 442ms、Android 模拟器约 1,632ms 打开，队尾选曲、重新打开、删除、切歌和实际持久化均通过；自动保存期间 20 次原生 UI 查询最大响应 35ms。基线、源码指纹、失败证据与最终验收见 [记录](issue-525.md) / [English](../en/project/issue-525.md)。真机、iOS/HarmonyOS、长后台和 CI 未跑。本批未提交、推送、发布或操作 Issue，父 Lynx gitlink 不变；此前授权的 Flutter 本地提交为 `bb03a5c` / 父仓库 `aedbe1e`。

## 2026-10-15 · 发布确认交互

未提交工作树已修复 Lynx 一键发布中版本/确认提示被捕获、空回车误继续的问题：计划和提示走 stderr，取消/EOF 非零退出；父脚本校验三个版本结果。基线 `0de993ff272ee29df96c8401b46df56256646438`，旧实现 5 项新回归失败，修复后生产双 bundle 构建和 81 项发布测试通过，PTY 真实命令替换验证回车停止与 yes 本地发布。证据与未提交差异指纹 `/tmp/songloft-release-{terminal-result,validation}.json`，完整记录见 [progress](progress.md#2026-10-15--发布确认交互)。Not run：共享 TS/Vitest、原生/设备（工具脚本改动）、真实发版/CI（未授权）。本次未提交、推送或修改父 gitlink。

2026-10-15：用户已授权 #523 的提交、推送及 Issue 回复，按两个客户端先提交、父仓库后同步指针执行；不打正式版 tag、不关闭 Issue。下方该批未提交描述为验证阶段快照，最终结果以 Git/CI 和 Issue 评论为准。

## 2026-10-15 · #523 歌词背景与内置配色

Lynx 已实现封面背景与歌词可读性调整、六种设备配色、主题包优先和 SVG/插件实时同步。类型、最终 3531 项测试、双 bundle/Web 部署与 Android Debug 构建通过；四组真实浏览器验收保留 48 张截图并断言持久化、SVG 与背景像素。Android 原生截图与安装边界见 [#523 记录](issue-523.md) 和 `/home/hanxi/work/songloft-review/issue-523-lynx-20261015/validation.json`；同目录 `index.html` 供用户审核，另保留前批 Flutter 对照图。基线和源码指纹均记录在该文档。Not run：iOS/HarmonyOS 构建与真机、真实户外。当前未提交、推送、发版或操作 Issue，父 gitlink 未更新；下方历史授权不适用于本批。

## 2026-10-15 · #524 歌单排序

歌单排序文案中英同步为「歌曲名称 / Song name」，继续传 `title`；父仓库统一修复分页、定位 ID 和永久名称排序的拼音字母序。Lynx 类型、3516 项测试、双 bundle/Web 部署构建和中英文 390px 浏览器升降序、艺术家排序、偏好保存及重新进入恢复均通过，页面异常为零。基线 `2698e2eb1d85990f8c1433261e430697aaf3b33d` + 本批工作树；记录见 progress，证据 `/tmp/songloft-524/{lynx-browser,validation}.json`。Not run：本地原生构建/真机；多音字使用字典默认读音。用户已授权提交、推送和回复 #524；快进到只新增 CHANGELOG 的 `e73afc82b40501902b93a1d91476e98279e8bc40` 后，先提交客户端再同步父指针，实际 SHA/CI/评论以交付记录为准。不打正式版 tag，不关闭 Issue。

## 2026-10-14 · #520 退出与缓存后续

Android 显式退出和首页双返回停止原生播放/服务并释放进程，保留登录；共享滑块统一坐标系、保留快速松手提交并修复填充条，本机/服务端端点与中间档位已实际保存正确字节值。完整 3516 项测试、77 项发布检查、类型、生产构建与 Android Debug 编译通过，API 34 已运行设置退出、双返回与通知停止。2026-10-15 用户已授权提交、推送及回复 Issue，最终 SHA/开发包以 Git/CI 为准，完整能力需要新 APK；鸿蒙 4.2 真机仍为 Not run。详情与工作树证据见 [#520 记录](issue-520.md) / [English](../en/project/issue-520.md)。

进度条静止点按也保留首个位置，控件回归与原生 25%/50%/75% 跳转均通过。

## 四段插件日期版本（2026-10-14）

GitHub 发现页已支持日期末段序号比较，完整测试和构建通过，原生应用版本协议保留。按当前会话的 CI 自动发布要求同步两个客户端及父指针；不新打客户端正式 tag。证据和历史客户端边界见 [本批记录](plugin-date-version.md)。

## 歌词页屏幕常亮 · songloft-org/songloft#520（2026-10-14）

Flutter 和 Lynx 已在本机实现播放设置中的常亮开关，默认关闭、仅歌词可见且前台时生效；退出问题按用户要求暂缓。Lynx JS/Android 编译、完整测试和 Web 开关持久化验证通过，本地 iOS/HAP 编译与原生实际熄屏验收未执行。用户已授权提交、推送及回复 Issue；客户端先提交，父仓库同步实际指针，最终 SHA 和 CI 状态以 Git/同一 SHA 的工作流为准。本批不打正式版 tag。对象、日志及边界见 [本批记录](issue-520.md)。

## 歌单浏览 · songloft-org/songloft#518（2026-10-14）

当前批次完成两端首页布局、歌曲数量和首字母提示，以及 Lynx 行列配置、滚动条和两端首页电台可见性开关。用户已授权本地提交客户端和父指针；实际提交以 Git 记录为准。验证范围、证据和设备边界见 [本批记录](issue-518.md)。未推送、发布或操作 Issue；原生设备未验收，下方为此前批次快照。

## 后端更新请求 · songloft-org/songloft-player-lynx#11（2026-10-14）

用户已授权本批 Lynx 修复与父仓库子模块指针的本地提交。提交前核对源码标识与验证对象一致、范围为本批 12 个文件，差异和编码检查通过；实际结果以 Git 记录为准。下方未提交描述为验证阶段快照；推送、发布和 Issue 写操作未授权。

已修复空请求体导致的「无效的版本类型」：SettingsApi 发送当前通道的 `version_type`，检查解析对应 `updates` 及 `release_notes`，非 Docker 无在线更新动作，重试清旧错误，重复点击/启动等待有保护。基线 `0651222`，源码工作树 SHA-256 `faec7a428a9675dc1d3e5c98191d963555b8616c409e93658daae6f651e8389b`，详细证据见 [progress](progress.md)。完整 317 文件 / 3467 项通过；最终新增回归与格式化后 3 文件 / 36 项、类型检查、Lynx/Web 双 bundle、Web 部署构建通过。旧页面隔离反向验证 5 项按预期失败。Docker Chromium 的完整关于页验证 dev 拒绝后重试、stable 成功、非 Docker 无 POST，页面异常为空，截图已目测；更新接口使用夹具，未实际替换服务端。Not run：Android（无已连接设备）、iOS/HarmonyOS 设备、真实升级及云端 CI。自审、格式化、差异与 UTF-8 检查通过。未提交、推送、发布或操作 Issue，父 gitlink 未更新；以下为历史批次快照，不授权本批外部动作。

## AI 开发流程整顿（2026-10-13）

本批新增中英 AI 流程、LESSONS 并同步规范入口与两份 dev-flow，连续调查/实现/验证/自审，不逐阶段确认；提交、推送、发布、Issue 写操作仍分别按当前会话授权。未解决 Issue 排查包含父仓库和全部递归子模块。平台验收按 HARNESS，经验按证据与独立事件日期维护，历史细节仍在 pitfalls/progress。

技能结构、链接、UTF-8 和差异检查通过；本批为纯文档/技能变更，App 构建、JS 测试和设备验收未运行。未提交、推送或操作 Issue，子模块指针未更新。下方历史批次的授权、验证和待办是历史快照，不授权当前任务或证明本批验证。

用户已确认本批跨平台验证记录，并授权提交、推送 Lynx 仓库及主仓库子模块指针。提交范围为 5 个文档文件，业务代码不变；实际提交与推送结果以 Git 记录为准，下方未提交描述为验证阶段快照。

**当前批次：更新说明的 iOS / 鸿蒙 / Web 跨平台检查完成，未新增业务代码。** 共用解析器按能力补齐 API，后台线程隔离和三端同源打包均已核对；旧 iOS 15.0–15.3 存在相同 API 缺失风险，鸿蒙 PrimJS 4.0.0 需保留 Android 同版本的兼容处理。Chromium 121 / Firefox 134 / WebKit 18.2 的完整关于页两处说明、双语 Release 表格与横向滚动通过，真实 Worker 移除两项 API 后解析仍通过；页面异常为空，截图已目测。4 文件 / 26 项相关回归通过。证据 `/tmp/lynx-md-platform-check/`，元数据使用本地夹具和浏览器路由，未执行实际升级；iOS/鸿蒙设备不可用，设备渲染仍待验。仅更新本批验证记录，未提交、推送，下方为此前快照。

用户已确认本批 Android 与后端更新 Markdown 修复，并授权提交、推送 Lynx 仓库及主仓库子模块指针。提交前复核范围为本批 9 个文件，沿用上述 Android/Web 截图、完整测试和生产构建证据，差异检查通过；实际提交与推送结果以 Git 记录为准。下方待确认描述为实施阶段快照。

**当前批次：Android 客户端及后端更新说明的 Markdown 渲染已修复，未提交或推送。** Android PrimJS 实测缺少 `Array.prototype.at` 与 `Object.hasOwn`，Marked 抛出 `TypeError: t.at is not a function` 后旧实现回退纯文本；后台解析前按需补齐这两项，已有实现不替换。后端更新区接入同一 Markdown 组件。类型检查、完整 **316 文件 / 3450 项**测试、生产 Lynx/Web 双 bundle 与 **72 项**发布检查通过，最后测试夹具的类型修正后两项解析回归再次通过。新 Debug APK 在 API 35 / arm64 native bridge / Mesa 模拟器的实际关于页通过客户端与后端截图验证，横向滑动表格偏移 0→93；安装包哈希一致，AndroidRuntime/LynxError 错误输出为空。Docker Chrome 完整关于页两处说明正确，页面异常为空。更新数据为隔离夹具，另加载仓库真实双语 Release 模板；没有执行下载、安装升级或后端升级。截图及日志在 `/tmp/lynx-md-recheck/`，iOS/HarmonyOS 设备未验。本批等待用户确认，下方为此前批次快照。

**当前批次：Lynx Issue #10 的 iOS 后台播放风险修正已完成自审，等待用户确认审查结果。** 异步准备音轨、代次与 item 身份隔离旧回调，保留准备期间播放意图/seek；后台切歌、缓冲及有限重试共用有界执行窗口，仅 iOS 的终止分支发送清理 pause。自审修复 1 处准备阶段定位竞态，以独立 seek 代次隔离旧取消回调，保留最新位置。实施阶段完整 **315 文件 / 3446 项**测试（**2026-10-13 12:11:45 UTC+8** 开始）及生产双 bundle 通过；自审类型检查与 **5 文件 / 390 项**定向测试（**2026-10-13 12:47:59 UTC+8** 开始）通过。真实 seek 方法受控验证及 2 种缺陷变体、真实 Swift 任务验证与 3 种缺陷变体验证通过，iOS 修改文件语法解析及格式化通过；此前旧源码 6 条反向回归证据保留。日志与 21 文件清单见 progress，双语测试指南与 Apple CI 已接入。UIKit/AVFoundation 的 Apple SDK 编译、真机长后台及插件重载/进程重启根因仍待验。未提交、推送或操作 Issue，父仓库指针未提交；下方为此前批次快照。

用户已确认 #517 的实施、自审和三个仓库的提交信息，并授权按 Flutter、Lynx、父仓库顺序本地提交。暂存范围为 Flutter 的 1 个实现文件、Lynx 的 1 个实现与 3 个记录文件、父仓库的两个子模块指针；实际提交结果以 Git 历史为准。推送和 Issue 操作未授权，下方待确认描述为此前快照。

用户已确认 #517 的两端实施结果，本批提交前自审通过，无新增问题、无代码修正。已核对选择范围、切歌清理、布局约束、焦点释放、Lynx 非扁平化要求与 Web 快捷键兼容；沿用本批完整测试、构建和浏览器证据，格式化、差异与 UTF-8 检查通过。原生设备验证限制保留。等待用户确认自审结果，未提交、推送或操作 Issue；下方实施待确认描述为此前快照。

**当前批次：全屏播放器歌曲信息选择复制（songloft-org/songloft#517）已实施并验证，等待用户确认。** 用户要求同时排查并修复 Flutter 与 Lynx。Lynx 的歌名和艺术家 `<text>` 开启 `text-selection={true}` 并设置 `flatten={false}`，歌曲信息区域按歌曲 ID 重建以清除旧选区。类型检查、完整 **314 文件 / 3438 项**测试、生产双 bundle 与 Web 部署构建通过；Docker Chrome 的真实隔离曲库验证覆盖长日文标题、艺术家、切歌后选区清除及 1400/390px 鼠标选择与 Ctrl+C，剪贴板文本一致，页面无异常，截图已目测。Flutter 同批的 `SelectionArea` 修改通过静态检查、**49 项**相关测试、嵌入 Web 构建及完整省略标题/切歌后歌名/艺术家剪贴板验证。原生三端未实测。未提交、推送或操作 Issue，父仓库子模块指针未提交；progress 记录完整证据，下方为此前批次快照。

用户已确认 Release Markdown 渲染的实施、自审结果和提交信息，并授权在 Lynx 仓库本地提交本批 15 个文件。自审无新增问题，无代码修正；后台解析与链接线程边界、内容切换、失败回退、依赖锁和双语说明已核对，沿用本批完整验证，差异与 UTF-8 检查通过。实际提交结果以 Git 历史为准；未授权推送或提交父仓库子模块指针，下方待确认与未提交描述为此前快照。

**当前批次：客户端 Release Markdown 渲染已实施，等待确认，未提交或推送。** 更新页接入原生元素渲染，支持常用 GFM 格式与横向滚动表格，链接复用宿主桥接；解析隔离在后台线程，解决 Marked 正则无法进入主线程字节码的问题。完整 **314 文件 / 3438 项**回归、类型、生产双 bundle、Web 部署复制与线程扫描通过；双语协议及许可证已同步，旧纯文本接入的反向回归失败。同一组件的独立生产 Web 预览通过 320/390/1024px、明暗主题、大字号、表格滚动及宿主链接点击，截图已目测、页面无异常；完整更新页发布夹具未跑通，页面接入由回归测试覆盖。Android/iOS/HarmonyOS 设备渲染未验证。详细记录见 progress，下方为此前批次快照。

**当前批次：GitHub Token 与商店客户端渐进加载已完成提交前自审，提交和推送已获授权。** 用户确认实施后，自审修复六类边界：删除/停用源后不再使用旧 Token，取消切源时的旧搜索防抖，Flutter 安装后迟到高版本仍显示更新，匿名 401 不误判共享 Token 无效，Web 回退固定服务器并检查异步鉴权后的身份，有效空清单替换旧缓存并使旧请求代次失效。源 Token 优先、共享 Token 仅兜底官方 API、凭据绕过 GitHub 前缀代理的约定保持生效。最终 Lynx **313 文件 / 3429 项**、类型、生产双 bundle、Web 部署和 **72 项**发布检查通过；Flutter 完整 **682 项**，最后空源状态/取消断言修正后的 **15 项**组件回归、静态检查与嵌入 Web 构建通过。隔离副本撤掉保护后，Lynx **7 条**、Flutter **6 条**回归按预期失败，副本已恢复。最终生产 Web 的浏览器复验确认首条早于慢请求、源 Token 优先、不带 Songloft JWT，页面异常为空；截图已目测，临时服务已清理。后端沿用此前完整检查及真实配置持久化证据。双语指南/wiki/交接与 Swagger 已同步；原生宿主重定向、Android/iOS/HarmonyOS 和 Flutter 浏览器未实测。用户已确认自审结果、三个仓库的提交信息及暂存范围，并明确授权提交和推送；按先客户端、后父仓库的顺序执行，父仓库同步两端子模块指针，实际提交与推送结果以 Git 记录为准。详细记录见 progress；下方为此前批次快照。

用户已确认 HarmonyOS CI 依赖安装重试的实施、自审与提交信息，并授权在 Lynx 仓库本地提交本批 4 个文件。实际提交结果以 Git 历史为准；未授权推送或重跑 CI，下方待确认与未提交描述为此前快照。

**当前批次：HarmonyOS CI 依赖安装重试已实施，未提交或推送。** run `38200636309` 因 OHPM 下载 `@lynx/lynx_http_service@4.0.1` 返回 HTTP 503 而失败。依赖安装现最多尝试 3 次，前两次失败等待 10 / 20 秒，成功继续，耗尽保留日志与最后一次退出码。真实工作流 Shell 的 4 个成功 / 失败场景、旧步骤反向验证、YAML 与 Bash 语法检查通过，证据 `/tmp/lynx-ohpm-retry-check.py`。用户已确认实施结果；提交前自审无新增问题，失败处理、退出码和后续步骤顺序正确，沿用执行验证，差异与 UTF-8 检查通过。未重跑云端 CI；真实下载及 HAP 编译待验证。等待用户确认审查结果，详情见 progress；下方为此前批次快照。

用户已授权本批 Lynx、MIoT 与父仓库两个子模块指针的本地提交，尚未授权推送或 Issue 操作。暂存文件与已确认范围一致，差异及编码检查通过；实际提交结果以 Git 历史为准，下方待确认与未提交状态为此前快照。

**当前批次：MIoT 返回桥接同步到 Lynx，未提交或推送。** 原生 WebView 与跨域 Web iframe 共用会话 / 序号回执，优先让插件消费可取消的 `songloft-back`；MIoT 实时报告内部可返回状态，根页撤销拦截，保留覆盖层优先与原生双击退出。旧插件保留浏览历史 / 路由降级，回执超时、重复按键、重新加载和卸载均有保护；新增跨组件回调明确为 background only。类型检查、生产双 bundle 和 Web 部署构建、完整 **311 文件 / 3397 项**回归通过，线程边界补强后的 **28 项**定向复测通过；MIoT 类型、构建与测试通过。撤掉接入后原生 / iframe 两条回归及 MIoT 跨域回归按预期失败，已恢复。

提交前自审发现并修复一处竞态：等待插件回执时打开宿主弹层，超时回退会跳过弹层直接导航。回退现重新检查当前覆盖层并跳过插件自身；新增回归在旧实现失败。修正后 **16 文件 / 192 项**相关导航回归、类型、生产双 bundle、Web 构建与线程扫描通过；完整 3397 项是自审修正前的结果，本轮未重复全量。

Docker Chrome 实际运行不同端口的 Lynx 宿主与 MIoT iframe，验证弹层、歌词、封面、迷你播放器及浏览器返回，记录根页返回标志恢复为 false，页面异常为空。证据为 `/tmp/miot-121-lynx-browser-result.json` 与 `/tmp/miot-121-lynx-player.png`，API 使用隔离模拟服务，不代表真实音箱验收。当前 adb 无设备，Android/iOS/HarmonyOS 真机未验证；未修改 Kotlin/Swift/ArkTS 或新增原生模块方法。用户已确认自审、三仓库提交信息和父仓库指针范围，等待确认本地提交，完整记录见 progress；以下为此前批次快照。

用户已授权 Shell 发版入口的提交与推送，父仓库指针同步。最终复核无新增问题，沿用本轮 72 项发布检查；实际完成状态以 Git 历史和远端为准，下方未提交状态为实施时快照。

**当前批次：已补可直接执行的 Shell 发版入口，未提交或推送。** `scripts/bump-version.sh` 与 Flutter 同名，复用现有 Node 发布脚本和全部参数，从仓库外或含空格路径调用也可定位正确仓库。两条缺陷反向验证与完整 **72 项发布工具检查**通过，真实工作区帮助/dry-run 与 Shell 语法通过；双语 README/发版指南同步。没有实际发布版本，业务和原生代码未改，父仓库指针未更新。下方为此前批次快照。

用户已授权本批客户端 CHANGELOG、跨仓库双语安装说明的提交与推送，含父仓库两客户端指针同步。最终复核无新增问题，沿用本轮验证结果；实际完成状态以 Git 历史和远端为准，下方未提交状态为实施时快照。

**当前批次：Lynx/Flutter 中文 CHANGELOG 与 Flutter/后端双语安装说明已实施，未提交或推送。** 两端版本 Release 成功后由串行独立 job 更新最新 `main` 上的日志，dev 不落盘；后端既有日志持久化保持。三端正文生成保留 Markdown，支持超过 128 KiB 的记录。12 项正文场景、YAML/Bash/指南链接、两端真实临时 Git 写回与重复运行、70 项发布工具验证通过。双语文档同步，实际云端版本日志写回与 Release 页面待下次发布验证，父仓库指针未更新。下方为此前批次快照。

用户已授权 Release 提交记录与双语安装说明的提交、推送及父仓库子模块指针同步。最终复核无新增问题，沿用本轮验证结果；实际完成状态以 Git 历史及远端为准，下方未提交状态为实施时快照。

**当前批次：Lynx Release 已补提交记录与双语安装说明，尚未提交或推送。** 参考 Flutter 使用相同的 Conventional Commits 分类生成器，在 dev、preview、正式版正文追加提交记录。安装说明统一使用 `.github/release-notes.md` 的中英文模板，列出五包安装/部署、服务器要求、签名限制、Web 响应头和三系统 SHA-256 校验。完整 Git 历史和基线 tag 选择已接入，处理无历史 tag、同提交 tag 和空结果。工作流 YAML/Bash、12 项临时 Git/说明场景及模板/链接检查通过；上一轮 70 项发布检查通过，本次只改说明未重复全量测试。实际 GitHub 页面待下次 CI 发布验证。双语发版指南已同步，父仓库子模块指针未更新。下方为此前批次快照。

**当前批次：导航与插件页面合并，实施验证已完成，尚未提交或推送。** 用户确认顺序为插件管理 → 内置导航 → 插件导航顺序，数量与固定入口/折叠提示位于页尾。设置移除独立 Tab 配置入口，旧地址跳转插件页。曲库开关继续使用同一完整配置和作用域锁，保留插件偏好；共享拖拽手柄保持原行为。Flutter 同步合并。最终 309 文件 / 3385 项测试、类型、生产双 bundle/Web 和 70 项发布检查通过；中文窄屏/英文宽屏 Docker Chromium 验证分区顺序、真实触摸排序和曲库开关，后端确认完整偏好保留，注入保存失败后重试成功。自审补充同步外观分类说明并清理 Lynx 无用样式和旧引用，123 项相关测试、类型与生产双 bundle 复核通过；Flutter 全量 656 项及静态检查再次通过；可用样式和交互逻辑未改。本批不涉及原生宿主改动，未重新打开或评论已关闭的 #501。后续段落为更早批次快照。

本文维护当前范围和验证边界；逐批证据见 [progress.md](progress.md)，已知问题见 [bugs.md](bugs.md)。旧记录中的「未提交」和验数仅代表当时快照。[English](../en/project/handoff.md)。

## 1. 当前完成度

用户已授权列表拖拽修复的提交与推送，并同步父仓库子模块指针；提交前复核无新增问题，运行时代码未再修改，沿用最终验证结果。实际结果以 Git 历史和远端为准，下方未提交状态为实施时快照。

**当前批次：列表拖拽与页面滚动隔离已修复，尚未提交或推送。** 自定义视图、Tab 插件、歌单列表和歌单歌曲共四个排序入口统一使用共享 `DragHandle`，手柄消费原生滑动，Web 分支禁止浏览器平移，禁用时释放拦截，其他行内容仍可滚动且 SDK 拖拽事件正常传递；补齐稳定 React key，保持连续排序时 MTS 引用和浮层归属。首页插件编辑区已有拦截，当前播放队列没有拖拽入口，无需修改。最终 **309 文件 / 3384 项**、类型、生产 Lynx/Web 双 bundle、**70 项发布检查**及五文件 ReactLynx 扫描通过。Chromium 390×760 真实触摸验证四个入口的上下拖动、固定滚动位置和服务端保存，普通行仍可滚动，歌单/歌曲连续拖动与最终截图已复核；证据及测试驱动修正见 progress。没有后端或原生宿主变更；当前没有连接的 adb 设备，Android/iOS/HarmonyOS 的实际手势仍待设备验收。父仓库指针未更新。下方为此前批次快照。

用户已授权本轮 Android 透镜同步修正的提交与推送，父仓库子模块指针一并同步；提交前自审无新增问题，运行时代码未再修改，沿用本轮最终验证结果。实际提交和推送以 Git 历史及远端为准，下方「未提交/未推送」为实施时快照。K40 蓝线真机验收仍开放。

**当前批次：Redmi K40 / Android 13 的录屏已分析，Android 透镜同步修正已落地，蓝线真机验收仍开放。** 已确认原生透镜与 CSS 填色不同步；Android 在 pre-draw 跟随实际胶囊变换及边缘光 alpha，取消独立原生时钟，透明内部跳过法线/采样计算。API 34 新包明暗各 30s、连续转向及减少动画录屏已复核，未看到横线；这不代表已证实 K40 蓝线的 GPU 根因或完成同设备修复。最终 **307 文件 / 3372 项**、类型、**62 项 JVM**、生产双 bundle、**70 项发布检查**及 Debug/Release APK 通过，四端生产复制已恢复关闭 TestBridge。实际回执、APK/hash 与签名边界见 progress。改动含 Android 原生代码，需要后续完整 APK 复测，JS 热更新不足。本批未提交或推送，下方为此前快照。

用户已确认曲库显隐批次的实施结果并授权本地提交；实际结果以 Git 历史为准，尚未推送。下方“待确认/未提交”和父仓库指针状态为实施时快照，指针随本次提交同步。

**最新批次：曲库顶栏显隐按钮已按用户确认方案实施，待确认实施结果；未提交或推送。** 歌曲分类控制“显示隐藏歌曲”（隐藏歌单中的歌曲），歌单分类控制“显示已隐藏歌单”，艺术家、专辑、目录等浏览分类不显示该按钮。两个状态独立，曲库页内同组分类切换保留，重新挂载页面恢复默认隐藏；默认斜线眼睛，开启后睁眼并使用主题强调色及浅色填充，点击区域 44×44。歌曲请求携带 `exclude_playlist_labels=none`，歌单请求携带 `exclude_labels=none`，关闭时恢复后端默认过滤，搜索和来源条件保留。旧歌单计数入口已移除，切换显隐清空旧选择并退出歌单多选/排序。中英文文案同步；验证证据见 progress。本批仅改共享客户端代码、测试和交接文档，没有后端或原生宿主变更，Android/iOS/HarmonyOS 设备尚未验证；父仓库指针未更新。下方为此前批次快照。

**当前批次：songloft-org/songloft#501 的 Lynx 插件导航同步已完成提交前自审，三类遗漏已修复，用户已确认审查结果与提交信息，待确认本地提交；尚未提交或推送。** 插件管理集中启用、导航显示和排序，Tab 配置保留内置项与数量；停用保留偏好且不占名额，动态排序缓存已修复。自审补齐单独/批量更新的导航缓存刷新、保存期间迟到 GET 的取消与重读，以及异步认证/401 恢复和重发前的会话及查询实例校验；其他 HTTP 请求默认行为不变。六条新增回归反向验证均能捕获缺陷。最终完整 **307 文件 / 3356 项**（2026-10-09 **20:41:06 UTC+8** 开始）、类型、生产 Lynx/Web 双 bundle、**70 项发布检查**与五文件 ReactLynx 扫描通过。最终部署产物中文 390px / 英文 1200px 实测导航、真实拖拽落盘、停用偏好、曲库开关及保存失败重试，页面错误为空，截图已复核；Web 构建和部署 hash 一致，测试服务及容器已停止。本批共 17 个文件，中英交接已同步；没有后端、schema 或原生宿主变更，Android/iOS/HarmonyOS 设备未验证。父仓库指针和 #501 未操作，Issue 保持打开。完整证据及中途终止的测试边界见 progress；后续条目为历史快照。

**最新批次：songloft-org/songloft#511 的 Lynx“下一首播放”与随机历史导航已完成提交前自审，修复五类遗漏，用户已确认审查、提交信息及本地提交；实际提交结果以 Git 历史为准，尚未推送。** 歌曲菜单复用中英文文案，安排歌曲保留当前进度、队列来源与后台补齐；已有歌曲移动到当前曲之后，当前曲最多额外安排一次，最近指定的优先播放。手动安排优先于四种播放模式，随机上一首按实际播放历史回退，下一首沿历史前进或播放手动安排。历史在真实音频 `playing` 事件或成功 DLNA 投放后提交，命令回执、失败和取消不会新增历史；预加载复用实际下一首选择，队列编辑、连续切歌、模式切换和恢复播放有对应回归。队列内选曲使用 `playQueueIndex` 保留上下文。自审修复首次重试漏报、首次播放前切音轨漏记、移除当前歌曲的异步竞态（含旧通知元数据与停止回执）、Web 快捷键忽略手动优先项、原生停止残留导航；七条追加回归覆盖上述边界。最终 **306 文件 / 3334 项**、类型、生产 Lynx/Web 双 bundle、**70 项发布工具**与两文件 ReactLynx 扫描通过。Chromium 中文 375px / 英文 1000px 实际菜单和队列截图已复核；独立 WAV/API 夹具的播放记录均为 `1 → 4 → 1 → 4`，页面错误为空。原生设备与真实 DLNA 渲染器未验证；本批未修改原生宿主源码，父仓库指针及已关闭 Issue 未操作。完整文件清单、反向验证和日志见 progress；本批拥有的浏览器容器和测试服务已停止。下文为之前批次快照。

**最新批次：songloft-org/songloft#510 的 Lynx Android 缓存目录已实现并完成提交前审查，用户已确认审查及提交信息并授权本地提交；实际提交结果以 Git 历史为准，尚未推送。** 设备缓存页提供本机/SD 卡目录选择、重新授权、恢复默认及当前账号迁移/进度/取消。Android 可选版本 1 扩展显式附加 `storage_version:1`；私有公共索引与旧 v2 媒体分离，旧壳/bundle 保持原目录行为，其他平台与必需 bridge/schema 不变。审查修复原件清理失败丢失追踪、旧同 key 私有副本阻止恢复默认、detach 取消异常三个问题；收尾原位置持久化，新副本失效保留可用原件。最终完整 **305 文件 / 3298 项**（2026-10-09 18:58:19 UTC+8 开始）、类型、生产双 bundle/Web、**70 项发布工具**、**62 项 Android JVM**及重建 APK 通过；生产 bundle 同步三端，包内容校验一致。当前 adb 无设备，模拟器因当前用户无 KVM 权限失败；SAF UI/持久授权、实际 SD 卡、原生 content URI 解码及第三方播放器发现尚未验收。日志、最新哈希与夹具边界见 progress；父仓库指针及已关闭 Issue 未操作。下文为之前批次快照。

**最新批次：弹窗与播放列表 Sheet 背景修复已获用户确认并授权提交，尚未推送；实际提交结果以 Git 历史为准。** 17 处覆盖层统一局部 `ModalMaterial` 与单层 `ModalScrim`，减少整页压暗、去掉整面渐变，保持内容/模糊祖先 opacity=1。Android 新增完整播放器内容采样根；原生按效果视图位置/尺寸变化刷新，解决滑入时保留屏幕外透明采样的残影。当前 **303 文件 / 3281 项**、类型、生产双 bundle/Web、发布 **70 项**、Android APK 与 **47 项 JVM**通过；Android API 34 和 Chromium 的明暗弹窗/队列截图已复核，嵌套遮罩恢复与关闭清理通过。录屏与哈希见 progress。Firefox/WebKit 当前无头环境连最小普通 HTML backdrop blur 都不绘制，其截图不算模糊视觉验收；iOS/HarmonyOS 设备仍未运行。

最后逐帧检查还修复了 Android SDK capture post 延后一帧的问题：仅 pre-draw 内同步完成受销毁保护的采样，其他 post 保持排队。新包明暗开合录屏和截图已复核，生产三端 bundle 已恢复并核对一致；模拟器录制不证明真机帧率。

上一批跨平台 Tab 玻璃修复已提交并推送：子仓库 `e2f119d`、父仓库 `f42f2b9`。下方「尚未推送」等描述为该批提交前的历史快照；全平台一致的原始目标仍未闭合，不能以共享实现或单端截图代替设备验收。

**当前目标尚未完成：用户要求统一 Android、iOS、HarmonyOS 和 Web 的液态玻璃显示与动画。** 共享弹簧、连续激活、轻微隆起与边缘光已接入；填色始终保留，背景采样排除前景图标与自身。Android 已有新包明暗及减少动画录屏，HarmonyOS GPU 网格已编译并通过资源生命周期检查；iOS 已撤销效果视图 opacity 动画，新增原生暂停材质动画按共享激活度插值 effect，并保持玻璃及祖先 alpha 为 1；选中 wash 在效果上方。新 Objective-C/Swift 尚未 Apple 编译或运行，不能视作正确视觉已验证。浏览器镜像现已接入实际应用：WebKit 18.2 / Firefox 134 的明暗、快速反向切换与背景对齐的逐帧布局检查通过，3/5/更多 Tab 和辅助功能卸载实测通过。WebKit 18.2+（含同内核的 iOS 浏览器）与 Firefox 134+ 使用浏览器主线程的有界实际背景镜像，经 SVG 模糊/位移绘制；SVG 文字按实际基线和换行复制。镜像只随源变化刷新，移动透镜在实际胶囊内用同一动画时钟逆变换背景，不复制前景控件。遇到可见 iframe/video/canvas 等无法忠实采样的内容，明确退回原生 blur，不能算完整折射验收。 Apple 设备尚未运行（既有 mac SSH 握手被重置），鸿蒙模拟器首次许可待授权，因此不能宣称全平台一致。用户已授权提交当前修复，实际结果以 Git 记录为准；尚未推送。最终检查与证据见 progress。下方为历史批次快照。

此前 `/tmp` 镜像与独立几何动画仅属原型；本轮已接产品并修复文字滤镜逃逸、背景时钟错位与降级样式优先级。详细失败与最终证据见 progress；视觉检查使用带实际时间戳的应用 PNG 序列，Firefox 内置录制的灰帧已排除。软件浏览器和模拟器结果不证明真机帧率或功耗。

最新共享实现通过完整 **302 文件 / 3267 项**、类型、生产双 bundle/Web、发布 **70 项**、Android **43 项 JVM**与 APK、HarmonyOS 未签名 HAP；iOS C 时钟与接线检查通过，UIKit 未编译或运行。新 Android 测试包已在 API 34 录制明暗连点和关闭动画，安装哈希核对一致；三种浏览器明暗/落位/辅助功能通过，WebKit/Firefox PNG 动画序列已复核。生产包已恢复并核对三端及包内 bundle，录制测试包与生产包分别记录。自建测试服务已停止。本轮提交已获用户授权，尚未推送；Apple 与鸿蒙运行验收继续开放。

用户已确认提交此前一轮 Tab 水滴动画与移动玻璃透镜修复；验证与自审完成，提交状态以 Git 历史为准，尚未推送。下方「未提交」描述保留为实施时快照。

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

## 2026-10-28 · songloft-org/songloft#545

iOS 上传请求已独立持有完成回调，避免 picker delegate 释放后丢失回执。317 项原生契约检查、类型检查通过，隔离旧源码新检查失败。尚缺 Xcode 编译与 iOS 18.6 真机验收；需要重建原生包，未提交或发布。详见 progress。

English: #545 source fix: upload requests now retain completion independently of the dismissed iOS picker delegate. All three outcomes return to JS on the main queue. Baseline ab96b325565241cc62850fba01e5efe63385754b plus uncommitted changes, Linux, 2026-10-28. Native contract checks: 317 pass; new structural check fails against isolated old Swift. TypeScript build passes. Logs: /tmp/songloft-545-{contract,negative,types}.log. Not run: Xcode build and iOS 18.6 device upload/cancel/error retry (no Apple SDK/device). Structural checks do not establish ARC timing or reproduce the reporter's device. Rebuilt native client required. No commit, push, release or Issue write.
