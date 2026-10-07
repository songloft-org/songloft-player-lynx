# Lynx 客户端功能补齐计划（2026-10-06）

[交接](../handoff.md) · [文档索引](../../README.md)

**状态：用户已批准实施，按批次验证并本地提交，不 push。** 本计划仅保留中文版，基于 Lynx 子仓库 `1848c12` 与工作区后端 Swagger/源码核查。“更新文档”指订正落后于实现的现状描述，不将待做功能写成项目现状。本轮暂缓桌面客户端与 Bundle 本地模式。

## 1. 目标、范围与实施顺序

目标是补齐已经建议且获准规划的功能，优先改善实际播放，再补数据管理和平台体验。

| 批次 | 交付 | 平台 | 依赖 | 初步工作量 |
|---|---|---|---|---|
| P0 | 订正文档、形成可审核计划 | 文档 | 无 | 小 |
| P1 | 多音轨查询、选择与可靠切换 | Android / iOS / HarmonyOS / Web | 现有后端音轨接口；媒体源生命周期 | 中 |
| P2 | 三个原生端 bundle 热更新；需要新原生能力时升级安装包；Web 部署更新入口 | 四端 | 签名发布契约、原生加载器与兼容检查 | 大（拆 P2a/P2b/P2c） |
| P3a | 缓存身份隔离、索引、枚举与取消 | 三个原生端 | P1 的音轨/源身份；现有单曲缓存 | 中～大 |
| P3b | 歌单/多选批量缓存、任务进度与失败重试 | 三个原生端 | P3a | 中 |
| P3c | 已缓存歌曲管理与断网播放 | 三个原生端 | P3a/P3b | 中 |
| P4 | Web 歌单 JSON 导入/导出 | Web standalone / embedded | 现有文件宿主桥接 | 小～中 |
| P5 | Web 播放键盘快捷键 | Web | 主线程键盘事件桥接；P1 播放控制 | 小～中 |
| P6a | HarmonyOS 剪贴板 | HarmonyOS；共享 facade 兼容 | Platform 模块 | 小～中 |
| P6b | HarmonyOS 通知歌词与音频契约补齐 | HarmonyOS；Android/iOS 回归 | AVSession 元数据、歌词同步 | 中 |
| P6c | iOS/HarmonyOS 插件恢复前台通知 | iOS / HarmonyOS；Android/Web 回归 | 现有 Android resumed 事件 | 中 |

**顺序：P0 → P1 → P2 → P3a → P3b → P3c → P4 → P5 → P6a → P6b → P6c。** 工作量用于拆分批次，不承诺日历工期；原生设备和工具链可用性影响验收。视频批次 P1b 因缺少可运行的测试环境暂缓，不进入本轮实施顺序。

本轮边界：不开发桌面宿主、系统托盘、桌面歌词或嵌入 Go 后端；不做静默安装、跨服务器完整曲库离线镜像及 OS 保证的后台下载。用户已确认将远程 bundle 热更新纳入 P2，默认兼容时更新 bundle，新增原生能力时更新安装包。已有预取策略保留，不单独排一个“从零做预加载”批次。视频已有页面及四端宿主代码，本轮只按源码订正视频现状文档，不安排视频功能修改或设备验收。P1b 留作环境具备后的待验事项，不能凭源码或 JS 测试宣称视频播放已通过。

## 2. 核查结果与需要订正的旧结论

| 项目 | 当前源码事实 | 对本计划的影响 |
|---|---|---|
| 音轨 API | `src/features/library/api/songs-api.ts#getTracks` 使用已有 `/songs/{id}/tracks` 数组接口，但不含默认标记；后端另有 `/songs/{id}/audio-tracks`，返回 `{tracks: [...]}`，字段含 `index/title/language/codec/default` | 改用含默认标记的完整契约并新增真实消费点，不能直接挂一个菜单就算完成 |
| 音轨 Store | `player-store.ts#setAudioTrack` 有定义、没有业务 UI 调用；选择值是模块变量，当前方法会无条件播放，且视频源分支可能绕过 `track` 参数 | 需要可观察状态、切歌重置、源选择与暂停/竞态处理 |
| 原生媒体 load | TS `load()` 的 Promise 只表示方法已发出，不能证明原生媒体准备完毕 | 不得用 `await load()` 代替“新源可 seek”的判据 |
| 下一曲预取 | `player-store.ts` 在 80% 进度时已有 128 KiB Range GET | 属已存在策略；旧“完全未做”结论失效 |
| 单曲缓存 | 三端已有 `SongloftSongCache`、持久目录、`.part` 原子写、TLS 策略及 `limit_exceeded`；现接口围绕 songId | 扩展现有实现；先解决多服务器/音轨身份，避免批量缓存扩大碰撞 |
| Web 数据传输 | `web/audio-host.js` 和 Worker Platform proxy 已有上传/下载能力；`dataTransfer` 仍由 `isWeb ? false : ...` 禁用 | 补能力判断与用户激活链路，不能只解除开关 |
| 客户端更新 | 关于页仅有服务器 UpgradeSection；发版已发布 `version.json`、`checksums.txt` 与五种资产；Android/iOS 加载器仅读安装包资源，HarmonyOS 从 rawfile 构建 TemplateBundle | 三端底层支持加载外部模板，但当前客户端没有热更新器；扩展现有 Release 契约，不借用后端升级端点 |
| 原生补齐 | HarmonyOS `setClipboard` 是空方法、`updateNotificationLyric` 缺失；iOS/HarmonyOS 没有 resumed 事件 | 分三批闭合调用链与设备验证 |
| 视频文档漂移 | HarmonyOS `Index.ets` 已注册视频模块并建立 XComponent；iOS 已用下层 UIView + AVPlayerLayer | 改为“已有源码，待编译/设备验收”，不重复开发视频模块 |

