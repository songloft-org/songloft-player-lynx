# 代码库审计问题登记表

> 稳定问题 ID、证据和状态维护于此。任务内候选项须完成调用链、反证、影响和快照门禁后才能登记为已确认。

## 导航

- [审计看板](Dashboard.md)
- [当前报告](Report.md)
- [任务](tasks/)
- [结果](results/)

## 审计快照

| 字段 | 值 |
|---|---|
| 运行 ID | `20260901-main-982291d` |
| 基线 | `main` / `982291d54231a832de48ee0d50322fc7fed0ddf3` |
| Context 指纹 | `9cd06eb40f62b52227e50fee5776233520fbf8d72b11caaf7bbb73c304a37eae` |
| 漂移状态 | 有效 |

## 状态说明

内部状态沿用 `candidate`、`needs-verification`、`confirmed`、`rejected`、`stale`、`resolved`；中文分别显示为候选项、待验证、已确认、已排除、已失效、已解决。

## 问题登记表

### AUD-001 P1 HarmonyOS 音量被重复除以 100

- 状态：已确认；置信度：高；来源：A02、A05。
- 主张：player store 已把 0–100 音量换成 0–1，Harmony module 又除以 100，最终给 AVPlayer 的范围是 0–0.01。
- 调用链：音量 UI/store → `player-store.setVolume` → native facade → Harmony module → Harmony engine → AVPlayer。
- 证据：`src/features/player/store/player-store.ts:662-665`、`src/native/audio-types.ts:88`、`harmony/entry/src/main/ets/modules/audio/SongloftAudioModule.ets:102-104`、`harmony/entry/src/main/ets/modules/audio/SongloftAudioEngine.ets:146-148`。
- 反证：Android/iOS module 均直接传入 0–1；Harmony engine 注释和实现也明确消费 0–1。
- 影响：Harmony 用户调节到 100% 实际只得到 1% 引擎音量，主播放功能近乎静音。
- 建议：在 Harmony module 删除二次除法，并增加 store→module→engine 单位契约测试及真机音量验证。

### AUD-002 P2 HarmonyOS 缺少通知歌词方法

- 状态：已确认；置信度：高；来源：A02、A05。
- 主张：Harmony 音频模块能通过“可用”探测，但没有 `updateNotificationLyric`，歌词逐行同步时会产生 rejected Promise。
- 调用链：`lyric-store.syncPosition` → `SongloftAudio.updateNotificationLyric` → `NativeSongloftAudio` → 缺失的 Harmony method。
- 证据：`src/native/native-audio.ts:56-65`、`src/native/native-audio.ts:71-89`、`src/native/native-audio.ts:251-253`、`src/features/player/store/lyric-store.ts:208-225`、`harmony/entry/src/main/ets/modules/audio/SongloftAudioModule.ets:111-127`。
- 反证：Android/iOS 均实现该方法；`getVolume` 虽也缺失，但 facade 有 `typeof` 保护，机制不同，未合并。
- 影响：Harmony 每次歌词行变化都可能产生未处理拒绝，且媒体通知歌词不更新。
- 建议：补齐 Harmony 方法或把 facade 的可用性/可选调用契约改为按方法降级，并添加 Harmony 方法面门禁。

### AUD-003 P2 全局删除歌曲后失效了不存在的查询键

- 状态：已确认；置信度：高；来源：A03。
- 主张：删除成功后失效 `['songs']`，仓库实际歌曲列表 key 分别以 `['library','songs']` 和 `['playlist','songs']` 开头，因此没有缓存被命中。
- 调用链：全局歌曲菜单 → 确认删除 → songs API → `queryClient.invalidateQueries` → TanStack Query cache。
- 证据：`src/shared/ui/SongRowOverlays.tsx:94-108`、`src/features/library/data/songs-query.ts:22-34`、`src/features/playlist/data/playlist-query.ts:19-24`。
- 反证：全仓搜索没有任何 query 以裸 `['songs']` 建立；歌单专属 mutation 使用正确 key factory。
- 影响：后端已删除歌曲后，曲库、歌单歌曲和统计仍显示陈旧数据，直到发生无关 refetch。
- 建议：用权威 key factory 同时失效受影响的 library/playlist/stats 查询，并补充删除成功/失败的缓存测试。

