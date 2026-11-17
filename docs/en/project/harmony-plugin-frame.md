# HarmonyOS miot blank page investigation (2026-11-17)

## Finding and implementation

Baseline: `songloft-org/songloft-player-lynx@173fa140c70ba80998cb8f49960619306986ef86`, parent `songloft-org/songloft@caf3729128ff85dbd5280b861ea9eace439b0efa`. Existing desktop candidate changes are preserved. The user subsequently authorized this batch's commit, push and parent gitlink update. Actual commits and same-SHA CI are recorded in `/tmp/songloft-harmony-miot/delivery.json`. No stable release is created; device acceptance remains unverified.

`LynxPluginFrame` originally rendered `<frame>` on every native platform. HarmonyOS Lynx 4.0.1 does not implement it, and `Index.ets` did not register a Behavior. A template fetcher and bridge alone do not create a child view; the SDK falls back to an empty UIView for unknown UI tags. This establishes a defect in current source. The reporter's versions and device are unavailable, so this is not a claim of reproducing their installed package.

Evidence includes the locked `@lynx/lynx@4.0.1` HAR source and upstream [Harmony UIOwner](https://github.com/lynx-family/lynx/blob/4.0.1/platform/harmony/lynx_harmony/src/main/cpp/ui/ui_owner.cc), [XElement registry](https://github.com/lynx-family/lynx/blob/4.0.1/platform/harmony/lynx_xelement/registry.cc), and [FrameElement](https://github.com/lynx-family/lynx/blob/4.0.1/core/renderer/dom/fiber/frame_element.cc). The built-in frame also has a separate core template/data pipeline; registering a UI with that name does not establish full Harmony support.

Harmony now renders `songloft-plugin-frame`. Its Behavior creates an independent LynxView with explicit template/generic/media fetchers, component behaviors and its own `SongloftPluginBridge`. Initial props carry the server prefix, frame identity, theme, token and player snapshot. Late tokens and later props update the existing context. URL/identity replacement and disposal release the BuilderNode and remove child bridge entries by context identity; stale load callbacks are ignored. The child engine receives window lifecycle transitions without registering the root updater failure or appearance/lifecycle singletons. Diagnostics log error codes, excluding URLs and credentials. Android/iOS and Web retain their existing paths.

Install a rebuilt HAP containing both the ArkTS changes and shared JS. A server/plugin update or JS hot update cannot add this native element to an older shell.

## Verification

Environment: Linux x86_64, Node 22.17.1 for shared JS, bundled Node 24.14.1 for HAP compilation, Lynx Harmony SDK 4.0.1. Evidence and final file SHA-256 snapshot: `/tmp/songloft-harmony-miot/verification.json`. The tested object is the baseline plus this worktree.

- Six adapter tests execute production ArkTS classes: registration/initial props, deferred creation/token updates, actual bridge RPC/replies/pushes, replacement/stale callbacks, window lifecycle and identity-safe cleanup. ArkUI's builder is replaced, so these are not rendering evidence.
- Twelve focused component tests pass, including the Harmony tag, native bundle URL, initial props and bridge cleanup, plus the existing Web/Android paths.
- The isolated old-code check fails because no child is created (actual 0, expected 1): `frame-before-final.log`. The old component fails for the missing custom element: `component-before-allowed.log`. The first component attempt could not run because of Vite's file allowlist in the isolated directory; an isolated allowlist fixed that environment issue without changing workspace test configuration.
- `pnpm exec tsc -b`, `pnpm run build` (both targets), and `pnpm test --maxWorkers=4` (368 files/3848 tests) pass. Logs: `types-package.log`, `build-package.log`, `tests-final.log`. `pnpm run test:release` passes all 95 checks (`release-package.log`). Its first concurrent run preceded Web output creation and failed; rerunning after build passed.
- HAP: the isolated copy installs dependencies and applies the same two SDK patches as CI. `hvigorw clean assembleHap --mode module -p product=default -p buildMode=release --no-daemon` succeeds with **all 34 tasks executed** (`hap-build.log`). The toolchain is the repository CI's third-party `ErBWs/ohos-sdk` mirror `26.0.0.821`, containing SDK `26.0.0.105 / API 26`. Archive SHA-256 `0cbdf7ac5c1be1e42694d448ffaee0c0be0ba9a948197e2bc5b61ca5bdc481f2` matches the earlier repository record and downloaded checksum; this does not establish official distribution signatures. SDK module registration class-as-object and existing API warnings remain.
- `python3 scripts/verify-package.py harmony <HAP> .build/version.json` passes (`package-verify-final.log`). The initial attempt lacked the isolated `.build/native-host.json`; adding metadata identical to the packaged copy resolved it without changing the validator. Compiled ArkTS contains the element and registration, and the packaged bundle matches that worktree's output. Initial artifact digests remain in `verification.json`; the current commit candidate is described below. The dev metadata's source identifier is `unknown`; verification snapshots bind the actual source. This is not a production release.

### Isolated commit candidate

After commit/push authorization, staged tree `ece9e45f57404f33336e2ccb1dda009a02d6cdc0` was exported to `commit-check/`, excluding existing desktop changes. All seven source/test files match the initial verified snapshot byte-for-byte. Only this batch's Harmony sections are staged from shared documents. Subsequent edits only add delivery documentation.

Isolated `node node_modules/typescript/bin/tsc -b`, `node_modules/.bin/rspeedy build` (Lynx/Web), and `node node_modules/vitest/vitest.mjs run --config vitest.delivery.config.js --maxWorkers=4` pass: **366 files/3843 tests**. Direct execution of release script tests passes **95 checks**. The temporary test config only allows reading dependencies from the original workspace; committed test logic is unchanged. Logs: `delivery-{types,build,tests,release-tests}.log`. Earlier 368/3848 results include uncommitted desktop tests and are not the candidate's count.

The candidate bundle is copied into the isolated HAP and rebuilt cleanly: **all 34 tasks execute successfully**, package validation passes, the bundle matches candidate output byte-for-byte, and compiled ArkTS contains the element and registration. Logs: `delivery-hap.log`, `delivery-package-verify.log`; digests: `delivery-artifact.json`. Current unsigned artifact: `/tmp/songloft-harmony-miot/delivery-unsigned.hap`, SHA-256 `deb7aeaffba2a856c78e0eff518c74488a697a862f588d011f0a0636aaab8e9f`; bundle SHA-256 `5934b0944b41cfc9a4dd99a418ef0416545080f511bcfbc11331851aa5bf8768`. `delivery.json` records actual commits, pushes, parent gitlink and same-SHA CI.

Not run: HarmonyOS device/emulator miot rendering, input, tab switching, background recovery and speaker interaction; no Harmony device is connected. No signing private key was read and no production signed package was created. Android/iOS native source is unchanged; native recompilation and device interaction were not run.

[中文](../../project/harmony-plugin-frame.md)
