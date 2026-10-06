# 设备歌曲缓存

[English](../en/reference/device-cache.md) · [原生模块](native-modules.md)

P3a 三端源码已增加 v2 身份、索引与任务契约，共享播放/单曲入口优先采用新契约；Android 有编译和设备证据，iOS/HarmonyOS 尚未编译/设备验证。发布兼容声明为 bridge 3 / schema 2，要求 `songCache.v2`，旧壳应升级本通道安装包。批量任务页面、离线列表与登录失效后的本地入口由 P3b/P3c 接续，当前不能把索引基础写成完整离线功能。

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

完整条目为 `{namespace,key,cached:true,url,sizeBytes,createdAt,snapshot}`，url 是系统编码的 `file://` URL。`songCacheProgress` 数组事件传 `{task_id,namespace,key,status,bytes,total,error}`，total 为 0 时表示未知长度，不表示下载失败。

Android 音频引擎使用 Media3 `DefaultDataSource` 分派本地文件与网络地址，保留原 HTTP 配置；仅使用 HTTP 数据源无法播放命中的 `file://` 缓存。

HarmonyOS 源码将系统文件 URI 用 `fileIo.openSync` 打开后，以 `fd://` 交给 AVPlayer；在 reset 完成后换源并关闭旧描述符，release 完成后释放最后一个描述符。Node 回归使用真实带空格/中文文件，验证句柄交接、换源和失败释放；不是实际设备解码结果。

三端使用进程级串行写入调度，新/旧入口共用容量检查，最多 32 个运行或排队任务；持久任务记录最多保留 128 条。单曲失败可继续后续任务；未知长度流逐块检查字节和磁盘空间。Android 取消真实 OkHttp call；iOS 源码用独立 URLSessionDataDelegate 边接收边写文件、逐块限额并取消真实 task。HarmonyOS 源码用 RCP 响应头/数据回调与真实 request 取消，限制重定向次数，使用 statfs 检查剩余空间；收紧 TLS 策略时取消当前连接。排队取消不打开连接；只有清理完成和终态记录完成后才回 Callback。切服务器/用户/登出取消所属进行中任务，已完成文件保留。

机器错误包括 `limit_exceeded`、`insufficient_space`、`cancelled`、`interrupted`、`cache_queue_full`、`cache_busy`、`invalid_cache_request`、`cache_storage_unavailable`、`download_failed`、`unsupported_media`。JS 超时会取消同 taskId，并忽略迟到结果。设备媒体下载沿用用户的服务器 TLS 策略，与独立系统 TLS 的客户端更新下载器区分。

## 验证边界

Android 真实文件/HTTP 回归覆盖跨身份同 id、音轨和实际格式、无凭据快照、总容量、真实连接取消、排队取消、崩溃中断、缺文件、分身份/旧缓存清理；共享 Callback 和版本降级另有 JS 测试。iOS 新增 `scripts/verify-ios-cache.swift` 与真实本地 HTTP 夹具，并接入 Apple CI；当前 Linux 缺少 Swift/Xcode，程序尚未编译或执行。HarmonyOS 实际转译源码在 Node 文件/HTTP/TLS 适配器下测试身份/容量、取消/队列、媒体响应、重启清理及 TLS 切换；不能替代 ArkTS 类型检查、HAP 编译或 SDK/设备行为。两端编译、TLS/取消/后台及设备验收、批量与完整离线交互仍开放。详细计数及设备证据见 [progress](../project/progress.md)。

实现参考：[Apple URLSessionDataDelegate](https://developer.apple.com/documentation/foundation/urlsessiondatadelegate)、[FileHandle](https://developer.apple.com/documentation/foundation/filehandle)、[Huawei RCP](https://developer.huawei.com/consumer/en/doc/harmonyos-references-V5/remote-communication-rcp-V5)、[OpenHarmony statfs](https://github.com/openharmony/docs/blob/OpenHarmony-5.0.0-Release/en/application-dev/reference/apis-core-file-kit/js-apis-file-statvfs.md)、[AVPlayer](https://github.com/openharmony/docs/blob/OpenHarmony-5.0.0-Release/en/application-dev/reference/apis-media-kit/js-apis-media.md#avplayer9)。
