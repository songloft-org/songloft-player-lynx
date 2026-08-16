# 工作交接（2026-08-16）

> 本文件是**给接手 AI 的交接说明**。读完这一篇就能继续干活；细节在链接里。
>
> **一句话现状**：批41–48 完成并全部推送；**批49「视频歌曲全屏原生播放」做到 Step 3/5，Android 上画面已经出来了**，iOS 侧待做（Step 4）。两个平台 e2e 全绿：Android **112 passed / 8 skipped (120)**、iOS **110 passed / 10 skipped (120)**（跳过的都是平台门控或缺素材，见 §3）。闸门全绿：**995 vitest / 103 文件** + `tsc -b` + 双产物 + `gradlew assembleDebug` + `ios:build`。
>
> **接手第一件事**：直接读 §3「批49 现状与 Step 4 怎么做」。那一节是可执行的，包含已经踩过的坑、必须写的那行 `updatesNowPlayingInfoCenter = false`、以及怎么造视频素材。

---

## 1. 现在在哪、做到哪了

### 已提交

**全部已推送**，`main` 与 `origin/main` 同步（`git rev-list --left-right --count origin/main...main` = `0 0`）。

| commit | 内容 |
|---|---|
| `a2c361f` | **批49 Step 3**：Android 全屏原生视频（画面接到现有 ExoPlayer）+ 契约闸门 6 例 + e2e 5 例 |
| `656807e` | **批49 Step 2**：视频源选择（direct 优先 / 回退 video-hls）+ `enterVideoSource` + Android HLS 读超时 |
| `90c9be5` | **批49 Step 0–1**：播放 URL 带上真实平台（视频不再被要求剥掉画面；iOS 的 ogg/opus 从放不出来变成能播） |
| `3df1299` | 批48：悬浮歌词第四/五重死（manifest 两行声明 + 主线程 hop）+ AndroidManifest 闸门 7 例 + Android 悬浮歌词 e2e 5 例 + 清 11 个死 i18n key |
| `f849804` | 批47：自签名下 iOS 媒体流可播（`InsecureMediaLoader`）+ 关开关立即生效 |
| `4a8153d` | docs：自签名 TLS 四步实测，确认批45 生效并判定两条缺陷 |
| `8f446d1` | 批46：iOS e2e 首跑 6 个失败全修（110/110） |
| `0745418` | docs：记录 iOS 首次编译收口与 e2e 首跑结果（104/110） |
| `f8a060d` | 批45 Swift 首次编译收口（导入名对齐 + LiveActivity 可用性守卫） |
| `36f2f99` | docs：HANDOFF 订正推送状态 |
| `ba6f7e3` | 批45 docs：HANDOFF 补 iOS 编译交接清单 + SDK 工件 URL |
| `755172d` | 批45：insecureTls 三条出站路径生效 + iOS 锁屏封面 + 闸门收紧（**iOS 未编译**，见 §3） |
| `aa43fd6` | 批44 #15：视频歌曲播放标识 |
| `3d35583` | 批44 #10：library-browse 视图配置（14 视图 + 设置页） |
| `0465ee4` | 批44 #13：插件源管理 + 撞名冲突警告 |
| `d1b59a1` | 批44 #12：启动自动探测服务器可达性 |
| `f329f1a` | 批44 #9/#11：投屏暂停本地 + 偏好上云 |
| `f79b6a8` | 批44 #8：从文件安装插件 |
| `594dc1c` | 批44 #6：删除歌曲入口 |
| `77f5dec` | 批44 #5：隐藏歌单显示切换 |
| `6e5e7b1` | 批44 #2/#7：播放全部 + 电台歌单创建 |
| `11e0caa` | 批44 #1/#3/#4/#14：播放历史上报/高亮/坏歌跳/正在播放入口 |
| `e95c97f` | 批43 P2-1：TokenStore/AuthInterceptor 收口单例 |
| `9f08038` | 批43 P2-3：原生模块补齐 + 契约闸门（+30 例） |
| `6ffe792` | 批43 P0-2/4/5：Web 音频/宿主页/后端地址 |
| `3e1c342` | 批42 P1-12：多选状态跨搜索/筛选残留 |
| `fbe5662` | 批42 第五波 P1-6：元数据「再次刷新」不轮询 |
| `5bd94e7` | 批42 第四波：DLNA 页进去即崩 / 能力探测器接线 |
| `e50dab4` | 批42 第三波：切服务器带旧 token / HTTP 无超时 |
| `9889b22` | 批42 第二波：播放位置不落盘 / 冷启动播放键无效 / LiveActivity 泄漏 |
| `a7114c1` | 批42 第一波：裸 i18n key / 收藏分页死循环 / 升级轮询失控 / 队列重排钉错 |
| `983a97d` | 批41：三条 P0 阻断（原生 bundle 不重建 / iOS 工程损坏 / web 产物黑屏） |
| `93de19e` | docs：审计教训固化 + 修复计划 + docs 目录整理 |

