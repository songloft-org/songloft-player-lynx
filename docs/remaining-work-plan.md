# 剩余边角料工作规划（非桌面端）

> **用途**：纯前端 + 原生小补全，给下一个 AI 独立执行。每项包含「做什么」「为什么」「风险/注意」。
> **生成时间**：2026-08-14
> **排除范围**：桌面端（Lynxtron）、视频播放、真机验证（仅真机可测的留待用户自行验）

## 总览

| 优先级 | 项目 | 类型 | 工作量 | 依赖 |
|--------|------|------|--------|------|
| P0 | ① 扫描轮询迁移（`refetchInterval`→`setInterval`） | 纯前端 | 小 | 无 |
| P0 | ② `useLocalT()` → `resources.ts` i18n 统一 | 纯前端 | 中 | 无 |
| P1 | ③ Player 封面传入原生通知 | 纯前端 | 小 | 无 |
| P1 | ④ 播放失败自动重试 | 纯前端 | 小 | 无 |
| P2 | ⑤ iOS `setInsecureTls` | 原生 | 小 | 无 |
| P2 | ⑥ 封面 artwork 在 Android 通知栏显示 | 原生 | 小 | ③ 后再做 |
| P2 | ⑦ `use-debounce` 测试 flake 修复 | 纯前端 | 小 | 无 |
| P3 | ⑧ DuplicateCheckPage.css 设计 token 化 | 纯前端 | 小 | 无 |
| P3 | ⑨ Home 页「正在播放」入口条 | 纯前端 | 极小 | 无 |
| P3 | ⑩ PROGRESS.md 文档清理 | 纯前端 | 极小 | 全部做完后 |

---

## P0 项（先做，涉及面广/有静默失效风险）

### ① 扫描轮询迁移：`refetchInterval` → 显式 `setInterval`

**源文件**：`src/features/library-ops/data/scan-query.ts`

**背景**：批29c 发现 `query-core` 5.101 的 `refetchInterval` 在 Lynx 4.0 首次 fetch 后不再 fire（fingerprint 已修复，scan 页仍依赖）。目前 scan 页轮询看似工作是因为 `focusManager.isFocused()` 意外为 `true`（无 DOM 时 `undefined !== 'hidden'`），一旦有人调了 `setFocused(false)` 会静默死掉。

**修法**：照搬 `fingerprint-query.ts` 的做法：
1. 移除 `refetchInterval` / `refetchIntervalInBackground` / `forced` / `paused` 选项
2. 改为页面级 `useEffect` 显式 `setInterval` + `query.refetch()`，离开时 `clearInterval`
3. 删除 `scanPollInterval` / `metadataPollInterval` 两个纯函数及它们的单测（调用方变为零）
4. 删除 `forced` / `paused` 参数（LibraryOpsPage 里 `startScan` 的 `setForced(true)` / `setPaused` 改为 `setInterval` 的控制）

**范围**：
- `scan-query.ts`（`useScanProgressQuery` / `useMetadataProgressQuery`）
- `scan-model.ts`（`scanPollInterval` / `metadataPollInterval` → 删）
- `library-ops/page` 里 `startScan` / `pause` / `cancel` 的 `forced`/`paused` 用法
- `fingerprint-model.ts` 的注释（提到 `refetchInterval` 不可靠，保留即可）

**验证**：`tsc -b` + `pnpm test`（scan-model.test.ts 里相关测试需删除或调整）+ 真机扫一次看进度轮询

---

### ② `useLocalT()` → `resources.ts` i18n 统一

**源文件**：以下 8 个文件用了内联 `useLocalT()` 而非 `resources.ts` + `t()`：