当前源码和 Swagger 优先于历史批次记录。文档中“已实现”“已编译”“已设备验证”分别记录；无法运行的验证保留为开放项。

## 3. P1：多音轨切换

### 行为与交互

- 当前歌曲探测出至少两条音轨时，在播放器更多菜单提供“音轨”；选择面板展示标题、语言、编码、默认/当前状态，缺失标题使用本地化编号。
- 单音轨、无可探测文件、未缓存网络源不显示无效选择项。404/缺 ffprobe/网络失败有明确降级与重试，不阻断正常播放；按后端实际错误语义处理。
- 选择使用后端的 audio-relative `index`，不是数组下标。切换保留毫秒进度、播放/暂停意图、音量、速度与队列；切新歌清除旧歌选择。
- 音轨状态由当前歌曲和服务端响应派生；选择只作用于当前歌，首版不跨歌曲记忆。DLNA 会话期间隐藏本地音轨入口，避免把远端控制误送给本地引擎。
- 缓存只能用于匹配的音轨版本；完整容器视频播放与服务端抽轨音频明确处理：观看视频时不提供音频抽轨入口，离开视频后再恢复可用选择。

### 实施点

1. 在 library SongsApi 修正路径、对象响应和强类型解析，加入 `default`；新增模型及 `features/player/data` 音轨 query，按服务器/歌曲隔离，过期请求不能覆盖新歌。
2. 把音轨选择迁入可订阅播放器状态；统一 URL 构造、重试源、元数据及恢复路径。修复切轨失败后错误的选中态，清理未使用的旧接口。
3. 为源切换建立 load 代次与准备状态。默认方案是为 `AudioLoadOptions` 增加可选源标识和初始进度/播放意图，由四端宿主、mock 和 facade 同步实现；在对应新源可播放/可 seek 后完成恢复，超时和异步错误均结束切换。
4. 保留原生 fire-and-forget 调用方式，以事件/回调确认结果。新字段不传给不支持的旧壳；可靠切换所需契约缺失时禁用切轨并提示更新客户端，不能误报成功。
5. 新建选择面板，复用根级覆盖层、Popover/Sheet、返回栈和主题；中英、窄屏、宽屏、最大字号均可用。

主要文件：`features/library/api/songs-api.ts`、`features/player/{data,domain,store,widgets}/`、`core/network/url-helper.ts`、`native/{audio-types,native-audio,mock-audio}.ts`、`web/audio-host.js` 与三个原生 audio 模块/引擎。

### 验收

- 真后端双音轨样本可查询，实际播放请求含选中的 `track=N`，原唱/伴奏能听出变化；单轨与空列表正常。
- 暂停状态切换仍暂停，播放状态切换继续播放，进度恢复误差按设备 seek 精度记录。
- 快速连切、切换中下一首、旧探测晚到、异步加载失败不会把旧音轨/进度写给新歌；失败允许重试。
- 普通音频、HLS、电台、视频、缓存播放、随机模式及通知控制无新增回归。

### P1b（暂缓）：视频设备验收

用户已指出当前没有可运行的视频测试环境。本节仅记录将来具备环境后的验收范围，不授权本轮执行视频修改，不计入本轮交付。以下涉及复现或修复的步骤须先有真实环境和证据，再确定实施范围。

当前已有 `FullVideoPage`、封面上的 MV 入口、播放/暂停/进度控件、fit/zoom、横竖屏控制及四端宿主接线。Android 为 SurfaceView，iOS 为 AVPlayerLayer，HarmonyOS 为 XComponent；Web 为主线程 video。不能将这些功能统一写成“缺失”，也不能仅因模块存在就宣称四端完整可用。

1. 用带视频的真实样本建立平台矩阵：本地 MP4、需转换容器的 MKV、纯音频负例、远程源、HLS 与自签名源。逐端记录可直放、需后端转码、失败或环境未验证，区分容器和编码能力。
2. 核对封面入口 → `video-open.ts` → 视频源解析 → `enterVideoSource` → 宿主 surface 的闭环。准备失败、缺 ffmpeg、无视频轨、服务端 HTTP 错误分别反馈，不能统一报“无视频轨”。
3. 验证新源代次、加载中返回、连续点入口、切歌和视频转码重试，修复实测/可稳定复现的竞态；Android 旧 open/isOpen 问题仍需设备复核后才能闭合。
4. 验证播放/暂停、seek、fit/zoom、控制栏显隐、安全区、横竖屏锁定/释放和系统返回。退出必须解绑视频输出并恢复音频页；随后播放纯音频不能静音或停留黑屏。
5. HarmonyOS 已重新有真实视频模块和表面，单独跑 HAP 真编译与设备测试；更新旧“模块已删除、另做视频”的缺陷描述，不拿过去移除占位模块的证据当当前功能验证。
6. 多音轨抽轨、缓存变体和视频原容器的组合只在有真实支持时开放入口；不会播放的格式给出明确错误和可恢复音频路径。Web 浏览器横屏/全屏被拒时保留可操作页面。

主要文件：`features/player/pages/FullVideoPage.tsx`、`FullPlayerPage.tsx`、`data/video-open.ts`、视频源模型、`store/player-store.ts`、`native/video.ts`、`web/audio-host.js`、三个宿主 video 模块/表面与对应 E2E。