### AUD-004 P2 播放器响应式测试门禁稳定失败

- 状态：已确认；置信度：高；来源：A04、A06。
- 主张：共享 lyric mock 把 `currentIndex` 设为 1，渲染后触发测试环境未实现的 `NodesRef.invoke`；首例失败后同文件出现 13 个级联 DOM 失败。
- 调用链：responsive test render → mocked lyric active line → `LyricsView` effect → testing-library `NodesRef.invoke` → element tree 后续断言。
- 证据：`src/__tests__/_render-mocks.tsx:479-489`、`src/features/player/widgets/LyricsView.tsx:136-154`、`src/features/player/__tests__/full-player-responsive.test.tsx:95-123`；运行 `node_modules/.bin/vitest run src/features/player/__tests__/full-player-responsive.test.tsx --reporter=json` 得 14 失败、5 通过，首错为 `NodesRef.invoke Error: not implemented`。
- 反证：TypeScript、双环境 build 与 player layout 纯函数测试通过，故不把失败等同于生产布局错误。
- 影响：全量测试持续红灯，响应式页面真实回归会被同一批基础设施失败遮蔽。
- 建议：在该测试 mock/no-op invoke 或令 lyric mock 默认不激活滚动，再确认 19 项断言能独立清理并通过。

### AUD-005 P2 HarmonyOS 剪贴板是空实现但界面提示复制成功

- 状态：已确认；置信度：高；来源：A05。
- 主张：Harmony `setClipboard` 方法体为空，TS 与两个 UI caller 仍无条件显示成功状态。
- 调用链：设置/歌曲编辑复制按钮 → `copyToClipboard` → registered Harmony platform module → 空方法 → 成功提示。
- 证据：`harmony/entry/src/main/ets/modules/platform/SongloftPlatformModule.ets:21-32`、`src/native/native-platform.ts:89-101`、`src/features/settings/pages/ProxySettingsPage.tsx:123-135`、`src/features/library/widgets/SongEditDialog.tsx:135-141`。
- 反证：Android/iOS/Web 有真实剪贴板实现；canonical 平台文档把 Harmony platform clipboard 标为支持。
- 影响：Harmony 的 AI prompt、歌曲路径和 endpoint 复制按钮对用户撒谎，剪贴板内容不变。
- 建议：使用 Harmony Pasteboard API 实现，并让 facade/UI 能区分不可用或失败。

### AUD-006 P1 HarmonyOS 视频能力被错误暴露

- 状态：已确认；置信度：高；来源：A05。
- 主张：能力只检查模块存在；Harmony 注册了 `SongloftVideo`，但 `open` 永远返回 false，UI 因而展示一个必然失败的视频入口。
- 调用链：FullPlayer cover → `getPlatformCapabilities().video` → HLS source switch（如适用）→ native video open → 恒 false。
- 证据：`src/native/platform-capabilities.ts:96-112`、`harmony/entry/src/main/ets/pages/Index.ets:28-32`、`harmony/entry/src/main/ets/modules/video/SongloftVideoModule.ets:12-21`、`src/features/player/pages/FullPlayerPage.tsx:54-74`、`docs/architecture/platform-differences.md:19-25`。
- 反证：文档明确宣称 Harmony 共享 AVPlayer，而不是“暂不支持”；Android/iOS module 有真实 surface 生命周期。
- 影响：Harmony 全屏视频功能完全不可用，HLS 路径还会在失败前切换播放源。
- 建议：实现 Harmony 视频 surface 借用；完成前不要注册模块或将能力改为方法/宿主声明的真实可用性。

### AUD-007 P1 HarmonyOS DLNA 发现结果不会进入设备列表

