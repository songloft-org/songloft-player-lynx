# 工作交接（2026-08-15）

> 本文件是**给接手 AI 的交接说明**。读完这一篇就能继续干活；细节在链接里。
> 一句话现状：**批41–45 完成，工作树干净、闸门全绿（949 vitest）+ Android 可真编译**。审计计划已闭合；批45 收口了原生缺口，代价是 **iOS 侧代码从未编译过**（见 §3）。

---

## 1. 现在在哪、做到哪了

### 已提交

批41–44 的 15 个 commit **已推送**（`main` 与 `origin/main` 同步）。此前本文件写的「均未推送」已过期。批45 的改动见 §3。

| commit | 内容 |
|---|---|
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

批45 的改动**未提交**（等用户在 Mac 上编译过 iOS 再定）。闸门：`build` 双产物 / `tsc -b` / **949 vitest（97 文件）** / `android/gradlew assembleDebug` 全绿。

---

## 2. 四条必须内化的铁律（本项目反复踩的坑）

完整论述在 [`../../AGENTS.md`](../../AGENTS.md) §4「平台判断」「Web 平台」、§5「原生模块调用约定」「宿主 HTTP service 是我们自己的」、§6「测试与闸门原则」。这里是要点：

1. **DOM 探测不是平台判断。** web-core 把背景线程跑在真 Worker 里，那里没有 `document`/`localStorage`/`HTMLAudioElement`，所以 `typeof <DOM 全局>` 在 **Web 平台上回答「不是 Web」**。判平台一律用 `isWebPlatform()`（读 `SystemInfo.platform`，两 realm 都有）。已踩三次：下拉刷新文案 / 刷新掉登录 / Web 没声音。

2. **原生模块禁止强转成 Promise。** Lynx 原生方法是 callback 式，promisify 必须在 TS 适配层做（参考 `core/storage/native-storage.ts`）。`nm.X as SomePromiseInterface` 会让 `.then()` 落在 `undefined` 上——DLNA 页就是这么崩的。

3. **闸门要验语义，不验子串；mock 要保留真实前置条件；断言先反向验证会红。** pbxproj 闸门用 `.toContain` 被畸形行骗过；`mock-audio` 的 `play()` 不需先 `load()`，掩盖了冷启动播放键无效。本项目习惯：**每条修复都配一个「摘掉修复即变红」的回归测试**。批45 又踩了一次同款：新写的 iOS 注册闸门第一版仍是子串检查，被「整行注释掉的 `config.register(...)`」骗过——**反向验证是唯一发现它的手段**。

4. **`fetch` 走的是我们自己的宿主 HTTP service，不是 SDK 的。** 两侧都替换了（`net/SongloftHttpService.kt` / `SongloftHttpService.swift`），iOS 还从 Podfile 摘掉了 `LynxService/Http`。动网络层前先读 AGENTS.md §5 那一节：SDK 实现把 client 私有化（iOS 用的是不能挂 delegate 的 `URLSession.shared`），所以「允许不安全的 TLS」到不了 `fetch`，这才是替换的唯一理由。改这两个文件要保持「SDK 实现的逐行转写，只在 TLS 一处分叉」这个性质。

---

## 3. 批45（未提交）与剩余工作

### 批45 做了什么

原 HANDOFF 把两条记为「只有 Android」的 P2，复核后发现记录本身有偏差：`setArtworkUri` **不是桥接方法**（是 Android 引擎内部的 Media3 调用，跨桥的是 `setQueue` 的 `artworkUrl`），而 `setInsecureTls` **两个宿主都是半残的** —— Android 的 trust-all 装在 `HttpsURLConnection` 全局默认上，JS `fetch` 走 OkHttp 完全无视它，所以「开了开关仍然登录不上自签名服务器」；关掉开关也不会恢复。

