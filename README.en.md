# Songloft Player (Lynx)

A ReactLynx + TypeScript rewrite of the Songloft Flutter client, targeting Android, iOS, HarmonyOS, and Web.

Learn about the underlying technology: [Lynx official website](https://lynxjs.org/) · [ReactLynx documentation](https://lynxjs.org/react/).

Settings → Playback → Keep screen on for lyrics is off by default and saved only on this device. When enabled, it keeps the display awake while lyrics are visible (beside the cover on wide screens), even while playback is paused. Returning to the cover, leaving the player, or backgrounding the app restores automatic sleep. Android/iOS/HarmonyOS require a native package with the new screen policy method; older shells safely degrade. Web depends on browser Screen Wake Lock support and permission; denied requests do not interrupt playback.

## Current status

This is a **preview client**. Playback, library/playlists, lyrics, plugins, themes, multiple servers, and administrative settings are implemented. About now separates client checks from server upgrades: dev checks only dev, while stable checks only the latest stable release. All three native bundle updaters are integrated in source; Android has local UI download/cancel/cold-start evidence, while iOS/HarmonyOS compilation and device acceptance remain open. Windows/macOS desktop hosting, Bundle, playback, both plugin types, and whole-app updates are implemented and published through the shared Build and Release workflow. Production signing/notarization and final device coverage remain open. See [Client updates](docs/en/reference/client-updates.md) and the [implementation record](docs/en/project/desktop-implementation.md).

Native device caching now has identity/track-variant indexes, whole-playlist/selection tasks and local management/offline playback. Authentication expiry preserves local-only access; explicit logout hides the previous identity. See [Device cache](docs/en/reference/device-cache.md). Android has real-file/UI evidence; iOS/HarmonyOS compilation and device acceptance remain open.

The Android Bundle includes FFmpeg and FFprobe for three ABIs. The iOS Bundle links FFmpeg into the Go backend so probing and transcoding run inside the app. Windows and macOS Bundles use FFmpeg assets verified by the same backend release workflow.

Web supports playlist JSON import/export with file selection, authenticated refresh, downloads and cancellation. Expired browser activation falls back to main-thread controls. Chrome standalone and root-path embedded flows were exercised; Firefox/Safari remain unverified. See [Web deployment](docs/en/guides/web-deployment.md#playlist-json-import-and-export).

Web playback settings also provide a persisted keyboard-shortcut switch: Space toggles playback and Ctrl/⌘ + arrows change tracks or volume. See [Shortcuts](docs/en/guides/web-deployment.md#playback-keyboard-shortcuts) for input/overlay/plugin focus protection and the Chrome validation scope.

The library supports combined filters for local tracks, remote tracks, and radio. Select several stations to set Automatic, HLS, HTTP-FLV, or Audio only in one action. Library Play All excludes radio and tracks in hidden or audiobook playlists.

| Platform                 | Release artifact               | Limitations                                                                                        |
| ------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Android                  | Signed Standard or Bundle APK | Standard requires Android 5.0+ and Bundle requires Android 6.0+ |
| iOS 15+                  | Unsigned IPA                   | Re-sign before installation; Live Activity requires iOS 16.2+                                      |
| HarmonyOS NEXT / API 13+ | Signed HAP                     | Experimental; video module and XComponent surface exist, but compilation and device behavior need verification |
| Web                      | Standalone / embedded archives | No bundled backend, DLNA, or per-song offline cache; browser compatibility requires actual testing |
| Windows / macOS           | Standard or Bundle desktops   | Windows 10 22H2+ x64 and macOS 13+ on Apple silicon or Intel |

## Installation and downloads

- [Standard stable releases](https://github.com/songloft-org/songloft-player-lynx/releases/latest) and [standard development release](https://github.com/songloft-org/songloft-player-lynx/releases/tag/dev).
- [Bundle stable releases](https://github.com/songloft-org/songloft/releases/latest) and [Bundle development release](https://github.com/songloft-org/songloft/releases/tag/dev).
- [Windows/macOS desktop builds](desktop/README.en.md): standard desktop assets stay in the Lynx Release, while Bundle desktop assets are in the backend Release. Filenames contain no dev or stable segment. Select `win32-x64`, `darwin-arm64`, or `darwin-x64` for your machine.
- [Installation guide](docs/en/guides/installation.md): package names, signing requirements, server connections, and checksums.
- [简体中文](README.md)

Download assets published in GitHub Releases; the four-platform CI updates dev only after all seven mobile and Web packages build and pass verification. Desktop variants publish separately when configured. Maintainers of a fork must configure signing secrets; see the [release guide](docs/en/guides/releasing.md).

The Android and iOS Bundle packages embed the Go backend built by the backend Release workflow from the fixed root SHA, and can also connect to a remote server. Standard packages connect to remote servers only. Switch modes from the login or settings screen in a Bundle package. The first time local mode is enabled, choose a music directory; there is no separate mode chooser on first launch. Android uses the system directory picker and requests read access. iOS uses the app's Documents directory, where music can be added through the Files app. HarmonyOS and Web packages do not include the backend and need a running [Songloft server](https://github.com/songloft-org/songloft). Choose a package under **Assets** on the corresponding release page:

| Platform | Download | Installation / deployment |
| --- | --- | --- |
| Android | `songloft-lynx-android.apk` / `songloft-lynx-bundled-android.apk` | The first is the standard build and the second embeds the Go backend. Download and open the APK, then allow installation when prompted. The package uses the maintainer's release signature. |
| iOS | `songloft-lynx-ios-nosign.ipa` / `songloft-lynx-bundled-ios-nosign.ipa` | The first is the standard build and the second embeds the Go backend. Both are unsigned device builds. Re-sign with your developer certificate and a provisioning profile for your device before installing. |
| HarmonyOS | `songloft-lynx-harmony.hap` | Standard build without the local Go backend. Install with DevEco Studio or `hdc install songloft-lynx-harmony.hap`. |
| Web (standalone) | `songloft-lynx-web-standalone.tar.gz` | Extract to a static server, then open the site and enter the Songloft API address. |
| Web (embedded) | `songloft-lynx-web-embedded.tar.gz` | Extract and configure same-origin static hosting with the same-origin backend; does not automatically replace the server's existing embedded frontend. |

See the [Web deployment guide](docs/en/guides/web-deployment.md) for response headers, MIME types, and browser requirements.

**Verify downloads:** Keep your packages and `checksums.txt` in the same directory. On Linux, run `sha256sum -c checksums.txt --ignore-missing`. On macOS, use `shasum -a 256 <filename>`; on Windows, use PowerShell `Get-FileHash <filename> -Algorithm SHA256`. Compare the result with the listed SHA-256. `version.json` contains the version, commit, build time, and package information.

See the root repository's [Bundle mode guide](https://github.com/songloft-org/songloft/blob/main/docs/bundle-mode.md) for backend startup, login, and mode switching. Release bodies contain categorized changes and installation links to this section.

## Technology stack

| Layer           | Implementation                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build/framework | Rspeedy + ReactLynx + TypeScript                                                                                                                               |
| State           | Zustand for client state; TanStack Query for server data                                                                                                       |
| Routing         | TanStack Router, memory history and code-based routes                                                                                                          |
| UI              | Individual lynx-ui packages, Apple semantic design tokens (`src/shared/theme/tokens.css`), and @lynx-js/motion                                                 |
| Models          | zod with snake_case → camelCase transforms                                                                                                                     |
| Localization    | i18next + react-i18next (English / Chinese)                                                                                                                    |
| Tests           | Vitest + @testing-library for unit tests; TestBridge + Vitest for E2E                                                                                          |
| Native          | Ten custom modules covered by contract gates: Audio/Storage/Platform/Dlna/Video/SongCache/Navigation/PluginBridge, Android FloatingLyric, and iOS LiveActivity |
| Web             | `@lynx-js/web-core` renders the bundle in a browser `<lynx-view>`                                                                                              |

## Quick start

Requires Node `^20.19 || >=22.12`, pnpm, and a Songloft backend at `http://localhost:58091` (initial credentials: `admin/admin`).

```bash
pnpm install
pnpm run web:sync && pnpm run web:dev
```

Validation commands:

```bash
pnpm run build        # Must emit both File (lynx) and File (web)
pnpm run typecheck    # tsc -b; --noEmit alone does not check this project
pnpm test            # Unit tests and contract gates
pnpm run test:release # Release tooling and actual Web output (build first)
```

These checks cover JS and release tooling. They do not replace Swift/Kotlin/ArkTS compilation or browser rendering. Changes to a host require its platform checks.

[Getting started (Chinese)](docs/getting-started.md) · [Build and run](docs/en/guides/build-and-run.md)

## Project structure

```text
src/              Client source
  core/           Networking, storage, configuration
  features/       auth/home/library/library-ops/player/playlist/settings/jsplugin
  models/         zod models
  native/         TypeScript native facades
  shared/         Components, themes, layouts, navigation
  store/          Zustand state
  i18n/           English / Chinese
android/          Kotlin host and native modules
ios/              Swift host and native modules
harmony/          ArkTS host and native modules
web/              Web host and static development server
demo-frame-plugin/ Native Lynx plugin example
e2e/              Drivers and cross-platform scenarios
scripts/          Build, release, and localization tooling
patches/          Committed upstream patches
docs/             Documentation
```

## Documentation

[Documentation index](docs/en/README.md) organizes tutorials, how-to guides, references, explanations, project tracking, and archives.

| Task                        | Reference                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Start from scratch          | [Getting started (Chinese)](docs/getting-started.md)                                                           |
| Build a platform            | [Build and run](docs/en/guides/build-and-run.md)                                                               |
| Write/run tests             | [Testing](docs/en/guides/testing.md)                                                                           |
| Add native capabilities     | [Native development](docs/guides/native-development.md) · [Module contracts](docs/reference/native-modules.md) |
| Look up conventions         | [API and stores](docs/reference/api-conventions.md) · [Back navigation](docs/reference/back-navigation.md)     |
| Understand runtime behavior | [Lynx constraints](docs/architecture/lynx-constraints.md) · [Debugging](docs/guides/debugging.md)              |
| Take over development       | [Handoff](docs/en/project/handoff.md)                                                                          |

Root-level references:

- [AGENTS.md](AGENTS.md): development constraints and validation rules.
- [ARCHITECTURE.md](ARCHITECTURE.md): architecture overview; detailed explanations live in `docs/architecture/`.
- [HARNESS.md](HARNESS.md): build and validation entry points and their coverage.
- [DESIGN.md](DESIGN.md): Apple HIG, materials, Liquid Glass, and implementation notes.

The backend OpenAPI contract lives in the backend repository's `docs/swagger.json`, or at `http://localhost:58091/swagger/index.html` on a development server.

## Status

Current delivery status and outstanding validation are maintained in the [handoff](docs/en/project/handoff.md). Historical batches are in [progress (Chinese)](docs/project/progress.md); platform capabilities are in the [platform reference (Chinese)](docs/reference/platforms.md). This README avoids duplicating test counts, artifact sizes, and dated validation snapshots.

## Releases and contributing

```bash
./scripts/bump-version.sh patch --dry-run
./scripts/bump-version.sh patch
```

The script synchronizes versions, commits to `main`, creates a `v*` tag, and pushes. The equivalent `pnpm run release patch` remains available; the shell entry delegates to the existing Node release logic and supports the same arguments. See the [release guide](docs/en/guides/releasing.md) and [CONTRIBUTING.en.md](CONTRIBUTING.en.md).

Version history is maintained in the Chinese-only root [CHANGELOG.md](CHANGELOG.md), updated after a versioned release succeeds. Rolling dev commit history remains on its release page.

## License

[Apache-2.0](LICENSE), matching the Songloft backend and Flutter client. Dependencies retain their own licenses.