- 状态：已确认；置信度：高；来源：A05。
- 主张：Harmony discovery 只把设备存到局部数组并经 `startDiscovery` callback 返回；TS 丢弃该 payload，随后调用的 `getDevices` 恒返回空数组。
- 调用链：DLNA 页面扫描 → `startDiscovery` → Harmony 局部 devices → TS 忽略结果 → 延时 `getDevices` → 空列表。
- 证据：`src/features/player/pages/DlnaPage.tsx:30-47`、`src/native/dlna.ts:111-125`、`harmony/entry/src/main/ets/modules/dlna/SongloftDlnaModule.ets:26-36`、`harmony/entry/src/main/ets/modules/dlna/SongloftDlnaModule.ets:94-137`。
- 反证：Android/iOS 将 devices 保存在 module 实例并由 `getDevices` 返回；权限声明存在，不足以修正状态丢失。
- 影响：即使 SSDP 收到设备，Harmony DLNA 页面也永远显示空列表，投屏入口不可用。
- 建议：让 Harmony module 持久化发现结果并保持与 Android/iOS 相同的 start/get contract，补充 adapter 合约测试和真机 SSDP 验证。

### AUD-008 P2 HarmonyOS DLNA 把设备 ID 当作 SOAP control URL

- 状态：已确认；置信度：高；来源：A05。
- 主张：Harmony discovery 生成的 id 是 USN，但 `cast`/`control` 直接把 `deviceId` 交给 HTTP SOAP request。
- 调用链：设备列表选择 USN → TS `cast(deviceId, url)` → Harmony `parsed.deviceId` → `soapAction(controlUrl)`。
- 证据：`src/native/dlna.ts:123-129`、`harmony/entry/src/main/ets/modules/dlna/SongloftDlnaModule.ets:38-50`、`harmony/entry/src/main/ets/modules/dlna/SongloftDlnaModule.ets:141-151`；Android `SongloftDlnaModule.kt:104-130`、iOS `SongloftDlnaModule.swift:65-96` 均先按 id 查设备再使用 `controlUrl`。
- 反证：SSDP `LOCATION` 本身还是设备描述 URL，不等于 AVTransport control URL；仅修复 AUD-007 的列表持久化也不能修复本项。
- 影响：发现列表恢复后，Harmony 的投放和控制仍会向无效 USN 发 HTTP 请求。
- 建议：解析 device description 的 AVTransport control URL，并按稳定 id 保存/查询完整设备记录。

### AUD-009 P2 原生契约门禁遗漏 HarmonyOS 方法面

- 状态：已确认；置信度：高；来源：A05、A06。
- 主张：测试加载了 Harmony 源码，但 interface 方法循环只断言 Android/iOS；Harmony 只检查 module registration，所以方法缺失、空实现和错误单位均能在 185 项全绿时存在。
- 调用链：TS native interface → static contract test → Android/iOS method assertions / Harmony registration-only assertion → CI test gate。
- 证据：`src/__tests__/native-module-contract.test.ts:49-93`、`src/__tests__/native-module-contract.test.ts:259-283`、`src/__tests__/native-module-contract.test.ts:575-600`、`src/__tests__/native-module-contract.test.ts:697-749`、`src/__tests__/native-module-contract.test.ts:925-931`；隔离运行该文件 185/185 通过。
- 反证：测试确实读取 Harmony 文件并验证注册、权限，因此问题不是“完全不覆盖 Harmony”，而是 method/behavior coverage 缺口。
- 影响：四端契约门禁给出假绿，当前 AUD-001、002、005、006、007、008 均未被阻止。
- 建议：将 Harmony 纳入每个 interface 方法表，针对单位、能力与非空行为增加窄而明确的静态/适配层测试；设备语义仍由真机闸门补充。

## 证据约束

以上问题均绑定审计快照 `004428fc558e1e6b5927c1617585e434ea82663a82c68371efa5793eacfed59a`。每个问题记录可证伪主张、精确代码或运行证据、完整行为链、反证、影响、置信度、修复边界和来源任务。
