# Lynx 客户端开发经验

### 设置页复用共享行布局

- 2026-11-21，`9150581` 的重置元数据复选框通过了曲库定向测试，但全量测试中的 `grouped-list.test.ts` 发现扫描页直接渲染了 `settings-row`。共享行组件负责分隔线和点击区域。
- 用 `SettingsRow` 的尾部内容承载 `AppCheckbox`，由整行处理点击。修改设置行后同时运行业务交互用例和分组布局检查。Seen 1×（2026-11-21）。

### BUNDLE-002：从公开分支选择后端构建源码

- 2026-11-19，Lynx Android/iOS 与 Flutter Bundle 流水线请求只存在于本地的后端提交 `35b1e33`，GitHub 返回 `upload-pack: not our ref`。远端 `main` 当时也缺少 Android 构建需要的 SQLite 实现。[Lynx CI](https://github.com/songloft-org/songloft-player-lynx/actions/runs/44477893015) · [Flutter CI](https://github.com/songloft-org/songloft-player/actions/runs/44459675316)
- 先将构建所需的后端代码合入主仓库，再改用公开 `main`。流水线每次运行读一次分支最新提交与版本，所有打包任务复用这次结果，并核对构建和产物记录的真实 SHA。
- Seen 1× (2026-11-19)。

### BUNDLE-FFMPEG-001 · 桌面 Bundle 必须复用固定的 FFmpeg 资产

- 范围：Lynx Android、iOS 与桌面 Bundle 构建。
- 规则：桌面 SDK 在打包前校验解析记录和 ABI 资产摘要，再更新 SDK manifest；Android 通过 APK 原生文件目录安装工具，iOS 编译时链接静态库。不能使用无版本约束的 `latest` 下载。
- Seen 1× (2026-11-20)。[后端 Bundle CI](https://github.com/songloft-org/songloft/actions/runs/44754365874)生成 Android、iOS、Windows 和两种 macOS 架构的 Lynx 测试包。设备安装与播放另行验收。

### WEB-AUDIO-001 Web 播放进度以当前媒体元素为准

- [songloft-org/songloft#581](https://github.com/songloft-org/songloft/issues/581)，Lynx 基线 `64692b84e5f36a6f2f3ceeede77904771c2904d6`。Docker Chrome 播放真实 MP3 时，将 Web 音频宿主的 250ms 定时器延迟到 60 秒，旧进度一直停在零，浏览器的 `currentTime` 仍持续推进。
- 用当前媒体元素的 `timeupdate` 和 `durationchange` 回报位置和时长。曲终重新读取媒体位置，再发送完成事件。直播的无穷时长按未知上报，切源后忽略旧元素事件。
- 证据在 `/tmp/songloft-581.7JfaBL/`，四项新回归在旧宿主上失败，在修改后的宿主上通过。
- 同次 Windows 复验用报告人的 pywebview 托盘流程。服务端从 `v2.13.9` 更新到 `f75be9e` 后，已打开的 WebView2 仍执行旧脚本，页面心跳正常。对照运行中和 HTTP 响应的 `audio-host.js` 哈希，普通刷新后两者一致。验证嵌入前端升级时，应检查窗口实际执行的脚本版本。见[进展记录](docs/project/progress.md#issue-581)。
- 确认加载新版后，Windows 长播仍出现进度消息积压，曲终事件也一起延迟。分别采集媒体时钟、桥接上报、可见进度和下一首开始时间。Web 定期进度超过有效期即丢弃，并在当前会话降低采样频率。定位、时长修正与曲终保留即时上报。见[真机对照](docs/project/progress.md#issue-581)。
- Seen 1× (2026-11-19)。

### BUNDLE-001：用固定的绑定工具编译，按 AAR 声明选择 Android 下限

- 2026-11-18，Lynx 基线 `baef0f9`，后端固定为 `81204e2`。`gomobile init` 拉取了新版 gobind，随后临时 Go 模块的 VCS 检测失败。改为从固定后端 Go 模块版本安装 gomobile 和 gobind，并关闭临时构建的 VCS stamping。二进制仍通过链接参数记录真实后端 SHA。
- 三种 Android ABI 的原始 AAR 和 iOS arm64 静态框架均编译成功。Lynx 首次整包构建在 manifest 合并时明确报出 AAR 要求 API 23。根据 AAR 是否存在选择最低版本，Bundle APK 使用 API 23，无后端的源码构建使用 API 21。安装包检查读取每种已打包的 Go 库，核对实际 SHA。日志见 `/tmp/songloft-bundle-build.v9dPHY/`。
- Seen 1× (2026-11-18)。

### LYRIC-003 在实际歌词字段与播放入口验证逐字解析

- 播放歌词 Store 和逐字 LRC 解析使用基线 `f624965610b21fab03d8aec33b08d34cb90a1cba` 验证。[songloft-org/songloft-player#54](https://github.com/songloft-org/songloft-player/issues/54)
- 原解析器的尖括号单测可通过，但 Store 只在 `lxlyric` 分支调用它。旧实现的四项新增回归分别暴露行内单方括号、洛雪相对偏移、双括号及歌词字段选择问题。
- 普通 `.lrc` 旁挂歌词经 `lyric` 字段传输，专用 `lxlyric` 有可用逐字时间时优先。使用真实格式夹具走 Store、缓存和播放器，保留普通 LRC 连续行首标签的重复语义。
- Seen 1× (2026-11-18)。

### DESKTOP-002：隔离 Node 与 Lynx weak N-API 的 C++ 包装符号

- 范围：同一个 `.node` 同时提供 Node 宿主功能和 Lynx 原生模块。
- 证据：只分别构建两类源码可通过；完整业务页启动却在 Lynx_JS 线程跳到地址 0，报告 `lynx_napi_report_and_clear_exception`。普通 Node 与 weak N-API 包装拥有相同的 inline C++ 符号，链接器合并后会使用错误 ABI。分配 `NAPI_CPP_CUSTOM_NAMESPACE=SongloftNode/SongloftLynx` 后，真实 Mac 业务登录页及存储/网络/快捷键 RPC 运行通过。
- 规则与正确示例：同时隔离 C API 选择和 C++ 包装命名空间；只为 BTS 源码启用 `USE_WEAK_SUFFIX_NAPI`。分别验证宿主导出和真实 Lynx Callback，不能以模块链接或 Node-only 播放测试代替两者合用。
- Seen 1×（2026-11-17）。状态：未提交候选；详见[本轮记录](docs/project/desktop-implementation.md)，Windows 和设备验收分别记录。

### PLUGIN-003：模板 fetcher 和桥接注册不能替代原生子页面组件

- 范围：HarmonyOS HAP 打开 miot 等 Lynx 插件；基线 `173fa140c70ba80998cb8f49960619306986ef86`。
- 证据：锁定的 Harmony Lynx 4.0.1 没有 frame 实现，原 Index 也没有对应 Behavior；隔离旧代码的子页面回归实际创建 0 个实例，组件回归找不到鸿蒙节点，均按预期失败。已有 HAP 编译与模板下载器测试未覆盖这个缺口。
- 规则与 Done right：按实际 SDK 核对标签实现及其完整加载链路；鸿蒙使用专用标签创建独立 LynxView，明确传入 fetcher、组件、桥接和初始 props，验证令牌晚到、RPC、保留/销毁与替代身份。子页面不绑定根页面单例；模拟器/真机画面与编译、适配器测试分别记录。详见[记录](docs/project/harmony-plugin-frame.md)。
- Seen 1× (2026-11-17)。状态：本地源码修复、回归和 HAP 编译通过；用户已授权本批提交、推送及同步父指针，实际提交和同 SHA CI 见记录。无鸿蒙设备验收，不创建正式版本；旧壳需要重装新 HAP。

### PLUGIN-004：入口展示方式不能决定插件实例是否保留

- 范围：首页网格、导航 Tab 与管理入口的原生 Lynx 插件；基线 `b952231c253aad1938d3020ee74157b100a11291`。
- 证据：保留机制原来只匹配 `tab=true`，首页每次返回都会卸载子引擎。旧实现的新首页回归因没有保留节点失败；修复后 20 次往返同一节点、搜索保留、仅一次挂载。插件侧另有每次 resumed 强制重载健康封面的独立问题，不能将封面闪动全部归因于路由。
- 规则与 Done right：所有原生 Lynx 入口共享 Shell 实例，embed/标题栏只决定展示；离开时暂停，身份/服务器/停用/退出时清理。健康封面不因恢复显示失效。编译、组件与浏览器分别记录；无堆栈不能将重复创建或图片重载定为鸿蒙闪退根因，详见[记录](docs/project/miot-reentry.md)。
- Seen 1× (2026-11-17)。状态：本地修复；未提交/发布，鸿蒙崩溃待日志与设备验收。

### PLUGIN-005：Windows 插件验收要核对首次画面与恢复画面

- 范围：测试签名 Windows x64 2.13.16 安装上的 Lynx 与 HTML 插件。
- 证据：两个插件写入了收藏和后端存储，并播放了测试音。CEF 离屏合成仍显示白屏。Lynx 子窗口修正位置后能正常首次打开，返回后再次打开仍白屏。Win32 枚举显示原 HWND 仍可见且位置正确，提升子窗口层级并请求重绘立即恢复原内容。
- 规则：独立核对插件副作用、画面与原实例恢复。Windows CEF 插件使用原生子窗口。Lynx 在尺寸变更后校正 DPI 原点，等渲染器完成窗口尺寸变更再请求重绘。保留实例的回归应包含隐藏后恢复和窗口缩放。[验收记录](docs/project/desktop-implementation.md#windows-完整业务页插件验证)。
- Seen 1× (2026-11-19)。状态：本地修复和 Windows 虚拟机复测，更新后的整包待验。

### DESKTOP-004：调试宿主与页面会话分别等待就绪

- 范围：2026-11-17 macOS x64/Rosetta 第一批探针采集；客户端 `173fa14` 加未提交工作树。
- 证据：固定延迟后采集分别遇到 `No available clients` / `No available sessions`；轮询实际页面后，9.633 秒取得可用会话，真实 Callback、CoreAudio、CEF 加载和视频截图均可采集。另一次总进程预算没有覆盖初始化后才启动的退出计时，被控制器提前清理；20 秒探针重试正常退出。详见[记录](docs/project/desktop-phase1.md)。
- 规则与 Done right：先核对目标进程仍活着，再等实际页面会话；宿主在线不是页面可用。应用计时与控制器计时必须使用一致起点或留出已观察的初始化时间，保留原始失败和清理原因，不把采集时序错误写成目标不兼容或应用退出失败。
- Seen 1× (2026-11-17)。状态：采集修正；锁屏下连续画面与交互仍未验收。

### DESKTOP-003：原生绘制完成应绑定 invoke 回调

- 范围：2026-11-17 第一批 macOS 探针；基线 `173fa14` 加未提交工作树。
- 证据：实际引擎时间前进但提交帧保持 1；`SelectorQuery.exec()` 的真实声明为 `exec(): void`，传入的回调未被执行，绘制门控一直占用。DevTool 日志与截图见[记录](docs/project/desktop-phase1.md)。
- 规则与 Done right：SelectorQuery 保持类型；在 `invoke` success/fail 中释放单请求门控，处理同步异常，销毁后忽略回调。4 项回归通过。锁屏环境仍有表面缓冲超时，原因待解锁定位，不能把此单点修复当作连续视频验收。
- 同轮状态修复：换源保留全局暂停观察值，避免未变化属性不重发时长期未知；隔离恢复旧重置后原生测试实际失败。
- Seen 1× (2026-11-17)。状态：本地修复；macOS 连续画面、人工听音和三架构验收未通过。

### DESKTOP-002：绘制所需锁内不能同步等待 libmpv 核心

- 范围：第一批桌面音视频探针，`6df678d` 后未提交桌面源码；2026-11-17 核对固定 mpv 0.41.0 `render.h` Threading 约束，发现同步暂停与状态读取在绘制所需互斥锁内。
- 规则与 Done right：活跃 render context 的共享锁内只使用 render-safe 异步控制、属性观察和零超时事件读取。初始化同步版本读取先于 render 创建；未知属性保持未知，异步命令排队不伪装为实际状态。
- 证据：`test:native` 使用真实头文件声明及 API double 执行生产 `Engine`；隔离恢复同步暂停、同步读取后，两次测试都编译成功并以对应的 `synchronous ... holds the render lock` 失败。修复后的事件读取、未知态、异步错误、换源和释放顺序通过，日志 `/tmp/songloft-desktop-engine-test-final.log`；此测试复现的是 API 约束违反，不是目标平台实播死锁。
- Seen 1× (2026-11-17)。状态：本地控制修复；目标系统真实音视频仍 Not run。

### DESKTOP-001：可选运行时必须按全部目标架构检查锁文件

- 范围：Windows/macOS 桌面第一批候选依赖；客户端基线 `888f5b88c842ea932a1f1f0b810a7f82a876f6fc`。
- 证据：镜像对 `@lynx-js/lynxtron-runtime-darwin-arm64-devtool@0.0.31` 返回 404，官方 registry 返回版本及摘要；安装仍退出成功，但锁文件漏掉 arm64。新增完整矩阵测试实际失败，见 `/tmp/songloft-desktop-lock-before.log`。仅改 registry 并复用旧元数据仍未补齐。
- 规则与 Done right：桌面独立配置官方作用域 registry，使用新 store 重新解析并锁定三架构元数据；检查每个目标包及摘要，不能用当前 Linux 安装成功代表 macOS/Windows 就绪。修复后三个 Node 检查通过，见 `/tmp/songloft-desktop-lock-fixed.log`。此检查不替代目标平台编译和运行。
- Seen 1× (2026-11-17)。状态：候选依赖修复；三架构原生验收 Not run。

### LICENSE-001：协议入口要可阅读，依赖署名要验证覆盖完整性

- 范围：登录协议、同意状态和许可证页；基线 `888f5b88c842ea932a1f1f0b810a7f82a876f6fc`。
- 证据：协议文字原先只切换勾选；许可证页只验证已有条目，没有发现新增的四个直接依赖。隔离旧页面后，新回归分别因缺少协议入口和漏列四包失败（2 失败、8 通过）。
- 规则与 Done right：阅读入口用 `catchtap` 独立打开离线中英协议，不改变同意状态；复用 ConfirmDialog 的滚动、关闭和返回处理。许可证测试同时从运行时依赖反查条目，保留组件家族通配署名。
- 验证与边界：定向回归、类型、双构建、完整测试及 Docker Chrome 交互的最终结果和工作树标识见 `/tmp/songloft-license-fix-20261117/verification.json`；原生宿主编译和设备交互 Not run，共享 JS 与 Web 结果不能代替设备验收。
- Seen 1× (2026-11-17)。状态：本地修复，未提交或发布。

### PLUGIN-002：关闭连接必须取消仍在等待凭据的开连请求

- 范围：MIoT Lynx 父桥，基线 `88e00646a6c948c3497fbf32eaab3c80f04bdd82` 加本轮工作树。
- 证据：异步 secure.get 尚未完成时，socketClose 已执行，随后仍创建原生连接；新增实际父桥测试在修复前 1 失败/2 通过。
- 规则与 Done right：开连前记录 frame/socket 请求身份，关闭时删除；凭据 await 后及 finally 均核对同一身份，不能复活已关闭连接或清理替代请求。Web 与原生共用同一个适配器；记录见 miot 插件 `docs/lynx-migration.md`。
- Seen 1× (2026-11-16)。本轮用户明确授权提交主程序；物理设备、iOS/HarmonyOS 编译 Not run。

### PLUGIN-001：插件内页签保留不等于原生 frame 保留

- 范围：Android 原生主导航插件，基线 `2447fade1affad9dda94f0bd68aff932680d91d8`。
- 证据：原 frame 在路由页面内，曲库往返必然重建；只修插件内部 scroll-view 不能保留搜索。原生分支组件回归验证同一 frame 和搜索状态，隔离破坏为只渲染当前 frame 后因原节点丢失失败。
- 规则：主导航 frame 生命周期归属稳定 Shell，隐藏时暂停界面轮询；版本/更新时间、停用、服务器作用域和 Shell 退出均清理。Web 的现有保留机制不能外推到原生。
- 同批 Web 输入排查：自定义元素升级前丢失的事件绑定不能靠界面反写值修复；宿主缓存绑定并在定义就绪后重放。执行真实键盘输入，并核对 HTTP 实际返回的运行时哈希；复制到数据库目录不代表可执行文件目录的资源已更新。生产方法的旧包对照 2/3 失败，修复后 3/3 通过。
- Done right：3820 项、89 项发布检查及双包/Web 构建通过，原生真机未验；详见[验证记录](docs/project/bili-plugin-interaction.md)。Seen 1× (2026-11-15)。未提交或发布。

## 范围与来源

记录songloft-org/songloft-player-lynx 的双线程、共享 JS 与四端宿主行为。流程见 [本地 AI 开发流程](docs/guides/ai-development.md)，公共宿主约束见父仓库。已有 AGENTS 和业务文档仍是权威规则，LESSONS 链接证据而不复制历史全文。

## 记录与升级

每条含规则、适用范围、完整 owner/repo#编号、失败/修复 commit SHA、实际验证和 Done right 示例；没有正确示例时写待补。Seen 只统计不同日期的独立事件，同一事故重复复盘不增加。三个日期后提出升级并标记规范位置，已有铁律/严重问题立即处理。与 [英文版](LESSONS.en.md) 同步，不虚构历史次数、修复结论或设备验收，敏感信息脱敏。

## 条目

### LIBRARY-ADD-001：添加电台成功后刷新曲库查询

- 范围：[songloft-org/songloft#578](https://github.com/songloft-org/songloft/issues/578)，添加电台页面和曲库的共享查询缓存，基线 `ed953c20dcee85a19e9810e682a69b951eda89c5`。
- 证据：Docker Chrome 保存 HLS 电台收到 201，返回曲库后仍显示已缓存的空列表。添加成功后使 `['library']` 查询失效，浏览器返回曲库即可看到新电台，能立即打开编辑页并切换至仅音频。实测播放器时钟推进到 1 秒，服务端返回 `audio/mpeg`。对照和结果在 `/tmp/songloft-578.jCp7cj/lynx-ui-result-v6.json` 和 `/tmp/songloft-578.jCp7cj/lynx-ui-result-final-v2.json`。
- Seen 1× (2026-11-18)。

### MARKDOWN-001：GFM 不会自动展开 GitHub emoji 短码

- 范围：Android 关于／升级页、客户端 Release 与后端 changelog 共用的 Markdown；基线 `1de4735` 加本批工作树。
- 证据：仓库 Release 标题使用 `:sparkles:`、`:bug:` 等短码，旧渲染器直接显示原文。旧代码的三个组件／页面回归失败；修复后 36 项定向、3811 项全量、89 项发布工具与双产物通过。Web 新旧包对照和 Android 34 原生界面已核对，见[记录](docs/project/release-emoji.md)。
- 规则与 Done right：在正文文本节点按名称表转 Unicode，不能对整个 Markdown 原文替换；保留代码、转义文本、自动链接与 URL，未知名称原样显示，字典查询只匹配自有属性。数据依赖同步许可证与 lockfile，避免顺带升级无关包。
- Seen 1× (2026-11-15)。状态：本地修复；Android 复用既有调试宿主测试新 bundle，完整原生重编译因 Gradle 下载未完成而取消，不冒充原生构建通过；报告原机未验，未提交或发布。

### BACKUP-001：备份兼容须覆盖导入文件和导出响应

- 范围：Web 数据管理，基线 `1de4735`；公共契约经验同时记于父仓库。
- 证据：旧共用校验只接受 v1，使服务端 v2 导入、导出及认证重试的三项新回归均失败。允许 v1 / v2 后 28 项定向通过；真实下载跨两个临时后端导入，标签 ID 1 → 2，歌曲与歌单引用正确，v1 兼容且 v3 不上传。详见[验证记录](docs/project/backup-v2.md)。
- 规则与 Done right：不能只放宽上传前校验；同时核对下载后校验，原样传输标签定义与引用，由服务端映射 ID。未知版本和错误结构仍拒绝，提示同步中英文。原生路径与其他浏览器未验。
- Seen 1× (2026-11-15)。状态：本地修复及浏览器验证完成，未提交或发布。

### RESUME-002：慢分页必须验证队列中间态

- 范围：歌单续播，基线 c10e790 + 本批工作树。
- 证据：千首歌单延迟第二批与同曲残缺队列恢复的两项新回归，在旧实现均失败；修复后实际浏览器先显示 100 首，未完成即可播放第 129 集，最终 1000 首。见[验证记录](docs/project/playlist-resume-queue.md)。
- 规则与 Done right：每批立即公布连续窗口，优先加载当前项附近及后续曲目；同曲复用也要核对完整队列。保留当前音频对象并映射前插索引，已加载的下一集不应等待前缀加载。测试停住后续请求检查可播放项。
- Seen 1× (2026-11-14)。状态：全量测试与 Web 验证通过，原生设备 Not run，提交推送按交付记录。

### RESUME-001：恢复位置必须参与音源准备事务

- 范围：歌单续播、Web/原生音源加载；基线 84a1f56 + 本批工作树。
- 证据：首次真实浏览器中保存位置为 754 秒，命令返回后 seek 的实现实际只播放到约 6 秒；修复后实际音频约 760 秒且服务端约 759 秒。见[验证记录](docs/project/playlist-resume.md)。
- 规则与 Done right：命令 Promise 不代表音频已准备；位置随 source-load 的 initialPositionMs 传递并等待 sourceReady。队列水合保留正在加载的 Song 对象，否则依赖对象身份的确认回调失配。Mock 必须保留命令和准备事件的时序差异，运行时验收核对实际媒体时间。
- Seen 1× (2026-11-14)。状态：本地实现与 Web 验证通过；原生设备 Not run，提交、推送按本批交付记录，未执行正式发布。

### FAVORITE-001：收藏失效订阅必须绑定服务器和账号

- 范围：应用级收藏长轮询、Query 缓存与原生通知红心，songloft-org/songloft#563。
- 规则：请求固定目标 URL，并在认证重试及缓存写入前验证会话；只有完整刷新成功后才推进游标。退出、后台及会话切换停止旧订阅，恢复必须重新对账。
- 证据与 Done right：控制旧响应在切换后到达，新集合仍为 `{99}`；刷新失败后不确认游标；真实 QuickJS 插件经后端增删，Docker Chrome 的同一已打开页面红心依次 Add→Remove→Add，无心形按钮点击或页面刷新。完整 3793 项和两目标构建通过，见 [记录](docs/project/issue-563.md)。
- Seen 1× (2026-11-11)。状态：新功能机制验证，提交前验证；交付状态见本批记录。

### UI-006：窄屏歌曲行应重新分配信息层级并保留触摸面积

- 范围：共享歌曲行与歌单上下文菜单，songloft-org/songloft#562；基线 `5e6fe23055eb6512fe185e2fcb9b3acaf9e73497`。
- 证据：390px 浏览器基线中，时长、收藏、更多和外层移除按钮将歌单标题压到约 104px；收藏/更多仅 26px。仅缩图标无法同时解决标题空间与触摸面积。
- 规则与 Done right：时长放到第二行、手机移除进入根菜单并保留确认，收藏/更多各保留 44px 点击区域；用测量、实际位移、成员状态和请求分别验证布局、滚动和动作。基线已能滚动，不把原机“不滚动”推定为缺少组件。旧代码三项新回归失败；最终对象与平台边界见 [记录](docs/project/issue-562.md)。
- Seen 1× (2026-11-09)。状态：本地优化，未提交、推送或发布；荣耀/鸿蒙原机待验。

### LYRIC-002：队列快照缺少歌词地址不代表服务端没有歌词

- 范围：歌曲恢复与歌词缓存，songloft-org/songloft#555；基线 `07eb9b25c851b19eadb005f8345f2493aab72b2b`。
- 规则：手动抓取给 store 补端点不等于更新持久队列；正常恢复不能在检查缓存前把旧快照的缺字段当成权威缺失。在线本地歌曲读取普通歌词端点，离线快照不补服务端地址。
- 证据与 Done right：旧实现两项回归失败；真实临时后端及浏览器两次加载分别覆盖数据库与持久缓存，普通请求一次、强制刮削零次，播放到 00:01 并高亮。对象、日志和边界见 [记录](docs/project/issue-555.md)。
- Seen 1× (2026-11-03)。状态：本地修复，未提交、推送或发布；报告人的实际快照未取得。

### SORT-002：自动滚动需核对宿主参数和分页后的活动回调

- 范围：歌单手动排序，songloft-org/songloft#551 评论 `6576318751`；基线 `8ed3c6484d6107a5f5fd0dc417b6d984578524fd`。
- 规则：排序组件须拥有真实滚动边界；原生 offset 不能直接当 Web 的 top。持有中的定时器要更新到分页后的条目回调，追加页时保留拖动浮层，卸载停止循环。
- 证据与 Done right：真实浏览器先暴露开关启用后仍不滚动，再暴露分页后落点受旧 key 数组限制；旧组件的源/发布代码控制器共 4 项失败、2 项原生参数项通过，新实现六项及页面回归通过。双产物、类型、3768 项全量与真实双向跨屏/分页/持久化通过，见 [记录](docs/project/issue-551-scroll.md)。
- Seen 1× (2026-11-02)。状态：本地修复；原生设备未验，未提交、推送或发布。

### SORT-001：单首拖动不能取第一个位移条目

- 范围：歌单手动排序，songloft-org/songloft#550；基线 `a90cded03be18426de61c6df436d08a29e7a3077`。
- 规则：排序组件只返回完整新顺序时，跨行拖动会同时推移中间条目。应按最大位移识别被拖动项，或验证推导出的单次移动能完整重建新顺序；不能只查第一个位置变化。
- 证据与 Done right：旧回调将 `[1,2,3] → [2,3,1]` 误发成移动 2 到首位，新增实际页面回调回归失败；修复后向上/向下跨行回归、3761 项全量、双产物与类型通过，真实浏览器双内置歌单跨三行拖动的后端顺序符合操作。记录与平台边界见 [#550](docs/project/issue-550.md)。
- Seen 1× (2026-11-02)。状态：本地未提交工作树，原生手势仍需设备验收。

### WEB-004：组件的布尔 false 不证明 Web DOM 收到了关闭开关

- 范围：虚拟列表 footer、Web 引擎属性传递与滚动高度，songloft-org/songloft#540；基线 `07599c329f3b52247d48538bfbc7537fd8584148`。
- 证据：2026-11-02，录屏拆帧发现曲库反复出现大片留白；本地真实 Web DOM 丢失 `recyclable={false}`，footer 仍为 `content-visibility: auto`，40 首歌曲的滚动范围从 3228px 降到 2682px。JSX 有 false 和此前稳定 footer 的组件回归并未保证浏览器布局稳定。
- 规则：核对实际 DOM、computed style 与滚动范围；辅助行也必须有符合真实尺寸的占位策略。不要把原生元素的布尔关闭语义直接当成 Web 引擎已支持，也不以关闭全部歌曲虚拟化代替修复。
- Done right：宿主仅保持 `__footer__` 实际布局；三个部署路径的新样式回归在旧实现下失败，修复后通过；真实 WebKit 继续核对行 auto、footer visible 和容器稳定。玻璃观察根的重复发现另按结构变更失效，等量浏览器对照及验证对象见 [#540](docs/project/issue-540.md)。
- Seen 1× (2026-11-02)。状态：本地修复经验；原机版本未知，iOS Safari 流畅度仍需真机验收。

### LIST-004：全选的操作对象不能限于可见分页

- 范围：曲库全选、批量删除、添加到歌单与设备缓存，songloft-org/songloft#549；基线 `ea55033d73456d9268d8e31069ced1e144511dce`。
- 证据：旧曲库只有添加到歌单，没有全选/删除入口；首批三个新回归均因缺少入口失败。原缓存按钮只从已加载 `songs` 取选中项，新增完整 ID 全选后若继续复用，会漏掉离屏选择。
- 规则与修复：通过相同筛选下的完整 ID 定义选择，后续所有动作消费该集合；需要歌曲对象的设备缓存额外分页解析元数据。切换范围、退出及卸载须拒绝旧响应；删除成功回调不能清掉后来的选择。文件删除继续显式选择、默认保留。
- Done right：真实临时后端中，仅加载 40 首仍选中并删除全部 45 首网络歌曲，失败/取消保留选择；本地两条路径验证文件保留/移除，未选择电台仍在。单测覆盖离屏缓存、筛选和异步生命周期，最终 72 项及 Chrome/WebKit 证据见 [#549](docs/project/issue-549.md)。
- Not run：报告人 iPhone、原生设备缓存及各宿主构建；浏览器结果不外推为真机验收。
- Seen 1× (2026-11-01)。状态：经验；本批未提交、推送或发布。

### WEB-003：玻璃背景采样必须保留浏览器的行虚拟化

- 范围：WebKit/Firefox 底栏背景镜像及曲库滚动，songloft-org/songloft#540；基线 `196adc500da5b700bfbf61ab99ffc4b2918922c4`。
- 证据：2026-10-30，报告人确认回顶已修复，但 Safari 滑动仍卡顿。玻璃采样逐项测量离屏行；同样加载到 180 首的 WebKit 诊断中，监听跳过状态后行测量从 14,385 次降到 2,182 次。首次 `checkVisibility` 方案没有证明减少该版本的开销，未保留。
- 规则与 Done right：捕获 `contentvisibilityautostatechange` 保存跳过状态，采样前排除这些子树，恢复可见时重新采样；事件不冒泡、不穿透 shadow root，须逐源根订阅并在销毁时解绑。旧实现的跳过/恢复及 shadow-root 回归失败；最终测试、等量对照、失败日志和设备边界见 [#540](docs/project/issue-540.md)。
- Seen 1× (2026-10-30)。状态：经验；本机浏览器证据不替代 iOS 18.6 真机流畅度验收。

### UI-007：Chromium 的稳定占位不证明 WebKit 滚动容器稳定

- 范围：曲库、分类歌曲页与 Web 虚拟列表，songloft-org/songloft#540；基线 `645717f254481baffd13a21da1ff5ba0191d29d4`。
- 证据：2026-10-29，补 64px 估算和稳定 footer 后 Chromium 通过，但 WebKit 18.4 在追加到 41 行时仍将 scrollHeight 压到 626px、偏移从 260 回到 0。默认 `content-visibility: auto` 在容器层跳过布局；只保持滚动容器布局后连续分页不再回顶。
- 规则与 Done right：按实际浏览器检查容器及行的几何，保持容器布局，行仍可虚拟化。公开 `injectStyleRules` 也有升级时被类字段清除的问题，须先升级、设置钩子，再启动 url。回归模拟该升级时序，WebKit 最终偏移单调到 3120、歌曲 49 可见，容器 visible、行 auto。曲库及分类入口另补行型估算与稳定 footer。完整证据、早期环境失败和原机边界见 [#540](docs/project/issue-540.md)。
- Seen 1× (2026-10-29)。状态：WebKit 已复现及验证；iOS 18.6 真机待复验，未提交或发布。

### WEB-002：文件选择的用户手势必须在主线程实际控件上取得

- 范围：浏览器上传及 Worker RPC，songloft-org/songloft#545；基线 `645717f254481baffd13a21da1ff5ba0191d29d4`。
- 证据：2026-10-29，报告人补充 Safari 后，核对发现此前原生 delegate 修复不覆盖 Web。Docker Chrome 真实 Worker 夹具在无激活时复现隐藏 input 点击后一直 loading；新可见控件经真实点击、取消重试与 multipart/Cookie 实收验证通过。
- 规则与 Done right：不能把原生选择器和浏览器路径视为同一修复；Worker 回调不能可靠携带文件选择手势。提供主线程可见控件与取消入口，超时从实际上传开始，完成仅结算一次。回归、构建和真机边界见 [#545](docs/project/issue-545.md)。
- 同次完整页面验收又发现客户端传 `plugin`、后端要求 `file` 的 multipart 契约不匹配，真实请求返回 400；纯上传宿主夹具只证明字节送达，必须继续验收后端安装和刷新后的列表。修复共享调用点并增加页面回归，不增加 Seen。
- Seen 1× (2026-10-29)。状态：经验；Safari 18.6 真机仍待复验。

### WEB-001：插件自身的 URL token 不能替代反向代理 Cookie

- 范围：Web 插件 iframe、NAS 网关，songloft-org/songloft#543；基线 `e1572551b9b6fb584e6a2325ef62e9db103e1283`。
- 证据：2026-10-27，旧宿主无条件设置 iframe `credentialless`；Docker Chrome 的 HttpOnly Cookie 网关夹具在根路径、子路径、隔离跨源三种配置中均因 Cookie 缺失返回 403。新三项回归在旧实现下失败，原有 22 项通过。
- 规则：URL token 只证明后端认证，不证明外层 NAS 网关放行。iframe 的匿名凭证上下文与 COEP 响应头语义不同；没有实际依赖就不要隔离凭证，验证必须检查网关实收 Cookie 和子资源请求。
- Done right：移除 iframe 属性，保留后端 COEP 头；350 文件 / 3714 项、类型、双产物、Web 与 89 项发布工具检查通过，浏览器夹具恢复 Cookie。实际界面、源码指纹及未跑平台见 [#543](docs/project/issue-543.md)。
- Seen 1× (2026-10-27)。状态：经验；报告人的真实飞牛环境仍待复验。

### LIST-003：分页行复用必须保留最新操作，性能探针不能遍历全部行取坐标

- 范围：Web 歌单分页和鼠标滚动，songloft-org/songloft#542；基线 `81c478c14d67de8a9a9dbbfcc9ab0857e4ee405a`。
- 证据：2026-10-27，旧实现每次滚动回调更新重构 80 行，分页也重复更新旧行；loading 替换 inset 导致末尾上下变化 32px。隔离旧实现时相应回归失败，鼠标滚动亦确认缺失于 Flutter→Lynx Web 迁移。
- Done right：缓存行树、memo 歌曲行，稳定回调通过 ref 读取最新页；回归同时断言旧行未重绘与旧行点击播放新加载的完整歌曲集合。loading 保留同一 inset。实际浏览器与平台边界见 [#542](docs/project/issue-542.md)。分页耗时在追加完成时截止，不能包含随后遍历全部行坐标的强制布局成本；并发测试下的耗时不作性能结论。
- 第二次独立事件：2026-10-30，`196adc5` 的曲库和分类页仍使用新数组、内联回调，使分页状态变化重复更新旧行。稳定 props 与 memo 的回归同时验证旧行复用、单行选择只更新目标及旧行读取最新队列/分类上下文。提高预取距离时还发现 Web 的单行阈值可被跳跃滚动越过，须同时观察实际末端；见 [#540](docs/project/issue-540.md)。
- Seen 2× (2026-10-27, 2026-10-30)。状态：经验；报告人的 Chromium 150、iOS 18.6 和真实曲库待复验。

### LIST-002：滚动条应保留待定目标，原生调用成功也要等可见行确认

- 范围：歌单分页、拖动滑块与 Lynx 原生/Web 列表，songloft-org/songloft#540。
- 证据：2026-10-25，基线 `eb396153c0a05ddd8a2ba940da87211d1a1cd36e` 的滑块只取初始为 0 的可见序号，分页等待期间即回到顶部；原生定位一调用就清除目标。新增两处回归在旧实现按预期失败，原生夹具明确模拟「调用成功、列表尚未布局」。
- Done right：等待期间滑块跟随请求位置；原生和 Web 都由可见行结束定位，重试有界、离页清理、旧请求拒绝执行。修复后 3 项定位回归通过，实际界面、最终工作树和未验证项见 [#540 记录](docs/project/issue-540.md)。
- Seen 1× (2026-10-25)。状态：经验；受控原生夹具不替代各原生平台的设备验收。

### WIDGET-001：桌面动作通道不能依赖音频首次加载

- 范围：2026-10-21 功能移植，基线 `1ef324864b88c679a7b0378eff24cfef3de4f167` 的未提交工作树；无关联 Issue。
- 规则：小组件动作绑定当前 LynxView，并在 JS 注册监听、消费冷启动动作后标记就绪；不能借用延迟初始化的音频事件 sink。销毁只解绑自己的页面，冷启动动作消费一次。
- 失败证据：`5b3e9f9…e70b8` APK 恢复暂停队列但尚未加载音频时，桌面首次播放只打开应用，动作丢失；实际失败截图及结果在 `/home/hanxi/work/songloft-review/lynx-current-device-20261021/before-fix-*`。
- Done right：`WidgetActionDelivery` 的 4 项 JUnit 覆盖页面就绪、冷启动、销毁及替换；独立通道接线检查在旧实现下失败。`86b5c0c8…0c093e` APK 的 9 项实际检查通过，包括原生进度、进程重启后切歌和无封面首快照清理。后续共享视频页修正的新包以本批记录为准。
- Seen 1× (2026-10-21)。状态：经验；模拟器开启减少透明度，真机和其他平台设备未验。

### VIDEO-001：关闭视频表面时也要退出对应控制页面

- 范围：同日功能移植 MV 结束自动切歌；无关联 Issue。
- 规则：视频页跟随打开时的歌曲引用；切到音频或另一首 MV 后退出控制页，不能将宿主 `close()` 当作必然收到 `closed` 导航事件。普通进度更新不退出。
- 失败证据：Android 实际 MV 播完后画面已关闭，页面仍留下音频歌词；`mv-auto-advance-before-fix.png` 保存在同批审核目录。两个已挂载组件回归在旧实现下均因未导航失败。
- Done right：`FullVideoPage` 在歌曲引用变化时只请求一次父路由导航，卸载沿用视频、计时器和浏览器全屏清理；测试覆盖 MV→音频与 MV→MV，实际设备结果见 [本批记录](docs/project/feature-port-20261021.md)。
- Seen 1× (2026-10-21)。状态：经验；不将页面单测视为宿主设备验收。

### BUILD-001：分别探测 Xcode 安装、选中路径和运行设备

- 范围：2026-10-21 功能移植追加原生验证，基线 `1ef324864b88c679a7b0378eff24cfef3de4f167` 的未提交工作树；无关联 Issue。
- 规则：本机为 Linux、SSH 首次超时或 `xcode-select` 指向 Command Line Tools，均不能证明已配置的远程 Mac 没有 Xcode。分别核对连接、Xcode.app、SDK、模拟器运行时及设备；只为构建命令设置 `DEVELOPER_DIR`，不必修改全局选择。不要输出 SSH 配置中的凭据。
- 证据与 Done right：重试现有 `mac` 别名后找到 Xcode 27.1，命令局部指定路径，完成 `xcodebuild -list` 和 WidgetKit 扩展编译；运行时和设备列表为空，因此仍保留设备截图与签名验收缺口。日志及兼容条件见 [移植记录](docs/project/feature-port-20261021.md)。
- Seen 1×（2026-10-21）。状态：经验条目，未达三日期升级门槛。

### TEST-002：进度验收要等待真实宿主回报

- 范围：Android 播放器与桌面小组件验收，基线 `1ef324864b88c679a7b0378eff24cfef3de4f167` 的未提交功能移植工作树；无关联 Issue。
- 规则：短于宿主回报间隔的任意等待不能证明播放停滞；有界等待同一歌曲的实际进度增加，再验证暂停后位置稳定。不要以 `isPlaying=true` 或图标变化代替进度。
- 证据：2026-10-21，同一安装包 `d8dc8b7c…a9807d` 的 300ms 采样曾误报未增长；等待真实回报后位置从 44312 增至 44815ms，桌面暂停后保持 45314ms。详见 [移植验收](docs/project/feature-port-20261021.md) 和证据目录 `widget-final-result.json`。
- Done right：最多等待 5 秒，要求歌曲 ID 不变且位置增加；暂停另取两次稳定读数，独立核对已安装 APK 校验值。原生实际进度、截图和服务端副作用分别取证。
- Seen 1×（2026-10-21）。状态：经验，未达到三日期升级阈值。

### AUDIO-001：直播重连保留播放意图，系统暂停须明确传递

- 范围：songloft-org/songloft#531，四端音频宿主与共享 player store；基线 `f3f78b3aae6e74323b963a9e8c940bf74b3613b5`。
- 证据：直播 completed 进入切歌逻辑，error 耗尽三次重试后也切歌；新回归对隔离旧 store 的播放模式、长重试和取消路径失败。宿主 paused 同时可表示缓冲，已暂停的播放器再次接收系统暂停还可能没有状态事件。实际 Android STOP 媒体键又发现普通 player stop 绕过通知栏自定义退出，必须逐一验证不同系统控制入口。
- 规则与 Done right：直播按当前台无限、有上限间隔地重连，不消费队列和歌曲计数；四端明确发送用户 play/pause 命令，暂停/停止同时取消定时器和在途加载。实际结果、源码指纹、最终提交与平台边界见 [验证记录](docs/project/issue-531.md)。
- Seen 1× (2026-10-20)。状态：经验；CI/开发包以最终同 SHA 交付为准。
- 同一事故发布补审：原生事件新增后还须更新 `updates/native-contract.json` 的必需能力；只提示安装新壳，自动更新仍可能把 JS 装进缺少事件的旧壳。`audio.remoteIntent.v1` 的签名清单与不可变快照门控回归见同一记录；不增加 Seen。

### SDK-001：SDK 对齐必须覆盖分发、模型转换和双向传输

- 渲染对照：相同 APK 换 Mesa 后 19 项功能通过仍不代表图标持续正常；新镜像未安装客户端就段错误、另一路被 OOM 杀死，证明环境有独立失败，但不能据此直接归因所有缺字。异步播放用有界等待真实状态，保留原断言和首次失败证据；多项诊断干预不能包装成单变量根因证明。见 `/tmp/songloft-sdk-e2e/rendering-validation.json`。

- 同日图标补修：实际 APK 的 `servalsvg:0.1.1` 缺 x86_64 库，不能只检查 Gradle 已声明依赖；升级 0.2.4 后核对四 ABI 库、实际加载日志和截图，原生图标恢复、19 项再通过。插件文字图标在刷新后正常、静置后再次缺失，不能只选择正常帧宣称通过；默认效果仍退出 139，不能因 SVG 修复就解除环境限制。见 `/tmp/songloft-sdk-e2e/svg/validation.json`。

- 范围：Lynx 的 HTML / frame 客户端 SDK；无关联 Issue，基线 `e41987c5b6f3f4a0315e0e54914207c45868a458`。
- 证据：2026-10-20，对照 Flutter 与 `@songloft/client-sdk`，旧分发器缺少队列编辑、按歌单播放、收藏和 Cookie；页面把 HTTP snake_case JSON 强转 Song，原生 WebView 丢弃分发结果，状态省略封面等字段。隔离旧分发器和播放器后，新增 7 项实际 store 回归全部按预期失败；公共 `common.js` 的三端旧传输反向回归见父仓库。
- 规则与修复：两种渲染方式共用 typed API、分发器和完整序列化；队列插入/重排同时映射当前条目与导航历史，不能通过查找歌曲 ID 处理重复项。回执保留请求 ID，组件卸载/URL 切换后不回发；状态推送包含等长重排、音量和实际时长，过滤单纯进度 tick。
- 同日审核：新回归证实 `bindload` 是加载完成，不能在此取消启动请求；原生回执执行失败须收敛 Promise 拒绝。HarmonyOS Cookie 字典用 Map 保留 `__proto__` 等数据键，真实方法的受控 store 回归在旧实现丢键。补修 575 项相关测试通过，设备/HAP 验收仍未执行；见 SDK 记录。
- 后续补验：审核后 3611 项全量通过；Android 34 模拟器开启“减少透明度”后，官方插件 19 项原生断言通过，含真实 HttpOnly Cookie 和加载回执。默认效果曾使模拟器退出，部分控制符号仍未绘制，必须保留环境条件与视觉缺口，不能将功能通过泛化为原生全面验收。见 `/tmp/songloft-sdk-e2e/native-validation.json`。
- Done right：未提交工作树下 TypeScript、3610 项完整 Vitest、Lynx/Web 双产物、Web 部署、87 项发布检查及 Android `assembleDebug` 通过；接口与本批浏览器验证边界见 [客户端 SDK](docs/reference/plugin-client-sdk.md)。`favorite.refresh` 先取消旧 GET，再更新缓存；缺少完整缓存时重载，不能把一首收藏通知当全量集合。
- Not run：iOS/HarmonyOS 宿主编译及三端真实 Cookie store / 原生设备验收；Android 编译不代表设备行为。
- Seen 1× (2026-10-20)。状态：经验；尚未提交、推送或发布。

### LYRIC-002：文字可读不能代替封面变化的视觉验收

- 范围：Lynx 播放器遮罩与歌词前景，songloft-org/songloft#523 的 2026-10-17 反馈。
- 证据：基线 `364607b0cb7a0ed07378e59b27ff6827549fde3e` 的对比度回归通过，但报告人确认普通模式仍色彩太淡。新增渐变两端色差回归在旧实现的浅/深模式均失败；旧遮罩下端仅保留 6%/10% 封面。
- Done right：独立约束封面色差，减少遮罩并重新验收黑白极值和所有内置配色的 7:1 / 4.5:1 文字目标；实际浏览器切歌、回退和辅助功能恢复另行验证。完整对象及平台边界见 [记录](docs/project/issue-523.md#2026-10-17--加深封面背景)。
- Seen 1× (2026-10-17)。状态：经验；当前为未提交工作树。

### WEB-002：桌面手机尺寸不能替代 Android Chrome 的 IME 与浏览器栏验证

- 范围：Web `Input` / `TextArea`、异步受控值回写和 fixed 导航；无关联 Issue。
- 证据：2026-10-16，基线 `209f6c88b071c187064194a2ae197e48c23fa6c3` 在 Android 34 / Chrome 113 / Gboard 模拟器中，单字输入触发约 9.5ms 只读脉冲，DOM 焦点仍在，系统键盘却收起；912px 的根高于 856px 实际视口，胶囊超出 48px。此前 390px 桌面截图未覆盖这两种系统行为。
- 规则：分别验证系统 IME 状态、真实连续/组合输入和浏览器 chrome 下的几何。只取消只读锁仍会因旧回写覆盖新输入而丢字；第一版实际丢失 `l`，新增四项异步回写测试后全部反向失败。输入确认值按顺序消费，重复值不能提前确认后续事件。
- Done right：Web 不临时设为只读，跳过浏览器已应用的 value 回写；保留原生锁。宿主使用动态视口和 Android `resizes-content`。源码/发行控制器 36 项回归、全量 3580 项、类型、双 bundle 和 87 项发布检查通过。设备最终结果见 [记录](docs/project/web-android-input-viewport.md)；证据 `/home/hanxi/work/songloft-review/android-web-input-20261016/`。
- 后续：动态视口也会把 fixed 胶囊顶到 IME 上方；上批把这个副作用误列为通过。新增验收必须检查输入时隐藏、无命中区、收键盘后恢复和播放不中断，不能只断言底栏在缩小视口内。HTTP 键盘检测没有通用精确 API，焦点/高度回退的边界与实际模拟器证据见同一记录；ADB 输入会重开 IME，不冒充真实外接键盘。
- Seen 1× (2026-10-16)。状态：经验；不把单版本模拟器扩大为 Android 真机、最新 Chrome 或 Safari 验收。

### WEB-001：HTML 打包改动必须经过实际归档验证器

- 范围：嵌入 Web HTML、`copy-bundle-web.mjs` 与 `verify-package.py`。
- 证据：2026-10-16，`6edca8561eeaa375c82c725c2cfd097f0ef3f996` 的本地 JS/打包测试与真实浏览器通过，但 CI `38883061236` 的 Web embedded 因新增 `<base href="/">` 被正则当作空资源路径而失败。此前只跑了通用 verifier 夹具，没有把新 copy 输出接入归档验证器。
- Done right：验证器用 HTMLParser 区分 base 与资源，分别校验 embedded/standalone 的 base；新回归对真实 copy 输出归档并调用验证器，同时删除真实资源确保仍会拒绝缺文件。隔离旧 verifier 时新回归失败，修复后 85 项发布检查和 CI 同款真实归档命令通过。证据 `/home/hanxi/work/songloft-review/lynx-default-20261016/logs/{lynx-ci-web-job,archive-verifier-negative,lynx-release-tests-archive-fix}.log`。
- Seen 1× (2026-10-16)。状态：经验；修复提交与后续 CI 以本次交付为准，取消的旧构建不算通过。

### LYRIC-001：封面背景被辅助功能停用时应明确说明

- 范围：Lynx 播放器与外观设置，songloft-org/songloft#523 的 2026-10-16 反馈。
- 证据：基线 `1ad0eaf1cba340d644660f64198fed6b8b6d6d6d` 的实际 Web 构建在增强对比度或降低透明度时卸载封面、显示纯色；旧说明只谈文字/分隔线或实心表面，未说明播放器封面背景会消失。反馈截图与该路径一致，但设备开关未确认。
- Done right：在实际设置 UI 分别关闭两项并确认封面恢复，补齐中英文副作用说明；保留无障碍策略，不把截图匹配当设备根因证明。对照截图与命令见 [#523 后续记录](docs/project/issue-523.md)。
- Seen 1× (2026-10-16)。状态：经验；验证时文案尚未提交，最终验证对象见任务记录。

### LIST-001：虚拟列表委托测试不能替代大队列运行时验收

- 范围：播放队列、共享 `VirtualList` 和 Web / 原生运行时，songloft-org/songloft#525。
- 证据：2026-10-15，基线 `e924f05a334254b6eb754927b2808f87a7943302` 的 80 项相关测试通过，其中 500 首测试 mock 了列表，只验证组件委托。真实 30,000 首队列在 Web 点击后页面查询超时，在 Android 34 / ARM64 转译模拟器中也达到原生测试桥 15 秒期限；媒体会话继续播放同一歌曲。
- 规则：组件名、原生布局虚拟化及 mock 的结构断言不能证明背景线程只处理可见条目。按实际规模分别验证 JS 条目构建、布局、测量、交互响应和媒体进度；100 / 500 首通过不能外推至 3 万首。
- Done right：按视口有界创建行，并在大字体下保持行高和偏移一致；保存播放进度只更新小键，大队列变化分批编码。最终 3,543 项测试、Web 四组和 Android 3 万首实际打开/队尾/删除/切歌通过，自动保存期间 20 次 UI 查询最大响应 35ms。完整对象、基线失败、最终证据及 Not run 见 [#525 记录](docs/project/issue-525.md)。
- Seen 1× (2026-10-15)。状态：经验；修复位于未提交工作树，同一事故不递增。真机与其他原生平台仍未验收。

### RELEASE-001：确认提示走 stderr，取消必须返回失败

- 范围：`scripts/bump-version.mjs` 及父仓库一键发布的命令替换调用。
- 规则：stdout 留给成功版本结果；计划与确认提示实时写 stderr。空回车、拒绝与 EOF 均取消并返回非零，避免编排继续执行；交互读取须能在 EOF 正常结束。
- 证据：2026-10-15，基线 `0de993ff272ee29df96c8401b46df56256646438` 在父脚本捕获 stdout 时隐藏提示，回车退出 0；新增 5 项相关回归在旧实现全失败，修复后通过。完整记录及 Not run 见 [本批进展](docs/project/progress.md#2026-10-15--发布确认交互)。
- Done right：发布工具 81 项通过；PTY 实际命令替换在输入前显示版本与提示，回车退出 1 且无写入，yes 只创建预期本地提交/tag，夹具远程保持不变。证据 `/tmp/songloft-release-terminal-result.json`。
- Seen 1× (2026-10-15)。状态：经验；本次未提交、推送或正式发布。

### UI-003：颜色 getter 正确不代表常驻 SVG 已更新

- 范围：内置配色、服务器主题包与常驻导航，songloft-org/songloft#523。
- 规则：ThemeProvider 更新继承的 CSS 变量，不会自动重渲染相同 children；原生 SVG 的具体颜色必须由其常驻拥有者显式订阅。测试读取已渲染 SVG 内容，并在真实截图中核对图标、文字和选中背景，而不是只调用颜色 getter。
- 证据：2026-10-15，基线 `4d73b793890494301d44b1a19e9df4dd178429e3` 的本批初版截图中，玫瑰色文字/背景已更新而底栏齿轮仍是蓝色，getter 断言却通过。旧 ShellLayout 的隔离渲染回归在 `#984061` 断言失败；补齐配色/主题包订阅后 13 项导航回归与最终 3531 项全量通过。修复源码指纹与保留截图见 [本批记录](docs/project/issue-523.md)。
- Done right：ShellLayout 订阅 `subscribeBuiltInPalette` / `subscribeActiveThemePack`，同一已挂载图标经过蓝色→玫瑰→主题包→恢复玫瑰，实际内容同步；浏览器逐一断言六种配色的当前 SVG 与根强调色一致。
- Seen 1× (2026-10-15)。状态：经验；未达到三日期升级阈值。

### UI-002：滑块松手和边界测量要属于同一手势

- 范围：lynx-ui 3.135.4 共享滑块和旧原生壳能力，songloft-org/songloft#520。
- 规则：不能只在已开始更新值时处理松手；边界测量未完成也要记录结束，并在同一手势的最后位置得到结果后提交。新手势/卸载拒绝旧回调；轨道和内部填充条分别测量。
- 证据：2026-10-14，基线 `992eb4930bc686f7160a1ca0bfbab42368dad284` 的库在 `getRectByRef` 返回前松手时丢失 commit，迟到回调仍能开始拖动；真实控制器夹具中旧库 3 项失败、补丁后 4 项通过。API 34 实际测量缓存填充条宽度为 0，显示值和刻度不能证明填充条或触摸过程正确。证据 `/tmp/songloft-520-slider-{negative,final}-test.log` 与 [#520 记录](docs/project/issue-520.md)。
- Done right：锁定 source/dist 补丁，覆盖短点按、末次移动、跨手势测量和卸载；内部填充明确宽度并居中。旧 Android `exitApp` 只移后台，JS 新入口同时消费宿主 `androidExitAppStopsPlayback` 能力，旧壳不显示误导入口，不能只看方法名存在。
- 坐标证据：API 34 中点触摸 x=196.36，但公共边界 helper 传 relativeTo:'' 得到 left=0，比例误为 0.597。原生查询改为 null，与 LynxView 触摸坐标一致；Web clientX 对应 screen。最终控制器 8 项通过，旧库 7 项失败。本机/服务端两端及中间档位实际保存正确，见 `/tmp/songloft-520-coordinate-{tests,negative}-final.log`、`/tmp/songloft-520-lynx-{device,server}-final.json`。
- 控件补充：ProgressBar 还通过渲染前 dragging 闭包丢弃首个值，与已填入初值的缓存/字号滑块不同。2 项控件回归旧实现失败、修复后通过；API 34 点按 25%/50%/75% 实际跳到对应 30/60/90 秒并继续播放。这是同一事故的补充验收，不增加 Seen。
- Not run：鸿蒙 4.2 实机；普通 Android 未复现全部鸿蒙触摸症状，不把确定性公共回归视为那台设备已通过。
- Seen 1× (2026-10-14)。状态：经验；原生/持久化最终证据见本批记录。

### TEST-001：读取发布产物的测试必须在构建完成后执行

- 范围：Lynx/Web 构建与发布产物闸门。
- 规则：构建会清理 `dist/`；依赖 `dist/main.lynx.bundle` 的测试不能与构建并发。先完成双产物构建和 Web 打包，再运行完整测试。
- 失败：2026-10-14，songloft-org/songloft#520，基线 `a69a45f4c3048171ddbc1f0f33c9922fa3af74d8` 的未提交工作树中并发运行构建与测试，`release-build.test.ts` 报 `ENOENT`；日志 `/tmp/songloft-520-lynx-tests.log`。这是验证编排问题，不能计为源码回归或跳过闸门。
- Done right：构建完成后顺序执行，`/tmp/songloft-520-lynx-tests-final.log` 的 3494 项通过；随后增加歌词可见性用例的最终验证记录见 [#520](docs/project/issue-520.md)。
- Seen 1× (2026-10-14)。状态：经验。

### TEST-002：隔离回归要保留 pnpm 依赖目录结构

- 范围：从已打包的源码快照运行 Lynx 共享测试。
- 证据：2026-11-19，以 `debad6e80` 为基线的 2.13.24 打包快照中，隔离目录的依赖符号链接指向原工作树，Vitest 的 374 个套件都在加载 ReactLynx setup 时失败。保留 pnpm 的本地目录结构并为依赖文件建立硬链接后，Android manifest 与认证拦截的 19 项先导测试通过。
- 做法：隔离依赖目录和构建产物，使 Vite 仍从测试根解析 setup。先构建 Lynx 与 Web，再按打包源码摘要记录测试结果。[验证记录](docs/project/desktop-implementation.md#21324-三架构同源开发包)
- Seen 1× (2026-11-19)。状态：经验。

### UI-001：滚动提示要核对实际可见歌曲和各宿主的回调形态

- 范围：虚拟列表定位、首字母和序号提示（songloft-org/songloft#518）。
- 规则：气泡出现不等于定位成功；用实际列表位置或可见行确认歌名和序号。原生 `attachedCells` 使用列表相对坐标；Web `getVisibleCells` 的数组缓存可能滞后，改用实际行坐标二分查询。Web 离屏项须提供贴近真实行高的占位估算，滚动偏移除以行高仅能暂作兜底。一次行坐标查询在途时合并最新待查位置，结束后补读，避免积压和漏掉最后一次滚动；拒绝过时回调。void `scrollToPosition` 成功不证明界面已接纳新行，必须用目标可见确认，有限重试。
- 失败证据：2026-10-14，本批未提交初版在浏览器中列表已滚至第 14 首，气泡仍为第 1 首；`/tmp/songloft-518-ui/lynx-full-drag.png`、`lynx-debug.json` 及已安装 web-elements 实现确认回调形态差异。
- 修复证据：当前未提交工作树的可见行归一化、实际滚动事件兜底、void 调用收尾、64px 歌曲占位估算和分页定位；本条所属提交以 Git 记录为准。相关单测验证原生对象、Web 数组坐标、不可变查询链、交错异步回调和无后续滚动事件的稳定位置；最终浏览器两次请求续拉到 offset=100，滚动偏移 6592 时均确认第 104 首「夜空中最亮的星」位于列表顶端、提示 `Y` 与 `104 / 130`，见 `/tmp/songloft-518-ui/lynx-final-{result,repeat}.json`；验证对象见本批 [记录](docs/project/issue-518.md)。
- Done right：气泡、列表可见行、真实分页请求和刷新后的偏好分别验证；长时间按住滚动条时保持气泡，并在显示期间确认最后一次滚动后才稳定的虚拟行。视口未移动时，新查询尚未返回不应废弃旧查询的有效响应；只拒绝已应用更新响应之前的结果。浏览器断言分别记录按住和松手后的提示，离开页面取消旧定位和查询定时器。
- Seen **1×**：2026-10-14。状态：经验；原生设备仍待验收，不将 Web 验证当成原生结果。

### API-001：升级动作必须验证请求体与服务端通道契约

- 范围：Lynx 后端升级检查、启动请求与页面测试。
- 规则：不能把返回 200 的空写入 mock 当作升级动作证据；同时验证当前通道、对应版本说明和实际 POST JSON。在线升级只允许当前 stable/dev 通道，非 Docker 不提供动作。
- 失败证据：[songloft-org/songloft-player-lynx#11](https://github.com/songloft-org/songloft-player-lynx/issues/11) 截图及基线 [`0651222`](https://github.com/songloft-org/songloft-player-lynx/commit/0651222b87b5a97daebef7e48c5d497c32a7e71a)：页面发 `{}`，后端因缺少 `version_type` 拒绝；旧 mock 未检查请求体。
- 修复证据：源码工作树 `faec7a428a9675dc1d3e5c98191d963555b8616c409e93658daae6f651e8389b`；隔离旧页面的 5 项回归失败，最终相关 36 项通过，浏览器记录正确 dev/stable 请求和拒绝重试。详情见 [progress](docs/project/progress.md)；真实服务端二进制替换及 Android 设备未验，修复提交以包含本条的 Git 记录为准。
- Done right：`SettingsApi.startUpgrade(channel)` 发 `{version_type: channel}`；关于页使用真实 API 类、传输测试读取 JSON，浏览器夹具拒绝错误通道并记录请求，而不是只确认按钮存在。
- Seen **1×**：2026-10-14。现有 API 契约继续执行，未达到三日期升级阈值。

### UI-004：scroll-view 必须有显式高度，flex 不能替代

- 范围：Lynx/Web 滚动容器与底部面板，songloft-org/songloft#536。
- 规则：`<scroll-view>` 只设 `flex: 1` 时不会自动获得受限视口高度，内容可能撑开而不产生滚动。占满剩余空间的滚动页显式写 `height: 100%`；absolute 底部面板要让面板自身有明确 `height: %`（不要用 `max-height` 期待收缩），内部滚动体才可用 `flex: 1`。内容可能超出短视口的页面必须按横屏/键盘弹出后的高度验证滚动。
- 失败证据：`LoginPage.css` 的 `.login__scroll` 原先只有 `flex: 1`，短视口下登录按钮不可达；新增 `login-css` 闸门要求该规则含 `height: 100%`，旧 CSS 不满足。
- Done right：Docker 无头 Chrome 390×420 实测 `.login__scroll` 为 scrollHeight 426 / clientHeight 356，滚到底后按钮完整可见（`/home/hanxi/songloft-ui-verify/login-390x420-{top,bottom}.png`）；新增歌曲面板固定 `height: 72%`，1280×800 下列表可滚动。
- Not run：iOS/Android/HarmonyOS 真机；Web 结果不代表原生手势与软键盘行为。
- Seen 1× (2026-10-23)。状态：经验，未达到三日期升级阈值。

### AUDIO-002：应用音量要自己持久化，系统音量语义按平台区分

- 范围：四端音量恢复、iOS AVPlayer 倍率与 Web 宿主，songloft-org/songloft#536。
- 规则：store 的 0–100 音量是应用级设置，写入 prefs `player_volume`（与偏好同步共用键），启动时先 `restoreVolume` 再恢复播放，避免自动续播按宿主默认音量出声。Android 的音量归系统媒体流，不能覆盖用户保存值，登录后的远程应用音量也不能在启动时回放到系统媒体流；iOS 记录应用级倍率并在每次创建播放器后重新赋值，不能读取/监听 `AVAudioSession.outputVolume`（那是系统音量，与应用滑杆无关，还会把滑杆弹回）。宿主 `volumeChanged` 在恢复完成前不得覆盖本地偏好。
- 证据：iOS 旧实现读系统音量且换播放器后丢倍率，Web `getVolume` 为空实现；新增 `volume-persistence` 回归覆盖防抖写入、启动恢复与事件门控。本次 Android 远程应用音量过滤回归与播放器相关 98 项测试、TypeScript 类型检查通过。Docker 无头 Chrome 实测宽屏 mini player 面板由 50% 拖到 30%，整页刷新后仍为 30%。
- Done right：`volume-prefs.ts` 统一键与容错，400ms 防抖写入；mini player 入口为宽屏专用，面板挂根级 overlays 避免被胶囊裁剪。截图 `/home/hanxi/songloft-ui-verify/volume-*.png`。
- Not run：iOS/Android/HarmonyOS 真机；硬件音量键、锁屏与蓝牙路径未验。
- Seen 1× (2026-10-23)。状态：经验，未达到三日期升级阈值。

### UI-005：可点击祖先内的弹层必须整层拦截冒泡

- 范围：Lynx mini player 内嵌 popover 与共享 PopoverSurface；无关联 Issue（mini player 按钮对齐批次及其后续修复）。
- 规则：Lynx `bindtap` 沿祖先链冒泡。放在自带 `bindtap`（如 mini player 根节点点击导航 `/player`）内的弹层，不只触发器要 `catchtap`：面板与遮罩虽是触发器的兄弟节点，仍是该可点击祖先的后代。触发器的 catch 只保护开关本身，行点击和遮罩点击会继续冒泡。共享弹层组件要显式提供隔离开关，并同时覆盖 trigger / panel / backdrop；面板用 no-op `catchtap` 止冒泡，遮罩用 `catchtap` 关闭，不要靠调用方额外包 view。
- 失败证据：Docker 无头 Chrome 首次点击 mini player「更多」后截图落在 `/player` 页而非菜单；触发器经 `bindtap` 冒泡到胶囊根的导航。修完触发器后同一批次再报：歌曲信息点开先跳全屏播放器才出弹窗（全局弹窗留在根级），均衡器被 `/player` 的第二次导航覆盖而打不开，睡眠定时面板随 ShellLayout 卸载一起消失。单测里 `fireEvent.tap` 只触达 `bindtap`，必须直接调用 `eventMap['catchEvent:tap']`。
- Done right：`PopoverSurface` 的 `stopTriggerPropagation` 同时切换 trigger / panel / backdrop（mini player 传 `true`，其它入口不受影响）；无头 Chrome 1024×768 实测歌曲信息在列表页原地打开、均衡器进入 EQ 页、睡眠定时面板弹出、遮罩点击关闭且不导航（`/home/hanxi/songloft-ui-verify/mini-menu-{song-info,equalizer,sleep-timer}.png`）。
- Seen 1× (2026-10-23；同一批次的后续缺陷 2026-10-24 不重复计数)。状态：经验，未达到三日期升级阈值。

### IOS-001：临时文件选择器的异步结果不能依赖弱引用 delegate

- 范围：iOS 共用上传，songloft-org/songloft#545；基线 `ab96b325565241cc62850fba01e5efe63385754b`。
- 规则：请求独立持有完成回调，成功、HTTP 和传输错误都必须回传 JS；不能依赖关闭后可能释放的 picker delegate。
- 证据与 Done right：317 项原生契约检查与类型检查通过，隔离旧源码的新结构检查失败；ARC 时序与真机未验。详见 [本次记录](docs/project/progress.md)。
- Seen 1× (2026-10-28)。状态：源码修复，原生编译及设备验收待完成。

### DESKTOP-003：跨宿主就绪状态必须等到实际消费边界

- 范围：桌面 Bundle 更新迁移确认、Lynx 原生子帧桥接及更新器下载收尾。
- 证据：2026-11-18 源码审查发现三处时序差异：远程模式启动后本地数据库迁移尚未发生；子 Lynx runtime 可能在宿主绑定 frame identity 前报告 ready；更新目录创建失败发生在下载清理块之外。旧代码可能过早确认应用、永久拒绝插件调用或卡在 downloading 状态。
- 规则与修复：确认与身份在对应实际消费边界读取：本地后端健康检查通过后确认迁移，插件首次子帧调用时解析绑定身份，下载准备步骤也位于同一错误/取消/finally 路径内。
- Done right：相关 JS 通过 Prettier 和 `node --check`，原生扩展通过 clang-format；安装器将不可变清单与启动确认记录原子写入，若替换应用后确认记录写入失败，则恢复并重启旧应用。实现记录同步说明精确未验证项。Not run：更新器/插件运行时测试、原生构建、真实迁移失败恢复与安装升级。
- 同次后续：dev 支持同版本升级，版本号单独不足以确认已安装的应用。升级确认同时核对客户端和后端 SHA，并等待本地健康检查。待确认期间禁止再次安装，备份时串行化模式切换并保持后端停止。隔离旧实现的两项回归因过早删除旧应用、过早停止会话而失败。Mac arm64 真实包完成 43→44 迁移，故意中止 0044 的隔离曲库恢复了同摘要旧库。证据见[桌面实施记录](docs/project/desktop-implementation.md#mac-arm64-真实数据库迁移及恢复)。
- Seen 1× (2026-11-18)。状态：经验，待最终设备和升级验收。

### DESKTOP-005：自动和手动更新共用镜像配置

- 范围：Lynxtron 桌面更新。旧宿主只在手动检查时接收代理，新增用例中首次自动检查和下载均直连 GitHub。
- 规则：每次检查从当前认证会话读取代理，并将配置与清单和资产绑定。等待时发生切服或退出，应放弃旧会话的响应。
- 证据：Linux 隔离旧宿主对照失败。Mac arm64/x64 的真实业务 bundle 均通过反代子路径读取代理，再下载测试签名资产。[实施记录](docs/project/desktop-implementation.md#自动更新代理补验)
- Seen 1× (2026-11-18)。状态：已修复，正式发布待验。

### DESKTOP-006：Windows 媒体控制需要官方 SDK 编译验证

- 范围：Windows x64 SMTC。MinGW 构建其它 COFF 对象时，媒体控制缺少 SDK 头文件。
- 规则：用官方 Win32 头和 C++/WinRT 投影共同编译，显式限定 WinRT 类型，并启用 C++20。
- 证据：Windows SDK 10.0.26100.4204 对旧稿报告命名空间冲突及实验性协程错误。修复后 12 个源文件交叉编译，并用 Lynxtron 导入库和 mpv 夹具链接。[实施记录](docs/project/desktop-implementation.md#windows-x64-原生交叉编译和链接)
- Seen 1× (2026-11-18)。状态：已修复编译，Windows 真机待验。

### DESKTOP-007：Mac 视频绘制避免等待共享缓冲

- 范围：Lynxtron 0.0.31 的 Mac 视频元素。原双缓冲会短暂停顿，单缓冲借用表面后 Rosetta x64 仍复现超时。
- 规则：用 `PresentSurface` 尝试提交自有 IOSurface。缓冲满时保留后续重绘机会，提交后由 Lynx 持有该表面。核对像素变化、引擎位置、尺寸与缓冲超时。
- 证据：最终两架构各采样到第 560 帧，经历暂停、恢复和缩放，均未出现缓冲等待超时。[实施记录](docs/project/desktop-implementation.md#mac-视频缓冲与-cef-窗口测试)
- Seen 1× (2026-11-18)。状态：已修复探针复现，完整客户端和长时播放待验。

### DESKTOP-008 · 插件桥要覆盖首个调用和窗口退出

- 涉及 Lynxtron 0.0.31 的 Lynx 子帧与 CEF HTML 插件。
- Mac 的首次就绪推送触发 Lynx 同步回调，线程采样显示回调和销毁等待同一把路由锁。旧 CEF helper 中，页面 `load` 时既有插件 SDK 报告桥不可用。
- 在 UI 线程投递子帧事件，发送前释放路由锁，销毁时丢弃待投递事件。在 CEF renderer 创建主文档上下文时安装桥。用已安装插件执行写入、播放及后端重启读回来检验。[实施记录](docs/project/desktop-implementation.md#mac-两类插件读写与播放)
- Seen 1× (2026-11-18)。Mac arm64 和 Rosetta x64 隔离场景通过，Windows 运行待验。

### DESKTOP-009 · 安装前核对包内版本和架构

- 涉及桌面 dev 滚动发布和已签名更新包。
- 主机、Go helper 和发布工具旧逻辑均接受较晚发布的低版本。测试签名和摘要可以同时通过，因为它们保护的是收到的清单和文件。
- 同版本 dev 滚动先核对版本，再核对源码与时间。磁盘安装之前还要将目标包内的版本、通道、客户端和后端身份与清单对齐。在 Windows 上先让签名 NSIS 结束，再核对新应用并决定重启或恢复。[实施记录](docs/project/desktop-implementation.md#更新包身份和-mac-双架构升级)
- Seen 1× (2026-11-18)。Mac 原生包和错架构对照通过，Windows 执行待验。

### DESKTOP-010 · 回滚时同时核对应用与数据库

- 同一版本可以打包不同后端。采用正确文件摘要、错误后端 SHA 的备份，上一版 arm64 辅助程序仍执行了回滚。
- 备份需与旧应用版本及后端 SHA 匹配，所有文件先验证再移动。旧应用无法就位或数据库文件只恢复了一部分时，尝试撤回已完成的移动。Mac 真实 schema 迁移、回滚后曲库读取及失败现场摘要见[实施记录](docs/project/desktop-implementation.md#数据库回滚配对与中途失败)。
- Seen 1× (2026-11-18)。Mac arm64、Rosetta x64 和故障注入通过，Windows 实际安装与恢复待验。

### DESKTOP-011 · 核对构建器实际生成的资源目录

- Lynxtron builder 0.0.30 生成的 Windows 文件树把 `extraResources` 放在安装根目录。旧配置的实际产物为 `songloft/build-info.json`，宿主和更新器都按 `resources/songloft/build-info.json` 读取。
- Windows 使用从安装根开始的明确资源路径，上传前从实际安装目录核对元数据、本地工具和业务 bundle。用包内工具生成扫描夹具时要满足后端文件稳定性保护。[实施记录](docs/project/desktop-implementation.md#上传前验证实际安装产物)
- Seen 1× (2026-11-18)。Windows 实际打包布局及两种 Mac 更新 ZIP 的后端验证通过。

### DESKTOP-012 · 按共享纹理句柄类型导入与同步

- Lynxtron 0.0.31 内置的 Clay 在 Windows x64 使用 NT 共享句柄和键控互斥锁。旧导入接口在 Windows 11 24H2 虚拟机返回 `E_INVALIDARG`，纯音频能播放但视频打不开。
- 写入端用 `OpenSharedResource1` 导入 NT 句柄，保留旧句柄导入路径。按 Clay 的 key 0 同步，发现读端占用就重试当前绘制。实际画面采样、虚拟音轨和全屏往返后的播放位置均有对照证据。[实施记录](docs/project/desktop-implementation.md#windows-共享纹理与三架构装包播放)
- Seen 1× (2026-11-19)。Windows 11 x64 虚拟机通过，实体 GPU 待验。

### DESKTOP-013 · 安装辅助程序读取发行清单的平台名

- 发布工具从 `win32-x64` 生成清单，宿主也用 Node 的 `win32` 标识。旧 Go 安装辅助程序比较的是 `GOOS` 的 `windows`。在 Windows 11 x64 虚拟机运行旧辅助程序，有效签名的发行格式清单被拒绝为 `invalid update target`。
- 辅助程序按发行清单的平台名校验目标，并维持操作系统与架构校验。Windows 回归直接使用发布值 `win32`，补测拒绝 `windows`。同一回归用旧实现失败，修复后 Windows 和两种 Mac 架构的辅助程序测试通过。证据位于 `/tmp/songloft-windows-package.p7uZmv/vm/guest-serial-resumed.log` 和 `windows-update-lab/mac-helper-tests.log`。
- Seen 1× (2026-11-19)。

### DESKTOP-014 · Windows 安装辅助程序使用应用目录之外的工作目录

- 从 Windows 安装目录启动客户端后，界面触发“重启安装”并成功退出。辅助程序虽然已复制到应用数据目录，却继承了安装目录作为工作目录。重命名旧目录时 Windows 报文件仍被进程使用。
- 辅助程序在读清单和等待退出之前切换到更新目录。在同一 Windows 虚拟机，从应用目录启动两版辅助程序，旧版重命名失败，修复版执行到了预期返回 17 的签名安装夹具并恢复原目录。证据见 `/tmp/songloft-windows-package.p7uZmv/vm/guest-serial-resumed.log`。
- Seen 1× (2026-11-19)。

### DESKTOP-015 · 后端健康确认先于旧包的清理

- Windows 实际测试签名升级已启动新版，后端健康检查返回 200。旧确认逻辑用 ASAR 虚拟文件系统清理旧包，对 Windows 下的 `resources/app.asar` 执行 `rmdir` 报 `EBUSY`，误显示恢复提示。曾用虚拟文件系统打开同一归档的进程退出前，原始文件系统也可能遇到归档占用。
- 健康确认先写入启动记录，清理走 `original-fs`。临时清理失败保留记录并可由同一已确认版本重试。Windows 上原生 Lynxtron 对照、宿主回归和实际曲库读回见[实施记录](docs/project/desktop-implementation.md#windows-签名更新清单校验)。
- Seen 1× (2026-11-19)。

### DESKTOP-016 · 登录表单跟随宿主已确认的模式

- Windows 11 24H2 x64 测试签名客户端取消选目录后仍等待自动登录。切回远程时，登录页在宿主切换完成前显示，表单保留了本地模式按钮和内嵌后端的掩码凭据。
- 目录取消直接结束切换。登录页订阅宿主确认的模式，本地自动登录仅使用当前会话。Windows 实际界面通过取消、选目录、从设置双向切换和恢复远程凭据。证据见[实施记录](docs/project/desktop-implementation.md#windows-业务界面切换本地和远程模式)。
- Seen 1× (2026-11-19)。

### DESKTOP-017 · Windows 关窗要验证原生消息路径

- Lynxtron 0.0.31 的 Windows 关窗路径不会发出可取消的关闭事件。实际测试签名客户端点击标题栏关闭后，托盘和进程都消失了。
- 有托盘时拦截 Win32 关闭消息，通过原窗口的 hide 方法同步可见状态。显式退出撤销拦截，让应用和内置后端完成清理。Windows 对照验证了隐藏期间真实音轨连续输出、托盘回到原窗口和退出无残留进程。详见[实施记录](docs/project/desktop-implementation.md#windows-关窗后继续播放并从托盘恢复)。
- Seen 1× (2026-11-19)。

### DESKTOP-018 · 关于页展示已安装的桌面包身份

- 2.13.15 测试签名 NSIS 装包实际成功，默认业务 bundle 却在关于页显示 `dev` 和 `unknown`。共享组件编译时的版本常量无法代表宿主打包时选定的版本。
- 桌面宿主把更新服务使用的包内版本、提交 SHA 和构建时间传给根页面。更新 ASAR 和业务 bundle 后，Windows 实际关于页显示与安装包一致的 2.13.15 和 SHA。见[验收记录](docs/project/desktop-implementation.md#windows-完整测试签名安装包-21315)。
- Seen 1× (2026-11-19)。

### DESKTOP-019 · 在实际安装的 Windows 应用上验证 CEF 启动

- Windows 11 24H2 虚拟机只有 Microsoft Basic Display Adapter。2.13.17 开发安装包默认启动时，CEF 的 GPU 子进程连续报 `0xc0000005`，宿主退出。给同一安装加上系统命令行开关 `--disable-gpu` 后能打开登录页。
- DXGI 探测发现没有可用硬件适配器时，宿主在初始化 CEF 和获取单实例锁前以软件模式重新启动一次。用完整 2.13.18 NSIS 安装后，通过普通启动路径核对实际进程参数，重复启动应保持原窗口。再以包内 CEF 验证插件页面、后端写入和播放。[验收记录](docs/project/desktop-implementation.md#21318-完整开发包)
- 同日真机补验，Iris Plus 655 能渲染 libmpv 视频，但启动 HTML 插件时 CEF GPU 子进程连续失败并终止宿主。Windows 改为固定以 CEF 软件模式启动。对同一实体设备复测普通启动、插件持久化和视频全屏，并验证自定义开发目录的 CEF 配置与默认开发配置隔离。[真机记录](docs/project/desktop-implementation.md#windows-实体-cef-子进程崩溃与修复)
- Seen 1× (2026-11-19)。

### DESKTOP-020 · 开发数据目录要隔离系统凭据

- 2.13.19 的 macOS 开发版用 `SONGLOFT_DESKTOP_DATA_ROOT` 分开设置和曲库，但两个目录仍使用同一个 Keychain 服务名。控制台预检发现默认开发服务已有凭据。隔离回归恢复旧查找逻辑后，测试目录读到了默认目录的测试密码。
- 自定义开发数据目录使用数据路径摘要作为 Keychain 服务名的一部分，同一目录重启后继续使用同一个服务。测试覆盖默认开发目录和两个自定义目录，27 项宿主检查通过。目录隔离说明见[桌面构建指南](desktop/README.md)。
- Seen 1× (2026-11-19)。

### DESKTOP-021 · 从实际曲库验证 MV 入口

- Windows 2.13.19 的打包宿主能用探针画视频，但“观看 MV”只播放了音轨。306 次实际曲库操作的屏幕采样均未出现视频。桌面入口需要导航到共享视频页，并等当前 `sourceId` 的 `sourceReady` 后再打开和测量画面。
- 用同一安装中的后端扫描视频，通过普通菜单进入。合成视频的 16 段色块和音频全部匹配，进出全屏时位置继续推进。回归覆盖换源、提前关闭和准备失败。[验收记录](docs/project/desktop-implementation.md#windows-21319-曲库-mv-与全屏)
- Seen 1× (2026-11-19)。

### DESKTOP-022 · Mac 更新重启显式传递开发数据目录

- 在 macOS 26.6.2 上，安装辅助程序只调用 `open -a` 时，Launch Services 继承的目录值会将「隔离」转成乱码。安装和恢复后的新进程可能因此读取另一套偏好和钥匙串服务。
- 宿主用本次运行解析出的绝对目录启动辅助程序。辅助程序在 dev 通道通过 `open --env` 传递该项。实际签名升级与恢复夹具都重新启动到同一含中文、空格和等号的目录，且保留失败文件。[实施记录](docs/project/desktop-implementation.md)
- Seen 1× (2026-11-19)。

### DESKTOP-023 · 按 TLS 模式记录连接和媒体请求

- 同一个自签名媒体夹具在 macOS 会留下 TLS 警报，在 Windows 2.13.19 则只留下严格模式的 TCP 连接。播放器报错且没有媒体 GET，原验证器仍因要求 macOS 的警报形态而失败。
- 由客户端标记模式，服务分别保存连接和媒体请求。严格阶段断言播放器拒绝并无媒体 GET，启用测试设置后断言同一 URL 有 206 和实际解码。Windows 完整九项媒体检查通过。[验收记录](docs/project/desktop-implementation.md)
- Seen 1× (2026-11-19)。

### DESKTOP-024 · 安装失败恢复目录后核对旧应用是否重启

- Windows 2.13.21 的设置页使用有效签名清单下载了版本不符的 NSIS。辅助程序恢复了原应用目录和曲库，但原进程已退出，失败日志没有界面入口。
- 在新应用启动前，确认原安装路径、旧应用身份和签名后重启。主进程读取失败标记并提供安装日志入口。实际设置页对照核验新 PID、四首歌及日志定位，两种 Mac 架构的签名夹具验证旧应用重启。[验收记录](docs/project/desktop-implementation.md#安装失败后重启已恢复的应用)
- Seen 1× (2026-11-19)。

### DESKTOP-025 · Windows 测试光盘拷贝后检查只读属性

- 从只读光盘恢复真实签名包的元数据后，PowerShell 的 `Copy-Item` 保留了只读属性。测试脚本在设置回环更新地址时被拒绝。
- 只对隔离安装中的副本清除只读属性，核对恢复的字节后再设置测试地址。原包保持原签名，2.13.21 至 2.13.22 设置页升级通过。脚本和验证记录见 [Windows 2.13.22](docs/project/desktop-implementation.md#windows-21322-设置页升级与锁屏播放)。
- Seen 1× (2026-11-19)。

### DESKTOP-026 · 本地后端未就绪时不按旧令牌进入主页

- Windows 2.13.22 的已登录曲库目录暂时不可用时，关闭启动失败提示后，旧令牌把客户端带到无法加载的主页。
- 本地会话启动失败也由宿主解析登录状态。登录页暴露重试和选目录，成功后才保存新的目录。实际移走和归还原目录的对照保留了四首歌曲和原凭据，重试恢复登录与发声。[验收记录](docs/project/desktop-implementation.md#音乐目录不可用时保留本地会话)
- Seen 1× (2026-11-19)。

### DESKTOP-027 · 暂存 CEF 时重建 macOS 框架链接

- macOS arm64 上，固定锁文件的离线安装把 CEF 的框架链接展开成文件和目录。打包复制了这些副本，`codesign` 拒绝签署结构不明确的框架。
- 暂存时仅复制框架的 `Versions/A`，再创建标准的相对链接。宿主测试覆盖链接被展开的安装树，完整 macOS 包另做严格验签。[验收记录](docs/project/desktop-implementation.md#21323-完整开发包)
- Seen 1× (2026-11-19)。

### DESKTOP-028 · 复制安装包前核对三个架构的源码摘要

- 发布工具夹具只改了一个架构的 `clientSourceSha256`，保留相同的客户端 SHA、版本、后端和更新公钥。旧脚本仍成功暂存并为混合工件签署清单。
- 发行任务固定 checkout 的换行策略。发布前同时读取三个架构的元数据，核对源码摘要及其它共同身份后再创建输出。回归覆盖同 SHA 不同源码的工件，并检查拒绝后没有输出目录。[验收记录](docs/project/desktop-implementation.md#桌面发行预检)
- Seen 1× (2026-11-19)。

### DESKTOP-029 · 停播前复核已下载的安装包

- 安装包校验通过后仍可能在磁盘上变动。测试用等长损坏文件覆盖后，旧宿主先停止会话，再由辅助程序发现错误。
- 点击安装时重算摘要，失败回到可重新下载的状态。辅助程序在原进程退出后独立验包，交接后的失败只重启身份和签名均通过校验的旧版。Windows 与两个 Mac 架构均已验证辅助程序拒绝损坏包及重启旧版。[验收记录](docs/project/desktop-implementation.md#交接前后验证更新包)
- Seen 1× (2026-11-19)。

### DESKTOP-030 · 升级包清理以启动确认记录为准

- 回归显示已确认的更新仍保留整份安装包。提前删包会令待确认更新失去独立辅助程序所需的恢复资产。
- 先持久化确认，再删除该记录对应的摘要文件和旧应用。Windows 的真实文件锁测试确认 `EBUSY` 不撤销确认，锁释放后可重试删除。数据库备份和失败记录继续保留。[验收记录](docs/project/desktop-implementation.md#确认升级后回收安装缓存)
- Seen 1× (2026-11-19)。

### LIST-005 · 标题滚动跟随行的可见状态

- ReactLynx 会为离屏列表项执行组件 effect。视口外的标题也会发起尺寸测量，后续用一次归零动画覆盖旧动画的做法还会让原动画继续写入样式。
- Docker Chrome 的 40 首长标题夹具中，两次触摸均滚到 482px。停止手势后的采样中，写入位移的标题由 40 个降至 10 个。收到 `uiappear` 后才测量并启动，收到 `uidisappear` 后用原动画句柄停止。回归还覆盖重新进入视口和标题滚动设置。
- Seen 1× (2026-11-18)。对照基于 `baef0f9` 和本次 Lynx 工作树，证据在 `/tmp/songloft-lynx-scroll-tabs.j14OKU/`。

### NAV-002 · 冷启动快照同时保存插件 SVG 图标

- 范围：Lynx 主导航插件 Tab。基线 `debad6e` 恢复了 Tab 布局和图标文件名，SVG 加载期间仍显示设置齿轮。
- 规则：按服务器和账号保存已加载的 SVG，在发布布局前恢复对应文件名的图标。旧快照和新图标加载时保留原尺寸图标位。校验失败时保留可用缓存。
- Seen 1× (2026-11-19)。旧实现的冷启动组件回归在首帧读到齿轮。Docker Chrome 的慢请求对照和证据见[进展](docs/project/progress.md#nav-tab-icons)。

### NAV-001 · 冷启动从上次成功的有效 Tab 布局开始

- 胶囊首帧使用当前服务器和账号的本地快照。后台同时校验 Tab 配置和已启用插件，成功后保存新的有效布局。移动 Bundle 用本地曲库身份跨监听端口重启复用快照。
- Docker Chrome 延迟两个接口，旧版先画内置 Tab，再插入插件项。修复后首帧有已保存的插件项，配置相同没有重排，配置变化更新一次，503 时布局保留。回归另外覆盖移动 Bundle 端口变化与账号隔离。
- Seen 1× (2026-11-18)。对照基于 `baef0f9` 和本次 Lynx 工作树，证据在 `/tmp/songloft-lynx-scroll-tabs.j14OKU/`。

### DESKTOP-031 · 换源保留未变化的 libmpv 视频属性

- 范围：桌面原生播放器的换源与视频轨判定。2.13.24 arm64 从 MP4 切到同尺寸 MKV 后，位置推进到 2,267 ms，宿主却报告 0×0。
- 保留尺寸和时长的最后一次属性观测。遇到不可用通知清除对应值，当前源就绪才向宿主公开。旧实现的回归复现尺寸归零，修复后的独立签名副本在原生 arm64 与 Rosetta x64 连播四种容器。[记录](docs/project/desktop-implementation.md#macos-换源保留同尺寸视频)
- Seen 1× (2026-11-19)。状态：经验。

### PLUGIN-006：插件桥需核对 Android 实际 JS 运行时支持的内置方法

- 范围：Android Lynx 宿主插件音效，songloft-org/songloft-player-lynx#15。
- 证据：API 34 模拟器上的 WebView 发起宿主播放并查询到系统 EQ，首次应用预设却由宿主返回 `Object.hasOwn is not a function`。此前 Node/Vitest 的播放桥测试已通过。
- 改用 `Object.keys` 校验音效配置的自有字段。回归在隐藏 `Object.hasOwn` 的环境跑真实分发器。SDK 传输的 WebView 与执行宿主逻辑的 Lynx JS 运行时都需要单独核对。
- Seen 1× (2026-11-19)。

### DESKTOP-032 · 验收包内工具时计入首次加载耗时

- 范围为 Lynx 桌面 Bundle 原生资源，客户端 `6929fc8`，后端 `35b1e33`。macOS 26.6.2 原生 arm64 在 30 秒内未完成首次 `ffmpeg -version`。重跑期间采样显示进程在 dyld 加载签名动态库，旧版 Rosetta 记录也有 61 秒的首次加载。
- 包内工具检查每条命令保留 120 秒上限，继续核对工具版本和扫描、Range、重启持久化。原生 arm64 新构建和 Rosetta x64 验签 ZIP 均通过，后者首次 `ffmpeg -version` 用时 29.322 秒。见[桌面实施记录](docs/project/desktop-implementation.md)。
- Seen 1× (2026-11-19)。

### DESKTOP-033 · 用实际接替进程验证 Windows 首次渲染

- 范围为真实 2.13.25 NSIS，在干净 Windows 10 22H2 x64 虚拟机运行。虚拟显卡触发 `--disable-gpu` 的自动重启，首个 PID 按预期退出，最初计时器误报启动失败。替换后的宿主打开原版登录界面。
- 从应用启动时开始计时，等待同一已验签路径的可见窗口，并跟踪该进程采集数据；原进程退出通过总时限和接替进程的实际窗口判定。见[桌面实施记录](docs/project/desktop-implementation.md)。
- Seen 1× (2026-11-19)。
