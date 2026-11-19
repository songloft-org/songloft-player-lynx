# 桌面第一批探针契约

[English](../en/reference/desktop-probe.md) · [构建指南](../../desktop/README.md) · [验证记录](../project/desktop-phase1.md)

这是独立 Windows/macOS 技术探针的候选契约。既有移动/Web 模块及其闸门不变；`SongloftPlatform` 的存在不表示具备桌面 Bundle、托盘、缓存或更新能力。业务适配、Bundle、插件与更新源码另见[完整实现](../project/desktop-implementation.md) / [English](../en/project/desktop-implementation.md)。

## 平台与状态

| 目标 | 候选系统下限 | 当前证据 |
| --- | --- | --- |
| Windows x64 | Windows 10 22H2（19045）/ Windows 11 | 原生模块用官方 SDK 交叉编译并链接。实际加载和设备运行待测 |
| macOS arm64 | macOS 13 | macOS 26.6.2 原生视频持续提交，暂停、恢复、缩放和 CEF 脚本验证通过。单缓冲对照收到了系统鼠标点击 |
| macOS x64 | macOS 13 | Rosetta 上通过持续提交、暂停、恢复、缩放和 CEF 脚本验证。鼠标、实体 Intel 和最低系统待测 |

固定组合以 [`compatibility.json`](../../desktop/compatibility.json) 为准：Lynxtron/CEF/扩展头文件 0.0.31，libmpv 0.41.0。API 核对基准为 4.2；两个 macOS 进程实际报告 Lynx 4.4。下限是候选声明，尚未在对应最低系统验证。Linux、Windows ARM 不属于桌面发行目标。

## NativeModules 与视频元素

`desktop/native/probe.cc` 在创建 LynxView 时注册 `SongloftDesktopProbe` 和 `songloft-mpv-probe`。TS 调用位于 `src/desktop/probe.tsx`：

```ts
interface SongloftDesktopProbe {
  invoke(
    method: 'load' | 'pause' | 'status',
    value: string,
    callback: (error: string | null, status: ProbeStatus | null) => void,
  ): void
}

interface ProbeStatus {
  lynxSdkVersion: string
  positionSeconds: number | null
  paused: boolean | null
  audioOutput: string | null
  submittedFrames: number
  error: string
}
```

| 方法 | `value` | 语义 |
| --- | --- | --- |
| `load` | 媒体路径或 URL | 提交异步 `loadfile`；仅确认排队，不表示准备成功或初始定位完成 |
| `pause` | `yes` / `no` | 提交异步暂停/恢复；结果中的暂停值来自实际属性观察，可能尚未变化 |
| `status` | 空字符串 | 零超时读取已有事件，返回已观察状态与表面提交计数 |

合法调用通过 Callback 返回；错误时 `error` 为字符串、`status=null`。参数数量/类型非法时抛 TypeError。没有原生 Promise。状态中的 `error` 是引擎/画面诊断；位置单位为**秒**，不同于业务 `SongloftAudio` 的毫秒契约。未知/不可用属性保持 `null`，不填零或推断播放成功。

`audioOutput` 来自 `current-ao` 的字符串属性观察，如 `coreaudio`；在下一次 mpv 事件到来前复制字符串，不能持有事件内部指针。换源清空位置与帧计数，保留未变化的播放器暂停/音频设备观察值。该字段不证明实际听到声音，也不表示支持所有音频格式。

视频元素只暴露 UI 方法 `draw`，参数 `{}`，success 返回诊断字符串（空字符串表示本次没有报告错误）。BTS 至多保留一个请求，`invoke` success/fail 才释放门控。libmpv 输出软件 BGRA。macOS 创建 IOSurface，用 `PresentSurface` 尝试提交，缓冲满时让出当前绘制，Lynx 持有已接受的表面。Windows 写入借用的 D3D11 表面并调用 `SwapBack`。接受后才递增计数并调用 `MarkDirty`。验证连续解码还应检查像素变化和实际引擎位置。[Lynx 原生呈现实现](https://github.com/lynx-family/lynx/blob/0264af38be0644ab4e6a62d5059b180b58f486e5/clay/lynx_adaptor/native_platform_view.cc)

模块与视频元素共用引擎；绘制在 UI，控制在 BTS，互斥保护共享状态。活跃 render context 下使用异步控制/属性观察，不在绘制所需锁内同步等待播放核心。销毁单个画面不主动停止音轨，最后一个所有者先释放 render context 再释放播放器。宿主 Node 入口与 Lynx 模块分别使用普通 N-API / `_weak` ABI。

## 验证与交付边界

API double 检查异步控制、未知态、事件字符串所有权和释放顺序；真实集成检查核对变化的软件帧、暂停稳定与恢复进度。Linux 检查只使用测试内的 `ao=null`，Mac 保留默认输出并要求实际后端不是 `null`/`pcm`。原生编译/Callback、软件帧和 CEF 加载事件分别记录，不能合并成完整 UI 验收。

早期 Mac 锁屏探针在两帧后卡住。最新解锁测试用 `PresentSurface` 验证两架构的暂停稳定、画面像素变化和缩放。CEF 夹具在两架构上持续回传 JS 心跳。业务宿主在锁屏时跳过画面并保留音频。完整客户端的队列、插件桥、Bundle 和更新继续按统一验收验证。[实施记录](../project/desktop-implementation.md)