| 文件 | 位置 |
|------|------|
| `src/features/settings/pages/CacheManagePage.tsx` | 全文件 |
| `src/features/settings/pages/ProxySettingsPage.tsx` | 全文件 |
| `src/features/library-ops/pages/DuplicateCheckPage.tsx` | 全文件 |
| `src/features/library-ops/widgets/FingerprintComputingSection.tsx` | 全文件 |
| `src/features/library-ops/widgets/FingerprintStatusCard.tsx` | 全文件 |
| `src/features/library-ops/widgets/DeleteConfirmDialog.tsx` | 全文件 |
| `src/features/library-ops/widgets/DuplicateGroupCard.tsx` | 全文件 |
| `src/features/library-ops/widgets/DuplicateResultsSection.tsx` | 全文件 |

**背景**：批9 建立了 `resources.ts` + `t()` 体系（en/zh 严格同形，编译期校验），但批19/28 引入的 `library-ops` 和批15 引入的 settings 子页使用内联 `useLocalT()` 按 `i18n.language` 手动选 en/zh。功能正常，但与全 app 不一致。

**修法**：
1. 提取每个文件中的文案到 `src/i18n/resources.ts`，按 feature 分组 key：
   - `cacheManage` 组：`pageTitle`, `totalSize`, `...`
   - `proxy` 组：`httpProxy`, `githubProxy`, `hlsProxy`, `allowlist`...
   - `duplicateCheck` 组：`statusTitle`, `computing`, `results`, `noDuplicates`, `deleteConfirm`, `batchDelete`...
2. 保持 `resources.ts` 的 `en: TranslationTree` → `zh: TranslationTree` 同形约束
3. 替换 8 个文件中 `useLocalT()` 定义和调用为 `useTranslation()` + `t('group.key')`
4. 删除 `useLocalT()` 函数定义

**注意**：
- `resources.ts` 里 `// @ts-expect-error` 声明 `zh: TranslationTree = en`，确保 en/zh 结构一致
- 每个文案在 en 和 zh 中都需有值（zh 可参考 `app_zh.arb` 或自译合理简体）
- 现有 `useLocalT()` 的 fallback 行为（`?? key`）可保留但改为 `t(key, defaultValue)` 模式

**验证**：`tsc -b`（en/zh 结构一致性由类型系统保障）+ `pnpm test`（i18n 资源完整性测试会断言 key 集全等）

---

## P1 项（播放体验改进）

### ③ Player 封面传入原生通知

**源文件**：`src/features/player/store/player-store.ts`（`toAudioItem` 或 `play`/`setQueue` 调用路径）

**背景**：Android/iOS 原生模块已有 `setQueue(items)` 方法接收 `AudioItem[]`，每项有 `url`/`title`/`artist`。`MediaMetadata.artworkUri` 已就位但从未收到 cover URL。当前 store 构造 `AudioItem` 时不传 `coverUrl`。

**修法**：
1. `src/native/audio-facade.ts` 的 `AudioItem` 接口加 `coverUrl?: string`（可选，向后兼容）
2. `player-store.ts` 的 `setQueue` 调用处从 `song.coverUrl` 传入：
   ```typescript
   audio.setQueue(queue.map((s: Song) => ({
     url: buildSongUrl(s.url ?? ''),
     title: s.title ?? '',
     artist: s.artist ?? '',
     coverUrl: s.coverUrl ?? undefined,
   })))
   ```
3. 原生端 **不需要改**：`MediaItem.Builder` 已有 `setMediaMetadata` → `setArtworkUri`，只是当前没收到值

**注意**：`song.coverUrl` 可能是 `null` 或 `undefined`，要确保 `undefined` 时原生端不报错（`Uri.parse(null)` 会抛）。`undefined` 不传让原生端跳过即可。

**验证**：`tsc -b` + `pnpm test` + 真机看通知栏出封面

---

### ④ 播放失败自动重试

**源文件**：`src/features/player/store/player-store.ts` 的 `onSongEnded` 或 `onError` 处理

**背景**：当前 error 态只展示错误无重试。用户 remote 歌曲 502 时直接死掉。加一个 3 次 exponential backoff 自动重试。