验收：至少逐端完成打开 MV、控制/旋转、退出后继续音频及错误负例；原生保持共享播放器，Web 确认画面与声音进度一致、没有双重出声。保存矩阵和设备证据，无法运行的平台继续标“未验证”；只有确认存在的新缺口才进入修复，不扩大为无证据的播放器重构。

## 4. P2：bundle 热更新与安装包更新

用户已确认本批方向：**Android、iOS、HarmonyOS 均规划 bundle 热更新，兼容时优先更新 bundle，需要新原生能力时引导安装 APK/IPA/HAP。** 三端底层具备模板加载能力，不等于当前客户端已经实现热更新；必须先安装一次包含更新器的新壳，后续兼容的界面、样式和 JS 业务修改才能免装安装包。下载完成后下次冷启动生效，不在播放过程中替换根 LynxView。

### P2a：版本、兼容与签名发布契约

- 原生壳独立暴露不可被新 bundle 覆盖的宿主版本、构建号、更新通道、平台、Lynx 引擎版本和原生桥接契约版本。现有 `clientBuild` 是 JS 构建元数据，热更新后只代表当前 bundle，不能用于证明原生壳兼容或改变更新通道。关于页分别展示壳版本和当前 bundle 版本。
- 扩展现有 `version.json`，增加更新协议版本、bundle 身份、目标平台、支持的宿主/引擎/桥接版本范围、必需能力及下载资产的大小和 SHA-256；继续保留五种安装/部署资产，不维护相互独立的两套版本源。可共用同一 bundle 的平台复用产物，有差异则分别发布，均有明确兼容声明。
- 发布清单使用独立更新签名；原生壳内置受信公钥和 keyId，对清单原始字节验签后再采用资产哈希。私钥仅进入 CI secret，签名算法及编码以三端目标 SDK 可用接口为准并使用同一组测试向量；只有 checksum 不能视为发布者验证。未知签名密钥/协议一律拒绝热更新，提供安装包入口。
- 先核对构建的外部图片、字体、脚本与拆包依赖，首版尽量自包含；必需外部资源随更新产物发布并纳入签名清单。原生加载路径与资源解析同批处理，不能假定替换 `main.lynx.bundle` 就包含全部内容。拒绝越界路径及超出大小上限的下载/解包。
- 改造 `finalize-release.mjs`、Release CI 的产物收集/校验和测试，增加独立 bundle 更新资产及清单签名。dev 滚动 Release 读取期间变化时重查一次，仍不一致则稍后重试；没有有效签名不发布热更新资产。首版保留现有完整发版流程，不另加绕过检查的 bundle-only 快速发布通道。
- 新原生模块、原生播放器修复、权限、Lynx SDK 升级等必须更新壳，并在清单上表达最低契约；不得靠 JS 方法存在判断代替完整兼容检查。P1 已需要原生 load 契约，P3/P6 后续也可能需要再次升级安装包。

### P2b：三端下载器、加载器和回退

- Android 改造 TemplateProvider，iOS 改造 SongloftTemplateProvider，HarmonyOS 改造 rawfile → TemplateBundle 加载链路：优先选择已验证且兼容的本地更新，始终保留安装包内置 bundle 作为兜底。三端复用 TS 契约及发布协议，原生文件、网络和验签分别适配。
- 原生更新模块提供查询宿主/更新状态、下载进度、取消、准备下次启动和启动确认；TS facade、旧壳降级与契约验证同批落地。先在 Android 验证完整流程，再对 iOS/HarmonyOS 按同一状态机实施；三端均在本批范围，工具链或设备不可用的验收单独标明。
- 下载写入应用私有目录的临时文件，校验签名、完整性和兼容后原子提交 pending。取消、断网、空间不足或进程中断不能改变 active；下载 URL 不包含服务器 token，不放宽现有 TLS 验证来迁就更新。
- 保留 pending/active/上一正常版本/内置包；冷启动加载 pending 时记录试运行，根界面和启动状态就绪后经原生确认才转为 active。登录页、断网页也可确认正常启动，不要求服务器可达。超时、致命加载错误或确认前崩溃，在下一次启动恢复上一正常兼容版本，必要时退回内置包；限制试运行次数，避免启动循环。
- 网络/认证业务错误不触发 bundle 回退；用户可从更新页恢复内置版本。更新包不得进行无法回退的本地数据迁移；本地 schema 与读写兼容另行版本化。
- 安装新壳后重新评估已有下载包，失效的不再覆盖内置新包；按当前通道和版本规则避免旧 bundle 意外覆盖新版安装包。断网冷启动仍可使用当前正常包或内置包。

### P2c：检查更新与生效交互

