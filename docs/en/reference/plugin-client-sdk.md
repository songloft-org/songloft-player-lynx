# Plugin client SDK

HTML plugins use `@songloft/client-sdk` / `window.SongloftPlugin`; native Lynx plugins use `invokeHost` from `@songloft/lynx-plugin-sdk`. Both renderers share `src/features/jsplugin/domain/plugin-host-dispatch.ts`, aligned with Flutter's `PluginHostDispatcher`.

## Methods and behavior

| Namespace | Method | Behavior / return value |
|---|---|---|
| `host` | `getInfo` | Actual client version, `android/ios/harmony/macos/windows/web` platform and capabilities |
| `player` | `getState` | Complete songs in snake_case JSON; position/duration in seconds, volume 0–100 |
| `player` | `setQueue` | Resolve `ids`, skip unavailable songs, start at `startIndex`, retain optional `sourcePlaylistId` |
| `player` | `addToQueue` | Append with ID/type deduplication without changing playback |
| `player` | `insertToQueue` | Insert `id` at `index`, retaining the playing occurrence and position; insertion into an empty queue does not start playback |
| `player` | `removeFromQueue` | Remove by index using the existing player transition / stop behavior |
| `player` | `reorderQueue` | `oldIndex/newIndex` use Flutter's insertion position before removal; subtract one when moving forward, preserving the actual current occurrence with duplicate songs |
| `player` | `clearQueue` | Clear and stop, cancelling previous background queue fills |
| `player` | `play` | With `id`, select an existing occurrence or append; without arguments, resume |
| `player` | `pause/togglePlay/next/prev` | Reuse current player actions |
| `player` | `seek/setVolume/setPlayMode` | Seconds / 0–100; modes are `order/loop/single/random/singlePlay`, with unknown values falling back to `order` |
| `player` | `playPlaylistById` | Start 10 songs using the playlist's saved sorting, then fill remaining pages; return total, 0 for empty, -1 for load failure |
| `favorite` | `refresh` | With `songId/isFavorited`, update an existing favorite cache; without a cache or complete parameters, reload; never repeat the server write |
| `cookies` | `get` | Native cookie store name→value map, including HttpOnly; explicitly reject on Web or older shells lacking the method |

`singlePlay` stops on natural completion; manual previous / next still move through the queue. Initial, reentry and subsequent player snapshots use the same serializer. Volume, duration, source and same-length queue reorders trigger pushes; position-only changes do not.

Incremental favorite notifications cancel older queries before updating the cache. Cold caches load the full set rather than treating one song's notification as the entire favorites collection.

## Lynx platform support

| Platform | External links | Fullscreen library video | Query, apply and clear EQ | Verification |
|---|---|---|---|---|
| Android | Supported | Supported | Supported via the system equalizer | Verified on an Android 14 emulator |
| iOS | Supported | Supported | Supported for file-based media. HLS is unsupported. | Native package verification pending |
| HarmonyOS | Supported | Supported | EQ is unsupported. Queries return `supported: {}`. | Native package verification pending |
| macOS | Supported | Supported | Supported via libmpv | Shared desktop host EQ tests passed. Native package verification pending. |
| Windows | Supported | Supported | Supported via libmpv | Shared desktop host EQ tests passed. Native package verification pending. |
| Web | Supported from a user click | Supported in the host video page | Supported when the current output uses Web Audio | Verified in Chromium |

Use `host.getInfo().capabilities` to check which APIs the current host provides and `getAudioEffects().supported` to check the presets available on the current audio output. Casting disables plugin EQ and fullscreen playback requests. Plugin reverb is pending on all platforms.

## Plugin external links and fullscreen video

Check `host.getInfo().capabilities` before displaying either control.

| Capability | WebView SDK | Native Lynx SDK |
|---|---|---|
| `plugin.openUrl` | `host.openExternalUrl(url)` | `invokeHost('plugin', 'openUrl', { url })` |
| `player.openVideo` | `player.openVideo({ id })` | `invokeHost('player', 'openVideo', { id })` |

External links accept absolute HTTP and HTTPS URLs. Success means the system accepted the request. An unavailable handler or blocked browser popup returns an error. Trigger browser links from a user click. Fullscreen video accepts a library entry ID with a video track. An already loaded entry retains its position and resumes if paused. A different entry follows the host's Watch MV flow. Closing the video returns to the launching plugin page. The host delivers the acceptance reply before navigation. The video page displays transcoding and media errors. In the browser, the video page's fullscreen button enters browser fullscreen.

