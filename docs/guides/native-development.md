# 原生模块开发

怎么给现有模块加一个方法、怎么新建一个模块，以及每一步漏掉会怎样。

> **调用约定的铁律在 [AGENTS.md §5](../../AGENTS.md)**（原生方法不返回 Promise、禁止强转、三侧同步、事件名逐字一致）。本篇是操作步骤，不重复那些论述。
> 已有模块的契约清单 → [reference/native-modules.md](../reference/native-modules.md)。

## 给现有模块加一个方法

四处必须同步，**漏任一处都是静默失败**：

| # | 位置 | 漏掉的后果 |
|---|---|---|
| 1 | TS 调用侧（`src/native/*.ts`） | —— |
| 2 | Kotlin `@LynxMethod fun x(...)` | TS 侧 `mod?.method` 的可选链把它吞掉 ⇒ no-op |
| 3 | iOS `methodLookup` | 同上 |
| 4 | 契约闸门 `src/__tests__/native-module-contract.test.ts` | 以上三条谁漏了都没人告诉你 |

**注解比方法本身更容易漏**：`fun x()` 写了但 `@LynxMethod` 没写，模块照样编译、方法照样存在、调用照样静默无效。闸门断言的是 `@LynxMethod\s+fun X(` **正则**而不是 `fun X(` 子串，正是为了抓这个 —— 旧版子串断言抓不到，而失败信息还谎称自己在验注解。

### 写完怎么验

```bash
pnpm test                                              # 契约闸门在这里
cd android && ./gradlew --no-daemon assembleDebug       # Kotlin 真编译
pnpm run ios:build                                     # Swift 真编译（需 macOS）
```

契约闸门是 vitest，**它不编译原生代码** —— 方法名对得上不代表 Kotlin/Swift 能编译。两条都要跑。

## 新建一个模块

在上面四步之外，还要：

5. **注册**。Android 在 `SongloftApplication` 的 `registerModule(...)`；iOS 在 `ViewController.buildConfig()` 的 `config.register(...)` **且 pbxproj 四处登记**。`@LynxMethod` 写全了但没注册 = 模块不存在。
6. **扩闸门的三处**：`hosts` 表 + `modules` 表 + 一段 `describe`。
7. **更新 [AGENTS.md §5](../../AGENTS.md) 的两张平台模块表** —— 这一步以前不在清单上，于是漂了五个条目（闸门覆盖 9 个模块，表里只列了 6+5）。**闸门保护代码，保护不了描述代码的表格。**
8. **Android 另需 `AndroidManifest.xml`**：新 Service/Activity 必须声明。`android-manifest-contract.test.ts` 从 Kotlin 源码**推导**需求（基类名以 `Service`/`Activity` 结尾就必须有声明，反向亦然），所以这条有闸门兜着 —— 但它是 2026-08 才补的，此前悬浮歌词整个功能死了四个批次没人发现。

### iOS 特有的三个坑

- **callback 类型必须是 `@escaping (String) -> Void`**，不能用 `LynxCallbackBlock`（NSArray error-first 风格）。用错后 selector **仍能匹配且能被调用**，但 Lynx 桥传入闭包的参数路径不同，导致拿不到 scene、**静默返回 false**。
- **Swift 怎么看 ObjC 声明**：importer 会剥掉与参数类型名重复的 label 词。拿不准就写个探针文件（刻意写错类型标注）让编译器报出真实签名 —— 猜三次不如探一次。批45 实测对照：

  | ObjC selector | Swift 导入名（编译器认的） |
  |---|---|
  | `invokeWithRequest:callback:` | `invoke(with:callback:)`（剥 `Request` ≈ `LynxHttpRequest`） |
  | `invokeStreamingWithRequest:callback:withDelegate:` | `invokeStreaming(with:callback:with:)`（剥 `Request`/`Delegate`） |
  | `processChunkedData:withData:` | `processChunkedData(_:with:)`（剥 `Data` ≈ `NSData`） |
  | `+registerServiceWithProtocol:protocol:` | `registerService(withProtocol:protocol:)`（原样） |
  | `+getInstanceWithProtocol:` | `getInstanceWith(_:)`（保基础词、剥 `Protocol`；**不是** `getInstance(with:)` 也不是 `instance(withProtocol:)`） |
- **`@available` 守卫**：`LiveActivityModule` 是 `@available(iOS 16.2, *)` 而部署目标 16.0，`config.register(...)` 不包 `if #available` 就是硬编译错。

### 线程

**原生模块方法跑在 Lynx JS 线程上。** 碰主线程创建的 View 会抛 `CalledFromWrongThreadException`，而模块里常见的 `catch (_: Exception) {}` 会把它整个吞掉 —— 悬浮歌词就是这样「窗口浮出来了、一行歌词也不显示、logcat 干净」。需要碰 View 就 `Handler(Looper.getMainLooper()).post { … }`（iOS 对应 `DispatchQueue.main.async`）。

## TS 适配层怎么写

原生是 callback 式，**promisify 必须在 TS 层做**，逐方法包一层。参考 `src/core/storage/native-storage.ts` 与 `src/features/player/data/song-cache.ts`。

两个已经用血换来的模式：

- **禁止 `nm.X as SomePromiseInterface`** —— 原生返回 `undefined`，`.then()` 直接 TypeError，页面 `useEffect` 挂载即炸（DLNA 页就是这么崩的）。
- **模块完整性检查要认「新方法」**：`song-cache.ts` 探测的是 `getCacheInfo` 而不是 `download`，因为 `download` 的**参数个数变过** —— 一个旧壳里有老 `download` 的宿主会报「可用」，然后被喂进它绑不了的参数。**部分可用的模块比完全没有更糟**，`navigation.ts` 因此逐个检查三个方法，缺一个就整体当没有（缺的那半是「用户永远退不出去」）。
- **不要 memoise「不可用」的那个分支**：`getNavigationModule()` 只缓存真适配器。back controller 在首帧前就启动，此时 `NativeModules` 可能还没填充，把「不可用」latch 住会让返回键整个会话失效 —— `getFloatingLyricModule()` 掉过这个坑。

## 能力探测

`src/native/platform-capabilities.ts` 按**模块名**探测，每个能力只看自己的模块。别用 DOM 探测判平台（见 [Lynx 约束](../architecture/lynx-constraints.md)），也别写「探测器写好了但没有调用点」—— `tsconfig` 没开 `noUnusedLocals`，那样的死代码不会报错，而后果是「Web 上一批入口点了没反应」。

## 相关

- [reference/native-modules.md](../reference/native-modules.md) —— 9 个模块的契约清单
- [AGENTS.md §5](../../AGENTS.md) —— 调用约定铁律、宿主 HTTP service、视频画面借用
- [平台差异](../architecture/platform-differences.md) —— 哪个能力在哪个平台上存在
- [构建与运行](./build-and-run.md) —— Kotlin/Swift 真编译的命令与环境
