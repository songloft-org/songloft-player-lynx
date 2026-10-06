# Handoff (2026-10-07)

This page records current scope and validation limits. Batch evidence is in [progress (Chinese)](../../project/progress.md); known issues are in [bugs (Chinese)](../../project/bugs.md). Historical uncommitted labels and counts describe their original snapshots. [中文版](../../project/handoff.md).

## 1. Current completion

This is a preview client. Playback, library/playlists, lyrics, plugins, themes, multiple servers, and administrative settings are implemented, with four host implementations. About separates client and server updates; the client checks dev or latest stable according to its immutable shell channel. All three updater sources are integrated, Android/Web have local flow evidence, and iOS/HarmonyOS compilation/device acceptance remain open. Production update signing is unconfigured. **Native desktop clients and a bundled local backend remain outside this work.** Unused `bundleMode/systemTray` probes do not represent completed features.

Android has recent compilation evidence. Older successful iOS CI and failed HarmonyOS CI cannot establish that current code is publishable. Background playback, casting, notifications, and video require devices; JS tests cannot establish their behavior.

## 2. Open-source and release preparation

Apache-2.0 licensing and bilingual READMEs, contribution, installation, build, testing, and release guides are present. Historical Chinese audits remain in their original language, as marked in the English [index](../README.md).

Unified [build-and-release.yml](../../../.github/workflows/build-and-release.yml):

- Main code pushes update dev; dispatch reruns builds; v\* tags publish stable or preview releases.
- APK, unsigned IPA, HAP, and standalone/embedded Web archives share metadata.
- JS, signing, embedded-version and payload checks, and all five packages must pass before publication.
- `pnpm release patch --dry-run` previews the plan. Actual release synchronizes versions, commits, tags, and pushes atomically. See [releasing](../guides/releasing.md).
- Android/iOS register TCP bridges only in Debug on loopback. JS E2E requires explicit `SONGLOFT_TEST_BRIDGE=true`; production packages reject it.
- Web assembly clears before copying, fixing embedded builds that deleted their bundle and engine.

Implementation and local validation are complete. After pushing, GitHub Actions/Release are authoritative for cloud builds and downloadable assets; repository visibility is managed separately. Required Android/HarmonyOS secret names are configured, but actual signing needs CI verification. The IPA needs user signing and cannot be directly installed.

## 3. Validation for this change

Linux can validate JS, scripts, and Android; iOS/HarmonyOS require their toolchains. Final evidence is in this batch's [progress entry (Chinese)](../../project/progress.md). Workflow linting cannot replace cloud signing and compilation.

Casting diagnostics now use the existing client log, including device details, media URL/MIME, operations, native SOAP error codes, and playback state changes, with token redaction and polling deduplication. All 258 JS test files / 2786 tests, type checking, and both Lynx/Web builds pass; no native methods were added. Direct TV testing reproduced 716 with Flutter's inline DIDL; the escaped version of the same HTTPS MP3 request was accepted, and Flutter serialization has been fixed. The TV still remained TRANSITIONING and did not fetch an unauthenticated HTTP MP3 either. The user confirmed the TV displays “casting is unavailable in the current scene”; this receiver restriction needs attention on the TV. Client log export and successful playback have not been verified on devices; these changes have not been pushed or published.

## 4. Outstanding work

1. Configure signing and run all platform jobs. Test APK/HAP upgrades and re-signed IPA installation.
2. Rerun Android/iOS E2E; verify notification lyrics, background queues, plugin foreground recovery, long requests, and DLNA.
3. HarmonyOS lacks a notification-lyrics method, has placeholder clipboard behavior, and has contract-coverage gaps; see [bugs (Chinese)](../../project/bugs.md).
4. Open iOS font-size and HLS self-signed URI issues remain in bugs.
5. Web subpath deployment is unverified. Plugin ordering needs newer backends supporting `/settings/plugin-order`; older servers return 404.
6. Desktop clients and bundled backends are excluded from this work. Device batch caching/offline lists, Web data transfer/shortcuts, and remaining native capabilities continue under the approved plan.

### Current source review (2026-10-07)

P1 now consumes `/songs/{id}/audio-tracks` with `{tracks: [...]}` and provides a multiple-track sheet in the player menu. Switching uses the actual index and preserves position and playback intent. The source-readiness contract is implemented in all four hosts; older shells disable switching and request an upgrade. Android device tests and real Web-browser playback pass; iOS/HarmonyOS compilation and device acceptance remain open. Video remains deferred as requested. Evidence and outstanding checks are in [progress (Chinese)](../../project/progress.md).

P2a adds independent bundle/manifest signing, compatibility models, and the immutable prepare-stage shell snapshot; see [client update protocol](../reference/client-updates.md). Full JS and Node/Java protocol regressions pass. Production signing remains unconfigured. That stage had no in-app updater entry; subsequent P2b/P2c evidence follows below.

