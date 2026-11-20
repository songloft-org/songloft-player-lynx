# Windows/macOS desktop client

[简体中文](README.md) · [Implementation and verification](../docs/en/project/desktop-implementation.md) · [Historical probe](../docs/en/project/desktop-phase1.md)

Desktop supports shared media bridges, Standard and Bundle editions, both plugin types, installers, and whole-app updates. The Lynx repository publishes Standard and the backend publishes Bundle. See the [implementation and verification record](../docs/en/project/desktop-implementation.md) for platform signing, notarization, and device checks.

Targets: Windows x64 (Windows 10 22H2 / Windows 11), macOS arm64/x64 (macOS 13+). Linux, Windows ARM, DLNA, floating lyrics, shortcuts outside the app, JS hot updates and Flutter data migration are excluded. Flutter and mobile SDK versions are unchanged.

## Pinned combination

[compatibility.json](compatibility.json), the independent desktop pnpm lock and root lock pin Lynxtron/CEF/headers 0.0.31, builder **0.0.30**, libmpv 0.41.0 and FFmpeg/ffprobe 8.0.1. API baseline 4.2 is distinct from package versions; both Mac runtimes actually report Lynx **4.4**.

Standard CI resolves backend `main` once for compatibility checks. Backend Bundle CI pins the backend release commit, Lynx submodule commit, and FFmpeg assets. All three desktop targets reuse the same application bundle. Local builds use the HEAD of the checkout selected by `SONGLOFT_BACKEND_SOURCE`, defaulting to the root workspace. Resource builds check that it supports `parent-watch-stdin`. Setting `SONGLOFT_DESKTOP_ALLOW_DIRTY=1` in the development channel labels the backend version `dev` and records its actual HEAD and source digest.

## Build and run

`desktop:build` writes `dist/desktop-build.json` binding the actual client SHA, source digest and business bundle digest; source changes during the build fail it. Release resources reject dirty clients and stale/mismatched bundles. The builder downloader is separately pinned to `@electron/get` 3.1.0. Dev/stable application filenames, identifiers and data are isolated.

Use matching Node 22.18+/24/26, pnpm 11.15.1, CMake 3.21+ and Go 1.26. Windows requires the VS 2022 C++20 toolset, Windows SDK and an MSVC libmpv import library. Mac requires Xcode CLT.

```bash
pnpm install --frozen-lockfile
pnpm --dir desktop install --frozen-lockfile
pnpm desktop:build
pnpm desktop:test
export SONGLOFT_MPV_ROOT=/absolute/mpv-sdk
pnpm --dir desktop build:native
pnpm --dir desktop start
```

Without staged backend resources, development offers remote mode. Isolate dev data with `SONGLOFT_DESKTOP_DATA_ROOT=/absolute/isolated-parent`. macOS uses a separate Keychain service for the custom directory. Windows places the DPAPI file in that directory. Automatic relaunch after installation or recovery retains the chosen data directory, including paths with spaces and non-ASCII characters. Stable uses its default application data and credential identity.

CEF 0.0.31 selects the browser profile by macOS bundle ID or Windows AppUserModelID. Windows derives a separate AppUserModelID for a custom development data directory to isolate the CEF profile. Concurrent macOS fixtures that use HTML plugins need individually signed test app identities.

Prepare an inspectable SDK from explicit inputs, including recursive dynamic dependencies, per-file digests and separate build headers/import libraries:

```bash
export SONGLOFT_FFMPEG_ROOT=/absolute/ffmpeg-prefix
export SONGLOFT_FFMPEG_COMMIT=894da5ca7d742e4429ffb2af534fcda0103ef593
export SONGLOFT_SDK_LIBRARY_DIRS=/absolute/other-dependency-prefix
export SONGLOFT_DESKTOP_SDK=/absolute/output-sdk
node desktop/scripts/prepare-sdk.mjs
export SONGLOFT_DESKTOP_SDK_SHA256=<sdk.json-sha256>
export SONGLOFT_BACKEND_SOURCE=/absolute/backend-checkout
export SONGLOFT_DESKTOP_CHANNEL=dev
export SONGLOFT_DESKTOP_UPDATE_PUBLIC_KEY=/absolute/desktop-update-public.pem
pnpm --dir desktop build:resources
pnpm --dir desktop package
```

PowerShell uses `$env:NAME = 'value'` and semicolon-separated dependency roots; Mac uses colons. Retain SDK build metadata, dependencies and corresponding licenses for release review.