- 关于页将客户端更新和服务器 UpgradeSection 分开。用户手动检查，展示发布时间、说明、bundle/安装包更新类型、下载进度、取消、重试与“下次启动生效”；不默认自动下载或强制重启。
- **严格限定本通道更新，与 Flutter 客户端一致**：dev 壳只查询 `releases/tags/dev` 及该 Release 的资产；正式壳只查询 `releases/latest` 返回的最新正式 Release。正式版不查询 dev 或版本化预发布，不扫描历史 Release 寻找其他候选。没有通道切换控件，当前通道没有有效候选时也不能回退到另一通道；bundle 与安装包入口共用同一次通道解析。
- dev 对比当前 bundle 与 dev `version.json` 的 `git_commit`：有效提交相同不提示更新，不同视为 dev 有更新；提交缺失时才回退到 `build_time`，远端较新且差值至少 10 分钟才提示，保留 Flutter 的同次构建时间容差。不能用 Release `published_at` 代替构建时间，不能把提交哈希当可排序的版本号。比较元数据不足时展示“无法确定”及本通道发版入口，不编造“已经最新”。
- 正式版只在远端正式语义版本高于当前 bundle 版本时提示更新；同版本和更低版本不提示，不采用“构建更晚”作为正式版升级依据。校验 latest 的非草稿、非预发布、正式 tag 及清单通道；dev 同样核验 dev tag/清单。预发布资产不作为候选，本批不新增 preview 更新通道。安装包升级后的已有 bundle 选择继续核对壳通道，跨通道旧包不再加载。
- 完整兼容时提供 bundle 更新；要求更高原生契约时说明需要升级客户端安装包。旧壳没有更新模块仍提供安装包链接，不能通过下载 bundle 自行补上更新器。
- Android 链接 APK，HarmonyOS 链接 HAP，iOS 提供 IPA/发版页并说明需重签；安装包交由平台打开链接。iOS bundle 更新无需重新签名整个 IPA，但不能靠它更新原生代码。
- Web 保持 standalone/embedded 部署包更新与刷新说明；Web 引擎和主线程宿主脚本与部署产物配套，不直接复用原生 bundle 更新器。
- GitHub 请求不携带 Songloft bearer token，短期缓存、并发去重；限流、未发布、缺失/不兼容资产、断网和签名失败分别反馈。代理区分 API 与下载域，仍执行验签，不能猜测代理格式。

主要文件：`features/settings/{api,data,domain,widgets}/`、`pages/AboutPage.tsx`、`core/config/constants.ts`、新增 native 更新 facade/宿主模块、本地 prefs、三端启动加载器、`scripts/{release-lib,finalize-release}.mjs`、版本注入和 Release CI。后端接口/数据库默认不改。

### 验收

- 每个原生端先安装带更新器的壳 A，再从界面下载兼容 bundle B；下次冷启动出现 B 的可观测界面/版本变化，期间不安装 APK/IPA/HAP，壳版本仍为 A。播放中的下载不打断音频。
- 新 bundle 要求壳 A 不具备的原生契约时，只提供安装包升级，不尝试加载；安装新壳后旧下载不会覆盖新版内置包。三端分别保存编译和设备证据。
- 篡改清单、坏签名、坏哈希、未知 keyId、错误平台/引擎/契约、越界资源、空间不足、取消和中断均不能替换正常包；三端验签使用正反测试向量。
- 下载完成后离线启动可用；试运行前崩溃、加载异常、启动确认超时及连续失败均能恢复，网络/认证失败不误回退；用户恢复内置版本有效。
- 验证请求和候选严格隔离：dev 仅查询 dev，正式版仅查询 latest 正式版；断网、404、缺资产、坏清单及不兼容时均不跨通道回退，不选择预发布或历史版本；bundle 和安装包指向同一候选 Release，旧下载包不能改变壳通道。
- 正式版相同/更高/更低版本（含 `1.9.0` 与 `1.10.0`）比较正确；dev 同/不同提交、提交缺失时构建时间差小于/等于/大于 10 分钟、远端较旧、时间未知及滚动资产变化均有覆盖。区分服务器、原生壳与 bundle 版本；五种原资产及新更新资产与发版脚本一致，Release 签名/版本注入测试通过。
- 外部请求检查无后台 token；旧壳安装包入口、各平台打开链接及 Web 部署包入口回归通过。无法执行的原生端验证不标为热更新已交付。

## 5. P3：歌单批量缓存与离线管理

### P3a：身份、索引与取消

- 在现有 `SongloftSongCache` 上增加命名空间及索引。身份至少包含服务器 profile/标准化服务器地址、用户标识、songId、音轨、实际缓存格式/音质/归一化设置；文件名用稳定编码或哈希，不能包含 token。
- 保存最小本地歌曲快照与缓存变体信息，用于断网列表和播放。索引与媒体文件原子提交；启动时核对文件，清理 `.part`，未完成任务标记为中断，允许用户重试。
- 增加分页枚举、任务进度、按任务取消及按身份删除的 TS/三端契约。取消必须终止网络读取并清理临时文件；UI 状态结束不能代替真实取消。
- 三端维持持久目录、当前 TLS 策略、字节上限和机器可读错误。所有入口共用有界串行调度与容量检查，避免单曲与批量下载互相越过容量限制。
- 旧 songId 缓存无法证明属于哪个服务器，默认不自动归属给当前服务器；计入容量并提供旧缓存清理入口，既不跨服复用也不自动删除用户文件。旧壳继续可用原单曲入口；新批量/枚举入口按必需方法探测。

主要文件：`features/player/data/song-cache.ts`、`domain/song-cache-actions.ts`、新增缓存模型/任务 Store、本地 storage、Android/iOS/HarmonyOS `SongloftSongCacheModule`。

### P3b：批量入口与任务

- 歌单详情和曲库多选提供“缓存到设备”；“整歌单”使用真实完整歌曲集合，不能仅下载当前已加载的一页。
- 任务状态为等待/下载中/完成/失败/取消/中断，显示完成数、总数和当前字节进度。已缓存相同变体跳过，重复提交去重。
- 默认串行下载；单曲失败保留原因并继续其他歌曲，容量不足停止后续任务。支持取消当前任务、取消剩余任务和只重试失败项。
- 电台不作为可缓存歌曲；视频大文件复用现有确认规则。任务开始后不因用户切换当前播放音轨而改变冻结的下载参数。
- 切服务器/登出取消所属待处理与进行中任务，清空当前任务视图；不自动销毁已完成缓存。进入后台不承诺 OS 持续下载，恢复前台重新核对宿主任务状态，进程被杀后显示中断并可重试。

