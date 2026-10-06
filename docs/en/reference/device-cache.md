# On-device song cache

[中文](../../reference/device-cache.md) · [Native module reference](../../reference/native-modules.md)

P3a sources on all three hosts have the v2 identity, index and task contract; shared playback and single-song actions prefer it. Android has compilation/device evidence; iOS/HarmonyOS are not yet compiled/device-verified. Release compatibility now declares bridge 3 / schema 2 and requires `songCache.v2`; older shells need a full package from their own channel. Batch task UI, the offline list and local access after authentication expiry follow in P3b/P3c. The index foundation does not constitute complete offline support.

## Identity and files

- A namespace is the JSON string `[profileId or default, normalized server address including deployment path, username]`. Normalization covers scheme, hostname and default port while preserving path case; credentials, queries and fragments are rejected. Profile and username are restored before playback, without switching to a reachable alternative server on cold start.
- When switching servers, bind the username to the saved token independently of editable login-prefill fields. Legacy profiles without a proven token username can still use their remote session, but require login before accessing v2 cache identity; never assign another user's files to that session.
- A key is the JSON string `[namespace, songId, track or default, quality, normalize, revision, actual format]`. Directory names use SHA-256 of the original namespace/key UTF-8, never a token. Track means the backend audio-relative index, not a UI array position.
- Downloads freeze server/user, URL, track, quality, normalization and song snapshot. The URL is transient. Snapshots contain only id, type, title, artist, album, duration, isVideo, format and updatedAt. Native code applies its own whitelist and drops URLs, filesystem paths and extra fields.
- Explicit `normalize=0/1` prevents backend defaults from changing a frozen variant. Track extraction overrides requested format/quality: AAC produces M4A and other codecs produce MP3. Native code adjusts the actual extension from the media response type and records it in the key. Playback matches the first six fields; the local entry supplies its actual container.
- Files stream to `song_cache/staging/<taskId>/`. Complete media and `entry.json` move atomically to `song_cache/v2/<namespaceHash>/<keyHash>/`. Only committed entries can be listed/played. Startup checks metadata and file size, cleans temporary files and marks waiting/downloading tasks as interrupted.
- Legacy `{songId}.{ext}` files have no provable server identity. They are neither reassigned/reused for v2 identities nor automatically deleted. They count toward device media capacity and have a separate cleanup entry. Rolling back to an older bundle preserves the new directories; the legacy ABI does not interpret them as songId caches.

## v2 Callback contract

The module remains `SongloftSongCache`. Its original five-method ABI is preserved. The nine additions use JSON callbacks except fire-and-forget `cancelTask`. TS checks both the method set and version `2` from `getCacheContract`; older shells retain the original single-song entry.

| Method | Arguments | Result |
|---|---|---|
| `getCacheContract` | callback | `{version: 2}` |
| `cacheEntry` | JSON `{task_id, namespace, key, snapshot, url, max_bytes}`, callback | Complete entry or `{error}` |
| `getEntry` | JSON `{namespace, key}` or `{namespace, song_id}`, callback | `{cached:false}` or complete entry |
| `listEntries` | JSON `{namespace, offset?, limit?}`, callback | `{entries,total,bytes,legacy_bytes}`, limit 1–200 |
| `removeEntry` | JSON `{namespace,key}` or `{namespace,song_id}`, callback | `{}` or `{error}` |
| `clearNamespace` | JSON `{namespace}`, callback | `{}` or `{error}` |
| `clearLegacy` | callback | `{}` or `{error}` |
| `getTasks` | callback | `{tasks:[...]}` |
| `cancelTask` | taskId | void |

A complete entry is `{namespace,key,cached:true,url,sizeBytes,createdAt,snapshot}` with a system-encoded `file://` URL. The `songCacheProgress` array event carries `{task_id,namespace,key,status,bytes,total,error}`; total 0 means unknown length, not failure.

The Android audio engine uses Media3 `DefaultDataSource` to dispatch local files and remote URLs, preserving the existing HTTP configuration. An HTTP-only data source cannot play a matched `file://` cache.

HarmonyOS source opens the system file URI with `fileIo.openSync` and supplies `fd://` to AVPlayer. Source changes close the previous descriptor after reset, and release completion closes the last descriptor. A Node regression uses real files containing spaces/CJK to check descriptor handoff, replacement and failure cleanup; this is not device decoding evidence.

All three hosts use one process-wide serial writer and shared capacity checks across new/legacy entries, with at most 32 running or queued tasks and 128 retained task records. A failed song does not block later tasks. Unknown-length streams check capacity and disk space per chunk. Android cancellation terminates the actual OkHttp call. iOS source streams through a dedicated URLSessionDataDelegate, checking capacity per chunk and cancelling the real task. HarmonyOS source uses RCP header/data callbacks with real request cancellation, bounded redirects, statfs free-space checks and active-session cancellation when TLS policy changes. Queued cancellation opens no connection. Callbacks follow cleanup and terminal task recording. Server/user changes or logout cancel owned in-flight tasks while preserving completed files.

Machine errors include `limit_exceeded`, `insufficient_space`, `cancelled`, `interrupted`, `cache_queue_full`, `cache_busy`, `invalid_cache_request`, `cache_storage_unavailable`, `download_failed` and `unsupported_media`. JS timeouts cancel the same task and ignore late results. Media downloads use the user's server TLS policy, separately from the client updater's dedicated system TLS.

## Validation boundary

Android real-file/HTTP regressions cover same IDs across identities, tracks/actual format, credential-free snapshots, total capacity, connection/queued cancellation, interrupted startup, missing files and namespace/legacy cleanup. JS tests separately exercise callbacks and version downgrade. iOS adds `scripts/verify-ios-cache.swift` and a real loopback HTTP fixture to Apple CI. Linux lacks Swift/Xcode: the verifier has not been compiled or executed. HarmonyOS transpiled source is tested against real Node filesystem/HTTP/TLS adapters for identity/capacity, cancellation/queue limits, media guards, startup cleanup and TLS changes. This cannot replace ArkTS type checking, HAP compilation or SDK/device behavior. Compilation, TLS/cancellation/background/device acceptance on both hosts, batch UI and complete offline behavior remain open. Counts and device evidence are recorded in [progress](../../project/progress.md).

Implementation references: [Apple URLSessionDataDelegate](https://developer.apple.com/documentation/foundation/urlsessiondatadelegate), [FileHandle](https://developer.apple.com/documentation/foundation/filehandle), [Huawei RCP](https://developer.huawei.com/consumer/en/doc/harmonyos-references-V5/remote-communication-rcp-V5), [OpenHarmony statfs](https://github.com/openharmony/docs/blob/OpenHarmony-5.0.0-Release/en/application-dev/reference/apis-core-file-kit/js-apis-file-statvfs.md), [AVPlayer](https://github.com/openharmony/docs/blob/OpenHarmony-5.0.0-Release/en/application-dev/reference/apis-media-kit/js-apis-media.md#avplayer9).