> ⚠️ 是否 `git push` 由用户决定，**不要自行推送**。

### 工作树状态

**干净**（`git status --short` 无输出）。曲库已还原为 3 首本地 mp3、63 首总计；测试用的视频/ogg 素材与 `zz-*` 探针文件都已删除。

闸门快照（批49 Step 3 收口时全绿）：`build` 双产物 / `tsc -b` / **995 vitest（103 文件）** / `gradlew assembleDebug` / `ios:build` / Android e2e **112 passed 8 skipped (120)** / iOS e2e **110 passed 10 skipped (120)**。

**两侧 skip 的构成**（skip 数变了就说明有东西被静默关掉了，值得查）：Android = 3 例 `ios-appearance` + 5 例 `android-video-fullscreen`（缺视频素材）；iOS = 5 例 `android-floating-lyric` + 5 例 `android-video-fullscreen`（都是平台门控）。

---

## 2. 四条必须内化的铁律（本项目反复踩的坑）

完整论述在 [`../../AGENTS.md`](../../AGENTS.md) §4「平台判断」「Web 平台」、§5「原生模块调用约定」「宿主 HTTP service 是我们自己的」、§6「测试与闸门原则」。这里是要点：

1. **DOM 探测不是平台判断。** web-core 把背景线程跑在真 Worker 里，那里没有 `document`/`localStorage`/`HTMLAudioElement`，所以 `typeof <DOM 全局>` 在 **Web 平台上回答「不是 Web」**。判平台一律用 `isWebPlatform()`（读 `SystemInfo.platform`，两 realm 都有）。已踩三次：下拉刷新文案 / 刷新掉登录 / Web 没声音。

2. **原生模块禁止强转成 Promise。** Lynx 原生方法是 callback 式，promisify 必须在 TS 适配层做（参考 `core/storage/native-storage.ts`）。`nm.X as SomePromiseInterface` 会让 `.then()` 落在 `undefined` 上——DLNA 页就是这么崩的。

3. **闸门要验语义，不验子串；mock 要保留真实前置条件；断言先反向验证会红。** pbxproj 闸门用 `.toContain` 被畸形行骗过；`mock-audio` 的 `play()` 不需先 `load()`，掩盖了冷启动播放键无效。本项目习惯：**每条修复都配一个「摘掉修复即变红」的回归测试**。批45 又踩了一次同款：新写的 iOS 注册闸门第一版仍是子串检查，被「整行注释掉的 `config.register(...)`」骗过——**反向验证是唯一发现它的手段**。批46 是 mock 那一面的又一例：mock 被 `load` 直接告知时长，永远表达不出真实宿主「我还不知道」（`durationMs: 0`）的状态，于是「store 用 0 抹掉已知时长」测不出来；**问一句「mock 能表达宿主的未知态吗」就能提前发现**。批46 还有一条反向验证救回来的：写的第一版播种测试摘掉修复后**依然是绿的**——它测的是 mock 的同步回显，不是修复本身。

4. **`fetch` 走的是我们自己的宿主 HTTP service，不是 SDK 的。** 两侧都替换了（`net/SongloftHttpService.kt` / `SongloftHttpService.swift`），iOS 还从 Podfile 摘掉了 `LynxService/Http`。动网络层前先读 AGENTS.md §5 那一节：SDK 实现把 client 私有化（iOS 用的是不能挂 delegate 的 `URLSession.shared`），所以「允许不安全的 TLS」到不了 `fetch`，这才是替换的唯一理由。改这两个文件要保持「SDK 实现的逐行转写，只在 TLS 一处分叉」这个性质。

---

## 3. 批45–46 与剩余工作

### 批49 现状与 Step 4 怎么做（**接手从这里开始**）

