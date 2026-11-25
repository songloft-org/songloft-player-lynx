# #591 Favorite long-poll cancellation after page changes

The baseline is `2f3010c5beff70b1e2263ff1ecdb47840201c3fb`, with this change kept in the uncommitted working tree. The report describes controls becoming unresponsive after several minutes on the voice settings page while the server sees the favorite-change long poll repeatedly time out and reconnect.

The favorite-change watcher now owns the lifetime of its HTTP request. Stopping the watcher, or switching server, account, foreground state, or background state, aborts the in-flight request immediately. Calling `run()` twice on the same watcher reuses one loop. Each session captures its server address so a global configuration update cannot retarget an old subscription. The 35-second receive deadline, cursor advancement after a successful refresh, and exponential retry backoff remain in place.

## Verification

- `pnpm exec vitest run src/features/library/__tests__/favorite-change-watcher.test.ts src/features/library/__tests__/favorite-changes.test.ts`: 8 tests passed.
- `pnpm exec tsc -b`: passed.
- `pnpm test`: 376 files, 3929 tests passed.
- `pnpm run build`: Lynx and Web bundles passed, with the existing `touch-action` warnings.
- `pnpm run build:web`: Web bundle build and deployment copy passed.
- New regressions cover aborting an in-flight request, ignoring a late response, and single-flight execution for one watcher. The isolated negative run against the old implementation was not run. The new abort assertion would fail there because no abort signal was available.

The November 24 verification did not cover a long-lived Docker Chromium session or native devices. The favorite subscription change subsequently shipped in the dev image with Lynx `02def364483c15ade0a3aa4d2a972bc0b5454083` and Songloft `2587f7823504eb6b6087b1eb16600f87c563fb11`.

<a id="web-user-timing"></a>

## 2026-11-25 · Web User Timing follow-up

The reporter still saw the slowdown on `2587f78`. An isolated Linux amd64 Docker instance used the CI image for that commit, its embedded Lynx Web client, and the released smart speaker plugin `v2026.11.23.2` (`21efa9e6ef00dfdff971dd58c757d9d36d263530`). Docker Chrome 121 accessed the actual nested plugin through a local HTTPS reverse proxy. The test used fixture account, playlist, and device data. It sampled browser-thread CPU and worker User Timing entries every 15 seconds and clicked all four voice cards, waiting for each card to become selected.

With conversation monitoring off, the test cloned the real status socket's initial frame and sent a status with alternating volume once per second. At 90 seconds, the original build had accumulated 41,215 marks and 94,070 measures. The plugin worker used 89.8% of one core, and all three clicks that needed to switch the current panel exceeded five seconds. The CPU profile pointed to `profileEnd → performance.clearMarks()`. Most marks came from `ReactLynx::diffFinishNoPatch`. `@lynx-js/web-core@0.23.1` records these events whenever the browser provides the User Timing API.

- Clearing only marks at 30 seconds reduced worker CPU to 14.2% in the next sample, compared with 36.0% on the original build. CPU rose again as marks accumulated. Clearing only measures yielded 34.2% in that sample and later reached 90.9%.
- The local proxy disabled User Timing tracing by replacing only the Web main-thread and worker timing modules. With the same one-frame-per-second workload, the test had injected 123 frames at 120 seconds. Worker CPU was 1.1%, there were zero User Timing entries, and the four final panel switches took 53–115 ms.
- Returning false from only `isProfileRecording()` in the Web main thread and worker also prevented accumulation. After 121 frames in 120 seconds, the worker retained zero marks and one measure. Worker CPU was 0.7%, and the four final panel switches took 48–88 ms.
- In the five-minute comparison with a frame every six seconds, both runs received 50 frames. The original build accumulated 28,163 marks and 70,311 measures, and the final panel switches took 92–240 ms. The run with tracing disabled had zero entries and final switches of 44–73 ms.
- With conversation monitoring enabled, a two-second poll interval, debug logging on, and no injected status frames, the original nested page received only 13 status frames and one conversation snapshot over 15 minutes. All 64 clicks switched panels, with final switches taking 70–136 ms. The slowdown did not appear with this idle fixture.
- The source of repeated renders in the reporter's environment still needs a trace. Actual Edge, a real Xiaomi account, and physical speakers were not tested. The experiment replaced Web assets in the isolated deployment. Repository runtime code has yet to change.