**修法**：
1. 在 `player-store.ts` 里新增 retry 状态：
   ```typescript
   retryCount: number // 0-3
   ```
2. 在音频 facade 的 `on('error')` 回调里：
   - 如果 `retryCount < 3`，延迟 `[1000, 3000, 9000][retryCount]` 后自动 `load()` + `play()`
   - 每次重试 `retryCount++`
   - 成功时 `retryCount = 0`
3. 失败 3 次后不再重试，保留当前 error 状态

**注意**：不要和 `onSongEnded` 的 play-mode 逻辑冲突（`onSongCompleted` 已有 `sleepTimer` 和 `next` 处理）。错误重试只应在 `event === 'error'` 且 `retryCount < 3` 时触发。

**验证**：`tsc -b` + `pnpm test`（mock 音频可 control error timing）

---

## P2 项（原生小补全）

### ⑤ iOS `setInsecureTls`

**源文件**：`ios/SongloftLynx/SongloftPlatformModule.swift`

**背景**：Android 的 `SongloftPlatformModule.kt` 已有 `setInsecureTls(enabled: Boolean)` 方法，iOS 侧未实现。TS 侧 `native-platform.ts` 的 `applyInsecureTls` 函数已探测 `setInsecureTls` 方法存在性，iOS 缺了这个方法所以 no-op。

**修法**：在 `SongloftPlatformModule.swift` 加：
```swift
@LynxMethod
func setInsecureTls(_ enabled: Bool) -> Void {
    // Set a trust-all URLSession delegate for the session configuration
    // used by Lynx's HTTP service and our audio module.
    DispatchQueue.main.async {
        if enabled {
            // Create a session config with a trust-all delegate
            let config = URLSessionConfiguration.ephemeral
            // ... set delegate that always returns .performDefaultHandling
            // Store the session somewhere the HTTP service can pick it up
        }
    }
}
```

**注意**：
- iOS 的 ATS 已在 Info.plist 通过 `NSAllowsArbitraryLoads` 解决，`setInsecureTls` 解决的是**证书验证**（自签名证书）
- 需要实现 `URLSessionDelegate.urlSession(_:didReceiveChallenge:completionHandler:)` 对 server trust challenges 返回 `.performDefaultHandling`
- 需要确认 `LynxHttpService` 是否使用 `URLSession`，以及 session 配置是否可替换

**验证**：tsc 通过 + 真机用自签名证书后端测试

---

### ⑥ 封面 artwork 在 Android 通知栏显示

**源文件**：`android/app/src/main/java/org/songloft/lynx/audio/SongloftAudioEngine.kt`

**依赖**：必须先完成③（JS 侧传入 coverUrl）

**背景**：Android 通知栏/锁屏的 media notification 需要 `MediaMetadata.METADATA_KEY_ART_URI` 才会显示封面图片。当前 engine 的 `setQueueMetadata` 或 `load` 方法不设置 artwork。

**修法**：在 `SongloftAudioEngine.kt` 的 `load(url, opts)` 或 `setQueue` 方法中：
```kotlin
// 在 build MediaItem 时
val metadata = MediaMetadata.Builder()
    .apply {
        title = ... 
        artist = ...
        // 新增：从 AudioItem.coverUrl 设置 artwork
        coverUrl?.let { url ->
            if (url.isNotEmpty()) {
                setArtworkUri(Uri.parse(url))
            }
        }
    }
    .build()
```

**注意**：
- `Uri.parse()` 对空字符串返回 `Uri.EMPTY`，对 null 抛 NPE，需 guard
- 封面图片是远程 URL，media3 的 `MediaNotificationProvider` 会异步加载，不需要手动下载 Bitmap
- iOS 侧 `MPNowPlayingInfoCenter` 的 `MPMediaItemPropertyArtwork` 可能需要 `MPMediaItemArtwork` 对象，不是 URL——iOS 封面可能需要额外处理