主要文件：`library/widgets/FlatSongsView.tsx`、`playlist/pages/PlaylistDetailPage.tsx`、播放器缓存入口、缓存任务页/面板及查询失效逻辑。

### P3c：离线管理和播放

- 新增“设备缓存”页面：本地列表、搜索、占用空间、单项删除、当前身份缓存清理和旧缓存清理；与现有服务器缓存管理页分开。
- 断网时仅从本地快照和真实文件构造播放队列，播放不依赖远端曲库详情、歌词或封面成功；未保存的图片/歌词用明确占位。
- 冷启动保留既有服务器/用户身份即可进入其缓存，不以服务器可达性作为列表条件；登录态失效时提供仅本地缓存入口，不伪造服务器认证成功。显式登出后不展示上一用户曲目，重新登录该身份或用户主动清理后再处理。
- 先使用匹配变体的缓存；离线时缺文件/缺音轨直接报本地不可用，不能陷入远端重试循环。切服务器和换用户不会串用同 id 文件。

主要文件：新增缓存页面/路由/返回策略，`player-store.ts`、缓存源选择、`auth` guard 与 root 启动链路（仅增加本地缓存入口）、`settings` 导航、i18n。

### 验收

- 超过一页的歌单缓存完整；重复歌曲与重复操作不重复下载；同 id 的两个服务器不会覆盖文件。
- 多音轨/音质缓存互相隔离；实际媒体格式与扩展名一致；索引里没有 token 或临时远端下载 URL。
- 真设备取消后下载字节停止增长、连接/临时文件清理；超限不超额，故障/重启后没有把半截文件当作可播。
- 飞行模式下打开缓存列表、播放、上一首/下一首、重启后再次播放；过期 token 仅影响远端服务，显式登出不能暴露旧用户缓存。
- 旧单曲缓存入口与清理行为回归；三端下载性能与磁盘空间有实测记录。

## 6. P4：Web 歌单 JSON 导入/导出

实施记录（2026-10-07）：共享源码与 Chrome standalone/embedded 根路径验收已完成。主线程选择/下载控件处理激活过期，认证请求支持刷新重试；279 文件 / 3012 项 JS、35 项发布工具、类型/双产物和 Android APK 通过。实际选文件、后端歌单/歌曲新增、中文/emoji 下载、取消/错误/认证失效与中英最大字号六组通过，见 progress。Firefox 134 后续实际通过 standalone/embedded 根路径的数据传输，激活失效使用夹具；启动/音频环境观察见 progress，Safari 未运行。旧包曾实测前端子路径挂载 404/黑屏；后续已修复，Chrome 两种模式的登录/插件与 Linux WebKit 两种模式的 P4/P5 通过，详见部署指南，原生传输流程未改。

- 方法级判断文件上传/导出能力，解除 Web 的一刀切禁用；Settings 入口与 DataPage 同步。
- 导入继续使用现有 `/playlists/import` multipart `file` 契约，导出使用 `/playlists/export`。读取用户选定文件并上传，取消选择、无效 JSON、未授权、服务端失败均结束 busy 状态。
- 选择器与下载在宿主主线程执行。真实浏览器先验证 Worker → host 的用户激活；若丢失，则由主线程直接承接用户点击，或显示用户明确点击的文件选择/下载控件，不能只替换 `.click()` 为 `showPicker()`。
- 导出优先认证 fetch 后用 Blob 下载，避免异步 `window.open` 被拦；下载后撤销 object URL，关闭/取消时删除临时 DOM 和监听。
- 导入成功按真实 query key 失效歌单、歌曲和统计；并发重复点击禁用。embedded/standalone 均处理正确 base URL、跨源/CORS、token 刷新与错误语义。

主要文件：`native/platform-capabilities.ts`、`features/settings/pages/DataPage.tsx`、`features/settings/domain/data-transfer.ts`、`native/native-platform.ts`、`web/{audio-host,songloft-platform-module}.js` 及 Settings 入口。

验收：Docker Chrome 上从界面真实点选文件、下载可解析 JSON、导入后后端歌单/歌曲数变化；测试取消、空文件/坏 JSON、401、standalone 跨源与 embedded 同源。Firefox/Safari 记录实际支持与降级，不以 Chrome 结果代替全浏览器通过。

## 7. P5：Web 播放快捷键

- 首版固定映射：Space 播放/暂停；Ctrl/Meta + Left/Right 上一首/下一首；Ctrl/Meta + Up/Down 音量增减（每次 5，钳制 0–100）。在播放设置展示映射与启用开关，偏好只保存本地。
- 主线程监听键盘，识别 composed path 中 input/textarea/select/contenteditable（含 Shadow DOM），这些输入场景不触发；IME 组合输入、已处理事件、打开的模态输入/覆盖层也不抢占。
- 只在应用拥有交互焦点时处理，插件 iframe 内的按键不劫持；切换播放/上一首等忽略长按重复，音量允许重复。仅消费已匹配并实际处理的按键。
- 经宿主事件/模块桥接把动作交给现有播放器控制，DLNA 活跃时沿既有远端路径，不另写一套 audio 控制；初始化与销毁防止重复注册。