Upstream shipped the profiling fix in web-core 0.26.8. Its `isProfileRecording()` returns true only when the view explicitly enables tracing and the browser provides User Timing. The image used for the follow-up pinned `0.23.1`. [Upstream fix](https://github.com/lynx-family/lynx-stack/pull/4330) · [web-core 0.26.8](https://github.com/lynx-family/lynx-stack/releases/tag/@lynx-js%2Fweb-core@0.26.8)

### Upgrade comparison with 0.26.8

A local HTTP reverse proxy served web-core 0.26.8 from the npm release, with its SHA-512 verified, against the same isolated image. With the upstream runtime assets, the main app opened and the nested plugin did not appear. Applying Songloft's existing `nativeModulesMap` compatibility patch to the new `client.js` restored the nested smart speaker page.

Both Docker Chrome 121 runs received 91 changing status frames. At 90 seconds, the 0.23.1 plugin worker held 42,168 marks and 95,644 measures. Its four panel switches took 195–686 ms. The 0.26.8 plugin worker held zero marks and one measure, with switches taking 49–87 ms. The full existing `postinstall` script still rejected six patterns with 0.26.8. A production upgrade requires migrating those patches and rebuilding the Web assets.

<a id="lynx-upgrade"></a>

### Lynx upgrade verification

The Lynx client baseline was `37f6d43b0bc9a091a63bd0b2b2951153670d5a22`. The local candidate updated the Lynx npm dependencies in the shared client and sample plugin, including Web Core 0.26.9, ReactLynx 0.129.4, Rspeedy 0.19.0, and Lynx UI 3.143.0. It ported the input, slider, sortable, and Web Core patches. The Web Core patch routes `blur-view` through Songloft's moving lens subclass.

Docker Chrome 121 on Linux amd64 opened the rebuilt embedded Web client, used a keyboard to sign in, and opened the released smart speaker plugin on backend `2587f78`. The fixture sent 91 changing status frames in 90 seconds. The plugin worker retained zero marks and one measure, with final panel switches of 116–223 ms. Edge, a real Xiaomi account, and physical speakers are pending.

Android moved to Lynx 4.2.0, PrimJS 4.2.1, Debug Router 0.0.22, and Serval SVG 0.3.4. Gradle 8.7 `:app:assembleDebug` passed on Linux amd64. The APK contained the expected bundle, native version metadata, and Lynx and SVG libraries for all four ABIs. The merged manifest declared `minSdk` 21.

iOS and HarmonyOS moved to Lynx 4.2.0 and PrimJS 4.2.1. Both iOS Podfiles declare the official Lynx Specs source. CocoaPods 1.16.2 resolved both iOS lockfiles reproducibly. OHPM 5.1.3 generated the HarmonyOS lockfile, and the WebView storage and event reporter patches were exercised against the installed SDK. Bundle updates on all three mobile platforms require an exact runtime match, so older shells need a full client update first.

Desktop packaging moved to Lynxtron Builder 0.0.31. Its published npm package includes the Lynxtron and DMG patches and `@electron/get` 3.1.0. The desktop compatibility tests check those bundled dependencies directly. All 38 desktop tests passed locally on Linux. Installer builds and device runs are tracked separately.

[Reporter’s retest](https://github.com/songloft-org/songloft/issues/591#issuecomment-7160069715) · [Original image CI](https://github.com/songloft-org/songloft/actions/runs/45420147112)