For fullscreen video, WebView plugins require the updated server-provided `common.js`. Rebuild native Lynx plugins with an SDK that supports acknowledging the fullscreen reply.

## Plugin audio effects

Check `host.getInfo().capabilities` for `player.audioEffects`. Apply can fail if the browser blocks the AudioContext. Playback uses song IDs from the server library.

| `player` method | Parameters and result |
|---|---|
| `getAudioEffects` | Returns `{ playbackId, supported, applied }`. The ID is visible to the plugin that started this session and is `null` for other callers. EQ presets appear in `supported.equalizer.presets`. `applied` is `null` until a plugin effect takes effect. |
| `applyAudioEffects` | Pass `{ playbackId, effects: { equalizer: { preset: "vocal" } } }` to replace the plugin effects and return the applied configuration. An unsupported effect or preset rejects the entire request. |
| `clearAudioEffects` | Pass `{ playbackId }` to restore the user's effects while playback continues. Repeated clears are accepted within the same valid session. |

A plugin starts a session with `play(id)`, `setQueue`, or `playPlaylistById`. Effects survive track changes within the session, pauses, leaving the plugin page, and background playback. Starting separate playback in the host, stopping, reaching the end of the queue, changing the cast target or account, disabling the plugin, and manual host EQ changes remove the temporary effects. Writes require a valid `playbackId` and an active plugin page. Temporary effects never persist to user preferences.

WebView plugins can use `player` from `@songloft/client-sdk` or `window.SongloftPlugin.player`. Native Lynx plugins call methods such as `invokeHost('player', 'getAudioEffects')` and inspect `ok`, `data`, and `error`.

A debug APK on an Android 14 emulator with WebView 113 verified starting playback from the plugin, applying EQ, retaining it across track changes, clearing it without stopping playback, and host EQ taking precedence. AudioFlinger reported the equalizer disabled, enabled, and disabled again in the same output session.

The external URL and fullscreen APIs were verified on an Android 14 emulator and in Chromium. Android opened the system browser, entered fullscreen at 12 seconds, and returned to the plugin while playback continued. Chromium verified opening a browser tab from a plugin click, applying and clearing EQ, opening a library video, and returning to the plugin page. Desktop host tests covered applying a temporary preset and restoring the user's EQ settings.

## Transport and platforms

- Web HTML plugins use iframe `postMessage`. Native WebView URLs carry `songloft_host=lynx`; shared `common.js` selects Android `LynxWebViewBridge`, iOS `webkit.messageHandlers.nativeApp`, or HarmonyOS `LynxJSBridge`. External-browser URLs omit this parameter.
- Native requests reach the dispatcher through `bindmessage`; `eval` dispatches a `MessageEvent` containing the correlated `songloft-host-reply`. Unmounts and URL changes discard old replies; after a document reload, the SDK ignores unknown request IDs. Load completion does not cancel requests made during startup. Shared assets retain Flutter `callHandler` and iframe transports.
- Lynx frames retain existing `SongloftPluginBridge` RPC. WebView and frame share song resolution, dispatch and state-push semantics.
- Cookie reads use `SongloftPlatform.getCookies(origin, callback)`, whose callback is `(error, cookiesJson)`. Android/iOS dispatch to the main thread; HarmonyOS uses the ArkWeb store. Empty stores return `{}`. The implementation does not read `document.cookie`.
- Native HTML plugins require a server `common.js` containing this transport. Cookie reads also require a native shell containing the new method; a JS hot update cannot add native methods to older shells.

The repository's Flutter dispatcher and toolchain SDK define the interface. XElement wiring follows the [official Lynx WebView documentation](https://lynxjs.org/api/elements/built-in/webview.html) and [4.0.1 source](https://github.com/lynx-family/lynx/tree/4.0.1/platform).

## Verification

### Further renderer comparison (2026-10-20)

Keeping the APK, SDK and official plugin unchanged, Android 34 / Emulator 35.6.11 was switched to Xvfb + Mesa llvmpipe. All 19 functional assertions pass with Reduce Transparency enabled, but native navigation icons were still intermittently missing. Default effects became unresponsive and were not accepted. The first test asserted before asynchronous audio preparation finished; the diagnostic snapshot already showed the queue and playback recovered. A bounded five-second wait for actual playback/pagination passes on retry without relaxing the result assertions.