主要文件：新增 Web 键盘宿主脚本/事件 facade/动作映射，`web/index.html`、`scripts/copy-bundle-web.mjs`、PlaybackPage、i18n。原生移动端不注册 Web 键盘监听。

验收：真实浏览器验证播放/暂停、曲目变化、音量值；输入框、模态框、插件、禁用状态、IME 与 key repeat 不误操作；宿主脚本进入发布产物，加载两次不产生双动作。

## 8. P6：原生能力补齐

### P6a：HarmonyOS 剪贴板

- 用目标 SDK 的 Pasteboard API 实现写入；共享 facade 能确认写入成功或失败，成功后才显示“已复制”。新确认契约缺失的旧壳不报成功。
- Android/iOS/Web 同步核对方法签名、主线程要求和失败回调；对 Web 保留安全上下文/激活降级，不新增另一份剪贴板业务逻辑。
- 文件：HarmonyOS Platform 模块、`native/native-platform.ts`、Worker/主线程 Platform 适配、相关两端宿主和 ProxySettingsPage/SongEditDialog 调用点。
- 验收：HarmonyOS 从两处界面复制后粘贴到系统输入框，文本一致；失败显示失败；三端方法闸门加空实现反例。

### P6b：HarmonyOS 通知歌词

- 在 SongloftAudioModule 增加 `updateNotificationLyric` 并更新 AVSession 元数据，保留歌曲/歌手/封面/时长和正常媒体控制；清空歌词时恢复原始元数据。
- 核对 `setQueue` 等当前空方法是否导致元数据来源缺失；只补完成通知歌词所需的元数据链路，不把注册存在当成功。
- facade 按方法探测旧壳，缺失时可降级且无未处理 Promise；核对 Android/iOS `inTitle` 签名差异，统一契约与真实平台能力。
- 将 HarmonyOS 纳入音频必需方法/事件/单位/非空实现的契约验证，明确 EQ 等其他占位能力的降级，避免新的假绿。
- 文件：HarmonyOS audio module、AVSessionController、`native/{audio-types,native-audio}.ts`、歌词同步和 `native-module-contract.test.ts`。
- 验收：HarmonyOS 真实媒体卡片随歌词更新，切歌/无歌词/暂停后元数据正确，无 rejected Promise；Android/iOS 通知和锁屏回归。

### P6c：iOS/HarmonyOS 恢复前台通知

- 复用 `SongloftLifecycle.resumed` 与 TS 订阅，iOS scene 恢复活跃、HarmonyOS ability 进入前台时送达根 LynxView；实例销毁移除引用，首帧初始化后事件仍可达。
- 保持 Android 既有行为；原生 WebView 插件在下一浏览器帧收到可见性通知，Lynx frame 插件通过宿主推送契约获得恢复信号（若现有通道未覆盖，补同义事件）。Web iframe 继续用浏览器可见性。
- PluginWebViewPage、常驻插件 tab 与 LynxPluginFrame 的真实消费点逐项核对；恢复后触发重连/快照由插件负责，宿主只保证通知，不侵入 MIoT 业务。
- 文件：iOS SceneDelegate/ViewController、HarmonyOS EntryAbility/Index 或共享生命周期适配、`native/app-lifecycle.ts`、插件页与 frame 分发、相关契约/E2E。
- 验收：前后台往返只推送一次，长时间后台、断网再联网时 MIoT 等插件收到恢复通知并恢复状态；关闭/切换插件后无残留监听或向已释放 frame 发消息。

## 9. 仓库、接口、兼容与回滚

- 实施仓库是 `clients/player-lynx`；Flutter 仅供参考。父仓库后端默认只读现有 API/Swagger，预计不新增路由、数据库 schema 或通用 KV 配置。
- 如果实施证明必须改后端契约，先说明变更范围；新增/改 handler 才同步 swag 注释、`make swagger` 产物，SQL/schema 才走 sqlc/goose。不能手改 data 数据库。
- 每批完成后按真实实现更新现状文档；已有中英对应的现状文档保持同步，本计划按用户要求只维护中文。历史单语参考仍按文档索引明确标注。不能用 `docs/player-lynx/` 的同步副本作为编辑源。
- 新原生方法与可选 load 字段均同步 TS、三个宿主、Web 降级/代理和契约闸门。功能按方法级能力判断，与消费点同批落地。
- 每批保持可单独撤回；P3 缓存数据升级独立版本化，保留旧文件清理路径。回退版本可能读不到新索引，不自动删除文件；文档说明恢复办法。
- 提交、推送、发布及操作 Issue 仍分别需要明确授权；本次计划审核不等于发版授权。

## 10. 验证与完成判据

各批运行有意义的模型/API/状态机/故障回归，并在该批最终代码上跑 `pnpm run typecheck`、`pnpm test`、`pnpm run build`（Lynx/Web 两产物）。Web 宿主改动再跑 `pnpm run build:web`，用 Docker Chrome 打开最终产物；发版相关批次运行 `pnpm run test:release`。

原生追加：Android 同步新 bundle 后 `./gradlew --no-daemon assembleDebug` 与对应设备 E2E；iOS 用 macOS/Xcode 真编译及设备/模拟器；HarmonyOS 用 DevEco/hvigor 或平台 CI 编译及设备验证。测试桥只用于 Debug，发布包验证必须使用关闭桥的产物。查当前环境能力后记录实际能跑的验证，不沿用旧机器日志充数。

