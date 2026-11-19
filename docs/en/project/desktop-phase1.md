# Windows/macOS desktop phase-one verification

> Historical record. The user now requests all implementation before consolidated acceptance. See [complete implementation](desktop-implementation.md) for current source/results/open items; stop conditions, locked-screen state and unstarted later phases below describe their original dates.

[简体中文](../../project/desktop-phase1.md) · [Build and interface guide](../../../desktop/README.en.md)

## 2026-11-17 supplement: system audio and actual x64 callbacks

Client baseline remains `173fa140c70ba80998cb8f49960619306986ef86`; this round starts from parent `caf3729128ff85dbd5280b861ea9eace439b0efa`, with the uncommitted desktop worktree. Snapshot: `/tmp/songloft-desktop-ao-worktree.json`; evidence: `/tmp/songloft-desktop-ao-evidence/`. This round stays in phase one. Mac lock state rechecks as `1`; no lock bypass or permission changes.

Added asynchronous `current-ao` observations. Status `audioOutput` reports the actual backend, or `null` when unknown. Pinned 0.41.0 `client.h` specifies a `char**` for `MPV_FORMAT_STRING`; event text is copied immediately. API doubles cover unknown/unavailable values, ownership after event invalidation and preservation across loads. No synchronous property reads or production audio-default changes were introduced.

The existing real-decoder check now runs on macOS. Linux retains its test-local GNU null-audio wrapper; macOS directly uses production Engine/default system audio and rejects `null`/`pcm`. The same generated MPEG4/AAC video produces:

| Execution environment | Observed audio backend | Software frames / distinct hashes | Paused → resumed position |
| --- | --- | --- | --- |
| Native macOS arm64 | `coreaudio` | 30 / 28 | 0.750 → 1.125 seconds |
| macOS x64 / Rosetta | `coreaudio` | 33 / 31 | 0.791667 → 1.250 seconds |
| Ubuntu / existing isolated container | `null` (test only) | 24 / 22 | 0.541667 → 0.916667 seconds |

All three verify stable position during a 600 ms pause and progress after resume. Mac results establish a running system audio backend/decoder, not human listening, synchronization or continuous Lynx presentation. Software frame counts are distinct from `submittedFrames`, which still stops at 2 in locked windows.

