# 设备歌曲缓存

[English](../en/reference/device-cache.md) · [原生模块](native-modules.md)

P3a 三端源码已增加 v2 身份、索引与任务契约，共享播放/单曲入口优先采用新契约；Android 有编译和设备证据，HarmonyOS 已通过 clean release HAP 编译，iOS 编译及两端设备验收仍开放。发布兼容声明为 bridge 3 / schema 2，要求 `songCache.v2`，旧壳应升级本通道安装包。P3b 已接入批量入口和任务页；P3c 已接入本地列表、管理和登录失效后的离线入口。三端完整设备验收仍开放。

## 身份与文件

- namespace 为 `[profileId 或 default, 标准化服务器地址（含部署路径）, username]` 的 JSON 字符串。地址规范化协议、主机与默认端口，保留路径大小写；拒绝凭据、查询参数和片段。服务器档案与用户名在恢复播放前读取，冷启动不因服务器不可达而自动切换到别的档案。
- 切换服务器时用户名绑定到保存的 token，不使用可编辑的登录预填用户名推测身份。旧档案若没有可证明的 token 用户名，远端会话仍可使用，但 v2 缓存需重新登录获得身份；不把其他用户文件归给当前会话。
- key 为 `[namespace, songId, track 或 default, quality, normalize, revision, 实际格式]` 的 JSON 字符串；文件目录使用 namespace/key 原始 UTF-8 的 SHA-256，不包含 token。音轨是后端 audio-relative index，不能用面板数组下标。
- 下载时冻结服务器/用户、源 URL、音轨、音质、归一化和歌曲快照。URL 只在当前请求内使用，快照只保存 id、type、title、artist、album、duration、isVideo、format、updatedAt。native 再次白名单筛选，丢弃 URL、文件路径及多余字段。
- 显式传 `normalize=0/1`，避免服务端默认开关改变已冻结变体。指定音轨时后端 AAC 抽轨为 M4A，其他编码为 MP3，覆盖请求 format/quality；native 依据响应媒体类型订正实际扩展名，并记入 key。匹配播放时比较前六项，实际容器由本地条目给出。
- 新文件在 `song_cache/staging/<taskId>/` 流式写入，完整媒体与 `entry.json` 一起原子移动到 `song_cache/v2/<namespaceHash>/<keyHash>/`。只有成功提交的条目可枚举/播放；启动核对文件大小和元数据，清理临时文件，将 waiting/downloading 任务标为 interrupted。
- 旧 `{songId}.{ext}` 无法证明属于哪个服务器，不自动归属或复用给 v2 身份，也不自动删除；计入设备媒体容量，保留独立旧缓存清理入口。退回旧 bundle 时新目录保留，旧 ABI 不将新文件认作 songId 缓存。

## v2 Callback 契约

模块仍名为 `SongloftSongCache`。旧五方法 ABI 保留；新九方法均为 Callback JSON，只有 `cancelTask` 是 fire-and-forget。TS 同时检查方法集合与 `getCacheContract` 的版本 `2`，没有新契约的壳沿用原单曲入口。

| 方法 | 参数 | 结果 |
|---|---|---|
| `getCacheContract` | callback | `{version: 2}` |
| `cacheEntry` | JSON `{task_id, namespace, key, snapshot, url, max_bytes}`、callback | 完整条目或 `{error}` |
| `getEntry` | JSON `{namespace, key}` 或 `{namespace, song_id}`、callback | `{cached:false}` 或完整条目 |
| `listEntries` | JSON `{namespace, offset?, limit?}`、callback | `{entries,total,bytes,legacy_bytes}`，limit 1–200 |
| `removeEntry` | JSON `{namespace,key}` 或 `{namespace,song_id}`、callback | `{}` 或 `{error}` |
| `clearNamespace` | JSON `{namespace}`、callback | `{}` 或 `{error}` |
| `clearLegacy` | callback | `{}` 或 `{error}` |
| `getTasks` | callback | `{tasks:[...]}` |
| `cancelTask` | taskId | void |