界面验证必须同时有行为证据：音轨实际播放 URL/听感；导入后后端数据；缓存文件和真实取消；快捷键 Store/播放器状态；剪贴板实际粘贴；插件可见性事件及状态恢复。附中英、320px 窄屏/宽屏、最大字号的截图或测量。

每批报告文件、行为、测试、设备证据和未验证项，验收后更新计划勾选与交接。源码实现、编译通过、设备验收三种状态分开；必需平台未验证时批次不标完整完成，不阻止准备后续独立批次，但不发布“全平台已完成”。

## 11. 审核默认选择与交付检查表

用户已批准按以下选择实施：音轨按当前歌临时选择；更新手动检查，dev 只对比更新 dev，正式版只对比更新最新正式版，三端兼容时优先 bundle 更新、下次冷启动生效，需要新原生能力时提供本通道安装包；缓存串行、真实取消、支持本地列表/断网播放；快捷键采用上述固定映射。2026-10-06 用户进一步授权继续执行计划、分批本地提交，不 push；各批记录验证结果和环境限制后继续，无需再次询问已获准的提交。希望更改其中一项时可直接指出批次编号。

- [x] P0：订正落后于实现的文档，中文计划落盘
- [x] 用户审核计划并批准实施、分批本地提交（不 push）
- [ ] P1：音轨切换（源码与 JS/Android/Web 验证完成；HarmonyOS HAP 已编译；iOS 编译及两端设备验收开放）
- [ ] P1b（暂缓，不计本轮交付）：待具备环境后进行视频设备验收
- [x] P2 方向：用户确认 bundle 更新优先、需要原生能力时升级安装包
- [x] P2 通道：用户确认 dev 只更新 dev，正式版只更新最新正式版，对齐 Flutter
- [ ] P2a：兼容元数据、签名发布契约及更新资产（发布工具、模型和本地回归完成；壳运行时暴露在 P2b 接入，正式密钥/CI 真发版待配置）
- [ ] P2b：Android/iOS/HarmonyOS 下载器、加载器与回退（三端源码/共享 TS 已接入；Android 11 项真实 TLS/文件 JVM 回归和四项模拟器冷启动检查完成；iOS Apple CI 验证程序已接入但尚未编译执行；HarmonyOS 转译源码在 Node 适配器下的五项真实 RSA/HTTPS/文件回归通过，现另已完成 HAP 真编译；iOS 编译和两端设备验收仍开放，见 progress）
- [ ] P2c：客户端检查更新、生效交互及全链路验收（源码已接入，Android 本地签名夹具完成实际界面检查/下载/播放不中断/取消/冷启动/恢复，Web 中英最大字号及部署入口通过；HarmonyOS HAP 已编译；正式密钥、iOS 编译和两端设备验收仍开放，见 progress）
- [ ] P3a：缓存身份/索引/取消（共享 TS 与三端 v2 源码已接入；发布兼容声明 bridge 3 / schema 2 / `songCache.v2`，旧壳需安装同通道新包；Android 真实文件/HTTP 8 项、设备分音轨缓存及后端不可达冷启动播放通过；HarmonyOS 源码在 Node 文件/HTTP/TLS 适配器下 8 项通过，现另已完成 HAP 真编译；iOS Apple 核心验证程序已配置但未编译/执行，iOS 编译与两端设备验收继续，见 progress）
- [ ] P3b：批量缓存任务（共享源码已接入；273 文件 / 2960 项回归、双产物及 Android APK 编译通过；Android arm64 界面验证 235 首入队、94 完成含 36 缓存跳过、取消剩余 141 项和暂存清理；x86_64 缺 SVG 库/原生崩溃单独记录，HarmonyOS HAP 已编译；iOS 编译和两端设备验收仍开放，见 progress）
- [ ] P3c：离线管理与播放（共享源码已接入身份证明、本地列表/搜索/空间/删除/清理及独立本地队列；277 文件 / 2989 项回归和 35 项发布工具、双产物及 Android APK 编译通过；Android 实际断网播放/控制/seek/重播/冷启动、删除/分身份清理及登出隐藏通过，中英最大字号三个宽度六组通过，见 progress；HarmonyOS HAP 已编译；iOS 编译和两端设备验收仍开放）
- [x] P4：Web 导入/导出（源码与 Chrome、Firefox 134 standalone/embedded 根路径数据流程验收完成；Linux WebKit 18.2 两种部署补充回归通过；Firefox 兼容性观察与激活夹具边界见 progress，Safari 待验）
- [x] P5：Web 快捷键（源码与 Chrome 实际播放/菜单/持久化验收完成；Firefox 134 在临时 PulseAudio 空输出/128 kbps 下完成控制流程，Linux WebKit 18.2 亦完成空输出控制回归；间歇 Blob 异常、听感与 IME/插件夹具边界见 progress，真实 Safari 待验）
- [ ] P6a：HarmonyOS 剪贴板（四端确认回调与两处成功/失败反馈已接入；Android 当前包两处跨应用系统粘贴已通过；HarmonyOS HAP 已编译，其系统粘贴验收仍开放，见 progress）
- [ ] P6b：HarmonyOS 通知歌词（队列元数据、AVSession 布局/控制、旧壳降级与音频契约源码已补；HarmonyOS HAP 已编译；iOS 编译与真实卡片/锁屏验收仍开放，见 progress）
- [ ] P6c：iOS/HarmonyOS 插件恢复前台（三端生命周期/消费点与 SDK ready 已接；Android 后续修复真实插件 frame 模板加载，`9bfd35c` APK 的初始通知、五次 HOME、A/B 退出与新标识重入通过；HarmonyOS 补远程模板 fetcher，8 项实际源码 HTTP/TLS 适配器及真实 SDK clean HAP 编译通过，需安装新壳；iOS 已补双模板入口与流式下载源码、Apple 验证程序，尚未编译执行；两端 frame 设备验收、iOS 编译及 MIoT 长后台/断网重连仍开放，见 progress）