**验证**：真机播放看通知栏出封面图片

---

## P3 项（收尾 / 质量）

### ⑦ `use-debounce` 测试 flake 修复

**源文件**：`src/features/library/__tests__/use-debounce.test.ts`

**背景**：该测试用了 `setTimeout` 等待 debounce 触发，偶发超时（约 5s 超时跑满）。改用 `vi.useFakeTimers` + 确定性推进。

**修法**：参照 `src/shared/sort/__tests__/pinyin-compare.test.ts` 的写法，用 `vi.useFakeTimers` + `vi.advanceTimersByTime` 代替 `setTimeout` 等待。

**验证**：`pnpm test -- --run` 该文件连续跑 10 次不出现 flake

---

### ⑧ DuplicateCheckPage.css 设计 token 化

**源文件**：`src/features/library-ops/pages/DuplicateCheckPage.css`

**背景**：该文件有约 120 个硬编码 px 值。功能无碍，但未使用仓库的 `--space-*` / `--radius-*` / `--color-*` 设计 token。

**修法**：用 `--space-*`、`--radius-*`、`--color-*` 等 token 替换硬编码值。参考 `src/features/settings/pages/SettingsPage.css` 的 token 使用模式。

**注意**：不要改布局结构，只替换 token。运行时功能性不应变化。

**验证**：`pnpm run build` 零 CSS 警告 + 真机目测页面样式正常

---

### ⑨ Home 页「正在播放」入口条

**源文件**：`src/features/home/pages/HomePage.tsx` + `HomePage.css`

**背景**：首页现在只有 MiniPlayer 底部条（在 shell 里，所有页共享）。有歌在播时，首页可以加一个更显眼的入口条（比如统计条区域上方），点击直接跳 `/player`。

**修法**：
1. 在 `HomePage.tsx` 的统计条上方加条件渲染：
   ```tsx
   {currentSong && (
     <view class='home__now-playing' bindtap={() => navigate({ to: '/player' })}>
       <text>{t('home.nowPlaying')}</text>
       <text class='home__now-playing-title'>{currentSong.title}</text>
       <text class='home__now-playing-artist'>{currentSong.artist}</text>
     </view>
   )}
   ```
2. 加很轻量的样式（`height: 48px`, `background: --surface`，向下箭头入口）

**验证**：`tsc -b` + `pnpm test` + 真机目测

---

### ⑩ PROGRESS.md 文档清理

**源文件**：`docs/tracking/PROGRESS.md`

**全部做完后做**：更新以下内容：
- 把 `[ ]` 未勾但实际已完成的项目勾上（用 `[x]`）
- 删除已完成的遗留条目
- 删除乱码字节
- 在末尾添加本批次的完成记录

---

## 验证清单

每项完成后执行：
```bash
pnpm exec tsc -b        # 类型检查（必须带 -b，不要用 --noEmit）
pnpm run build          # rspeedy 构建（含类型检查，是真正的闸门）
pnpm test -- --run      # vitest 全绿（忽略已知的 use-debounce flake）
```

---

## 参考信息

- 项目根：`/home/ejoydev/work/mimusic/songloft-player-lynx`
- 构建：`pnpm run build`（~1500 kB）
- 测试：`pnpm test -- --run`（~825 tests，1 已知 flake `use-debounce.test.ts`）
- 类型：`pnpm exec tsc -b`（不是 `tsc --noEmit`，后者是空跑）
- 原生模块格式：`@LynxMethod` 注解（Kotlin）/ `@LynxMethod` 属性（Swift）
- iOS pbxproj：新增 Swift 文件需在 4 处注册（PBXBuildFile、PBXFileReference、group children、Sources build phase）
- 无 DOM 铁律：`window`/`document`/`self` 不可用，`globalThis` 部分不可用
- i18n 模式：`resources.ts` 内联 en/zh 资源，`TranslationTree` 类型强制 en/zh 同形