**目标与已定方向**（用户已拍定，不要重新论证）：视频歌曲**全屏原生播放** —— 新 `SongloftVideo` 模块，Android 起 Activity、iOS present `AVPlayerViewController`，画面接到**现有的同一个播放器实例**上。**不做**自定义 `<x-video>` Lynx 元素：本仓库零先例、iOS 纯 Swift 而注册宏是 ObjC-only、且「标签未注册时 Lynx 不报错、元素静默不渲染」这个失败面零闸门覆盖。视频源**能直出就直出、不行回退 `video-hls`**。

**已完成 Step 0–3**（逐条根因与实测数据在 `PROGRESS.md` 批49 段）：

| Step | 内容 | 状态 |
|---|---|---|
| 0–1 | `songUrl()` 补 `platform`；`audio-format` 视频容器分支平台化 | ✅ `90c9be5` |
| 2 | `core/network/video-source.ts` 三值判定 + `enterVideoSource()` + Android HLS 读超时 300s | ✅ `656807e` |
| 3 | Android：引擎 attach/detach/hasVideoTrack + Activity + 模块 + TS 适配层 + capability + ▶ 入口 | ✅ `a2c361f` |
| **4** | **iOS：`AVPlayerViewController` 接 `SongloftAudioEngine.shared` 的 player** | ⬜ **待做** |
| 5 | iOS e2e、▶ 标识补到列表/详情、full-player 角标的回归测试 | ⬜ 待做 |

**Step 4 的实施要点**（Android 侧已经把路走通，iOS 照抄结构即可）：

1. 引擎（`ios/SongloftLynx/SongloftAudioEngine.swift`，`:63 private var player: AVPlayer?`）加一个**受控** accessor，不要暴露 player 本身。Android 侧的对应物是 `attachVideoOutput(view) { w,h -> }`。iOS 建议 `func attachVideoOutput(_ sink: @escaping (AVPlayer) -> Void)` —— 用闭包是为了让引擎不必 `import AVKit`，`AVPlayerViewController` 的生命周期归模块管。
2. 新 `ios/SongloftLynx/SongloftVideoModule.swift`：`name = "SongloftVideo"` + `methodLookup` 三项（`open`/`close`/`isOpen`），骨架照 `SongloftDlnaModule.swift`。`topViewController()` 那 6 行可以照抄 `SongloftPlatformModule.swift:67-74`（**别去改那个在用的文件**）。
3. **`vc.updatesNowPlayingInfoCenter = false` 必须写**。它默认 `true`，`AVPlayerViewController` 会拿自己那套信息覆盖引擎 `updateNowPlaying()` 写的 title/artist/artwork。症状是「全屏看过一次之后锁屏信息变了」，**纯真机可见，任何单测都抓不到**——所以顺手把这条加进契约闸门。
4. `close` 时**先 `vc.player = nil` 再 dismiss**：AVPlayerViewController 在某些关闭路径上会 `pause()` 它持有的 player。真机上必须验一次「退出全屏后音频还在走」。
5. 注册两处：`ViewController.buildConfig()` 里 `config.register(SongloftVideoModule.self)`，以及 **pbxproj 四处**。契约闸门会逐个 `ios/SongloftLynx/*.swift` 核对，漏了立刻红；改完 pbxproj 记得 `xcodebuild -list` 确认还能解析（批39 的教训）。
6. 契约闸门里 `modules` 表那行现在是 `{ name: 'SongloftVideo', android: 'SongloftVideoModule', ios: null }` —— Step 4 把 `ios` 填上，注册断言会自动生效。`hosts.video` 也要补 `ios` 分支。
7. **两条真机项无法靠闸门代替**：全屏期间 EQ 是否仍生效；锁屏元数据是否还是我们写的。

**Step 3 里被实测纠正的两处设计**（iOS 会遇到同族问题，先知道省一轮）：

- **「有没有视频轨」不能问 `videoSize`**：没有 surface 就没有帧输出，尺寸永远是空的 —— 鸡生蛋。Android 改读 `currentTracks` 的轨道组。iOS 的对应物是 `item.asset.tracks(withMediaType: .video)`，**注意别在主线程同步等 asset**（批47 的 `InsecureMediaLoader` 就是这么把自己锁死的）。
- **画面会被拉伸**：Android 上 `MATCH_PARENT` 的 SurfaceView 把 640×360 抻成竖屏形状，靠截图才发现，任何状态断言都是绿的。iOS 用 `vc.videoGravity = .resizeAspect` 一行解决。

**造视频素材**（每次实测都要，用完 `POST /api/v1/songs/clean` 收尾）：