### 剩余验收条件（2026-10-07）

源码批次已落地，以下按缺少的证据安排后续验收，不能用当前包或旧设备记录勾选全部完成。

| 验收组 | 当前可用证据 | 下一步与前置条件 |
|---|---|---|
| iOS P1/P2/P3/P6 | 三端共享回归、Swift 源码与 Apple CI 核心验证程序已接入；当前包只有资源复制 | 在 macOS/Xcode 编译当前代码并执行更新器、缓存、插件模板三个原生核心验证程序，再用签名安装包验收切轨、缓存/离线、更新回退、复制和 scene/插件恢复；本机无 Xcode/swiftc |
| HarmonyOS P1/P2/P3/P6 | `1d86b77` 新 HAP 含远程模板接线与能力标记，34 个 clean 构建任务全部执行，包校验与实际源码 Node 适配器通过；HAP 未签名，尚无安装记录 | CLI 已能查询 API 13 phone 镜像 `5.0.0.112`，下载/启动需要用户明确授权接受华为协议；当前账号无 `/dev/kvm` 读写权限，模拟器运行与调试签名仍需验证。许可未确认时不下载、创建或启动实例 |
| Android P6 与跨批回归 | API 34 / 4 KB、35.6.11 / Mesa llvmpipe 环境可用；`e09592b` 两处跨应用复制、根恢复和基础播放/暂停/通知通过；修复模板加载后的 `9bfd35c` APK 完成原生 SDK 子 frame 初始、五次 HOME、A/B 退出与重入 | 继续 MIoT 长后台/断网重连、歌词布局/锁屏和跨批回归；短周期计数插件不能代替 MIoT 重连或堆内存检测，SwiftShader 宿主与 x86_64 问题仍开放 |
| P6c 插件兼容与恢复 | 父桥/SDK ready、Chrome/Firefox 保活可见性通过；Android 新 `1d86b77` APK 安装哈希确认与初始/五次 HOME/退出/重入复验通过；同源 HAP 编译和包校验通过；两端实际验签测试验证新旧模板能力快照兼容；SDK 未发布，插件 bundle 在本地重建 | iOS 已补模板入口源码，需完成编译与实际 Foundation 验证程序；两端再用新壳做 frame 设备验收与 MIoT 长后台/断网重连；旧 SDK 不解锁新增原生推送，仍需插件重建；三端加载器修复需安装新 APK/IPA/HAP；新增必需能力 `pluginFrame.templates.v1`，旧快照引导本通道安装包，不能仅更新 bundle |
| P2 正式交付与 Web 补充 | 本地签名夹具、版本/包工具通过；Chrome/Firefox/Linux WebKit 的 P4/P5 回归已记录；前端子路径已修复并通过 Chrome 两种模式插件/登录与 Linux WebKit 两种模式 P4/P5 | 正式受信密钥仍为 0，签名/CI/真实发版不在本次“不 push”的执行动作内；实际 Safari 与 Firefox 间歇 Blob 异常仍开放；目录入口需尾斜杠和隔离响应头，不用 Linux WebKit 结果替代 Safari |

原四种本地包与 SHA-256 固定在 `/tmp/lynx-local-delivery/e09592b/verification.json`，原回执未安装字段是当时快照，后续 Android 系统复制/根事件/基础播放证据见 progress。模板加载修复另提供 `/tmp/lynx-local-delivery/9bfd35c/` 的 Android APK；当前含模板能力标记的 APK/HAP 在 `/tmp/lynx-local-delivery/1d86b77/`，构建号 `213496964`，有严格包校验和新 APK 的逐项设备复验回执。旧包哈希未变，未将 Android 新证据写成全部平台通过。许可文本在 `/tmp/lynx-harmony-emulator/license-review.log`；目前只审阅，未接受。Android 的独立 KVM/Mesa 环境已经可用，但不证明 HarmonyOS 模拟器可运行或未签名 HAP 可安装。桌面、Bundle 本地模式和视频继续暂缓。

## 12. 外部契约参考

- 本地 Flutter 更新参考：`../player/lib/core/updater/channel_release_resolver.dart`、`version_compare.dart` 及 `../player/lib/features/settings/data/frontend_version_api.dart`（路径相对 Lynx 仓库根目录）；仅参考本通道解析和版本判断，Lynx bundle 格式及原生更新器仍单独实现。
- [GitHub Releases REST API](https://docs.github.com/en/rest/releases/releases)：公开发布数据、latest 与按 tag 查询、实际 asset 下载 URL；本计划不新增发布操作。
- [Lynx loadTemplate](https://lynxjs.org/api/lynx-native-api/lynx-view/load-template)：Android/iOS 加载模板，以及 HarmonyOS 的 URL、buffer、TemplateBundle 入口；三端可据此设计外部 bundle 加载，更新器仍由宿主实现。
- [MDN showPicker](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/showPicker)：浏览器文件选择需要 transient user activation，因此 Web 数据传输必须做真实用户点击验证。

具体 Lynx 页面/元素/CSS 实施前按项目技能查询对应版本官方契约；HarmonyOS Pasteboard/AVSession 按项目 API 13 目标及 ArkTS 约束核对。