Bundle releases resolve the desktop ABI asset from a concrete `dev` or stable Release of `hanxi/ffmpeg-builder`. Pass the resolver's `ffmpeg-resolution.json` and archive to `desktop/scripts/fetch-sdk.mjs` through `SONGLOFT_FFMPEG_RESOLUTION` and `SONGLOFT_FFMPEG_ASSET`. The script verifies the digest again and updates the SDK manifest. Desktop jobs must not download a rolling `latest` file directly.

Outputs are isolated by channel, variant, and target. The standard variant omits the local Go backend, while bundled embeds it. Windows uses per-user NSIS installers; macOS produces a DMG and update ZIP per architecture. The official builder collects CEF and signs nested components before the app. Pinned native pnpm patches reproduce the official builder patches without its incompatible postinstall layout assumptions. Packaging does not publish assets.

`build:native` and `package` compile the renderer helper against the CEF SDK pinned in [compatibility.json](compatibility.json). The first run downloads the architecture-specific minimal SDK from the CEF CDN, verifies its SHA-256, and caches it in `desktop/.build/cef-sdk/`. The official CEF extension owns windows, rendering, and cookies. The helper installs the existing bridge before plugin scripts run, allowing remote servers to keep their current plugin SDK. macOS staging re-seals the modified helper bundles before the installer signs them.

Windows passes `--disable-gpu` in the OS command line so CEF uses software rendering. On an Iris Plus 655 device, repeated CEF GPU process crashes had terminated the app. libmpv video continues through its separate native Lynx surface.

## Host and module contracts

- `main.mjs` loads the actual application; `--probe` remains isolated. The host owns one libmpv, backend process and system media controls. JS owns queue/repeat/shuffle decisions.
- `src/desktop` preserves existing callbacks/events. Only the current source's readiness and completed initial seek emit `sourceReady`. Missing native playback fails explicitly without Mock.
- Video only presents the current engine; fullscreen/page recreation do not load media. Audio continues with hidden/detached surfaces. Live mpv operations under the rendering lock are asynchronous.
- Node and Lynx weak N-API C++ wrappers use separate namespaces, preventing linker coalescing across incompatible ABIs.
- Root RPC uses a fresh token and method allowlist. Native parents bind child identities. Plugins never receive the root token, Node filesystem/process or installation capabilities.
- The Lynx plugin bridge queues events per destination runtime and delivers them on the UI thread. It releases the routing mutex before sending SDK events. Runtime destruction discards pending events.
- Lynx plugins use a native child LynxView because this candidate lacks desktop frame support. HTML plugins use official CEF and the existing host/player/cookies/favorite dispatcher. Hidden instances retain state and pause polling; disable/switch/logout releases frames, requests and sockets.
- Settings use atomic app/channel-specific storage; secrets use Keychain/DPAPI. OS locks plus activation sockets/pipes enforce one instance. Closing hides while audio continues; explicit quit cleans the page, playback/network/plugins, then backend.
- Bundle uses an absolute selected music directory, separate database/plugin/cache paths, `-port 0`, announced-port parsing and health checks. Random administrator credentials persist in system storage, used for local login/display only. Ordinary logs redact URLs and credentials.
- Inherited stdin EOF handles a crashed parent; force termination follows a 20-second grace period. Crashes stop playback, cancel work and retry finitely. Remote mode stops the backend while preserving data. Ephemeral ports never identify caches/playback.

## Updates and recovery

Automatic check/download never stop playback; the user selects Restart and install. A separate Ed25519 envelope signs original JSON bytes binding version/channel/OS/architecture/client/backend SHA/asset size/hash. Both host and standalone Go helper verify; installation waits for all application processes.

When the user selects Install, the host rechecks the downloaded package on disk. A missing or damaged file offers another download in Settings while playback and the local backend continue. After handoff, the helper waits for the host to exit and verifies the package again. Windows keeps the installer read-only and prevents replacement during installation. On verification failure the helper logs the error and relaunches the previous app after confirming its identity and platform checks at the original path.

On macOS, the helper compares the ZIP's embedded identity, version, channel, client and backend SHAs, and executable Mach-O architecture before replacing the app. On Windows it checks the corresponding metadata and PE architecture after NSIS exits and before restart. On failure it retains the failed install and restores the previous app.

If installation fails before the candidate launches, the helper confirms that the previous app is back at its original path and its identity and platform checks pass before relaunching it. On its next launch, the host offers to show `install.log` in the updates directory. If the new backend has started and may have modified the database, the user chooses whether to restore the matching backup.