```bash
ffmpeg -f lavfi -i "testsrc2=size=640x360:rate=25:duration=60" \
       -f lavfi -i "sine=frequency=330:duration=60" \
       -c:v libx264 -pix_fmt yuv420p -preset veryfast -c:a aac -shortest \
       /Users/hanxi/toy/songloft/music/zz-video-probe.mp4
# 等 12 秒过文件稳定阈值，再 POST /api/v1/scan
```

`testsrc2` 自带走动的时间码，两张间隔 1.5s 的截图不同即「画面在动」——这是与配色无关的活性判据，比肉眼看截图可靠。

**后端已就绪、客户端已接的部分**：`?media=video`（直出原容器，忽略 format/quality/normalize）、`/songs/{id}/video-hls/playlist.m3u8`（H.264+AAC 实时转码，**转完再播**，缺 ffmpeg 返 503）。判定表在 `src/core/network/video-source.ts`，其中 **`'m4a'` 属于视频直出集合不是笔误**：后端 `songs.format` 用 tag 库的家族命名，一个 H.264+AAC 的 `.mp4` 扫进来是 `format: 'm4a', is_video: true`（实测）。

### 批48 做了什么（悬浮歌词从未工作过 + manifest 闸门补位）

起点是一次「还剩什么没做」的巡查：`AndroidManifest.xml` 无闸门这条 P3 挂在清单上很久，顺着它去读文件，发现批43 记为「此前已有」的两项**都不存在**。逐条根因在 [`bug.md`](bug.md)「批48」段，这里留**方法论上值得带走的四点**：

1. **没有闸门的文件上，任何结论都会腐烂。** 批43 那句「SYSTEM_ALERT_WINDOW 权限与 service 声明此前已有」是错的，而它活了四个批次——因为**没有任何东西会去读那个文件**。这不是谁不小心，是缺少对账机制的必然结果。补闸门时刻意**从 Kotlin 源码推导需求**（基类名以 `Service`/`Activity` 结尾就必须有声明），这样下一个新组件不需要谁记得来扩这个测试。
2. **静默失败要主动去想「如果它坏了，我会看到什么」。** 这个功能的三重死没有一次能让页面侧看到错误：`startService` 对未声明的 Service **不抛异常**、权限未声明只是让 app 不出现在授权列表里、`updateText` 的线程异常被模块的裸 `catch (_: Exception) {}` 吞掉。TS facade 三种情况都返回 resolved promise。所以新加的 e2e 断言全部落在**进程外**的 `dumpsys` 上——只问 `isShowing()` 等于让嫌疑人自证清白。
3. **截图证明不了「文本写进去了」。** 覆盖层是白字白底，肉眼与截图都看不出差别。定位靠的是与配色无关的量：`dumpsys window windows` 里 `Requested h` / `mLayoutSeq` / frame 在写入前后**逐字节相同** → 压根没重排。修完后 46→48、4748→4749。**这也顺便成了免费的反向验证**：摘掉主线程 hop 就回到 46。
4. **平台门控的默认值要跟 driver 对齐。** 新 scenario 用 `E2E_PLATFORM === 'android'` 门控，结果在裸 `pnpm run test:e2e` 下 5 例**整体跳过**（`createDriver()` 把未设该变量视为 Android）。第一次全量跑就是这么「通过」的——107 passed / **8** skipped，比预期多 5 个 skip，只有盯着 skip 数才看得出来。

### 批46 做了什么（iOS e2e 首跑的 6 个失败，全修完）

首跑 104/110 → **iOS 110/110**。逐条根因与修法在 [`bug.md`](bug.md)「iOS e2e 首次运行发现」与 `PROGRESS.md` 批46 段，这里只留下**方法论上值得带走的四点**：

