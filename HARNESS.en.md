# HARNESS — Build and validation contract

This file defines executable commands, prerequisites, and coverage. AGENTS.md defines behavior and modification constraints.

## Project type

ReactLynx music client with multiple native/Web hosts.

## Build and startup troubleshooting

- Work from the repository root; use Node as declared by package.json and pnpm.
- Shared JS build success must include File (lynx) and File (web).
- JS checks do not replace Gradle, Xcode, hvigor, browser, or device checks.
- Existing dependency CLIs may diagnose local pnpm/Corepack cache failures, but are not the standard project commands.
- See [build and run](docs/en/guides/build-and-run.md) for toolchain requirements.

## Automatically identified candidates

- build: `pnpm run build`
- test: `pnpm test`
- quick: `pnpm exec tsc -b`
- bugfix/full: no single automatically identified command

## Confirmed commands

- build: `pnpm run build`
- test: `pnpm test`
- quick: `pnpm exec tsc -b`
- bugfix: typecheck + tests + affected platform gates
- full: no portable command covering all four hosts

| Purpose | Command | Prerequisites | Coverage |
|---|---|---|---|
| Android compilation | `cd android && ./gradlew --no-daemon assembleDebug` | JDK 17, Android SDK | Kotlin/resources/manifest/APK; no device behavior |
| iOS project parsing | `xcodebuild -list -project ios/SongloftLynx.xcodeproj` | macOS, Xcode | Project parsing, not compilation |
| iOS build | `pnpm run ios:build` | macOS, Xcode, CocoaPods | Pods, Swift, simulator app |
| HarmonyOS build | HarmonyOS job in build-and-release.yml or DevEco Build Hap | HarmonyOS toolchain | ArkTS/resources/HAP |
| Web output | `pnpm run build:web` | Node, pnpm | Standalone output; browser testing still required |
| Android E2E | `pnpm run test:e2e:android` | Connected device with Debug APK | Device scenarios |
| iOS E2E | `pnpm run e2e:ios` | macOS, simulator | iOS scenarios |
| Release tooling | `pnpm run test:release` | Production build first | Version/Git tooling/actual Web copying; no native compilation |

All release hosts share .build/version.json through build-and-release.yml. Downloads are Release builds with TestBridge disabled. E2E needs a Debug host and JS built with SONGLOFT_TEST_BRIDGE=true. See [releasing](docs/en/guides/releasing.md).

## High-risk directories

- android/ios/harmony/web: affected platform toolchains/runtime checks are required.
- src/native: TypeScript/native method, callback, and event contracts.
- patches and patch-web-core-client.mjs: required dependency behavior patches.

## Generated/read-only areas

- dist and web/dist: generated products, not source.
- node_modules and oh_modules: installed dependencies.
- songloft-player: optional read-only Flutter reference checkout.
- .codegraph: machine-local index.
- .git: do not edit manually.

## Automatically identified entry points

- package.json scripts: JS, Web, native, release, and E2E commands.
- .github/workflows: unified build/release pipeline.
- src/__tests__ and e2e/scenarios: contract and device gates.

## Manual verification requirements

- No single local full command covers all platforms.
- Backend API changes require checking its authoritative Swagger source.
- HarmonyOS local commands depend on DevEco/SDK setup; CI/IDE compilation remains the gate.