The first P2b batch integrates Android modules, immutable APK metadata, and the root template loader. The shared TS facade handles timeouts/cancellation, real-route startup confirmation, and render-boundary failures. All **11 Android JVM tests** pass using real TLS/files, covering cancellation, disk tampering, unconfirmed rollback, channel/newness rules, and shell replacement. Full JS **263 files / 2849 tests** and **19 publishing-tool tests** pass. iOS/HarmonyOS modules and the P2c UI remain in progress; this does not establish hot-update completion on all three platforms. See the batch's progress entry for final compilation and emulator evidence.

The second P2b batch integrates iOS signature verification, streaming download, disk state, the root template provider, and fatal startup-error reporting, including Xcode source/resource entries and module registration. Apple CI now includes a native-core verification harness, but this Linux environment has neither Xcode nor swiftc: **it has not been compiled or executed, and device acceptance remains open**. The missing bundle-host snapshot in shared CI artifacts is fixed, with all three copy scripts and packaged identity/public keys covered by regressions. All 298 focused contract tests and 20 publishing-tool tests pass. HarmonyOS and P2c remain in progress; evidence is in progress.

The third P2b batch integrates eight HarmonyOS methods, immutable rawfile identity, public-key verification, independent system-TLS streaming, root template selection, and fatal-error reporting. Automatic redirects are disabled and each HTTPS hop is validated manually; cancellation, next-cold-start confirmation/rollback, and builtin restore are implemented. Five core regressions execute the actual transpiled source with real Node RSA/HTTPS/filesystem adapters; all 286 native structure tests and 25 publishing-tool tests pass. **This does not establish ArkTS/HAP compilation or device SDK behavior**, and the required environment remains unavailable. Source integration on all three platforms allows P2c UI work to proceed while P2b acceptance gaps stay open.

A next-song Range GET already runs at 80% progress, so prefetch is not wholly missing. Web file bridges exist, but `dataTransfer` remains explicitly disabled. HarmonyOS `Index.ets` registers video and creates an XComponent; iOS now uses an underlay AVPlayerLayer. Existing source does not establish device acceptance.

P2c adds the About entry: channel checks, shell/bundle identity, native-verified downloads, progress/cancel, cold-start/builtin restore guidance, and APK/IPA/HAP/Web deployment links. Bridge 2 adds independent system-TLS `fetchMetadata` without business certificate bypass; older eight-method shells retain release-page links. A local Android signed fixture verifies actual UI downloads, uninterrupted playback, cancellation cleanup, bundle B/shell A after cold start, and builtin restore. Web Worker checks omit credentials, with both languages, maximum text size, and three viewport widths verified. Production signing and Apple/HarmonyOS compilation/device acceptance remain open. Continue the approved P3 cache work without pushing; evidence/counts are in progress.

The first P3a batch integrates the shared cache identity/variant model and Callback facade with Android's durable v2 index/task scheduler. Downloads freeze identity, track, quality and normalization; snapshots omit credentials, while legacy files are preserved and counted toward capacity. Cancellation terminates real connections and queued cancellation opens none. Identity loads before playback; server switches use token-bound usernames. Actual device UI caching of default/track 1 produced separate MP3 files. Cold-start playback, pause and resume passed with the backend port unavailable, after correcting the HTTP-only data source's inability to open local files. iOS/HarmonyOS v2, batch UI and the offline list remain in progress. See [device cache](../reference/device-cache.md) for the contract and progress for validation counts. Commits remain local without pushing.

The second P3a batch integrates iOS v2 source: durable Documents storage, identity/actual-container indexing, serial scheduling, streaming capacity/disk checks, real task cancellation and array progress events. The original five and new nine methods share the scheduler. The module now conforms to LynxContextModule and the new files are referenced in Xcode. Apple CI includes an actual-core verifier and loopback HTTP fixture, but Linux lacks Swift/Xcode; the program has not been compiled/executed. Syntax parsing and 293 method-gate tests do not constitute device evidence. Full JS 269 files / 2933 tests and all 26 publishing-tool tests pass. HarmonyOS v2 and P3b/P3c continue; iOS TLS/download/background/playback device acceptance remains open.

## 5. Taking over and validating

Read [AGENTS.en.md](../../../AGENTS.en.md) and [pitfalls (Chinese)](../../project/pitfalls.md), then follow [build](../guides/build-and-run.md) and [testing](../guides/testing.md).

```bash
pnpm run typecheck
pnpm run prepare:build
SONGLOFT_BUILD_METADATA="$PWD/.build/version.json" pnpm run build
pnpm test
pnpm run test:release
```

Copy fresh bundles and compile after native edits. Debug E2E needs the JS flag and adb forward/iproxy. Package inspection requires production bundles without the bridge; do not mix them.