1. **首跑时对两条失败的归因是错的**，都是「看现象合理推断」而非量化。实测推翻：`durationMs` 不是「iOS 只随 tick 上报」（`.readyToPlay` 时 `item.duration` 本就还是 `indefinite`），0.5x 不是「每 tick 只推 250ms」（每 tick 仍推 500ms，**是间隔被拉成 1 秒墙钟**）。**先用一次性探针把现象量化，再动代码** —— TestBridge 可以直接驱动设备上的 store，写个临时 `zz-probe.scenario.ts` 密集采样几秒就够，比连猜带改省好几轮 iOS 构建。
2. **`addPeriodicTimeObserver(forInterval:)` 的间隔按媒体时间计**，墙钟间隔是 `interval / rate`；Android 的 tick 是 `postDelayed` 的墙钟 500ms。两者要对齐就得把间隔按 rate 缩放（`installTimeObserver`）。
3. **改了 tick 步长就要重算所有依赖它的断言**。我把 2x 的每 tick 步长变成 1000ms，旧的 1 秒窗口对 2x 就有约 10% 概率误判 —— 那是**我自己引入的新 flake**，不改测试等于埋雷。同一轮还顺带发现 `audio-playback` 的 seek 断言本就是刀锋（容差 500ms 恰好等于它自己 sleep 500ms 的合法推进量，实测 500.216 > 500）。
4. **「测试读错对象」不等于「宿主没问题」**。bug.md 当时留了一句「修测试前先验宿主链路」，照做后真挖出一条：只断言 `getSystemAppearance()` 是在测空气 —— 那台模拟器持久化的 app 主题是 `'light'`，此时 app **本就不该**跟随系统，而这种断言照样全绿。测试要自己用 `changeAppTheme('system')` 建立前提，并断言**解析后**的 `resolveTheme(getAppTheme())`。

另外**回退了**首跑时加的推测性改动（seek 完成后 `playImmediately` 恢复播放，`intendedPlaying` 一族）：它基于「seek 把播放停了」的猜测，根因既已查明，留着就是无法证伪、也没有回归测试的代码。

### 批45 做了什么

原 HANDOFF 把两条记为「只有 Android」的 P2，复核后发现记录本身有偏差：`setArtworkUri` **不是桥接方法**（是 Android 引擎内部的 Media3 调用，跨桥的是 `setQueue` 的 `artworkUrl`），而 `setInsecureTls` **两个宿主都是半残的** —— Android 的 trust-all 装在 `HttpsURLConnection` 全局默认上，JS `fetch` 走 OkHttp 完全无视它，所以「开了开关仍然登录不上自签名服务器」；关掉开关也不会恢复。

改动：两侧各自**替换宿主 HTTP service** 拿到 TLS 钩子（`net/SongloftHttpService.kt` / `SongloftHttpService.swift`，iOS 顺带从 Podfile 摘掉 `LynxService/Http`），`InsecureTls` 收口三条出站路径且双向可逆；iOS 补锁屏封面；TS 侧补两处漏掉的 `applyInsecureTls`；4 条闸门收紧。详见 `PROGRESS.md` 批45 段与 `AGENTS.md` §5 新增的「宿主 HTTP service 是我们自己的」。

### ✅ iOS 已在 Mac 上编译通过（2026-08-15，Xcode 26.6 / Swift 6.3.3）

批45 的 Swift 代码首次编译，命中的正是预测的「Swift 怎么看 ObjC 声明」类问题，均已修复
（**只改 Swift 名、不动 `@objc(selector)`**）。importer 的重命名启发式实际做的事是
**剥掉与参数类型名重复的 label 词**，真实导入名与 ObjC selector 的对照：

| ObjC selector | Swift 导入名（编译器认的） |
|---|---|
| `invokeWithRequest:callback:` | `invoke(with:callback:)`（剥 `Request` ≈ `LynxHttpRequest`） |
| `invokeStreamingWithRequest:callback:withDelegate:` | `invokeStreaming(with:callback:with:)`（剥 `Request`/`Delegate`） |
| `processChunkedData:withData:` | `processChunkedData(_:with:)`（剥 `Data` ≈ `NSData`） |
| `+registerServiceWithProtocol:protocol:` | `registerService(withProtocol:protocol:)`（原样） |
| `+getInstanceWithProtocol:` | `getInstanceWith(_:)`（保基础词、剥 `Protocol`；**不是** `getInstance(with:)` 也不是 `instance(withProtocol:)`） |

预测的第 2 点（`registerService(withProtocol:protocol:)`）一次通过；卡住的是
`getInstance`——猜的三种形态全错，最后用探针文件（刻意写错的类型标注）让编译器
报出真实签名。结论已写进 `AppDelegate.registerHttpService()` 注释。

**第 4个问题是预测之外的**：前三个修完后浮出 `ViewController.buildConfig()` 里
`config.register(LiveActivityModule.self)` 无可用性守卫——类是 `@available(iOS 16.2, *)`
（ActivityKit 硬需求）而部署目标 16.0，直接硬编译错。该行是批43（`9f08038`）加的，
同样从未编译过。修法：包 `if #available(iOS 16.2, *)`，16.0/16.1 上模块不注册、
TS 侧可选链降级 no-op；契约闸门的断言是 `buildConfig()` 切片内
`toContain('config.register(LiveActivityModule.self)')`，包裹不影响。

