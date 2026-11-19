# Desktop phase-one probe contract

[简体中文](../../reference/desktop-probe.md) · [Build guide](../../../desktop/README.en.md) · [Verification](../project/desktop-phase1.md)

This contract describes the independent Windows/macOS probe. Existing mobile/Web modules and gates stay unchanged; presence of `SongloftPlatform` does not establish Bundle/tray/cache/update support. Business adapters, Bundle, plugins and updates are covered in the [complete implementation](../project/desktop-implementation.md).

## Targets and status

| Target | Candidate minimum OS | Current evidence |
| --- | --- | --- |
| Windows x64 | Windows 10 22H2 (19045) / Windows 11 | The native module cross-compiles and links against the official SDK. Native loading and device runs are pending |
| macOS arm64 | macOS 13 | Video submits continuously on macOS 26.6.2. Pause, resume, resize and CEF scripts pass. A single-buffer comparison received an OS mouse click |
| macOS x64 | macOS 13 | Continuous submission, pause, resume, resizing and CEF scripts pass under Rosetta. Pointer, physical Intel and minimum OS tests remain |

[`compatibility.json`](../../../desktop/compatibility.json) pins Lynxtron/CEF/headers 0.0.31 and libmpv 0.41.0. API review baseline is 4.2; both actual macOS processes report Lynx 4.4. Minimum systems remain candidate declarations without corresponding device validation. Linux and Windows ARM are not desktop release targets.

## NativeModules and video element

`desktop/native/probe.cc` registers `SongloftDesktopProbe` and `songloft-mpv-probe` during LynxView creation. TS calls are in `src/desktop/probe.tsx`:

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

| Method | `value` | Semantics |
| --- | --- | --- |
| `load` | Media path or URL | Queues asynchronous `loadfile`; acknowledges submission, not readiness or initial seek completion |
| `pause` | `yes` / `no` | Queues asynchronous pause/resume; returned state comes from observations and may not have changed yet |
| `status` | Empty string | Reads available events with zero timeout and returns observed state/surface submission count |

Valid calls return through the Callback; failure supplies a string `error` and `status=null`. Invalid argument count/types throw TypeError. There is no native Promise. Status `error` contains engine/surface diagnostics. Position uses **seconds**, unlike the business `SongloftAudio` millisecond contract. Unknown/unavailable properties remain `null`, without invented zero values or inferred playback success.

`audioOutput` observes the string property `current-ao`, such as `coreaudio`. Copy it before the next mpv event; never retain an event-owned pointer. Loading clears position/frame counters but preserves unchanged player pause/device observations. The field does not establish human-audible sound or support for every audio format.

The video element exposes UI method `draw` with `{}` parameters. Success returns a diagnostic string. BTS permits one pending request until `invoke` reports success or failure. libmpv supplies software BGRA. macOS creates an IOSurface and uses `PresentSurface` to try submission. A full buffer lets the draw yield, and Lynx retains accepted surfaces. Windows writes into a borrowed D3D11 surface and calls `SwapBack`. On successful submission, the count increases and `MarkDirty` requests paint. Verification of sustained decoding also uses pixel changes and actual engine position. [Lynx native presentation implementation](https://github.com/lynx-family/lynx/blob/0264af38be0644ab4e6a62d5059b180b58f486e5/clay/lynx_adaptor/native_platform_view.cc)

Module and element share an engine. UI draws while BTS controls; a mutex protects shared state. With a live render context, use asynchronous control/observations without waiting synchronously for the core under a render-required lock. Destroying one surface does not explicitly stop audio; the last owner frees the render context before the player. The host Node entry and Lynx module use ordinary N-API and `_weak` ABI respectively.

## Verification and delivery limits

API doubles check asynchronous control, unknown state, event-string ownership and teardown order. Real integration checks require changing software frames, stable pause and resumed progress. Linux uses test-local `ao=null`; Mac retains default output and requires a backend other than `null`/`pcm`. Native compilation/callbacks, software frames and CEF load events are recorded separately and cannot establish complete UI acceptance.

An earlier locked Mac probe stalled after two frames. The latest unlocked tests with `PresentSurface` verified stable pause, changing video pixels and resizing on both architectures. The CEF fixture sent repeated JavaScript heartbeats on both architectures. The business host skips video presentation while locked and retains audio. Queue, plugin bridge, Bundle and update behavior go through consolidated acceptance in the full client. [Implementation record](../project/desktop-implementation.md)
