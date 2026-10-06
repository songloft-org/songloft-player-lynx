# Testing

## Test builds and downloadable packages

Downloadable dev/stable packages are Release builds with TestBridge disabled. Use `pnpm run android:install` or `pnpm run ios:build` for Debug hosts with test JS. When building bundles manually, set `SONGLOFT_TEST_BRIDGE=true`; ordinary builds omit the test bridge. Native servers bind to `127.0.0.1:9230`; Android connects through `adb forward tcp:9230 tcp:9230`.

Run `pnpm run test:release` after a production build to validate release tooling and actual Web output. Rebuild in production mode after E2E before validating release gates. See [releasing](releasing.md) and [简体中文](../../guides/testing.md).

Two layers: Vitest unit/contract tests without devices, and TestBridge E2E tests running against a device/simulator. Architecture is documented in [E2E design (Chinese)](../../architecture/e2e-testing-design.md); assertion principles are in [AGENTS](../../../AGENTS.md).

## Unit tests

```bash
pnpm test
pnpm exec tsc -b
```

Current results belong in the [handoff](../project/handoff.md), not duplicated counts in this guide. Tests use Vitest/@testing-library and live in __tests__ beside source. Test bodies must not include the literal Vitest environment annotation prohibited by the Lynx testing harness.

## E2E behavior tests

```bash
pnpm run test:e2e:android
pnpm run e2e:ios
pnpm run e2e:ios:full
pnpm run e2e:ios:setup
```

There are 34 scenario files, about 121 test declarations, all requiring devices. Most are shared; iOS adds system appearance, while Android adds floating lyrics/fullscreen video. Reports and screenshots live in ignored e2e/reports and e2e/screenshots.

The documented full run from August 16 was Android 112 passed/8 skipped and iOS 110 passed/10 skipped. Scenarios have expanded since then; those historical counts do not validate current code.

### Investigate changed skip counts

Historical Android skips included iOS-only appearance tests and video tests lacking fixtures. iOS skipped Android-only floating lyrics/video. Platform defaults must match createDriver's default Android behavior: `(process.env.E2E_PLATFORM ?? 'android') === 'android'`.

Missing fixtures must visibly skip with test.skipIf, not silently return from tests and report success.

### Four environment checks before E2E

1. Terminate a running iOS app before installing a rebuilt bundle: `xcrun simctl terminate <udid> org.songloft.lynx`.
2. Remove leftover Android forwarding before iOS tests: `adb forward --remove tcp:9230`. Otherwise the driver can silently connect to Android.
3. ios setup may reuse an installed app. After rebuilding, explicitly terminate/install the new ios/build/Debug-iphonesimulator/SongloftLynx.app.
4. Check port 9230 with `lsof -iTCP:9230 -sTCP:LISTEN -P`, and keep only one simulator booted. A bind failure or selecting the first booted device can yield misleading results.

### Store handles

NativeModules is unavailable in the evaluator's scope, so native behavior is driven through the handles exposed by src/e2e-bridge.ts. Its current source is authoritative: player/auth/lyrics/EQ/server/config/router/appearance/floating lyrics/video/song overlays/cache/back handles.

See [API/store conventions (Chinese)](../../reference/api-conventions.md) before exposing new stores.

### Inspecting actual host events

Use a temporary probe scenario and poll player state to quantify tick cadence and event ordering. Measure before changing code; plausible explanations have repeatedly been disproved by device evidence.

## Assert observable state

Screenshots verify rendering; side effects need separate evidence:

- Check settings endpoints after toggling controls.
- Check `pgrep -x ffmpeg` after stopping work; keyword-count pipelines include the inspecting shell itself.
- Inspect window metadata for floating lyric updates when screenshots cannot distinguish text.
- Compare computed height and scrollHeight to detect compressed dialogs.

## Related

- [E2E architecture (Chinese)](../../architecture/e2e-testing-design.md)
- [Debugging (Chinese)](../../guides/debugging.md)
- [Scenario plan](../../../e2e/TEST_PLAN.md)
- [E2E known issues](../../../e2e/ISSUES.md)