完整条目为 `{namespace,key,cached:true,url,sizeBytes,createdAt,snapshot,available?}`，私有目录的 url 是系统编码的 `file://` URL；Android 目录扩展允许受信的 SAF `content://` URL。`available:false` 保留不可用目录的索引，播放前仍须重新核对。`songCacheProgress` 数组事件传 `{task_id,namespace,key,status,bytes,total,error}`，total 为 0 时表示未知长度，不表示下载失败。

Android 音频引擎使用 Media3 `DefaultDataSource` 分派本地文件与网络地址，保留原 HTTP 配置；仅使用 HTTP 数据源无法播放命中的 `file://` 缓存。

HarmonyOS 源码将系统文件 URI 用 `fileIo.openSync` 打开后，以 `fd://` 交给 AVPlayer；在 reset 完成后换源并关闭旧描述符，release 完成后释放最后一个描述符。Node 回归使用真实带空格/中文文件，验证句柄交接、换源和失败释放；不是实际设备解码结果。

三端使用进程级串行写入调度，新/旧入口共用容量检查，最多 32 个运行或排队任务；持久任务记录最多保留 128 条。单曲失败可继续后续任务；未知长度流逐块检查字节和磁盘空间。Android 取消真实 OkHttp call；iOS 源码用独立 URLSessionDataDelegate 边接收边写文件、逐块限额并取消真实 task。HarmonyOS 源码用 RCP 响应头/数据回调与真实 request 取消，限制重定向次数，使用 statfs 检查剩余空间；收紧 TLS 策略时取消当前连接。排队取消不打开连接；只有清理完成和终态记录完成后才回 Callback。切服务器/用户/登出取消所属进行中任务，已完成文件保留。

机器错误包括 `limit_exceeded`、`insufficient_space`、`cancelled`、`interrupted`、`cache_queue_full`、`cache_busy`、`invalid_cache_request`、`cache_storage_unavailable`、`download_failed`、`unsupported_media`。JS 超时会取消同 taskId，并忽略迟到结果。设备媒体下载沿用用户的服务器 TLS 策略，与独立系统 TLS 的客户端更新下载器区分。

## Android 缓存目录（songloft-org/songloft#510）

“设置 → 设备缓存”提供选择本机/SD 卡目录、重新授权和恢复默认目录。默认仍是应用私有目录；设置按设备保存，只改变之后新增缓存的位置。已有缓存需另行确认“迁移当前账号缓存”，按当前服务器档案、部署路径与用户的 namespace 迁移全部变体，不移动其他账号或旧无身份缓存。

可选扩展由 `cache-directory.ts` 探测 `getStorageContract(callback)` 返回 `{version:1}`，通过 `storageCommand(JSON, callback)` 执行：

| command | 参数 | 结果 |
|---|---|---|
| `getDirectory` | 无 | `{tree,label,available,busy}`；默认 tree/label 为 null |
| `pickDirectory` | 无 | 系统选择并持久授权后 `{saved:true}`；取消 `{cancelled:true}` |
| `setDirectory` | `{tree:null,label:null}` | 恢复默认后 `{saved:true}` |
| `migrate` | `{task_id,namespace}` | `{done,total}` 或 `{error,done,total}` |

只有方法完整且扩展版本为 1 的壳才向 v2 缓存请求附加 `storage_version:1`。旧 Android 壳显示升级说明；iOS/HarmonyOS/Web 沿用既有私有目录功能。扩展不增加必需热更新能力、不改 bridge/schema 版本；旧 bundle 在新壳仍只读写私有 v2 缓存。SAF 仅接受 Android 外部存储提供者的本地目录，系统限制的卷根目录、Download 根目录及 Android/data 等目录不能选取，云盘不作为离线缓存目录。

