# Lynx 客户端开发经验

## 范围与来源

记录songloft-org/songloft-player-lynx 的双线程、共享 JS 与四端宿主行为。流程见 [本地 AI 开发流程](docs/guides/ai-development.md)，公共宿主约束见父仓库。已有 AGENTS 和业务文档仍是权威规则，LESSONS 链接证据而不复制历史全文。

## 记录与升级

每条含规则、适用范围、完整 owner/repo#编号、失败/修复 commit SHA、实际验证和 Done right 示例；没有正确示例时写待补。Seen 只统计不同日期的独立事件，同一事故重复复盘不增加。三个日期后提出升级并标记规范位置，已有铁律/严重问题立即处理。与 [英文版](LESSONS.en.md) 同步，不虚构历史次数、修复结论或设备验收，敏感信息脱敏。

## 条目

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
- Seen 1× (2026-10-27)。状态：经验；报告人的 Chromium 150 和真实曲库待复验。

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
- 规则：store 的 0–100 音量是应用级设置，写入 prefs `player_volume`（与偏好同步共用键），启动时先 `restoreVolume` 再恢复播放，避免自动续播按宿主默认音量出声。Android 的音量归系统媒体流，不能覆盖用户保存值；iOS 记录应用级倍率并在每次创建播放器后重新赋值，不能读取/监听 `AVAudioSession.outputVolume`（那是系统音量，与应用滑杆无关，还会把滑杆弹回）。宿主 `volumeChanged` 在恢复完成前不得覆盖本地偏好。
- 证据：iOS 旧实现读系统音量且换播放器后丢倍率，Web `getVolume` 为空实现；新增 `volume-persistence` 回归覆盖防抖写入、启动恢复与事件门控。Docker 无头 Chrome 实测宽屏 mini player 面板由 50% 拖到 30%，整页刷新后仍为 30%。
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