Temporary page probes showed ordinary text and SVG shapes while some button glyphs disappeared. Glyphs returned after text-rendering adjustments and stopping WebGL. This is not a strict single-variable causal proof and does not justify a production CSS workaround. A fresh Android 35 / 16 KB image on Emulator 37.2.12 exited with 139 on the OpenGL path before the client was installed. Its Vulkan comparison exited with 137; kernel logs confirm an OOM kill of qemu. Environment failures therefore exist independently of the client, but the glyph-loss cause remains unresolved.

Evidence: `/tmp/songloft-sdk-e2e/rendering-validation.json`; Mesa results/screenshots in `mesa/`, temporary page probes in `glyph/`. No new implementation changes or complete visual acceptance in this round; stable-device verification of default effects and sustained rendering remains necessary. Temporary Xvfb processes and system links were removed; third-party plugin files were not modified.

### Latest: Android icon fix (2026-10-20)

Missing native SVG icons were traced to `servalsvg:0.1.1` omitting its x86_64 library; logcat reports failure to load `libserval_svg.so`. Official Maven `0.2.4` includes it for all four APK ABIs. The x86_64 runtime confirms successful loading, and home, navigation and plugin header icons render. Java methods actually called by XElement 4.0 remain compatible; `assembleDebug` passes.

With unchanged SDK implementation and official Now Playing 1.0.31, all 19 assertions pass again on Android 34 / Emulator 35.6.11 / WebView 113, without WebView JS exceptions. Plugin glyphs render in `official-now-playing-android.png` after reload but disappear again in the later `official-now-playing-android-settled.png`; host SVG icons remain correct. A shared cause or complete visual acceptance is not established. Evidence and source/artifact fingerprints: `/tmp/songloft-sdk-e2e/svg/validation.json`.

Still conditional: the successful run enables Reduce Transparency. Disabling it confirms `blur/androidGlass=true`, then the emulator host again exits with code 139. The SVG fix does not establish a fix for default glass effects. iOS/HarmonyOS compilation, real devices and long background sessions remain Not run; the other three ABIs were checked for packaged libraries only, not runtime behavior. Production JS/assets are restored; the test APK retains its test bridge. No commit, push or release. Earlier snapshots follow.

Shared regressions cover `plugin-host-dispatch.test.ts`, `favorites-non-react.test.ts`, `plugin-cookies.test.ts`, both plugin page suites and `native-module-contract.test.ts`. In the parent repository, `node --test scripts/tests/plugin-client-bridge.test.mjs` executes actual `common.js` transport, Flutter/iframe compatibility, reply, timeout and state-subscription behavior.

Shared JS, controlled native callbacks and browser tests do not replace iOS/HarmonyOS compilation or real cookie-store acceptance on all three native platforms. Actual results and Not run items appear in [development progress (Chinese history)](../../project/progress.md).

### Results for 2026-10-20