验证链：`pod install`（Podfile 摘了 `LynxService/Http`，必须重跑）→
`pnpm run ios:build`（双 JS 产物 + Pods + app 全 BUILD SUCCEEDED）→
模拟器（iPhone 16 Pro / iOS 18.3）启动、首屏渲染、6 个原生模块全注册、
TestBridge ping/eval 正常。

### 需要再读 Lynx SDK 源码时（本地不留副本）

批45 的协议签名是从这四个工件读出来的，`curl` 直接可取（`WebFetch` 被策略拦）。**刻意不入库**，需要时重新拉：

```
https://repo1.maven.org/maven2/org/lynxsdk/lynx/lynx/4.0.0/lynx-4.0.0-sources.jar          # ILynxHttpService 等接口
https://repo1.maven.org/maven2/org/lynxsdk/lynx/lynx-service-http/4.0.0/lynx-service-http-4.0.0-sources.jar  # Android 参考实现
https://github.com/lynx-family/lynx/releases/download/4.0.1/Lynx-4.0.1.zip                 # LynxServiceHttpProtocol.h / LynxHttpRequest.h
https://github.com/lynx-family/lynx/releases/download/4.0.1/LynxService-4.0.1.zip           # iOS 参考实现（含 LynxNSUrlSessionDelegate）
https://github.com/lynx-family/lynx/releases/download/4.0.1/LynxServiceAPI-4.0.1.zip        # ServiceAPI.h（LynxServices 注册入口）
```

pod 的 podspec 也能直接读，用来定位头文件路径：`https://cdn.cocoapods.org/Specs/<md5 前三位分片>/<Pod>/<版本>/<Pod>.podspec.json`（如 `Lynx` → `0/4/6`）。

### Android 现在可以本机真编译（批45 自举）

```bash
export JAVA_HOME=/home/ejoydev/.local/share/mise/installs/java/temurin-17
export ANDROID_HOME=/home/ejoydev/.local/share/mise/installs/android-sdk/22.0
export PATH="$JAVA_HOME/bin:$PATH"
cd android && ./gradlew --no-daemon assembleDebug
```

`AGENTS.md` 里那条 `/opt/homebrew/...` 的 `ANDROID_HOME` 是 macOS 的，Linux 上用上面这个。

### 已知缺陷

| 条目 | 严重度 | 状态 |
|---|---|---|
| **HLS 播放列表内的绝对 https URI（自签名下）** | P3 | 批47 修完 iOS 自签名媒体流后剩下的唯一缺口：播放列表里的**相对** URI 会继续带自定义 scheme 回到 `InsecureMediaLoader`（Songloft 自己的 HLS 反代产出的正是相对 URL，所以按构造是通的），但**绝对** `https://` URI 由 AVFoundation 自行加载、撞同一道证书墙。**两条都没有可测的自签名 HLS 源，未实测**。 |
| **疑似：Android 上 HLS 电台落到 `ProgressiveMediaSource`** | P2？ | `SongloftAudioEngine.load` 判 `hls \|\| url.endsWith(".m3u8")`，而 `buildSongUrl` 追加了 `?access_token=`，**后缀判断恒不成立**；电台也没有调用方传 `hls: true`（批49 只给 `/video-hls/` 传了）。按父仓库 AGENTS 的说法这会导致直播播不了。**刻意未修**：手上没有可用电台源，改了就是无法证伪的推测性修改。验证与两种修法见 [`bug.md`](bug.md)「批49 途中发现」 |
| **偶发全屏灰层** | 未定位 | 运行数分钟后整屏蒙中灰，重启即恢复。最可查嫌疑是 lynx-ui Sheet 的 backdrop 泄漏。**下次出现时跑**：`adb logcat \| grep -i "\[Sheet\] Invalid state transition"`（库自带的免费探针）。若真机（非 BlueStacks）复现不了，降级为环境记录。 |

### ✅ 自签名功能实测 + 批47 收口（2026-08-15，iOS 18.3 模拟器 + Android 模拟器）

**批45 的目的达到了**，且批46 实测挖出的两条缺陷已在**批47 修完并实测通过**：iOS 自签名下现在**能播放**（`InsecureMediaLoader`：换自定义 scheme 让 AVFoundation 把加载请求交给我们，自己流式拉字节范围），关掉开关**同一 URL 立即生效**（`update()` 失效并重建 `URLSession`，丢掉连接池）。Android 侧补测确认它本来就立即生效——`clientFor()` 在标志变化时重建 `OkHttpClient`，新 client 自带新连接池。剩下的唯一缺口见「已知缺陷」表里的 HLS 绝对 URI 那条。

