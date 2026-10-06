# Songloft Player (Lynx)

A ReactLynx + TypeScript rewrite of the Songloft Flutter client, targeting Android, iOS, HarmonyOS, and Web.

Learn about the underlying technology: [Lynx official website](https://lynxjs.org/) · [ReactLynx documentation](https://lynxjs.org/react/).

## Current status

This is a **preview client**. Playback, library/playlists, lyrics, plugins, themes, multiple servers, and administrative settings are implemented. About now separates client checks from server upgrades: dev checks only dev, while stable checks only the latest stable release. All three native bundle updaters are integrated in source; Android has local UI download/cancel/cold-start evidence, while iOS/HarmonyOS compilation and device acceptance remain open. Production update signing is unconfigured. Older shells and incompatible updates provide same-channel installation links; see [Client updates](docs/en/reference/client-updates.md). Native desktop clients and a bundled local backend remain outside this work.

Native device caching now has identity/track-variant indexes, whole-playlist/selection tasks and local management/offline playback. Authentication expiry preserves local-only access; explicit logout hides the previous identity. See [Device cache](docs/en/reference/device-cache.md). Android has real-file/UI evidence; iOS/HarmonyOS compilation and device acceptance remain open.

Web supports playlist JSON import/export with file selection, authenticated refresh, downloads and cancellation. Expired browser activation falls back to main-thread controls. Chrome standalone and root-path embedded flows were exercised; Firefox/Safari remain unverified. See [Web deployment](docs/en/guides/web-deployment.md#playlist-json-import-and-export).

| Platform                 | Release artifact               | Limitations                                                                                        |
| ------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Android 5.0+             | Release-signed APK             | Background playback, notifications, and DLNA still need ongoing device regression testing          |
| iOS 15+                  | Unsigned IPA                   | Re-sign before installation; Live Activity requires iOS 16.2+                                      |
| HarmonyOS NEXT / API 13+ | Signed HAP                     | Experimental; video module and XComponent surface exist, but compilation and device behavior need verification |
| Web                      | Standalone / embedded archives | No bundled backend, DLNA, or per-song offline cache; browser compatibility requires actual testing |

## Installation and downloads

- [Stable releases](https://github.com/songloft-org/songloft-player-lynx/releases/latest): published from version tags.
- [Development release](https://github.com/songloft-org/songloft-player-lynx/releases/tag/dev): automatically built after code pushes to `main`; updated only when every platform succeeds.
- [Installation guide](docs/en/guides/installation.md): package names, signing requirements, server connections, and checksums.
- [简体中文](README.md)

Download assets published in GitHub Releases; the four-platform CI updates dev only after all five packages build and pass verification. Maintainers of a fork must configure signing secrets; see the [release guide](docs/en/guides/releasing.md).

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
pnpm run release patch --dry-run
pnpm run release patch
```

The script synchronizes versions, commits to `main`, creates a `v*` tag, and pushes. See the [release guide](docs/en/guides/releasing.md) and [CONTRIBUTING.en.md](CONTRIBUTING.en.md).

## License

[Apache-2.0](LICENSE), matching the Songloft backend and Flutter client. Dependencies retain their own licenses.