Both channels reject lower semantic versions. A same-version dev update requires changed source and a publication later than the current build. Automatic and manual checks read the current session's GitHub proxy. The manifest and corresponding installer download use the proxy from that check. Before sign-in or when settings are temporarily unavailable, checks connect directly.

```bash
export SONGLOFT_DESKTOP_UPDATE_PRIVATE_KEY=/absolute/private-key.pem
node desktop/scripts/sign-update.mjs build-info.json application.zip https://host/application.zip desktop-darwin-arm64.json
```

Installation waits for any session switch to finish, then stops the backend and backs up the database and remaining WAL/SHM. The application pauses new mode switches during backup. Before installation, the helper matches the backup version and backend SHA to the installed application. A pending installation retains the previous app and backup. Confirmation checks the version and both client and backend SHAs. When a backup exists, confirmation also requires a healthy local backend.

A pending installation retains its downloaded installer. Startup confirmation removes that download and the previous app copy, while retaining database backups and failure records. If the operating system locks the download, the next startup confirmation can retry cleanup. A failed backup copy removes the incomplete copy from that attempt.

During paired recovery, the helper checks the previous app's identity, the backup version and backend SHA, and each database file's checksum before moving any files. If a move fails, the helper attempts to restore the app and database to their pre-recovery state. Successful recovery retains the failed application, database, and any remaining WAL/SHM.

Both standard and bundled Windows variants ship an NSIS installer. Both macOS variants ship an ad hoc signed DMG and update ZIP. Dev and stable build without a Windows certificate, Apple Developer ID or notarization. The operating system may show a publisher or app-origin prompt on first manual installation. In-app updates select a variant-specific Ed25519 manifest and verify the full package SHA-256. macOS also verifies the application’s code signature.

## CI and acceptance

[Build and Release](../.github/workflows/build-and-release.yml) builds Windows x64, macOS arm64, and macOS x64 using the same client bundle and backend revision. Set the repository Actions variables `DESKTOP_SDK_INDEX_URL` and `DESKTOP_SDK_INDEX_SHA256` to enable desktop builds. The HTTPS SDK index contains a `{url, sha256, manifestSha256}` entry for each target. SDK archives contain sdk.json, native, tools, and build at the root.

The client repository builds Desktop Standard and the backend repository builds Desktop Bundle. Standard Windows CI verifies the NSIS installation, business bundle, build metadata, mpv, CEF, and updater. Standard macOS CI verifies the DMG, update ZIP, and packaged metadata. Bundled targets run the installed backend with `-version` and test startup, scanning, Range requests, and persistence after restart. Standard targets confirm that the backend is absent. Each target still generates a synthetic track with its packaged FFmpeg and checks it with ffprobe.

Public files are named `songloft-lynx-standard-<target>.<ext>` or `songloft-lynx-bundled-<target>.<ext>` without a channel suffix. Windows x64 uses `.exe`. Both macOS architectures have `.dmg` and `.zip`. Dev Bundles are available as Actions artifacts while desktop signing keys are missing from the backend repository.

Dev and stable publishing require the `DESKTOP_UPDATE_PUBLIC_KEY` and `DESKTOP_UPDATE_PRIVATE_KEY` Actions secrets. Windows verifies the per-user installation’s version, business bundle, and media components. macOS runs `codesign --verify --deep --strict` on the application extracted from the update ZIP.

With the SDK configured, each repository publishes its desktop edition to its own `dev` Release. This repository publishes Standard and the backend repository publishes Bundle. Stable `vX.Y.Z` builds publish desktop assets to the corresponding versioned Release. Desktop clients discover per-architecture signed manifests in `dev` or the latest stable Release. Stable manifests pin the installer URL to its version tag. Prereleases such as `vX.Y.Z-beta.N` continue to build the mobile and Web packages. The publish job checks the client source, business bundle, backend identity, client version, and update key across all three architectures, then signs each manifest with `DESKTOP_UPDATE_PRIVATE_KEY`. The Release stays in draft until all platform packages and manifests finish uploading. Earlier dev installers remain available to existing signed manifests.

Source identities, environments, commands, failures and Not run are recorded in [this batch](../docs/en/project/desktop-implementation.md). Listening, audiovisual synchronization, lifecycle, clean installation, real upgrades and one-hour resource trends require consolidated device acceptance. Source/compilation alone does not establish those results.