Both Mac extensions recompile/link, native API doubles pass, and x64 module loading passes. MinGW rebuilds three COFF objects; `/tmp/songloft-cross-tools/compile-evidence-audio-output.json` binds current headers/sources. Windows linking/execution remain Not run. Inspected [mpv 0.41.0 release metadata](https://github.com/mpv-player/mpv/releases/tag/v0.41.0) and its pinned [Windows packaging script](https://github.com/mpv-player/mpv/blob/41f6a645068483470267271e1d09966ca3b9f413/ci/build-mingw64.sh); player release archives were not treated as libmpv SDKs. Timed-out partial downloads were not used for linking/verification. A verified SDK and Windows test environment remain missing; user asked for an existing connection.

x64 now completes actual Lynxtron → BTS → `SongloftDesktopProbe` → libmpv → Callback round trips, reporting `audioOutput=coreaudio`, Lynx 4.4, observed pause/resume, CEF `load` and initial video. DevTool captures show video and diagnostics. The first two captures query host/page too early and fail; polling an actual page session succeeds, first becoming ready at 9.633 seconds. That includes test/Rosetta overhead and is not a cold-start baseline. The first complete capture's total process budget also fails to cover a 50-second exit timer scheduled after initialization; the controller times out and cleans up. Failed logs remain. A 20-second probe run captures and exits normally. arm64 likewise supplies the new `audioOutput` callbacks/screenshots and exits normally. Early `No available clients/sessions` errors therefore do not establish target incompatibility.

This round passes types, 5 focused desktop Vitest checks, 6 Node checks, default Lynx/Web builds and the 95.6 kB probe build: `/tmp/songloft-desktop-ao-{types,focused,node,build}.log`. This batch does not change shared business sources; the prior 368-file/3847-test result remains historical and the full suite is not repeated this round. New bilingual [module/platform contracts](../reference/desktop-probe.md) are indexed. Legacy Chinese native-module/platform references retain their documented language exception and link to the new paired reference.

During wrap-up another session changes HarmonyOS plugin hosting, shared `LynxPluginFrame.tsx` and related declarations/tests. They are outside this desktop batch and the type/dual-build results above. The final snapshot preserves them without overwriting or committing them. Its build also cleans shared `dist/`; this round's verified business/probe bundles are saved separately under evidence `artifacts/` and checked against captured hashes, without writing back to the shared build directory. Verified desktop native and isolated probe source hashes still match.

Phase one remains incomplete. Locked-session surface timeouts and visible CEF interaction await unlocking; human listening, synchronization, physical Intel/minimum systems and actual Windows remain unverified. Phases two through six have not started. No commit, push, parent gitlink update or release.

## 2026-11-17 follow-up: actual macOS builds and execution

This round uses client `173fa140c70ba80998cb8f49960619306986ef86`, parent `b9d4a3a162ce65205775570a1336a0c4a410955a` and the uncommitted desktop worktree. New identity: `/tmp/songloft-desktop-mac-worktree.json`. This supersedes the earlier assumption that no macOS environment was available; previous checks and Not run tables remain historical.

The existing trusted SSH alias `mac` provides macOS 26.6.2 arm64, Xcode CLT / AppleClang 21, SDK 26.5, CMake 4.4.4 and Node 26.4.0. Dependencies/builds stay under `/tmp/songloft-lynx-desktop-20261117-173fa14/`, without modifying system packages or existing source directories. x64 uses cross compilation and Rosetta on that machine; **this does not establish physical Intel Mac or macOS 13 acceptance**.

| Check | Actual result |
| --- | --- |
| macOS arm64 | CMake compilation/linking pass; actual Lynxtron loads the extension/probe and NativeModules callbacks report real engine state; actual Lynx SDK **4.4** |
| macOS x64 | x86_64 Mach-O extension and libmpv compile/link; actual x64 Lynxtron under Rosetta loads the extension and reports `nativeExtensionLoaded=true, arch=x64, node=22.18.0` |
| Control contract | arm64/x64 compile and execute the API double; actual arm64 pause samples remain at `2.0416666667` seconds, then advance after resume |
| Video/CEF | DevTool captures decoded color video submitted through the surface; CEF emits `load`. **Continuous rendering and CEF display/interaction have not passed**: locked-session frames stop at 2 with `shared_image_sink.cc: timeout to wait back available` |
| Window/environment | Native window created; `CGSSessionScreenIsLocked=1`. OS window capture fails; application DevTool capture works. No screen-recording permission changes or system unlocking. User asked to unlock for remaining verification |
| Windows x64 | All three COFF objects recompile after Engine changes; `/tmp/songloft-cross-tools/compile-evidence-mac-followup.json`. VS compilation, linking and execution remain Not run |

### SDK builds and failed attempts

The prebuilt conda-forge mpv 0.41.0 SDK fails dynamic loading first on `_av_dict_copy`, then on `_cfstr_from_cstr` after pinning FFmpeg 8.0.1. It allowed extension linking but was unusable. `/tmp/songloft-mac-sdk-load.log` and earlier logs preserve failures. Builds switched to pristine upstream 0.41.0 source without distribution patches.

Original source archive SHA-256 is `4f900c91f9fdb36bc6442968775910aa8c0f67dade72a3d51a4b0c2b39af02da`, matching Ubuntu's `.dsc` orig checksum. Headers match pinned commit `41f6a645068483470267271e1d09966ca3b9f413`. Isolated micromamba 2.10.0 environments supply FFmpeg **8.0.1**, libass **0.17.4**, libplacebo **7.351.0** and dependencies. A Python venv supplies Meson **1.9.1** / Ninja **1.13.0**. Initial metadata and changes remain in remote `sdk-arm64-*.json` / `sdk-x64-create.json`; these are development dependencies, not a release dependency set.

Core commands (`root` is the temporary directory above and `mpv-src` the verified extracted archive):

```bash
export PATH="$root/build-tools/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PKG_CONFIG_LIBDIR="$root/sdk-arm64/lib/pkgconfig"
export MACOSX_DEPLOYMENT_TARGET=13.0
meson setup "$root/mpv-build-arm64" "$root/mpv-src" \
  --prefix "$root/mpv-sdk-arm64" -Dlibmpv=true -Dcplayer=false \
  -Dcocoa=enabled -Dswift-build=enabled -Dgl=disabled -Dvulkan=disabled \
  '-Dswift-flags=-target arm64-apple-macosx13.0' \
  "-Dobjc_link_args=-Wl,-rpath,$root/sdk-arm64/lib"
meson compile -C "$root/mpv-build-arm64" -j 6
meson install -C "$root/mpv-build-arm64"
SONGLOFT_MPV_ROOT="$root/mpv-sdk-arm64" node scripts/build-native.mjs
```

Disabling Swift causes a missing upstream `osdep/mac/swift.h`. Enabling it exposes an isolated dependency's `include/unctrl.h` conflict with Apple SDK curses headers. Only that temporary header moves to `build-disabled-headers/` for preservation, allowing normal Apple header lookup; upstream source is unchanged. Explicit Swift targets avoid the default macOS 26 deployment target. The first install also drops a dependency rpath: arm64's development dylib receives `install_name_tool -add_rpath "$root/sdk-arm64/lib" ...` and an ad-hoc signature. x64's explicit `objc_link_args` above loads directly. Failed logs are remote `mpv-source-arm64-{no-swift-failed,conda-header-failed,swift-target-default,no-rpath-failed}.log`, alongside final build logs.

x64's `mpv-macos-x64.ini` selects C/C++/ObjC compilers `clang -arch x86_64`, host `darwin/x86_64/little` and `needs_exe_wrapper=false`. It switches to `sdk-x64`, uses `--cross-file` and Swift target `x86_64-apple-macosx13.0`. The extension uses the same headers, `-DCMAKE_OSX_ARCHITECTURES=x86_64`, `-DCMAKE_OSX_DEPLOYMENT_TARGET=13.0` and separate `.build/darwin-x64`. The official x64 runtime npm archive matches the desktop lock's SHA-512; its embedded Node loads the extension without global x64 Node.

### Runtime findings and fixes

- Actual execution finds `app.getLocale` absent from this candidate runtime. The host checks the method and falls back to Node `Intl.DateTimeFormat().resolvedOptions().locale`, rather than assuming declarations guarantee runtime availability.
- Passing a completion callback to `SelectorQuery.exec()` limits the original drawing loop to one frame. Typed `createProbeDrawer` clears its request gate only through `invoke` success/fail, covering repeated drawing, no overlap, failure retries, synchronous errors and callbacks after disposal. Four regressions pass: `/tmp/songloft-mac-draw-tests.log`. The locked session still consumes only two frames after the fix; continuous rendering is not declared fixed.
- Loading preserves the observed global pause property while resetting source position/frame counters, avoiding indefinitely unknown state when mpv does not re-notify an unchanged property. Final actual arm64 control starts with `paused=false`, holds position at 2.042 seconds while paused, then advances after resume: `devtool-console-arm64-final-control-2.txt`. Positive check: `/tmp/songloft-mac-engine-test.log`; isolated restoration of the old reset compiles and exits 1: `/tmp/songloft-mac-pause-negative/result.log`.
- Added probe-only media/CEF URL, state logging, pause/resume timeline and timed exit options, plus an offline CEF counter/click fixture. Six desktop Node checks pass. `CEF loaded` is not proof of display/click interaction; default output of a synthetic audio track is not human listening evidence.

Remote logs and binary hashes are copied to `/tmp/songloft-desktop-mac-evidence/`; DevTool initial/fixed screenshots also exist as `/tmp/songloft-mac-probe-arm64{,-draw-fixed}.jpeg`. Final 368 files/3847 shared tests, 6 Node checks, types, default Lynx/Web builds and the 95.4 kB probe build pass: `/tmp/songloft-mac-final-{shared-tests,node,types,build,format}.log`. After the Engine update, real Linux decoding still yields 24 frames/22 hashes, stable pause and resumed progress with null audio: `/tmp/songloft-desktop-real-mpv/integration-mac-followup.log`; the temporary container is stopped. Formal signing, notarization, installers and upgrades were not executed.

**Current gate: phase one remains incomplete.** Unlocking is needed for continuous video, CEF interaction, fonts/input methods/lists/overlays/resizing, human listening and synchronization. x64 actual UI, physical Intel Mac, minimum systems and actual Windows remain Not run. Phases two through six remain unstarted; no commit, push, parent gitlink update or release.

## 2026-11-17 follow-up: control threading and Windows object compilation

Phase one progresses but has not passed the three-target runtime gate. This round uses client `173fa140c70ba80998cb8f49960619306986ef86`, parent `8177b2f`, and the uncommitted desktop worktree. New snapshot: `/tmp/songloft-desktop-followup-worktree.json`. The initial record below remains historical.

- Fixed the control/render lock dependency. Engine is isolated in a testable header; live playback uses asynchronous pause, observed properties and zero-timeout event reads. Unknown position/pause remain `null`. The render lock must not wait synchronously for the core: pinned [render.h threading contract](https://github.com/mpv-player/mpv/blob/41f6a645068483470267271e1d09966ca3b9f413/include/mpv/render.h).
- `SONGLOFT_MPV_ROOT=/tmp/songloft-mpv-sdk node desktop/scripts/test-native.mjs` passes; `/tmp/songloft-desktop-engine-test-final.log`. The API double implements actual header declarations and executes production Engine, covering unknown values, queued versus applied commands, observations, asynchronous failure, source reset and render-before-core release. Isolated restorations of synchronous pause/status both compile and exit 1 with `synchronous pause holds the render lock` / `synchronous status read holds the render lock`. Isolated files: `/tmp/songloft-desktop-engine-negative/`. This does not reproduce actual mpv decoding or a real playback deadlock.
- Temporarily unpacked Debian MinGW G++ 12.2 cross-compiles `surface.cc`, `probe.cc` and `addon.cc` into three genuine Windows x64 COFF objects. Full argv, source hashes and results: `/tmp/songloft-cross-tools/compile-evidence.json`. This proves target object compilation only. **No libmpv/Lynxtron linking or Windows execution** occurred. Visual Studio compilation, both macOS builds and target playback remain Not run. No system installation or Windows runtime environment was added.
- Types, 367 files / 3843 shared tests, 3 desktop Node checks, Lynx/Web builds and the 94.2 kB probe build pass. Logs: `/tmp/songloft-desktop-followup-{types,tests,node,build}.log`. This run includes the concurrent playlist tests added after the earlier 3839-pass result, outside this batch's feature changes.
- The official Windows 0.0.31 runtime archive passes its locked SHA-512 check. All 70 required Lynx/N-API symbols exist in both the import library and actual `lynxtron.dll` export table. Hashes and symbols: `/tmp/songloft-cross-tools/runtime/abi-evidence.json`. This does not establish loading or execution on Windows.
- A real libmpv integration check executes production Engine in an isolated Ubuntu 26.04 container: libmpv `0.41.0-2ubuntu4`, FFmpeg `8.0.1-3ubuntu2`, G++ 15.2, base image digest `sha256:d66b366dac61b575bee2aef07e9c26e8070096fbe84a3d4d3eb0da069b5d76db`. A generated video with an audio track and Chinese/spaced path renders 24 frames with 22 distinct hashes. Position stays stable during a 600 ms pause and advances from `0.541667` to `0.916667` seconds after resume. Log, fixture and executable: `/tmp/songloft-desktop-real-mpv/integration.log` and its directory. **Audio output is null: no audible sound, Lynx/CEF or GPU surface is exercised.** This neither replaces target acceptance nor adds a Linux product target.
- Early dependency-fetch attempts encountered slow HTTP/HTTPS transfers and missing default CA paths; logs remain. After explicit CA verification, a host cache acquires 254 packages from APT's verified distribution metadata and checks every SHA-256 before offline APT installation. Evidence: `/tmp/songloft-desktop-real-mpv/{install-offline.log,apt-package-metadata.txt,debs/download-evidence.json}`. Certificate, signature and integrity verification remain enabled. Only task-owned containers change, not host system packages.

Phases two through six have not started. This round performs no commits, pushes, releases or parent pointer updates.

## Initial scope and code

This delivers a phase-one candidate project. **Phase-one acceptance is incomplete.** Phases two through six have not started; Bundle, system media, plugin bridges, installers and automatic updates are not delivered.

- Repository: `songloft-org/songloft-player-lynx`.
- Initial baseline: `888f5b88c842ea932a1f1f0b810a7f82a876f6fc`. Another session committed login/credit changes; final verification uses `6df678d10c078dcbe495ac47720ce86eab38825a` plus this uncommitted worktree.
- Parent currently: `d57b42ba45c565bc48cd2d8f3f70f5b68d32859a`. This batch changes only the Lynx submodule, with no backend/Flutter edits, commits, pushes, releases or parent pointer updates.
- Final worktree identity: `/tmp/songloft-desktop-final-worktree.json`, generated at delivery with tracked/untracked digests. Other sessions' commits are not this batch's actions.
- Environment: Debian Linux x86_64, Node 22.17.1, pnpm 11.15.1, G++ 12, clang-format 19.1.7, Prettier 3.6.2. Shared JS allows this Node version; the desktop runtime requires Node 22.18+. Windows/macOS toolchains, libmpv SDKs and desktop sessions are unavailable here.

## Implementation

A separate desktop package/lock pins Lynxtron, official CEF and extension headers to 0.0.31 and records embedded Lynx and libmpv 0.41.0 source commits. The host loads either the business bundle or the isolated audio/video/CEF probe. A shared libmpv engine exposes Callback commands and actual status. The native video element submits software BGRA frames through the render API, IOSurface/D3D11 and SwapBack. Node entry and Lynx `_weak` N-API compile separately. Business playback explicitly fails until desktop audio integration; it never synthesizes progress.

## Checks

| Check | Result and evidence |
| --- | --- |
| `node --test desktop/tests/*.node-test.mjs` | 3 pass, parsing YAML to check versions, target OS/CPU, optional dependency links and SHA-512 integrity; `/tmp/songloft-desktop-node-final.log` |
| `pnpm exec tsc -b --force` | Pass on the current baseline; `/tmp/songloft-desktop-types-current.log` |
| `pnpm test --maxWorkers=2` | 366 files / 3839 tests pass; `/tmp/songloft-desktop-tests-current.log` |
| `pnpm run desktop:build` | Pass on the current baseline: Lynx 4304.1 kB, Web 4260.0 kB, isolated probe 94.1 kB; `/tmp/songloft-desktop-build-current.log`. These are JS bundle sizes, not installer sizes. Existing `touch-action` encoding warnings remain |
| `pnpm run test:release` | 89 pass; `/tmp/songloft-desktop-release.log`. Subsequent batch changes do not touch release tooling or update contracts |
| C++ syntax | Linux G++ passes using actual 0.0.31 headers and the pinned mpv `client.h/render.h`: `probe.cc` with `USE_WEAK_SUFFIX_NAPI=1`, `addon.cc` with ordinary Node ABI. `surface.cc` was not compiled; no target libraries were linked |
| ABI symbols | `g++ -c` and `nm -u` confirm `napi_create_object_weak`, `napi_create_string_utf8_weak`, `napi_get_cb_info_weak`; `/tmp/songloft-desktop-napi-symbols.log` |
| Formatting/diff | New code formatted using Prettier/clang-format; `git diff --check` passes |

The first full run failed because a Node test used `.test.mjs` and was collected by Vitest. It now follows the existing `.node-test.mjs` convention and runs separately under Node. Concurrent credit coverage failed and login types briefly failed during the other session's edits. Those files were not changed here; that session committed `6df678d`. Original failures remain in `/tmp/songloft-desktop-tests.log` and `/tmp/songloft-desktop-types-final.log`. An isolated initial-baseline attempt hit pnpm's non-TTY module rebuild refusal, and another hit a Vitest worker timeout. Neither establishes a baseline pass/fail conclusion.

Dependency negative check: the mirror omitted the Apple Silicon optional runtime, so installation succeeded but the matrix test failed (`/tmp/songloft-desktop-lock-before.log`). Re-resolving against the official registry with a fresh store passes all three checks (`/tmp/songloft-desktop-lock-fixed.log`). This establishes metadata completeness only.

Concurrent work exists. The full-suite result belongs to its run's worktree. Another session added `src/features/playlist/__tests__/playlist-play-next.test.tsx` during wrap-up; it is outside this batch and outside the 3839-pass claim. The final snapshot records its presence; this batch does not edit or commit it.

## Not run and gate

| Target | Native compile/link | Actual business UI | Audible video/resize/pause | Concurrent CEF interaction |
| --- | --- | --- | --- | --- |
| Windows x64 | Not run | Not run | Not run | Not run |
| macOS arm64 | Not run | Not run | Not run | Not run |
| macOS x64 | Not run | Not run | Not run | Not run |

Only Linux is available; target environments are not connected. Syntax checks do not replace Visual Studio/Xcode builds. Submitted-frame counts and engine time do not establish continuous pictures, audible sound or audiovisual synchronization. Verify native surfaces, CEF, Chinese IME, fonts/SVG, lists/overlays/dragging, GPU compatibility and close cleanup on target systems using the guide.

Not run: installation on clean machines, package/installed size, cold start, idle/playback memory, one-hour resource trends, Bundle scanning/LAN/process cleanup, actual plugin side effects, signed installation and upgrades. There are no installers; the latter capabilities belong to unopened phases. Do not proceed beyond phase one or substitute a Web desktop shell before all three target gates pass.