改动：两侧各自**替换宿主 HTTP service** 拿到 TLS 钩子（`net/SongloftHttpService.kt` / `SongloftHttpService.swift`，iOS 顺带从 Podfile 摘掉 `LynxService/Http`），`InsecureTls` 收口三条出站路径且双向可逆；iOS 补锁屏封面；TS 侧补两处漏掉的 `applyInsecureTls`；4 条闸门收紧。详见 `PROGRESS.md` 批45 段与 `AGENTS.md` §5 新增的「宿主 HTTP service 是我们自己的」。

### ⚠️ 接手第一件事：在 Mac 上编译 iOS

**批45 的 Swift 代码一行都没编译过** —— 开发机是 Linux，无 `xcodebuild`/`swift`。协议签名不是猜的（从 maven / GitHub release 拉下 SDK 源码和官方参考实现读出来的），所有 ObjC 接口点也都用了显式 `@objc(selector)` + 与 Swift 导入名对齐的双保险，但仍需：

```bash
cd ios && pod install          # Podfile 变了（摘掉 Http subspec），必须重跑
pnpm run ios:build
```

最可能出问题的点：`SongloftHttpService` 对 `LynxServiceHttpProtocol` 的一致性（Swift 按自己导入的方法名匹配 @objc 协议要求）、`LynxServices.registerService(withProtocol:protocol:)` 的 Swift 导入签名。

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
| **iOS 自签名 + 媒体流可能仍不通** | P2 | 让 AVPlayer 接受自签名证书只能靠 `AVAssetResourceLoaderDelegate.resourceLoader(_:shouldWaitForResponseTo:)`，Apple 从未保证它会为普通 `http(s)` 资源投递 server-trust 挑战。已挂上但未验证。**判定**：对自签名服务器登录成功但播放失败即说明没触发。保证做法要自定义 scheme 代理 + 自己喂 `AVAssetResourceLoadingRequest`（等于重写字节范围流式加载 + 改写 HLS 播放列表内 URL），批45 刻意不做。 |
| **偶发全屏灰层** | 未定位 | 运行数分钟后整屏蒙中灰，重启即恢复。最可查嫌疑是 lynx-ui Sheet 的 backdrop 泄漏。**下次出现时跑**：`adb logcat \| grep -i "\[Sheet\] Invalid state transition"`（库自带的免费探针）。若真机（非 BlueStacks）复现不了，降级为环境记录。 |
| **`AndroidManifest.xml` 完全无闸门** | P3 | 权限 / service 声明漏写无人拦（批43 的悬浮歌词就吃过这个）。其余原生契约面已被闸门覆盖。 |

### 自签名功能实测（唯一能证明批45 达到目的的证据）

起一台自签名证书的 Songloft（`https://<lan-ip>:58091`），四步：① 开关**关** → 登录应失败；② 开关**开** → 登录成功（证明 fetch 路径通了，这是 Android 旧实现失效的那条）+ 出声 + 锁屏有封面；③ 开关再**关**、不重启 App → 登录应**重新失败**（证明可逆，旧实现这一步会错误地继续成功）；④ iOS 第 ② 步若登录成功而播放无声 → 上面那条 TODO 生效。

### 明确不做（来自审计计划 §明确不做）

键盘快捷键、HomeGridConfig、/configs KV 编辑器、完整 GPL 全文许可页、升级的版本选择/手动上传/回退、客户端下载页、Web 调试控制台、热更、桌面歌词独立窗口、深目录树虚拟化、Settings 主从九分类 IA、黑胶唱片环动画。

### e2e 测试

27 个 scenario 文件，107 个测试用例，**全部需要设备（adb / iOS Simulator）**。当前环境无设备，无法运行。接手后在设备上跑：

```bash
pnpm run test:e2e:android   # Android 设备
pnpm run test:e2e:ios       # iOS 模拟器
```

### 后续功能方向（批45+）

- **视频播放完整实现**：当前只有 ▶ 标识，需原生视频渲染面
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