公共目录只写可读的“歌手 - 标题 - 歌曲 ID - 变体哈希.实际扩展名”媒体文件，原始 namespace/key、快照及文档 URI 保留在私有 `song_cache/public-v1/<namespaceHash>/<keyHash>.json`；目录选择保存在 `song_cache/storage.json`。公共索引与 v2 私有媒体目录分开，旧壳启动/clearAll 不会把公共记录当损坏私有文件删除。移除变体/清理当前账号只处理索引记录对应的文档，也清理旧 bundle 写出的同 key 私有副本；不扫描或删除用户目录里的其他文件。

迁移复用串行写入调度，下载进行中拒绝换目录/迁移。迁移前停止当前缓存播放、移除当前账号离线队列；逐文件核对源可用性和复制字节数，提交新私有索引后才删除原文件。进度事件 `songCacheMigrationProgress` 的数组参数为 JSON 字符串 `{task_id,namespace,done,total}`，复用 `cancelTask(taskId)` 取消。失败/取消保留已完成的迁移，未提交文件保留原件，清理当前复制出的临时文档；界面重新读取索引。离开页面、切换账号或超时取消自身迁移并忽略迟到回调。授权失效、卷卸载时不自动丢弃公共索引；重新授权或挂载后可再次使用。Media3 `DefaultDataSource` 接收 `content://`，离线播放无需远端详情/收藏请求。

迁移提交的新记录携带私有 `pending_cleanup` 原位置，原件删除及收尾索引写入均成功后才移除此字段。删除失败或收尾元数据写入失败时，两处容量继续计入，重启后重试迁移只完成收尾，不重复复制；移除变体/清理账号也会处理待清理原件。新副本失效时禁止自动删除尚存原件，并可从可用原件本地播放。恢复默认采用完整临时目录替换旧 bundle 写出的同 key 私有副本，提交失败保留原媒体。该内部字段不进入 Callback、歌曲快照或任务历史。

## 批量入口与任务页

曲库和歌单的多选工具栏提供“缓存到设备”，歌单菜单提供“缓存整个歌单”。整歌单独立按位置分页读取，忽略页面搜索条件和已加载页数，兼容服务器限制每页数量；读取期间总数变化则要求重试，最多 10000 首。电台/直播不入队，含视频的集合复用大文件确认。

`/settings/cache-tasks` 显示六种任务状态、完成数、已缓存跳过和已下载字节（未知总长单独显示）。共享 JS 调度器逐首提交到原生串行队列；按前六项变体身份去重，相同缓存跳过。单曲准备/下载失败保留机器原因并继续，容量/可用空间不足暂停后续任务。支持取消当前、取消剩余和重试失败/中断/容量暂停项；取消不会被重试入口重新加入，完成项也不重复下载。

音轨/音质/归一化在点击时固定；歌曲快照、地址和 token 在下载准备完成时固定。音轨接口可能刷新登录 token，整批使用刷新后的值，后续播放切换不改任务参数。重试重新读取当前歌曲修订/登录 token/容量限制，保留原变体参数。切身份取消原任务、清空视图，迟到结果不能进入新身份视图。

任务历史按 namespace 保存到 `device_cache_batch_v1:<namespace>`，仅持久化九字段歌曲快照、变体 key、机器错误与进度；URL/token 只在内存里，不写入任务历史。进度写入合并，重启未完成项显示中断，不自动下载；前台恢复重新读取宿主进度。后台能否继续由系统决定，界面不承诺持续下载。旧壳不展示新入口，直接进入任务页给出安装新版客户端的说明。

## 离线列表与播放

Settings 的“设备缓存”进入 `/device-cache`，只枚举当前服务器档案、部署路径和用户的 v2 索引，不请求远端曲库。支持标题/歌手/专辑搜索、缓存变体数量与当前账号占用、全设备及旧文件占用、单变体删除、当前账号清理和独立旧文件清理。页头随列表滚动，大字号下仍能到达歌曲和操作；删除均需确认，删除当前播放项先停止音频并清空队列，其他队列项删除后调整索引。