复现环境（约 5 分钟即可重搭，**刻意不入库**）：后端没有 TLS 参数，所以在前面挂一个自签名的 TLS 反代——`openssl req -x509 -newkey rsa:2048 -nodes -days 2 -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"` 生成证书，再用 20 行 Go（`httputil.NewSingleHostReverseProxy` + `ListenAndServeTLS`）把 `https://127.0.0.1:58543` 转发到 `http://127.0.0.1:58091`。模拟器的 localhost 就是宿主，直接可达。

驱动方式：`__E2E_AUTH_STORE__.getState().login({ username, password, apiBaseUrl, insecureTls })` —— 这个 action 直接吃 `insecureTls` 参数，四步实测一条 eval 就够；播放侧用 `__E2E_PLAYER_STORE__.playSong(song)`（歌曲元数据从宿主侧明文 :58091 取，媒体 URL 由 app 按自己配置的 https base 拼），然后读 `getPlayerState()` 的 `state`/`errorMessage`。

**验证「开关关掉是否生效」时必须换 hostname**（如 `https://localhost:58543` 对 `https://127.0.0.1:58543`，证书两个 SAN 都签了）。同一 URL 会复用连接池里已经握过手的连接，测出来的是假绿——**第一次实测就被这一点骗过**：跑第二轮时连 ① 都「成功」了，因为上一轮结束时开关是开的、连接还热着。

### 明确不做（来自审计计划 §明确不做）

键盘快捷键、HomeGridConfig、/configs KV 编辑器、完整 GPL 全文许可页、升级的版本选择/手动上传/回退、客户端下载页、Web 调试控制台、热更、桌面歌词独立窗口、深目录树虚拟化、Settings 主从九分类 IA、黑胶唱片环动画。

### e2e 测试

29 个 scenario 文件，120 个测试用例，**全部需要设备（adb / iOS Simulator）**：

```bash
pnpm run test:e2e:android   # Android 设备
pnpm run test:e2e:ios       # iOS 模拟器
```

**当前结果（2026-08-16，批49 Step 3 后）**：**Android 112 passed / 8 skipped (120)** ·
**iOS 110 passed / 10 skipped (120)**。skip 的构成见 §1「工作树状态」——**skip 数变了要查**，
批48 就出现过「门控条件写反、5 例整体静默跳过而报全绿」。`android-video-fullscreen`
在曲库没有视频歌时**可见地 skip**（模块级 `await fetchVideoSong()` + `test.skipIf`），
不是每个 test 里 `return` 的假绿；素材命令见 §3 批49 段。
批46 那 6 个失败的完整根因记录留在 `bug.md`「iOS e2e 首次运行发现」，其中两条的**首跑归因
已被实测推翻**，值得一读——那是本项目「先量化再改」的一课；批48 的三重静默死是另一课。

**跑 e2e 前必做的四件环境检查**（每一条都真的踩过，且失败时都不报错、只让你得出错误结论）：

1. **改了 JS bundle 或原生代码后，`simctl install` 不会替换已在运行的进程** ——
   必须先 `xcrun simctl terminate <udid> org.songloft.lynx`，否则测试跑的还是旧 bundle。
2. **跑过 Android e2e 之后，残留的 `adb forward localhost:9230` 会抢走宿主侧连接** ——
   它绑得比模拟器 App 的 `*:9230` 更具体，于是 iOS 测试会**静默连到 Android 上的 App**。
   批46 就这么被骗过一次（表现是 `changeAppTheme is not a function`，因为 Android 那份是旧
   bundle）。跑 iOS 前先 `adb forward --remove tcp:9230`。
3. **`e2e:ios:setup` 已装就不重装**（`scripts/e2e-ios-setup.mjs:107` 是 `if (!isAppInstalled(...))`）——
   所以 `pnpm run ios:build` 之后必须自己 `xcrun simctl terminate <udid> org.songloft.lynx`
   + `xcrun simctl install <udid> ios/build/Debug-iphonesimulator/SongloftLynx.app`。
   批49 第一次复测就因为这条得出了「修了也没用」的错误结论。
