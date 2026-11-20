# 客户端更新协议

[English](../en/reference/client-updates.md) · [发版指南](../guides/releasing.md)

Android、iOS 和 HarmonyOS 的更新入口位于「关于」页。热更新需要安装带更新器和受信公钥的原生壳，下载的模板在下一次冷启动时生效。桌面使用单独签名的安装包清单，Web 提供部署包入口。平台安装和回退见[安装指南](../guides/installation.md)与[桌面验收记录](../project/desktop-implementation.md)。

## 身份与发布资产

版本源仍为 `package.json` 与共享 `.build/version.json`。`prepare-build.mjs` 另生成 `.build/native-host.json`，含安装壳身份、协议、桥接/本地 schema、三端引擎版本、必需能力与受信公钥；随同一次构建分发。编译器按同一 bundle 身份生成 `.build/bundle-host.json`，copy 脚本将其复制为壳资源 `native-host.json`；显式 release 构建拒绝与 prepare 不一致的快照。Android 从 APK assets、iOS 从 app Resources、HarmonyOS 从 rawfile 读取，热更新包不得覆盖该文件。CI 共享两份快照，安装包检查要求嵌入身份、公钥和能力与 prepare 完全一致。

`updates/native-contract.json` 是兼容契约的源文件：Android 引擎 `4.0.0`，iOS/HarmonyOS `4.0.1`；当前桥接版本 `3`、本地 schema `2`、最低壳版本 `0.1.0`。完整安装壳必须提供 `audio.sourceLoad.v1`、`audio.remoteIntent.v1`、`updater.v1`、`updater.metadata.v1`、`songCache.v2` 和 `pluginFrame.templates.v1`。桥接版本 2 新增独立系统 TLS 的元数据读取；版本 3 / schema 2 增加带身份的缓存索引与任务接口，旧文件保留，新目录与旧 ABI 隔离。旧壳检查此 bundle 时引导安装同通道新壳。新增原生能力、SDK 变化或不兼容本地数据读写时，先调整契约并升级安装包。

`audio.remoteIntent.v1` 标记三端明确转发系统播放/暂停意图，以及 Android 系统 STOP 取消直播重连（songloft-org/songloft#531）。缺少此能力的旧壳拒绝新 JS bundle，须安装完整新客户端；不能只在文档要求升级，同时仍让自动更新把新 JS 装进旧壳。宿主快照与签名清单同源生成，桥接版本/本地 schema 无需改变。详见 [验证记录](../project/issue-531.md)。

`pluginFrame.templates.v1` 标记三端原生插件模板下载/接线修复，不改变方法 ABI 或本地 schema。缺少此标记的旧不可变壳快照，检查后续 bundle 时返回 capability 不兼容并提供本通道安装包；即使某个旧测试 APK 已含加载器，也不改写它的快照来放行。先安装含该标记的新壳，再使用兼容的 bundle 热更新。iOS 源码已接入但编译/设备验收仍开放，能力声明与发布工具通过不代表全平台通过。

客户端仓库发布标准版，移动端使用 `version.json` 与 `version.json.sig`。后端仓库发布 Bundle，Bundle 移动端使用 `bundle-lynx-version.json` 与 `bundle-lynx-version.json.sig`。两处已签名的移动热更新均使用 `songloft-lynx-main.lynx.bundle`。桌面在各自仓库读取 `desktop-standard-<target>.json` 或 `desktop-bundled-<target>.json`。

下表是标准版移动端使用的发布文件。

| 文件 | 含义 |
|---|---|
| `songloft-lynx-main.lynx.bundle` | 三端共用的原生模板，最大 32 MiB |
| `version.json` | 同一版本身份、六种资产的大小/SHA-256，以及 `bundle_update` 兼容声明，最大 128 KiB |
| `version.json.sig` | 对原始 `version.json` 字节的独立签名，JSON 信封 |
| `checksums.txt` | 五种完整包、bundle、清单和签名文件的 SHA-256 |

未配置私钥时仅生成完整包，`bundle_update` 为 `null`，清理同目录残留的 bundle/签名，不发布未签名更新。私钥已配置但公钥缺失、不匹配或与 prepare 阶段的壳公钥不同，发布失败。不得临时从更新清单采纳新受信公钥。

## 签名与编码

