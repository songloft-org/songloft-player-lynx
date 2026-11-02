# songloft-org/songloft#540：歌单滚动条定位

[Issue](https://github.com/songloft-org/songloft/issues/540) 最初报告「歌单进度条下滑会闪回第一首」，当时没有设备或版本信息。2026-10-29 的[补充评论](https://github.com/songloft-org/songloft/issues/540#issuecomment-6488463784)说明曲库普通上划仍会回顶，环境为 iOS 18.6 Safari、服务端 v2.13.7、客户端 0.1.7；录屏上传失败。[English](../en/project/issue-540.md)。

## 2026-11-02 · 录屏拆帧与 Web 滚动开销

来源：[报告人的 23.198 秒录屏](https://github.com/songloft-org/songloft/issues/540#issuecomment-6566677761)。基线：客户端 `07599c329f3b52247d48538bfbc7537fd8584148`、父仓库 `60a237d4331247909ea15fabdbc1e45fb771c348`；本批为未提交工作树，父 gitlink 不变。录屏没有版本页，无法确认安装包 SHA；环境沿用此前报告的 iOS 18.6 Safari，不能据文件元数据确定系统版本。

| 视频位置 | 实际可见现象 | 能说明的范围 |
| --- | --- | --- |
| 0–1.25s | 开始大片留白，约 0.5s 起歌曲行补齐 | 列表内容可见性不连续；不能仅据此判定网络慢 |
| 1.5–1.75s、2.75s、4.5s 附近 | 曲库反复只剩上方少量歌曲或整个内容区留白，随后恢复 | 优先核对分页边缘、占位高度和主线程工作 |
| 6–11s | 大体停留在同一组歌曲，随后切换插件 | 手指未录入画面，不能把停留直接算作卡死 |
| 约 12–23s | iWebPlayer 多次快速跨行滚动；约 17.5–19.5s 也有多次部分或整区留白 | 对照插件也有补内容现象，不能声称其完全没有留白 |

视频为 592×1280、1219 帧的可变帧率 H.264；录屏平均帧率不等于应用帧率。原片、每秒总览、前 6 秒和 17–22 秒的 4fps 拆帧保存在 `/tmp/songloft-540-20261102/`。拆帧用于定位现象，未把插值图或探针坐标当成原机帧率。

本地确认两处独立问题：

- Web 引擎省略布尔 `false` 属性，真实 DOM 的 footer 没有 `recyclable="false"`。因此其 `content-visibility: auto` 可将实际约 80px 的导航留白估算为整个 626px 视口；基线 40 首歌曲的滚动范围从 3228px 降为 2682px，相差 546px。宿主现在仅让 `__footer__` 保持实际布局；歌曲行继续浏览器虚拟化，上一轮容器防回顶修复保留。
- 玻璃背景每次采样都递归发现全部 shadow root。100 首诊断中建立 552 个观察根，约 5 秒操作扫描约 8 万节点；前轮降低行坐标测量没有消除这项开销。现在仅在元素插入/移除后重新发现观察根；滚动、颜色、文字变化仍采样并更新画面，新增/移除子树及销毁继续维护订阅。

旧实现下新增回归 4 失败 / 15 通过：三个部署路径的 footer 布局断言失败，滚动及属性更新场景重复扫描断言失败。修复后两文件 19 项通过，覆盖嵌套 shadow root 的新增、内容更新、移除和销毁。

验证环境：Linux x86_64 / Node 22.17.1 / pnpm 11.15.1 / WebKit 18.4 / Docker HeadlessChrome 121.0.6167.85。浏览器使用实际部署产物、663 首合成歌曲（含封面、中英长标题）、20 首分页及后续页 500ms 延迟；没有使用报告人的曲库。

| 等量 WebKit 对照 | 修复前 | 修复后 |
| --- | --- | --- |
| 已加载歌曲 / 滚动距离 | 140 首 / 4900px | 140 首 / 4900px |
| 操作期间额外歌曲请求 | 0 | 0 |
| `querySelectorAll('*')` 遍历节点总量 | 691,136 | 13,394 |
| footer computed `content-visibility` | auto | visible |
| 歌曲行 / 滚动容器 | auto / visible | auto / visible |

节点总量减少约 98.1%，表示消除了稳定结构上的重复发现工作，不代表应用帧率或 iPhone 性能提升 98.1%。两版均有有效玻璃场景、封面及长标题，没有页面异常；after 的少量遍历还包括有界 SVG 镜像复制。最终 `controlled-*` 对照使用完全相同的 bundle 与其他资源，只有本批两个 Web 源文件不同；此前缓存 bundle 仅构建时间/序号 28 个字节不同的初次采样作为早期记录保留。初始几何独立对照确认：同为 40 首，before 3228px、after 2682px，未主动逐项测量歌曲或 footer 以提前消除旧占位。

- `pnpm test --maxWorkers=2`：354 文件 / 3757 项通过；类型、Lynx/Web 双构建、部署 Web 构建及串行 89 项发布工具检查通过。构建保留已有 `touch-action` 警告。
- WebKit 390×844 连续分页到 9800px，offset=0..160 各请求一次；390×420 短视口到 4200px，offset=0..60 各一次，均无回顶或页面异常。短视口连续跳底预加载 140 首后从 0 滑到 4200px；首页真实卡片进入歌单后到 7610px，歌单 offset=0..120 各一次，均通过。证据见 `final-{pagination,short,short-jump,playlist-verified}.json`。
- Docker Chrome 实际触摸上划到 7033px，offset=0..120 各一次，footer visible、歌曲行 auto、无页面异常。请求证据读取夹具服务器实收记录；早期 Chrome Worker 请求监听得到空数组，不能作为无重复请求的证明，已替换并复验。
- 保留其他早期驱动失败：直接加载 URL 未进入应用的内存路由，歌单改用首页真实卡片点击；复用曲库的 9000px 和跨路径 offset 断言不适合歌单，后续分别按歌单实际高度及端点验证。不修改产品代码或放宽仓库回归来使这些尝试通过。

源码指纹、命令与日志清单：`/tmp/songloft-540-20261102/verification.json`；截图、录屏拆帧及逐次位置同目录。Not run：报告人的 iPhone / iOS 18.6 Safari、真实音乐封面与网络、iWebPlayer 同机性能采样、原生宿主构建/设备、后端 Go 检查、远端 CI/发布。本批仅改 Web 宿主页与采样脚本；原机录屏未提供安装 SHA，不能宣称原机已验收。未提交、推送、更新父指针或写 Issue。

## 2026-10-30 · 曲库滚动与预取

[最新评论](https://github.com/songloft-org/songloft/issues/540#issuecomment-6501337810)确认 dev 已修复回顶，剩余为 iOS Safari 曲库滑动顿挫、分页等待。基线：客户端 `196adc500da5b700bfbf61ab99ffc4b2918922c4`、父仓库 `59bca2fbb455022669aec88337281c0b968ff782`。本批仍是子模块未提交工作树，父 gitlink 不变。

- 曲库与分类页稳定歌曲数组、行构造和点击回调，memo 复用已有行；点击通过 ref 读取最新队列、筛选、选择状态和分类播放上下文。单首选择只更新目标行；歌曲变更、响应式布局和行内订阅仍可更新。
- 两处列表提前约 768px 预取，使用 `cancelRefetch: false` 复用重叠请求；保留每页 20 首与懒加载。Web 的 item-count 阈值只观察单行，快速跳底可能越过它，因此额外订阅 Web 实际末端事件；原生不接此事件。
- 底栏玻璃镜像原先逐项读取离屏行坐标。现在逐源根捕获浏览器虚拟内容跳过事件，以 WeakSet 排除跳过子树，恢复可见时重绘；覆盖 shadow root 和销毁解绑。不支持事件的浏览器继续原有采样路径。保留上一轮容器布局、64px 估算及稳定 inset，不关闭玻璃或恢复位置轮询。
- 隔离旧实现：曲库/分类/行 memo 回归 5 失败、32 通过；玻璃跳过与 shadow-root 回归 2 失败、4 通过；末端事件回归 1 失败、1 通过。失败均落在预期行为断言，日志位于 `/tmp/songloft-540-smooth/*negative*`。
- 全量快照 `pnpm test --maxWorkers=2`：353 文件 / 3740 项通过。之后更新玻璃事件、shadow-root 检查和末端兜底，最终受影响的曲库、歌单、玻璃与宿主页 36 文件 / 423 项通过；不把早期全量快照当作后续源码的完整全量结果。类型、双产物、Web、发布工具与最终源码标识见 `/tmp/songloft-540-smooth/verification.json`。
- 夹具：Linux x86_64 / Node 22.17.1 / pnpm 11.15.1 / WebKit 18.4 / Docker Chromium 121，390×844，601 首合成歌曲、每页 20 首、后续页延迟 500ms。操作实际部署产物，探针不逐项读取全部行坐标。诊断时同样 28 次拖动，旧版偏移 5956，预取后约 9500；同样加载到 180 首的玻璃对照，行测量 14,385 → 2,182。诊断期间有并发检查，不据此声称帧率提升。
- 最终等量 140 首对照：两版均从 0 滚到 4900、141 个列表子项，均没有额外歌曲请求；行坐标测量 8883 → 744，玻璃场景有效、无 pageerror。最终 WebKit 连续分页到 9456，offset=0..160 各请求一次；Chromium 实际触摸到 10861，offset=0..180 各一次，均未回顶，容器 visible、行 auto。390×420 短视口也通过跳底逐页加载 140 首并继续拖动到 2100。截图与产物哈希保存在上述验证 JSON。iwebplayer 的实际同机性能没有测量。
- 早期失败均保留：WebKit 缺 EGL vendor 配置、一次页面崩溃（重试通过）；无可证实收益的 `checkVisibility` 尝试已移除。快速跳底预加载超时导致发现单行阈值边界，已补末端事件。Chrome 驱动首次在 Node 端调用不存在的 `fetch`，改在页面 realm 读取；测试事件构造错误也不算通过。

Not run：报告人的 iOS 18.6 Safari、真实曲库/封面、iwebplayer 同机对照、Android/iOS/HarmonyOS 原生构建及设备、后端 Go 测试、远端 CI 与发布。本批没有原生宿主或后端修改；本地浏览器不等同于原机流畅度验收。未提交、推送或写 Issue。

上述为本地验证快照。用户随后明确授权本批提交、推送并回复 songloft-org/songloft#540，包含先提交子仓库、再同步父指针；实际提交、CI 和回复以 GitHub 交付记录为准。未授权正式发布或关闭 Issue。

## 2026-10-29 · 曲库分页高度稳定性

- 基线：主仓库 `deaf6342e0bac964eb8db7ddcb9ff825575b85b7`（v2.13.7 tag 解引用），客户端 `645717f254481baffd13a21da1ff5ba0191d29d4`（0.1.7）；均包含 10-25 的歌单修复。本批为客户端未提交工作树，未更新父 gitlink。
- Chromium 证据：曲库与分类歌曲页没传 `estimatedItemHeight`，web-elements 0.12.7 默认以 `100cqh` 估算离屏行；实际歌曲行为 64px。Chromium 121 / 390×844 / 241 首合成歌曲、20 首分页且后续页延迟 500ms 的夹具中，旧版 41 行的 `scrollHeight` 一度为 11658，随后为 2682；分页 footer 切换还造成 32px 的高度变化。
- 进一步的 WebKit 证据：只补估算和 footer 后，Linux WebKit 18.4 仍在追加第 21–40 首时从偏移 260 回到 0，41 行的 scrollHeight 瞬间变为视口高度 626。将 `x-list::part(content)` 的 `content-visibility` 改为 visible 后，对照中连续滚动不再回顶。该证据覆盖 WebKit，但仍不等同于报告人的 iOS 18.6 真机。
- 最终修正：两处歌曲列表显式传 64px 占位估算（不是固定行高，大字体仍可增长）；loading 放在同一个导航 inset 中。宿主页通过公开的 `injectStyleRules` 让列表容器保持布局，歌曲行继续 `content-visibility: auto`。该属性会被升级时的类字段清除，因此先移除初始 url，等待 `lynx-view` 升级后设置钩子再启动渲染。无需改依赖、强行恢复滚动位置或增加定位重试。
- 新增两项组件回归：旧版 2 项失败、原有 20 项通过；新版最终 22 项通过。另在隔离副本仅补估算、保留旧 footer，两个 inset 身份断言仍失败，证明 footer 检查独立有效。第一次隔离执行因高负载发生 Vite fetch 超时，不作反向证据。
- 最终类型检查通过；顺序执行 `RAYON_NUM_THREADS=1 pnpm run build --environment lynx` 与 `pnpm run build:web`，分别生成 Lynx/Web 并成功部署 Web 产物；保留既有 touch-action 警告。`pnpm test --maxWorkers=1`：353 文件 / 3733 项通过。早期共享 JS 快照另有 352 文件 / 3726 项及定向两文件 / 22 项通过，不能替代最终对象。
- Chromium 实际触摸连续上划 16 次：新版分页高度按 20 首增长，没有旧版的大幅估算突变，最终偏移 5017、首个可见歌曲 78；无 pageerror。截图与逐次实际位置见 `/tmp/songloft-540-safari/chrome-{before,after}.{json,png}`。该结果不替代 Safari 或原生设备。
- WebKit 最终宿主页验证：12 次鼠标拖动在真实滚动容器中从 0 单调到 3120，跨多次分页，首个可见歌曲 49；容器 computed content-visibility 为 visible，歌曲行为 auto，无 pageerror。`webkit-after.json` 保存初版的实际回顶，`webkit-final-product.{json,png}` 保存最终构建产物通过结果；最终 Chromium 触摸偏移 5106、第 79 首可见，见 `chrome-final.{json,png}`。根路径、子路径、嵌入模式的宿主页回归旧版 3 项失败、9 项通过，最终 12 项通过；夹具模拟自定义元素升级清除类字段，避免只验证属性存在。
- 早期额外 `pnpm run test:release` 未通过：85 passed / 3 failed / 1 cancelled。证据包括 Python 夹具尚在导入时达到短超时、子进程超时，以及其他构建清理共享 dist 后打包测试找不到 bundle。隔离反向测试和早期 WebKit 也曾超时，最终构建重跑曾被系统以 137 终止；同期实测 load >100、swap 已满。保留原始失败，不修改断言或把这些尝试标为通过；最终重跑状态见验证 JSON。
- 最终顺序构建后串行运行 `node --test --test-concurrency=1 scripts/__tests__/*.node-test.mjs`：89 passed / 0 failed / 0 cancelled，无跳过；未放宽原有断言。
- 最终源码指纹、环境与日志清单见 `/tmp/songloft-540-safari/verification.json`。工作区并发出现的上传功能修改不属于本批；浏览器产物另存 `verified-dist/`，不依赖后续被替换的 dist。

Not run：报告人的 Safari 18.6 与真实曲库、iOS/Android/HarmonyOS 真机及宿主构建（本批没有宿主改动）、远端 CI、发布。WebKit 回顶机制及修复已有浏览器证据，原机仍待复验。没有提交、推送、写 Issue 或关闭 Issue；下文授权属于历史批次，不适用于本批。

## 原因与修复

- 分页和布局尚未到位时，滑块一直取 `currentIndex`，初始值为 0；拖动目标虽然已保存，滑块仍回到第一首的位置。改为等待期间显示请求的位置，实际歌曲气泡仍取可见行。
- 原生 `scrollToPosition` 一调用就清除请求，成功回调也再次清除。数据到达不代表原生列表已布局，调用成功也不证明目标可见。原生与 Web 统一等待可见行确认，并沿用每 200ms、最多 25 次的布局重试；失败、超时、空页和离开页面不会无限重试。调用前核对请求代次，拒绝旧请求移动新位置。
- 快速拖动时，触底与定位续拉可能在状态更新前重复调用 `fetchNextPage`，默认行为会取消并重发同一页。设置 `cancelRefetch: false`，让重叠信号复用进行中的分页请求；新增页面回归覆盖该契约。
- 不改变排序、后端接口、普通打开歌单的分页方式或播放队列。

## 验证对象与证据

仓库：`songloft-org/songloft-player-lynx`，基线 `eb396153c0a05ddd8a2ba940da87211d1a1cd36e` + 本次未提交工作树。2026-10-25，Linux x86_64 / Node 22.17.1 / pnpm 11.15.1。最终差异标识和命令结果见 `/tmp/songloft-540-verification.json`。

- 新增原生布局延迟回归，并在分页用例中断言等待期间的滑块位置。旧实现 2 项失败、1 项通过（`/tmp/songloft-540-regression-before.log`）；修复后 3 项通过（`/tmp/songloft-540-regression-after.log`）。覆盖原生成功但未移动、真正可见后停止重试、超时和卸载。
- 最终隔离副本使用旧页面和旧列表、配合新测试，3 项按预期失败、23 项通过（`/tmp/songloft-540-negative-final.log`）；最终页面/列表 26 项通过（`/tmp/songloft-540-focused-final.log`）。最初副本的 Vite 文件访问范围配置失败不计为反向证明，补齐范围后才得到上述断言失败。
- 最终生产 `pnpm run build` 同时产出 Lynx/Web（`/tmp/songloft-540-production-final.log`）；保留已知 `touch-action` 编码警告。带测试桥的 Android bundle 与 `./gradlew --no-daemon assembleDebug` 通过（`/tmp/songloft-540-debug-final.log`、`/tmp/songloft-540-gradle-final.log`）。此前构建期间调整测试文件，被新鲜度闸门拒绝打包；停止并发构建、冻结源码后按顺序重跑通过，不把拒绝/中断计为通过。
- 最终 `pnpm test --maxWorkers=4`：348 文件 / 3704 项通过；`pnpm exec tsc -b` 通过（`/tmp/songloft-540-full-final.log`、`/tmp/songloft-540-types-final.log`）。验证源码标识 `aed8ac66643cc8195284749fc7e6b381f34e12662379a68034fb0be5aa276098`，四个源码/测试文件的 SHA-256 见验证 JSON。
- Chromium 121，390×844，130 首合成歌曲：普通页面仅加载首批 20 首；实际触摸与鼠标快速拖动均在 offset 0/20/40/60/80/100 各请求一次，最后滚动偏移为 6592、第 104 首位于顶部、滑块为 20.155%，无页面异常。`/tmp/songloft-540-{touch,mouse}-final.{json,png}` 保留结果和截图。夹具只使用本地临时服务与测试账号，不操作用户曲库。
- Android API 34 / x86_64 + ARM 转译模拟器使用最终 APK `594b18c492ed83ba28765a7815aae43d5e8cb38642cc4b718fc06d05c3138810`；包内与复制的测试 bundle 哈希均为 `64d9705ea94ad9411c6f6f51eb85496d986b214f9d1e8e64a8372c430cf7daa3`。实际拖动跨分页后 `scrollY=6528`，第 104 首 top=407 位于 343–820 的列表视口内；普通滑动后 `scrollY=6741`，一秒后仍为 6741，没有被定位重试拉回。见 `/tmp/songloft-540-native-{result.json,after.png,final.log}`。
- 保留早期失败：并行检查期间鼠标未在期限内到达目标、原生交互被 System UI ANR 弹窗挡住；分别保留在 `/tmp/songloft-540-mouse-under-load.json` 与 `/tmp/songloft-540-native-under-load.{json,png}`，不计为通过。全量检查结束、移除系统弹窗后，最终 APK 与鼠标分别单独复验通过。启动/安装的环境失败和模拟器崩溃也保留在验证 JSON 中。

Not run：Android 真机、iOS / HarmonyOS 设备及宿主构建（宿主无修改，当前为 Linux 环境）、远端 CI（未推送）和正式发布。浏览器与 Android 模拟器结果不代表报告人原机或其他平台验收。

上述未提交工作树为本地验证快照。用户于 2026-10-25 明确授权提交、推送并回复 songloft-org/songloft#540；子仓库先提交，父仓库随后同步指针，实际提交、CI、开发包与评论状态以 GitHub 交付记录为准。没有正式发布或关闭 Issue 的授权。提交信息：`fix(playlist): 修复分页定位时滚动条跳回顶部 (songloft-org/songloft#540)`。