- Object: `songloft-org/songloft-player-lynx@e41987c5b6f3f4a0315e0e54914207c45868a458` plus this uncommitted tree; parent baseline `32ca05ccab18a68133ab1ccb776460610c835726`. Linux amd64, Node 22.17.1, pnpm 11.15.1 and Go 1.26.0. Source SHA-256 inventory and logs: `/tmp/songloft-sdk-e2e/validation.json`.
- Passed: `pnpm exec tsc -b`, `pnpm test --maxWorkers=2` (336 files / 3610 tests), `pnpm run build` (Lynx + Web), `pnpm run build:web`, `pnpm run test:release` (87 tests), and `android/./gradlew --no-daemon assembleDebug`. Parent shared-script tests pass 9 cases and `go test ./internal/jsplugin` passes; diff formatting and source encoding checks pass. The initial parallel build exited 137 and tests timed out; these are the final results after limiting concurrency.
- Negative checks: restoring old dispatch/player implementations in isolation fails all 7 new cases. Old `common.js` lacks the 3 native endpoints; 5 cases fail while the 2 Flutter/iframe cases remain green.
- Official plugin: installed Now Playing 1.0.31 by charce526 from the [official registry](https://raw.githubusercontent.com/songloft-org/songloft-plugin-registry/main/registry.json) and its [original manifest](https://raw.githubusercontent.com/charce526/songloft-now-playing/main/plugin.json). Published ZIP SHA-256: `e46fd19d0fe0351b41bd93c4b0944babbe439f1c8ff05969e096b693eb67821a`. Plugin code was not modified.
- Actual Docker Chrome UI login, playback of a synthetic test playlist and opening this plugin pass 16 assertions: advancing real audio time, card pause/resume, next/previous, mode cycling, volume slider 55, persisted server favorites plus a separate `favorite.refresh` SDK call, queue edits, background pagination and explicit Web cookie rejection. This plugin version's favorite button writes the API directly and does not call `favorite.refresh`; SDK incremental synchronization is verified separately. Page errors are empty. Screenshots at 1440×1000 and 390×844: `/tmp/songloft-sdk-e2e/official-now-playing-playing.png` and `official-now-playing-mobile.png`; complete result: `plugin-check-final.json`.
- Not run: iOS / HarmonyOS compilation, real devices / cookie stores on all three native platforms, and long native-plugin background sessions. No connected Android device or Apple toolchain is available. No commit, push, parent gitlink update or release.

### Same-day review fixes

Review found and fixed three issues: native load completion cancelled pending startup SDK replies; synchronous reply `eval` failures caused unhandled Promise rejections; HarmonyOS lost the `__proto__` cookie name by storing cookies in a plain object. Page tests now cover startup timing and view destruction. Cookie serialization uses Map and a controlled-store test executes the actual ArkTS method. Both startup-timing and cookie assertions failed before these fixes.

The fixes pass 575 tests in 22 affected files; log: `/tmp/songloft-sdk-review-tests.log`. Types and dual bundles pass; build log: `/tmp/songloft-sdk-review-build.log`. This review changes native paths only. The preceding Web screenshots belong to the earlier validation snapshot. Native devices and iOS/HarmonyOS builds remain Not run; JS transpilation tests do not replace HAP compilation.

### Complete post-review verification

- The same client baseline plus the current uncommitted implementation passes all 3611 tests in 336 files, types, production dual bundles and 87 release checks; all 9 parent shared-script tests pass. Logs use `/tmp/songloft-sdk-continued-`; fingerprints and commands are in `/tmp/songloft-sdk-e2e/continued-validation.json`.
- With current server assets and post-review Web output, official Now Playing 1.0.31 again passes 16 real-browser assertions with no page errors. Results: `plugin-check-current.json`; new screenshots: `official-now-playing-current-playing.png` and `official-now-playing-current-mobile.png`, all under `/tmp/songloft-sdk-e2e/`.
- The rebuilt Android test JS is copied into the APK; `assembleDebug` and installation pass. Native acceptance attempts are environment-blocked: the isolated Android 34 x86_64 emulator was first killed by host OOM; serial retries with two software renderers hit host `RenderThread` segmentation faults, and disabling GPU still exits after app launch. Plugin interaction was never reached; native SDK/cookie acceptance is not claimed. Evidence: `/tmp/songloft-sdk-emulator*.log` and `/tmp/songloft-sdk-native-{bundle,assemble}.log`.
- iOS/HarmonyOS compilation, real-device cookie stores and long background sessions remain Not run. No commit, push or release; production bundles without the test bridge are restored after testing.

### Android native acceptance (conditional)

With the same Debug APK, official Emulator 35.6.11 / Android 34 x86_64 / WebView 113.0.5672.136 and the app's Reduce Transparency enabled, official Now Playing 1.0.31 passes 19 native assertions: host identity, advancing native audio time, next/previous, card pause/resume, modes, volume, persisted server favorites and refresh, queue edits/clear/pagination, real HttpOnly cookie reads, and SDK replies to requests made at `DOMContentLoaded` after reload. No WebView JS exceptions occurred.

Evidence under `/tmp/songloft-sdk-e2e/`: `android-sdk-final.json`, `android-sdk-environment.json`, `native-validation.json` and `official-now-playing-android.png`. An initial automated tap selected the old card before software WebGL finished moving the carousel; waiting for animation passes without modifying the third-party plugin or implementation. The tested APK SHA-256 matches the preceding build record.

Limits: several 37.2.12 renderers, default effects on 35.6.11 and an isolated `/dev/shm` all exited, so version or shared memory alone is not an established cause. This run completes stably with Reduce Transparency; default glass effects remain unaccepted. Some control symbols are still missing in screenshots although their DOM text, color and dimensions exist; the cause is unconfirmed and complete native visual correctness is not claimed. iOS/HarmonyOS compilation, real devices and long background sessions remain Not run. No commit, push or release.