4. **9230 没被别的残留实例占**：`lsof -iTCP:9230 -sTCP:LISTEN -P` 检查；新实例 bind 失败只打
   一行 `[TestBridge] bind() failed: 48`。另外**只留一台 Booted 模拟器** ——
   `getBootedSimulator()` 取 JSON 列表里第一个 Booted 设备，多台并存时选择不确定。

**`src/e2e-bridge.ts` 暴露的把手**（`NativeModules` 在 eval scope 里**完全不可达**，裸的和
`globalThis` 上都没有 —— 实测过，所以原生能力只能经这些把手驱动）：
`__E2E_PLAYER_STORE__` / `__E2E_AUTH_STORE__` / `__E2E_LYRIC_STORE__` / `__E2E_EQ_STORE__` /
`__E2E_SERVER_STORE__` / `__E2E_APP_CONFIG__` / `__E2E_ROUTER__` / `__E2E_APPEARANCE__` /
`__E2E_FLOATING_LYRIC__` / `__E2E_VIDEO__`（后者含 `open`/`close`/`isOpen`/`available`/
`platformTarget`/`sourceKind`/`enterVideoSource` —— 平台读数与源判定也暴露出来，因为视频这块
「没画面」的真实原因往往是决策错了而不是调用失败）。

**需要弄清「宿主到底发了什么」时，写个一次性探针 scenario**（如 `zz-probe.scenario.ts`，跑完删）：
TestBridge 能直接 eval 到 store，密集轮询 `getPlayerState()` 几秒就能把 tick 节奏、事件时序量化
出来。批46 的两条错误归因就是这么推翻的，比连猜带改省好几轮 iOS 构建。

### 后续功能方向（批47+）

- **视频播放**：批49 已到 Step 3/5 —— **Android 全屏原生播放已可用**，iOS 待做（Step 4，见 §3）。
  本批**明确不做**的部分：画面不在 Lynx 布局里（无法与歌词混排 / mini 小窗）、Android 侧只有裸
  surface 没有原生控件（要控件就得引 `media3-ui` 的 `PlayerView`，那套控件会跟 Lynx 控件抢
  transport）、PiP 两端都不做、`avi/flv/mpg` 依赖服务端转码、mkv 里的 AC-3/DTS 音轨在很多
  Android 设备上无授权可能「有画无声」
- **Web 音频 EQ/HLS/MediaSession**：`web/audio-host.js` 目前只实现了基础播放
- **Web 端 `openURL` / 文件选择**：`web-audio.ts` 同构的主线程桥接可解锁
- **渐进式队列加载**：当前一次性加载全部
- **歌词时间轴校准页**：编辑器中缺
- **音轨选择器**：`?track=N` 已通，缺枚举端点
- **下一曲 prefetch**：提前加载音频资源
- **单曲离线缓存**：需原生 fs 支持

---

## 4. 常用命令与验证

```bash
pnpm run build        # 必须同时列出 File (lynx) 与 File (web) 两个产物
pnpm exec tsc -b      # 类型检查（必须 -b，--noEmit 是空跑）
pnpm test             # vitest
pnpm run ios:build    # 改 ios/ 后验工程真能编译（不止 xcodebuild -list；需 macOS）
pnpm run build:web    # 改 web/ 后验产物，且要真的用浏览器打开

cd android && ./gradlew --no-daemon assembleDebug   # 改 android/ 后真编译（见 §3 的环境变量）
```

**「build 绿」不等于「能出包 / 能跑」**——批41 三条 P0 全是「闸门全绿而产物是坏的」。改 `ios/`/`web/`/`android/` 务必跑对应那条。批45 又添了一个变体：**Linux 上根本跑不了 iOS 那条**，所以 Swift 改动的「绿」只覆盖 vitest 结构闸门，不代表能编译。

---

## 5. 文档地图

| 文件 | 用途 |
|---|---|
| [`../../AGENTS.md`](../../AGENTS.md) | 开发规范 + 铁律（接手先读 §4–§6） |
| [`../plans/2026-08-14-audit-fix-plan.md`](../plans/2026-08-14-audit-fix-plan.md) | **主计划**：三类根因 + 批41–44 排期 + 明确不做清单 |
| [`PROGRESS.md`](PROGRESS.md) | 分批进展（批41–44 小结在文件顶部） |
| [`bug.md`](bug.md) | 缺陷清单（已全部勾选） |
| [`../plans/archive/web-support.md`](../plans/archive/web-support.md) | Web 支持原始计划 + 7 处被否证的假设（三次 realm 事故的源头） |