签名算法为 **RSA PKCS#1 v1.5 + SHA-256**，密钥为 2048/3072/4096 位。公钥以 SPKI PEM 配置，构建时生成 Java/ArkTS 使用的 SPKI DER 和 iOS SecKey 使用的 PKCS#1 DER（两者均 Base64），保留 `key_bits`。`key_id` 为 SPKI DER 的 SHA-256 前 16 个十六进制字符，无需另配。原生实现需对原始 UTF-8 字节验签，不能 parse 后重新序列化再验。

信封字段为 `{protocol: 1, key_id, algorithm: "rsa-pkcs1v15-sha256", signature}`，其中 `signature` 是标准 Base64。未知协议/算法/keyId、篡改原始字节或无效签名均拒绝热更新。`checksums.txt` 用于下载校验，不能替代签名。

`updates/fixtures/signature-v1.json` 是三端共用的公开正反验证向量，包含原始清单、签名、公钥和带中文的测试 payload；生成它的临时私钥已丢弃，不能用于真实发布。Node/Java 验证通过；iOS/HarmonyOS 尚需 P2b 的宿主编译及实际向量验证。

算法映射依据：[Java Signature](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/security/Signature.html)、[Apple SecKeyAlgorithm](https://developer.apple.com/documentation/security/seckeyalgorithm/rsasignaturemessagepkcs1v15sha256)、[HarmonyOS RSA PKCS1 验签](https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V13/crypto-rsa-sign-sig-verify-pkcs1-by-segment-V13)。

## 兼容与资源约束

`bundle_update` 包含协议、`bundle_id`、资产名/大小/hash、本地 schema 和 `targets`。bundle 身份为 `<channel>-<build_number>-<git_commit>`。每个 target 包含平台、准确引擎版本、最低壳版本、桥接版本的上下界和必需能力；不兼容时提供本通道完整包。

TS 的 `bundleCompatibility()` 仅用于界面展示，**不能授权加载**。原生 prepare 必须重新验签、校验兼容和下载 hash，保持壳通道、身份与信任列表独立于 JS bundle。P2c 只允许 dev 查询 `/releases/tags/dev`，正式版查询 `/releases/latest`；preview 不混入这两个通道。

当前原生构建目录只有 `main.lynx.bundle`，Web 产物在独立 `web/` 子目录；图标使用内联 SVG，没有原生外部构建资源。发布时发现其他原生拆包/资源文件即拒绝热更新包，必须先把它们加入受签名保护的资源协议。业务服务器图片/插件数据不是客户端构建资产。首版不下载/解压资源归档；资产名不允许路径分隔符，固定 bundle 文件名。

## 三端冷启动与回退（P2b）

`SongloftUpdate` 的 Callback 读取为 `getInfo/getState/inspectManifest/fetchMetadata`；`download(requestJson, callback)` 和 `restoreBuiltin(callback)` 在持久化完成后回调。取消、启动确认和启动失败报告为 void 命令。TS facade 逐方法检测旧壳，读取 15 秒、下载 240 秒超时；下载超时取消同一 task，晚到 Callback 不再提交结果。旧壳原有八方法可继续读取状态/确认启动，缺少第九个 `fetchMetadata` 时禁用原生更新检查并提供本通道发版页。Web 无此原生模块，使用浏览器证书验证和完整部署包入口。

Android 在 `filesDir/bundle_updates` 保存签名清单和 bundle，流式下载先写独立临时目录，验签、兼容及完整大小/hash 通过后原子提交 `pending`；取消实际 HTTP Call 并清理临时文件。下载使用独立系统 TLS，禁止 HTTP、HTTPS 降级跳转和带 token 的初始 URL，不继承歌曲服务器的忽略证书设置。下载前检查剩余空间，最大 32 MiB；后续提交/启动清理未引用候选。

iOS 在 Application Support 的 `bundle_updates` 保存相同状态，目录排除 iCloud 备份；SecKey 对原始字节验签，CryptoKit 流式计算文件 SHA-256。独立临时 URLSession 使用系统 TLS，逐跳限制 HTTPS，流式写入和大小检查，取消真实任务；文件同步后原子替换状态。根模板 provider 与 fatal Lynx lifecycle 回调接入试运行/失败报告，120 秒确认窗口使用单调时钟。该实现已接入 Xcode 源文件及资源列表；Apple CI 将直接编译并运行 `scripts/verify-ios-updater.swift`，不能把此 CI 配置当作已经执行通过。

HarmonyOS 在 `filesDir/bundle_updates` 保存签名文件和相同指针，通过 CryptoFramework 的 RSA PKCS1/SHA256 验签及流式文件 hash。独立 Remote Communication Kit 会话明确使用系统 CA、关闭自动重定向，逐跳验证 HTTPS 后手动跟随；流式落盘、实际请求取消、剩余空间与 180 秒总传输期限均已接入。Index 根加载链选择候选并检查 TemplateBundle 解析错误，失败可直接加载内置模板，同时保留未确认 trial 供下次启动回退；LynxViewClient 上报 fatal 错误，120 秒确认以系统 uptime 判断。相关接口依据 [RCP API 12 文档](https://developer.huawei.com/consumer/en/doc/harmonyos-references-V5/remote-communication-rcp-V5) 和 [Lynx 4.0.1 生命周期源码](https://github.com/lynx-family/lynx/blob/4.0.1/platform/harmony/lynx_harmony/src/main/ets/tasm/LynxViewClient.ets)。

更新只影响下次冷启动，当前播放与根视图不替换。加载器仅处理应用根模板，不拦截插件 frame；每次冷启动重新验证磁盘清单、签名、兼容和 hash，保留已确认版本及其前一版本，并可回到 APK 内置 bundle。新壳安装后重新检查兼容及新旧，旧热更新不能覆盖新安装包。

试运行指针先持久化再加载；真实路由挂载且认证/重定向启动屏结束后，TS 等待 1.5 秒再按 bundleId 确认，原生确认窗口为 120 秒。渲染边界错误、原生致命加载错误或崩溃导致未确认，下次冷启动回到此前确认包或内置包。认证业务错误不等于 JS 启动失败。恢复内置也在下次冷启动生效。

原生下载器重新执行同通道新版本规则：正式版本严格递增；已知 dev commit 不同才可准备，缺失 commit 时构建时间至少更新 10 分钟。签名/hash 失败、空间不足、取消等错误不提交 `pending`。

## 检查通道与交互

关于页的「客户端更新」独立于后端升级，分别展示不可变壳与当前 bundle。默认只手动检查；开启「自动检查更新」后自动检查并下载兼容的新 bundle。下载不替换正在运行的根视图，准备完成提示下次冷启动生效。下载任务跨页面保留，进度按 taskId 隔离，取消等待原生终止。恢复内置需再次点击确认，也只在下次冷启动生效。

- dev 仅 GET `releases/tags/dev`，正式仅 GET `releases/latest`；拒绝草稿、跨通道清单、正式预发布及异常资产 URL，不查历史或另一通道。bundle 和安装包共用同一候选。
- 有效 dev commit 相同不更新、不同更新；缺失 commit 时才比较构建时间，至少晚 10 分钟才更新。正式按数字语义版本严格递增，元数据不足显示无法确定并提供本通道发版页，不猜测已经最新或引导安装较旧资产。
- 公共 Release 数据缓存 60 秒、同通道/代理并发去重；显式检查绕过缓存。dev 读取前后核对 Release 及资产修订，变化时重查一次；验签失败也最多重查一次 dev，仍失败仅提供安装包/发版页。
- 元数据请求不经过业务 HttpClient，也不带 Songloft token、Authorization 或 Cookie。三端独立系统 TLS、最多八次经验证的 HTTPS 跳转、12 秒网络总期限、流式大小限制：API 512 KiB、清单 128 KiB、签名 8 KiB。Web 使用浏览器 TLS 和无凭据有界 fetch。
- 代理按既有 GitHub HTTPS 前缀约定分别包装 API 与下载 URL，不包含凭据/查询参数；代理网络失败仅回退同一 URL 的直连。下载时仍由壳验签与检查 hash，不因代理放宽安全要求。
- Android/HarmonyOS 提供 APK/HAP，iOS 提醒 IPA 需要重签；Web 提供对应 standalone/embedded 部署包及部署后刷新说明，不能用原生 bundle 更新 Web 主线程宿主。
- 客户端 Release 说明与后端更新 changelog 共用 GitHub Flavored Markdown 组件，显示标题、段落、列表（含任务列表）、引用、分隔线、粗体/斜体/删除线、代码和表格；表格可横向滚动。HTTP/HTTPS 链接通过宿主打开，其他链接保留文字；图片显示替代文字，HTML 按字面文本显示。客户端保持 16000 字符上限，后端说明完整显示，解析失败回退纯文本。解析仅在后台线程执行，避免 Markdown 正则进入 Lynx 主线程字节码编译；解析前按需补齐 Android PrimJS 缺失的 `Array.prototype.at` 和 `Object.hasOwn`，已有实现保持不变。

Release 正文中的 GitHub emoji 短码（如 `:sparkles:`、`:bug:`）按 `gemoji` 名称表转换为 Unicode emoji，客户端和后端更新说明共用此行为。标题、正文、强调、表格与链接文字支持转换；行内 / 围栏代码、转义短码、自动链接和链接目标地址保留原文，未知名称保持可读。实际字形由宿主系统字体提供。

## 自动检查与下载

跨平台说明（2026-10-13）：Markdown 兼容补齐没有平台分支；iOS 与鸿蒙发版复用同一原生 bundle，Web 也包含该解析器。iOS 默认后台运行时为 JavaScriptCore，项目最低版本为 iOS 15.0；`at` / `hasOwn` 在 [iOS 15.4 的 WebKit](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/) 才加入，旧系统存在缺失风险。鸿蒙依赖 PrimJS 4.0.0，与本批 Android 验证的版本一致，因此需保留相同兼容处理。Chromium 121、Firefox 134、WebKit 18.2 的完整关于页与真实 Worker 缺失 API 场景已验证；客户端/后端 Markdown、双语表格与横向滚动正常。iOS 与鸿蒙原生设备未验证，Linux WebKit 结果不能替代 iOS 原生验收。

开关默认关闭，保存在设备本地 `SongloftStorage.prefs` 的 `client_automatic_update` 中，与账号、服务器无关。Android/iOS/HarmonyOS 共用调度；Web 不显示开关，缺少安全元数据能力的旧壳禁用开关。沿用原生验签、完整兼容契约和下载哈希校验，不兼容的新版本仅在关于页提供安装包入口。

- 开启立即检查；冷启动在真实页面显示后异步检查，自动启动检查至少间隔 10 分钟，手动检查不受限制。正在试运行的新 bundle 确认启动后才允许继续自动更新。
- App 运行期间每 6 小时检查，回到前台时补查到期任务。系统挂起或关闭后不保证定时执行，不增加 OS 后台任务；下次启动/恢复时补查。下载不会中断播放，不主动刷新根视图或重启；冷启动加载仍由原生宿主负责。
- 手动与自动检查共用整个检查任务及结果，下载共用独占任务和关于页进度；已有待生效包时不替换，等待冷启动。后端不可用时检查公共 GitHub 发布仍可直连，元数据不带业务凭据。
- 网络/下载失败按 30 分钟、2 小时、6 小时退避，时间保存在本地，重启不会绕过退避。失败和兼容状态留在关于页，不自动弹窗。
- 关闭停止调度并取消自动下载，不取消手动下载；已准备好的包仍在下次冷启动生效。取消某个下载后，自动任务跳过该 bundle ID + SHA-256，手动可重试，新身份或修正后的哈希可自动更新。
- 下载前持久化包身份；下次启动结合原生回退状态跳过失败包，防止反复自动安装。原生 pending 状态优先于下载超时结果。恢复内置时同时关闭自动更新，避免恢复后立即重新下载。
- 偏好读取有 5 秒上限，损坏/缺失默认关闭；保存串行化，晚到读取不能覆盖用户选择。调度不依赖关于页是否打开，路由变化不会创建重复定时器。

## 当前验证与开放项

协议回归覆盖五包齐全、签名/key 匹配、原始字节篡改、大小限制、外部文件遗漏、调试包拒绝、旧发布无签名降级、不可变壳信息一致性及平台/引擎/桥接/schema/能力不匹配。[Lynx dev CI](https://github.com/songloft-org/songloft-player-lynx/actions/runs/44829503122)已发布标准版。后端 Bundle 的构建和发布单独验收。

Lynx dev CI 已通过 iOS 编译与 IPA 检查，设备下载与回退仍待验证。早期 HarmonyOS 验证用转译的宿主源码执行六项核心回归，并编译了未签名 HAP。Android 界面验证使用 Debug 壳、临时公钥与本地 HTTPS 发布夹具。验证环境和结果见[项目进展记录](../project/progress.md)。