成功登录保存 `device_cache_actor_v1:<profile>` 身份证明。登录 token 过期会清除全局及档案 token，但保留这个证明；登录页提供仅访问该身份缓存的入口，服务端路由仍要求登录。显式退出登录撤销证明并清除播放队列，保留完成的媒体文件；重新登录同一身份才能再次查看。服务器不可达的冷启动不会自动切换身份，可编辑的预填用户名不能建立离线证明。

点击缓存变体时，只从白名单快照构造本地音频队列；同歌曲多个变体优先使用所点击的版本，其余歌曲各取一个版本。精确 key 必须保留原生原始 JSON 字节（Android 会转义斜杠），校验时比较解码字段，不能用重新序列化的 key 查找哈希目录。播放直接读取文件，缺文件或身份不匹配立即报本地不可用，不进入远端重试。暂停、进度、上一首/下一首、EQ 和睡眠计时沿用播放器；不请求远端详情、收藏、播放历史或音轨，不启动下一曲网络预取。未保存的封面/歌词用占位，缓存页不提供视频或 DLNA 播放。

离线队列独立保存为 `device_cache_playback_queue_v1`，仅含歌曲快照、精确身份、位置和索引，不保存媒体 URL/token。冷启动核对当前身份及真实文件；写入/清理串行，旧写入不能在登出后恢复队列。旧 bundle 忽略独立键，回退后看到空远端队列而不会把本地快照误作网络源；原生 bridge/schema 本批不变。

## 验证边界

Android 目录扩展的 JVM 回归使用真实文件/HTTP 和文档存储适配器，覆盖当前 namespace 迁移/恢复默认、失败/取消/索引提交失败保护、卷不可用与重启、只清索引文件、旧 bundle 私有副本及下载互斥。共享 UI 回归覆盖目录标签、取消、旧壳降级、迁移确认/进度、离开页面与身份切换；离线回归验证 content URI 直接交给音频而不请求远端。适配器不是实际 DocumentsProvider，SAF 系统选择、持久授权、真机/SD 卡挂载和第三方播放器发现仍待设备验证；当前无 adb 设备，模拟器启动因用户无 KVM 权限失败。本批无 iOS/HarmonyOS 目录扩展。

Android 真实文件/HTTP 回归覆盖跨身份同 id、音轨和实际格式、无凭据快照、总容量、真实连接取消、排队取消、崩溃中断、缺文件、分身份/旧缓存清理；共享 Callback 和版本降级另有 JS 测试。iOS 新增 `scripts/verify-ios-cache.swift` 与真实本地 HTTP 夹具，并接入 Apple CI；当前 Linux 缺少 Swift/Xcode，程序尚未编译或执行。HarmonyOS 实际转译源码在 Node 文件/HTTP/TLS 适配器下测试身份/容量、取消/队列、媒体响应、重启清理及 TLS 切换；另已使用 SDK `26.0.0.105` 对 `e09592b` 完成 ArkTS 和 clean release HAP 编译，最低兼容声明保留 API 13，包未签名。Node 适配器和高版本 SDK 编译不能证明 API 13 设备行为；iOS 编译、两端 TLS/取消/后台及设备验收、批量与完整离线交互仍开放。详细计数及设备证据见 [progress](../project/progress.md)。

实现参考：[Apple URLSessionDataDelegate](https://developer.apple.com/documentation/foundation/urlsessiondatadelegate)、[FileHandle](https://developer.apple.com/documentation/foundation/filehandle)、[Huawei RCP](https://developer.huawei.com/consumer/en/doc/harmonyos-references-V5/remote-communication-rcp-V5)、[OpenHarmony statfs](https://github.com/openharmony/docs/blob/OpenHarmony-5.0.0-Release/en/application-dev/reference/apis-core-file-kit/js-apis-file-statvfs.md)、[AVPlayer](https://github.com/openharmony/docs/blob/OpenHarmony-5.0.0-Release/en/application-dev/reference/apis-media-kit/js-apis-media.md#avplayer9)。
