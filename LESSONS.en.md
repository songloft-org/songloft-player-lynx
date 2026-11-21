# Lynx Client Development Lessons

### Reuse the shared settings row layout

- On 2026-11-21, the reset metadata checkbox in `9150581` passed the focused library tests. The full suite's `grouped-list.test.ts` caught the scan page rendering `settings-row` directly. The shared row component owns the separator and tap area.
- Render `AppCheckbox` as trailing content in `SettingsRow` and handle taps on the whole row. Run both the interaction tests and the grouped layout check after changing a settings row. Seen 1× (2026-11-21).

### BUNDLE-002: Resolve build sources from the public backend branch

- On 2026-11-19, the Lynx Android and iOS jobs and the Flutter Bundle workflow requested backend commit `35b1e33`, which existed only locally, and GitHub returned `upload-pack: not our ref`. The public `main` also lacked the SQLite implementation required by the Android build. [Lynx CI](https://github.com/songloft-org/songloft-player-lynx/actions/runs/44477893015) · [Flutter CI](https://github.com/songloft-org/songloft-player/actions/runs/44459675316)
- Land the required backend code in the root repository before switching to its public `main`. Resolve the branch tip and version once per run, reuse them across packaging jobs, and verify the actual SHA used by the build and recorded in its artifacts.
- Seen 1× (2026-11-19).

### BUNDLE-FFMPEG-001 · Desktop Bundle builds reuse fixed FFmpeg assets

- Scope: Lynx Android, iOS, and desktop Bundle builds.
- Rule: before packaging, the desktop SDK verifies the resolution record and ABI asset digest, then updates its SDK manifest. Android installs tools through the APK native library directory and iOS links the static library at build time. Do not use an unversioned `latest` download.
- Seen 1× (2026-11-20). [Backend Bundle CI](https://github.com/songloft-org/songloft/actions/runs/44754365874) produced Lynx test packages for Android, iOS, Windows, and both macOS architectures. Device installation and playback are checked separately.

### WEB-AUDIO-001 Use the active media element as the Web playback clock

- [songloft-org/songloft#581](https://github.com/songloft-org/songloft/issues/581), Lynx baseline `64692b84e5f36a6f2f3ceeede77904771c2904d6`. Docker Chrome played a real MP3 while the host's 250 ms interval was delayed to 60 seconds. The original progress stayed at zero while the browser's `currentTime` advanced.
- Report the active element's position and duration on `timeupdate` and `durationchange`. Read the element again at the end of playback before notifying the queue. Report infinite live duration as unknown and ignore events from the previous element after a source change.
- Evidence is in `/tmp/songloft-581.7JfaBL/`. Four new regressions fail with the original host and pass with the fix.
- The Windows follow-up used the reporter's pywebview tray workflow. After the server update from `v2.13.9` to `f75be9e`, the open WebView2 still executed the old script and its heartbeat passed. Compare the running and served `audio-host.js` hashes. A normal reload made them match. Check which script the window executes when verifying an embedded frontend update. [Progress record](docs/project/progress.md#issue-581).
- With the updated script confirmed, Windows long playback still accumulated progress messages and delayed completion. Measure the media clock, bridge samples, visible progress and start of the next track. Drop expired periodic Web samples and lower the sample rate for the session. Continue to report seeks, duration corrections and completion immediately. [Physical-device comparison](docs/project/progress.md#issue-581).
- Seen 1× (2026-11-19).

### BUNDLE-001: Pin both binding tools and use the AAR's Android minimum

- On 2026-11-18, with client baseline `baef0f9` and backend pin `81204e2`, `gomobile init` fetched a newer gobind and VCS detection then failed in the temporary Go module. Install both tools at the pinned backend module version and disable VCS stamping in temporary builds. Linker flags still embed the actual backend SHA.
- The AAR built for three Android ABIs and the static iOS arm64 framework compiled. The first Lynx APK build failed manifest merging because the AAR requires API 23. Use API 23 when shipping the AAR and retain API 21 for source builds without it. Inspect the packaged Go libraries for the actual SHA. Logs are under `/tmp/songloft-bundle-build.v9dPHY/`.
- Seen 1× (2026-11-18).

### LYRIC-003 Verify word timing in the actual lyric fields and playback entry point

- Validation covers the playback lyric store and word-timed LRC parsing at baseline `f624965610b21fab03d8aec33b08d34cb90a1cba`. [songloft-org/songloft-player#54](https://github.com/songloft-org/songloft-player/issues/54)
- The existing angle-tag parser tests passed, but the store called that parser only for `lxlyric`. Four new regressions failed on the old implementation, covering inline single brackets, LX relative offsets, double brackets, and field selection.
- Standard `.lrc` sidecars travel in `lyric`. Prefer `lxlyric` when it has usable word times. Exercise representative files through the store, cache, and player, including consecutive leading tags that repeat a standard LRC line.
- Seen 1× (2026-11-18).

### DESKTOP-002: isolate Node and Lynx weak N-API C++ wrapper symbols

- Scope: one `.node` supplies both Node host functions and Lynx native modules.
- Evidence: separate compilation passed, but the complete app crashed at address zero on Lynx_JS while reporting `lynx_napi_report_and_clear_exception`. Identical inline wrapper symbols could be coalesced across incompatible ABIs. Separate `NAPI_CPP_CUSTOM_NAMESPACE=SongloftNode/SongloftLynx` restored the real Mac login page and storage/network/keyboard RPC.
- Rule / done right: isolate both C API selection and C++ namespaces; enable `USE_WEAK_SUFFIX_NAPI` only for BTS sources. Exercise host exports together with real Lynx callbacks; linking or Node-only playback tests do not cover their combination.
- Seen 1× (2026-11-17). Status: uncommitted candidate; [batch record](docs/en/project/desktop-implementation.md) separates Windows/device acceptance.

### PLUGIN-003: template fetchers and bridge registration do not supply a native child-view element

- Scope: HarmonyOS HAP opening miot and other Lynx plugins; baseline `173fa140c70ba80998cb8f49960619306986ef86`.
- Evidence: the locked Harmony Lynx 4.0.1 has no frame implementation and Index registered no corresponding Behavior. Isolated old-code checks create zero child instances and cannot find the Harmony element, failing as expected. Earlier HAP compilation and template downloader tests did not cover this gap.
- Rule / done right: verify the actual SDK tag and its full loading pipeline. Harmony uses a dedicated element with an independent LynxView, explicit fetchers/behaviors/bridge/initial props, and checks for late tokens, RPC, retention/disposal and replacement identity. Child views must not attach root singletons. Record rendering/device evidence separately from compilation and adapters. [Record](docs/en/project/harmony-plugin-frame.md).
- Seen 1× (2026-11-17). Status: local source fix, regressions and HAP compilation pass. The user authorized this batch's commit, push and parent gitlink update; the record tracks actual commits and same-SHA CI. No Harmony device acceptance or stable release. Older shells require a new HAP.

### PLUGIN-004: entry presentation must not determine instance retention

- Scope: native Lynx plugins entered from the home grid, navigation tabs or manager; baseline `b952231c253aad1938d3020ee74157b100a11291`.
- Evidence: retention only matched `tab=true`, so returning home unmounted the child engine. New home regressions fail with the old implementation because the retained node is missing. The fix preserves one node/search across 20 visits with one mount. Separately, plugin resumed events forcibly reloaded healthy covers; cover flicker alone does not prove route remounting.
- Rule / done right: all native Lynx entries share a Shell instance; embed/topbars affect presentation. Pause while hidden and dispose on identity/server changes, disabling or Shell teardown. Keep healthy covers on resume. Record compilation, component and browser evidence separately; repeated creation/image loading without a crash stack does not establish the Harmony crash cause. [Record](docs/en/project/miot-reentry.md).
- Seen 1× (2026-11-17). Status: local fix, uncommitted/unreleased; Harmony crash logs and device acceptance remain open.

### PLUGIN-005: verify the Windows plugin view on both first open and return

- Scope: Lynx and HTML plugins in the test-signed Windows x64 2.13.16 installation.
- Evidence: both plugins persisted Favorites and storage and played the fixture tone. CEF off-screen composition still produced a blank page. Correcting the Lynx child position fixed first entry, and returning to the same plugin still produced a blank page. Win32 enumeration showed the original HWND visible at the expected bounds. Raising it and requesting a repaint immediately restored its content.
- Rule: verify plugin side effects, visible output and retained-instance restoration independently. Windows CEF plugins use native child windows. The Lynx child uses the measured DPI-scaled origin and repaints after the renderer finishes resizing. Regression coverage should include returning from a hidden state and resizing the window. [Acceptance record](docs/en/project/desktop-implementation.md#plugins-in-the-full-windows-app).
- Seen 1× (2026-11-19). Status: local fix retested in the Windows VM. Updated installers remain to be verified.

### DESKTOP-004: wait separately for the debug host and page session

- Scope: macOS x64/Rosetta phase-one capture on 2026-11-17; client `173fa14` plus uncommitted worktree.
- Evidence: fixed-delay capture returns `No available clients` / `No available sessions`. Polling the actual page obtains a session at 9.633 seconds and captures real callbacks, CoreAudio, CEF load and video. A total-process budget also misses an exit timer scheduled after initialization and cleans up early; a 20-second probe retry exits normally. [Record](docs/en/project/desktop-phase1.md).
- Rule / done right: check that the target process remains live, then wait for a real page session. An online host does not establish page readiness. Align controller/application timer origins or include observed initialization time. Preserve failures/cleanup reasons instead of declaring target incompatibility or application exit failure from capture timing errors.
- Seen 1× (2026-11-17). Status: capture corrected; continuous locked-session video and interaction remain unverified.

### DESKTOP-003: native drawing completes through invoke callbacks

- Scope: macOS phase-one probe on 2026-11-17; baseline `173fa14` plus uncommitted worktree.
- Evidence: actual engine time advances while submitted frames stay at 1. The real SelectorQuery declaration is `exec(): void`; its ignored callback leaves the draw gate occupied. DevTool logs/screenshots: [record](docs/en/project/desktop-phase1.md).
- Rule / done right: retain SelectorQuery types; release the one-request gate in `invoke` success/fail, handle synchronous errors and ignore callbacks after disposal. Four regressions pass. Surface-buffer timeouts persist in the locked session; diagnosing their cause needs an unlocked session, so this isolated fix is not continuous-video acceptance.
- Related state fix: preserve global pause observations across loads because unchanged properties are not re-notified. Restoring the old reset in isolation makes the native test fail.
- Seen 1× (2026-11-17). Status: local fixes; continuous macOS video, human listening and three-target acceptance remain incomplete.

### DESKTOP-002: Never synchronously wait for the mpv core under a render lock

- Scope: uncommitted desktop phase-one probe after `6df678d`. Reviewing the pinned mpv 0.41.0 `render.h` threading contract on 2026-11-17 found synchronous pause/status calls holding the mutex required by rendering.
- Rule and Done right: while a render context is active, use only render-safe asynchronous control, observations and zero-timeout event reads under that mutex. Synchronous initialization version reads precede render creation. Unavailable properties remain unknown and queued commands do not imply applied state.
- Evidence: `test:native` executes the production `Engine` using actual header declarations and an API double. Isolated restorations of synchronous pause and status both compile, then fail with the corresponding `synchronous ... holds the render lock` diagnostic. Event status, unknown values, asynchronous errors, source resets and release ordering pass in `/tmp/songloft-desktop-engine-test-final.log`. This reproduces API contract violations, not a target-platform playback deadlock.
- Seen 1× (2026-11-17). Local control repair; actual target audiovisual behavior remains Not run.

### DESKTOP-001: Check optional runtime locks for every target architecture

- Scope: phase-one Windows/macOS desktop candidate dependencies; client baseline `888f5b88c842ea932a1f1f0b810a7f82a876f6fc`.
- Evidence: the mirror returned 404 for `@lynx-js/lynxtron-runtime-darwin-arm64-devtool@0.0.31`, while the official registry returned its version and integrity. Installation still succeeded but omitted arm64 from the lock. The new full-matrix check failed in `/tmp/songloft-desktop-lock-before.log`. Changing the registry while reusing stale metadata did not restore it.
- Rule and Done right: use a separate desktop scope registry and a fresh store to re-resolve all three architectures. Check each target package and integrity; successful Linux installation does not establish macOS/Windows readiness. All three Node checks pass after repair in `/tmp/songloft-desktop-lock-fixed.log`. This does not replace target compilation and execution.
- Seen 1× (2026-11-17). Candidate dependency repair; native acceptance on all three architectures is Not run.

### LICENSE-001: Make agreements readable and check attribution completeness

- Scope: login agreement, consent state, and licenses page; baseline `888f5b88c842ea932a1f1f0b810a7f82a876f6fc`.
- Evidence: agreement text only toggled consent; attribution tests checked existing entries but missed four direct dependencies. Restoring the old pages in isolation made the new checks fail for the missing agreement entry and four missing packages (2 failed, 8 passed).
- Rule and Done right: use an independent `catchtap` reading action to open offline Chinese/English terms without changing consent. Reuse ConfirmDialog's scrolling, close, and back behavior. Derive attribution coverage from runtime dependencies as well as checking listed entries, retaining component-family wildcard credits.
- Validation and limits: final targeted checks, types, dual builds, full tests, Docker Chrome interactions, and worktree identities are in `/tmp/songloft-license-fix-20261117/verification.json`. Native host compilation and device interaction are Not run; shared JS and Web results do not establish device acceptance.
- Seen 1× (2026-11-17). Local repair, not committed or released.

### PLUGIN-002: closing must cancel socket opens still waiting for credentials

- Scope: MIoT Lynx parent bridge, baseline `88e00646a6c948c3497fbf32eaab3c80f04bdd82` plus this worktree.
- Evidence: socketClose completed before secure.get, but its late result still opened a native connection. The actual parent-bridge regression failed before the fix (1 failed/2 passed).
- Rule and Done right: register frame/socket request identity before awaiting credentials and remove it on close. Check identity after await and in finally so closed connections cannot revive and replacements cannot be cleared. Native/Web share this adapter. Record: miot `docs/en/lynx-migration.md`.
- Seen 1× (2026-11-16). Host commits explicitly authorized this round; physical devices and iOS/HarmonyOS compilation remain Not run.

### PLUGIN-001: Retained plugin pages do not imply a retained native frame

- Scope: Android native main-navigation plugins, baseline `2447fade1affad9dda94f0bd68aff932680d91d8`.
- Evidence: frames belonged to routed pages and were recreated on library round-trips. Retaining scroll-views inside the plugin cannot preserve search across this boundary. Native-branch tests preserve the exact frame/search; an isolated active-frame-only mutation fails because the old node disappears.
- Rule: stable Shell owns main-tab frames, hidden pages pause UI polling, and package/update identity, disabling, server scope or Shell teardown dispose instances. Web retention does not prove native retention.
- Same-batch Web input investigation: echoing input values cannot fix bindings lost before custom-element upgrade; queue in the host and replay after definition. Use real keyboard input and verify the runtime actually served over HTTP. Copying beside the database does not update executable-relative assets. Production-method checks fail 2/3 on the old bundle and pass 3/3 after the patch.
- Done right: all 3820 tests, 89 release checks and dual/Web builds pass; native device acceptance Not run. See the [record](docs/en/project/bili-plugin-interaction.md). Seen 1× (2026-11-15). Uncommitted/unreleased.

## Scope and Sources

Record dual-thread behavior, shared JS, and four platform hosts in songloft-org/songloft-player-lynx. See the [local AI workflow](docs/en/guides/ai-development.md) and parent host constraints. Existing AGENTS/business references remain authoritative; link evidence rather than duplicating incident histories.

## Recording and Promotion

Include rule, scope, full owner/repo#number, failure/fix commit SHAs, actual validation, and Done right examples (pending if unavailable). Seen counts independent events on distinct dates, not repeated reviews. Three dates make promotion candidates; mark the authoritative destination. Existing hard rules/serious failures apply immediately. Synchronize the [Chinese version](LESSONS.md), never invent counts/resolution/device acceptance, and redact sensitive information.

## Entries

### LIBRARY-ADD-001: Refresh library queries after creating a station

- Scope: [songloft-org/songloft#578](https://github.com/songloft-org/songloft/issues/578), the add-radio form and shared library queries, baseline `ed953c20dcee85a19e9810e682a69b951eda89c5`.
- Evidence: In Docker Chrome, saving an HLS station returned 201 and the library still displayed its cached empty list after navigating back. Invalidating `['library']` after a successful create made the station immediately visible and editable. After switching to audio-only, the player clock advanced past one second and the server returned `audio/mpeg`. See `/tmp/songloft-578.jCp7cj/lynx-ui-result-v6.json` and `/tmp/songloft-578.jCp7cj/lynx-ui-result-final-v2.json`.
- Seen 1× (2026-11-18).

### MARKDOWN-001: GFM does not automatically expand GitHub emoji shortcodes

- Scope: shared Markdown for Android About/Updates, client Releases and backend changelogs; baseline `1de4735` plus this worktree.
- Evidence: repository Release headings use `:sparkles:` and `:bug:`; the old renderer displays them literally. Three old-code component/page regressions fail. The fix passes 36 focused checks, 3811 full tests, 89 release-tool checks and dual artifacts. Old/new Web comparisons and Android 34 native UI were checked; see [verification](docs/en/project/release-emoji.md).
- Rule and Done right: resolve names to Unicode in prose text nodes, not by replacing the entire Markdown source. Preserve code, escapes, autolinks and URLs; retain unknown names and use own-property dictionary lookups. Update attribution and lockfile for data dependencies without unrelated upgrades.
- Seen 1× (2026-11-15). Status: local repair. Android reuses an existing debug host with the new bundle; the native rebuild was cancelled during Gradle download and is not counted as passed. Reporter device untested; no commit or release.

### BACKUP-001: Cover import files and export responses when changing backup compatibility

- Scope: Web data management, baseline `1de4735`; shared-contract lessons are also recorded in the parent repository.
- Evidence: the old shared validator accepted only v1; three new v2 import/export/authentication-replay regressions fail. Accepting v1/v2 passes all 28 focused checks. A real download imported across two temporary backends remaps tag ID 1 → 2 with correct song/playlist references, retains v1 compatibility and blocks v3 before upload. See [verification](docs/en/project/backup-v2.md).
- Rule and Done right: check both pre-upload and post-download validation. Transfer definitions/references unchanged and let the server map IDs. Keep rejecting unknown versions and invalid structures; update both translations. Native paths and other browsers were not tested.
- Seen 1× (2026-11-15). Status: local repair and browser acceptance complete, uncommitted/unreleased.

### RESUME-002: Test intermediate queues under slow pagination

- Scope: playlist resume; baseline c10e790 plus this working tree.
- Evidence: delayed second-page and incomplete same-song resume regressions both failed on the old implementation. After repair, the browser showed 100 tracks first, played episode 129 before completion, and finished with 1000. See the [record](docs/en/project/playlist-resume-queue.md).
- Rule and Done right: publish contiguous windows on every batch, prioritizing neighbours and later tracks. Audio reuse still checks queue completeness. Retain the current source object, remap prepended indices and allow loaded next tracks to play before prefix completion. Hold subsequent requests and assert playable items.
- Seen 1× (2026-11-14). Full tests and Web passed; native devices Not run, delivery follows the batch record.

### RESUME-001: Restore positions inside source preparation

- Scope: playlist resume and Web/native source loading; baseline 84a1f56 plus this working tree.
- Evidence: the initial browser run saved 754 seconds but seek after a command Promise only played about six seconds; after repair, actual audio reached about 760 and server state about 759. See the [verification record](docs/en/project/playlist-resume.md).
- Rule and Done right: a command Promise does not prove preparation. Pass initialPositionMs through source-load and wait for sourceReady. Queue hydration must retain the loading Song object so identity-based confirmation callbacks still match. Mocks must preserve command/preparation timing; runtime acceptance checks actual media time.
- Seen 1× (2026-11-14). Local implementation and Web passed; native devices Not run. Delivery records govern commits/pushes; no stable release is performed.

### FAVORITE-001: Favorite invalidation subscriptions must bind server and account

- Scope: app-level favorite long polling, Query caches and native notification hearts, songloft-org/songloft#563.
- Rule: fix each request URL and verify its session before auth replay and cache writes. Advance the cursor only after successful reconciliation. Logout, backgrounding and session changes stop old subscriptions; resume must reconcile again.
- Evidence and Done right: an old response arriving after a switch leaves the new `{99}` set intact; refresh failures do not acknowledge cursors. Real QuickJS writes through the backend switch the same Docker Chrome page from Add→Remove→Add without heart clicks or page reload. All 3793 tests and both build targets passed; [record](docs/en/project/issue-563.md).
- Seen 1× (2026-11-11). Status: new-feature mechanism validation, pre-commit validation; delivery status is tracked in the batch record.

### UI-006: Reallocate narrow-row information while preserving touch targets

- Scope: shared rows and playlist context menus, songloft-org/songloft#562; baseline `5e6fe23055eb6512fe185e2fcb9b3acaf9e73497`.
- Evidence: at 390px, duration, favorite, more and outer removal leave about 104px for the playlist title; favorite/more targets are only 26px. Shrinking glyphs alone cannot address both title space and touch area.
- Rule and Done right: put duration on the second line and mobile removal in the root menu with confirmation, retaining 44px favorite/more targets. Verify layout, scrolling and actions separately through measurements, actual movement, membership and requests. The baseline already scrolls; do not assume the device symptom means a missing component. Three new regressions fail on old code; final object/boundaries: [record](docs/en/project/issue-562.md).
- Seen 1× (2026-11-09). Status: local optimization, no commit/push/release; actual Honor/HarmonyOS device pending.

### LYRIC-002: A missing lyric URL in a queue snapshot does not prove the server has no lyrics

- Scope: song restoration and lyric caching, songloft-org/songloft#555; baseline `07eb9b25c851b19eadb005f8345f2493aab72b2b`.
- Rule: supplying an endpoint to the lyric store during re-fetch does not update the persisted queue. Normal restoration must not treat missing snapshot fields as authoritative before checking cache. Online local songs use the ordinary lyric endpoint; offline snapshots must not acquire server URLs.
- Evidence and Done right: two regressions fail on the old implementation. A real temporary backend and browser verify database loading and persistent-cache restoration across two page loads, with one ordinary request, no forced scraping, playback at 00:01 and line highlighting. Objects, logs and boundaries: [record](docs/en/project/issue-555.md).
- Seen 1× (2026-11-03). Status: local fix, no commit/push/release; the reporter's actual snapshot was not obtained.

### SORT-002: auto-scrolling needs host parameters and live pagination callbacks

- Scope: playlist manual ordering, songloft-org/songloft#551 comment `6576318751`; baseline `8ed3c6484d6107a5f5fd0dc417b6d984578524fd`.
- Rule: let the sortable own the real scroll boundary; native offset is not Web top. Refresh running timers to use paginated row callbacks, preserve the active overlay during append and stop on unmount.
- Evidence / Done right: real browser checks exposed Web zero movement after enabling the feature, then drops limited by the old key array after pagination. Unpatched source/distribution controllers fail four cases while two native-parameter cases pass; all six and the page regression pass after the fix. Dual artifacts, types, all 3768 tests and real bidirectional cross-screen/pagination/persistence checks pass. See [record](docs/en/project/issue-551-scroll.md).
- Seen 1× (2026-11-02). Status: local fix; native devices unverified. No commit, push or release.

### SORT-001: The first displaced row is not necessarily the dragged song

- Scope: manual playlist ordering, songloft-org/songloft#550; baseline `a90cded03be18426de61c6df436d08a29e7a3077`.
- Rule: when a sortable component returns the complete new order, a multi-row drag displaces intervening rows too. Identify the dragged item by maximum displacement, or verify that the inferred single move reconstructs the entire new order; do not choose the first changed position.
- Evidence and Done right: the old callback interpreted `[1,2,3] → [2,3,1]` as moving song 2 to the front, failing the new real page-callback regression. Upward/downward multi-row tests, all 3761 tests, dual outputs and types pass after the fix. Real browser drags across three rows persist the intended order in both built-in playlists. Record and platform boundaries: [#550](docs/en/project/issue-550.md).
- Seen 1× (2026-11-02). Status: uncommitted local changes; native gestures still require device acceptance.

### WEB-004: A component's boolean false does not prove the Web DOM received its disabling attribute

- Scope: virtual-list footers, Web engine attributes and scroll geometry, songloft-org/songloft#540; baseline `07599c329f3b52247d48538bfbc7537fd8584148`.
- Evidence: on 2026-11-02, recording frames show recurring large blank library regions. Actual local Web DOM drops `recyclable={false}`, leaving the footer at `content-visibility: auto`; a 40-song scroll range shrinks from 3228px to 2682px. JSX false and the earlier stable-footer component checks did not guarantee stable browser layout.
- Rule: inspect actual DOM, computed style and scroll range. Auxiliary rows also need realistic placeholder sizing. Do not assume a native boolean disabling contract is implemented by the Web engine or disable virtualization for every song as a substitute.
- Done right: keep only `__footer__` laid out in the host. New style regressions fail at three deployment paths against old code and pass after the fix; real WebKit checks row auto, footer visible and container stability. Glass-root discovery separately invalidates on structural changes. Matched browser evidence and validation identities: [#540](docs/en/project/issue-540.md).
- Seen 1× (2026-11-02). Status: local repair evidence; the recording's version is unknown and iOS Safari smoothness still needs device acceptance.

### LIST-004: Select-all operations must not stop at loaded pages

- Scope: library select-all, batch deletion, add-to-playlist and device caching, songloft-org/songloft#549; baseline `ea55033d73456d9268d8e31069ced1e144511dce`.
- Evidence: the old library only offered add-to-playlist, with no select-all/delete entry; all first three new regressions fail on the missing action. The cache button previously filtered only loaded `songs`, which would truncate offscreen selections after adding complete-ID selection.
- Rule/fix: define selection using every ID under the same filters, and consume that set for subsequent actions. Device caching resolves additional paginated metadata where objects are needed. Scope changes, leaving and unmounting reject old responses; deletion completion must not clear a later selection. File deletion remains opt-in with preservation by default.
- Done right: a temporary real backend selects/deletes all 45 remote songs with only 40 loaded, retaining selection on failure/cancel. Two local paths verify file preservation/removal while the unselected radio remains. Tests cover offscreen caching, filters and asynchronous lifecycle; final 72 tests and Chrome/WebKit evidence: [#549](docs/en/project/issue-549.md).
- Not run: the reporter's iPhone, native device caching and host builds; browsers do not establish device acceptance.
- Seen 1× (2026-11-01). Status: lesson; no commit, push or release in this batch.

### WEB-003: Glass background sampling must preserve browser row virtualization

- Scope: WebKit/Firefox tab-bar scene mirrors and library scrolling, songloft-org/songloft#540; baseline `196adc500da5b700bfbf61ab99ffc4b2918922c4`.
- Evidence: on 2026-10-30 the reporter confirmed the return-to-top fix but still reported Safari jank. Glass sampling measured offscreen rows. With 180 loaded songs in both diagnostic WebKit runs, observing skipped content reduced row measurements from 14,385 to 2,182. The initial `checkVisibility` attempt did not establish a reduction on this version and was discarded.
- Rule and Done right: capture `contentvisibilityautostatechange`, retain skipped nodes, omit their subtrees, and repaint when relevant again. Events neither bubble nor cross shadow roots: subscribe on each source root and detach on disposal. Skip/resume and shadow-root regressions fail on the old implementation. Final tests, matched comparisons, failures and device boundaries: [#540](docs/en/project/issue-540.md).
- Seen 1× (2026-10-30). Status: lesson; local browsers do not establish smoothness on the actual iOS 18.6 device.

### UI-007: Stable Chromium placeholders do not establish WebKit scroll-container stability

- Scope: flat/category song pages and Web virtual lists, songloft-org/songloft#540; baseline `645717f254481baffd13a21da1ff5ba0191d29d4`.
- Evidence: on 2026-10-29, 64px estimates and stable footers pass Chromium, but WebKit 18.4 still collapses 41 rows to 626px and changes offset 260 to 0. Container-level `content-visibility: auto` skips layout; keeping only the scroller laid out prevents return-to-top during pagination.
- Rule and Done right: verify container and row geometry in the actual engine. Keep the viewport laid out while rows virtualize. Public `injectStyleRules` is also cleared by an upgrade class field: upgrade, install the hook, then start the url. Regressions model that ordering; final WebKit offset increases monotonically to 3120, song 49 visible, container visible and rows auto. Flat/category callers also receive appropriate estimates and stable footers. Evidence, early environment failures and device boundaries: [#540](docs/en/project/issue-540.md).
- Seen 1× (2026-10-29). Status: reproduced and verified in WebKit; actual iOS 18.6 remains unverified. No commit or release.

### WEB-002: Acquire the file-picker gesture on an actual main-thread control

- Scope: browser uploads and Worker RPC, songloft-org/songloft#545; baseline `645717f254481baffd13a21da1ff5ba0191d29d4`.
- Evidence: on 2026-10-29 the Safari follow-up revealed that the earlier native delegate fix did not cover Web. A real Docker Chrome Worker fixture reproduced a hidden input remaining loading without activation. The visible control passed actual click, cancel/retry and server-observed multipart/cookie checks.
- Rule and Done right: native and browser pickers require separate verification. Worker callbacks cannot reliably carry the picker gesture. Offer a visible main-thread control and cancellation; start the deadline only when uploading and settle once. Regressions, builds and device boundaries: [#545](docs/en/project/issue-545.md).
- Full-page acceptance in the same incident found a second mismatch: the client sent `plugin`, but the server required `file`, returning 400. A host fixture proves byte delivery only; also verify installation and the refreshed list. Fixed the shared call and added a page regression; Seen is unchanged.
- Seen 1× (2026-10-29). Status: lesson; iOS 18.6 Safari device recheck remains open.

### WEB-001: A plugin URL token cannot authenticate a reverse proxy's cookie session

- Scope: Web plugin iframes and NAS gateways, songloft-org/songloft#543; baseline `e1572551b9b6fb584e6a2325ef62e9db103e1283`.
- Evidence: on 2026-10-27 the old host unconditionally sets iframe `credentialless`. Docker Chrome gateway fixtures requiring an HttpOnly cookie return 403 without that cookie for root hosting, subpaths and an isolated cross-origin host. Three new regressions fail against the old script while the existing 22 pass.
- Rule: URL tokens establish backend authentication, not authorization at an outer NAS gateway. Anonymous iframe contexts differ from the COEP response header. Preserve credentials absent an actual requirement; verify cookies received by the gateway and requests for child resources.
- Done right: remove the iframe attribute, retain the backend COEP header. All 350 files / 3714 tests, types, dual outputs, Web packaging and 89 release-tool checks pass; browser fixtures recover cookies. Actual UI, source fingerprints and platform boundaries: [#543](docs/en/project/issue-543.md).
- Seen 1× (2026-10-27). Status: lesson; the reporter's actual FN Connect environment still needs verification.

### LIST-003: Reused paged rows need current actions; performance probes must not measure every row

- Scope: Web playlist pagination and mouse scrolling, songloft-org/songloft#542; baseline `81c478c14d67de8a9a9dbbfcc9ab0857e4ee405a`.
- Evidence: on 2026-10-27, scroll updates rebuilt 80 loaded rows and appending pages updated existing rows again. Replacing the inset with loading changed the end position by 32px. Corresponding regressions fail against the isolated old implementation; mouse scrolling was also confirmed missing in the Flutter-to-Lynx Web migration.
- Done right: cache row trees and memo song rows, with stable callbacks reading current pages through a ref. Tests assert both reuse of old rows and clicks playing all newly loaded songs. Loading retains the same inset. Actual browser evidence and platform boundaries: [#542](docs/en/project/issue-542.md). Stop pagination timing when rows are appended; exclude subsequent forced layout from reading every row's bounds and timings collected during concurrent tests.
- Second independent event: on 2026-10-30, `196adc5` still recreated arrays and callbacks in flat/category pages, updating existing rows on pagination-state changes. Stable props and memo regressions check old-row reuse, target-only selection updates, and old rows reading the latest queue/category context. Increasing prefetch also exposed Web's single threshold row being skipped by jump scrolling, requiring observation of the actual end; see [#540](docs/en/project/issue-540.md).
- Seen 2× (2026-10-27, 2026-10-30). Status: lesson; the reporter's Chromium 150, iOS 18.6 and real library remain unverified.

### LIST-002: Preserve pending scrollbar targets and confirm native seeks with visible rows

- Scope: Playlist pagination, drag thumbs and native/Web Lynx lists, songloft-org/songloft#540.
- Evidence: On 2026-10-25, baseline `eb396153c0a05ddd8a2ba940da87211d1a1cd36e` drives the thumb only from the visible index, initially 0, returning it to the top while loading. Native seeks immediately discard their destination. Two new assertions fail as expected on the old implementation; the native fixture explicitly models a successful invocation before layout commits.
- Done right: The pending thumb follows the requested position. Both native and Web finish seeking through visible-row confirmation, with bounded retries, unmount cleanup and rejection of stale requests. All 3 focused regressions pass. Actual UI results, final worktree identity and coverage boundaries: [#540 record](docs/en/project/issue-540.md).
- Seen 1× (2026-10-25). Status: lesson; the controlled native fixture does not establish device acceptance for every native platform.

### WIDGET-001: Widget actions must not depend on the first audio load

- Scope: 2026-10-21 feature port, uncommitted worktree based on `1ef324864b88c679a7b0378eff24cfef3de4f167`; no linked Issue.
- Rule: Bind widget actions to the current LynxView. Mark it ready after JS registers listeners and consumes the cold action; do not borrow the lazily initialized audio event sink. Detach only the owning view and consume a queued action once.
- Failure: With APK `5b3e9f9…e70b8`, the first desktop Play after restoring an unloaded paused queue only opened the app. Actual failed screenshots/results: `/home/hanxi/work/songloft-review/lynx-current-device-20261021/before-fix-*`.
- Done right: Four `WidgetActionDelivery` JUnit checks cover readiness, cold delivery, destruction and replacement; the independent-channel wiring gate fails against the old implementation. APK `86b5c0c8…0c093e` passes nine actual checks, including native progress, Next after process restart and stale thumbnail removal. See the batch record for the later APK with the shared video-page fix.
- Seen 1× (2026-10-21). Status: lesson; emulator uses Reduce Transparency, physical and other-platform devices remain untested.

### VIDEO-001: Closing a video surface also requires leaving its controls

- Scope: Same-day feature port, automatic advance at MV end; no linked Issue.
- Rule: The video page follows the opened song reference. Leave it after switching to audio or another MV; host `close()` does not guarantee a `closed` navigation event. Ordinary progress changes must not navigate.
- Failure: Actual Android MV completion closed the picture but left the audio lyrics on the video page. Evidence: `mv-auto-advance-before-fix.png` in the same review directory. Both mounted regressions fail against the old implementation because navigation never happens.
- Done right: `FullVideoPage` requests its parent route once on a song-reference change; unmount retains existing video, timer and browser-fullscreen cleanup. Tests cover MV→audio and MV→MV; actual device results are recorded in the [batch record](docs/en/project/feature-port-20261021.md).
- Seen 1× (2026-10-21). Status: lesson; component tests do not establish host-device acceptance.

### BUILD-001: Probe Xcode installation, selection and runtime devices separately

- Scope: Native follow-up for the 2026-10-21 feature port, uncommitted worktree based on `1ef324864b88c679a7b0378eff24cfef3de4f167`; no linked Issue.
- Rule: Local Linux, an initial SSH timeout, or Command Line Tools being selected does not establish that a configured remote Mac lacks Xcode. Check connectivity, Xcode.app, SDKs, simulator runtimes and devices separately. Set `DEVELOPER_DIR` per build rather than changing global selection, and never print credentials from SSH configuration.
- Evidence and Done right: Retrying the existing `mac` alias found Xcode 27.1. Command-local selection enabled `xcodebuild -list` and a WidgetKit extension build. Runtime/device lists were empty, so signing and device screenshots remain open. Logs and compatibility conditions are in [acceptance](docs/en/project/feature-port-20261021.md).
- Seen 1× (2026-10-21). Status: lesson; below the three-date promotion threshold.

### TEST-002: Wait for an actual host progress report

- Scope: Android playback/home-widget acceptance on the uncommitted feature-port worktree based on `1ef324864b88c679a7b0378eff24cfef3de4f167`; no linked Issue.
- Rule: An arbitrary wait shorter than the host reporting interval cannot establish stalled playback. Bound the wait for the same song to advance, then verify pause stability. Neither `isPlaying=true` nor an icon change proves progress.
- Evidence: On 2026-10-21 APK `d8dc8b7c…a9807d` falsely failed a 300ms sample; waiting for an actual report observed 44312 → 44815ms, then desktop pause held 45314ms. See [acceptance](docs/en/project/feature-port-20261021.md) and `widget-final-result.json` in its evidence directory.
- Done right: Wait at most five seconds for unchanged song ID and increased position; take two stable paused readings and independently match the installed APK checksum. Record native progress, screenshots and server side effects separately.
- Seen 1× (2026-10-21). Status: lesson; below the three-date promotion threshold.

### AUDIO-001: Preserve live playback intent and explicitly forward system pause

- Scope: songloft-org/songloft#531, four audio hosts and the shared player store; baseline `f3f78b3aae6e74323b963a9e8c940bf74b3613b5`.
- Evidence: Live completed events advanced the queue, and errors advanced after three retries. New regressions fail against the isolated old store for playback modes, extended retries and cancellation. Host paused events also represent buffering; pausing an already-paused engine may produce no state event. An actual Android STOP media key also exposed ordinary player stop bypassing the notification's custom exit command: verify distinct system-control entry points separately.
- Rule and Done right: Reconnect indefinitely to the current station with a capped delay, preserving queue and song counts. All four hosts explicitly send user play/pause commands; pause/stop cancel timers and pending loads. Actual results, source fingerprint, final commits and platform boundaries are in the [validation record](docs/en/project/issue-531.md).
- Seen 1× (2026-10-20). Status: lesson; final same-SHA delivery determines CI/dev artifacts.
- Same-incident release review: New native events also require updating capabilities in `updates/native-contract.json`. A documented full-install requirement alone still lets automatic updates install JS into shells lacking those events. Signed-manifest/immutable-snapshot regressions for `audio.remoteIntent.v1` are in the same record; Seen does not increase.

### SDK-001: SDK parity includes dispatch, model conversion and bidirectional transport

- Renderer comparison: All 19 functional assertions on the same APK with Mesa do not establish sustained icon correctness. A new image segfaulted before client installation and another path was OOM-killed: these prove independent environment failures, not the cause of every missing glyph. Wait for actual asynchronous playback with a bound, preserving assertions and initial failure evidence. Multiple diagnostic interventions are not a single-variable causal proof. See `/tmp/songloft-sdk-e2e/rendering-validation.json`.

- Same-day icon fix: The actual APK's `servalsvg:0.1.1` omits x86_64; a declared Gradle dependency does not prove ABI coverage. After updating to 0.2.4, verify all four packaged libraries, runtime loading logs and screenshots: native icons return and all 19 assertions pass again. Plugin glyphs render after reload but disappear later: selecting only the correct frame cannot establish a pass. Default effects still exit with 139, so restoring SVG icons does not remove the environment limit. See `/tmp/songloft-sdk-e2e/svg/validation.json`.

- Scope: HTML / frame client SDK in Lynx; no linked Issue, baseline `e41987c5b6f3f4a0315e0e54914207c45868a458`.
- Evidence: On 2026-10-20, comparison with Flutter and `@songloft/client-sdk` exposed missing queue edits, playlist playback, favorites and cookies. Pages cast HTTP snake_case JSON directly to Song; native WebViews discarded dispatch results; snapshots omitted artwork and other fields. With the old dispatcher and player restored in an isolated copy, all 7 new real-store regressions failed as expected. Parent-repository tests cover old shared `common.js` native transports.
- Rule and fix: Both renderers share typed APIs, dispatch and complete serialization. Insert/reorder remap both the current occurrence and navigation history; finding by song ID cannot handle duplicates correctly. Replies retain correlation IDs and stop after component unmounts or URL changes. Push same-length reorders, volume and actual duration while filtering position-only ticks.
- Same-day review: New regressions confirm that `bindload` means load completion and must not cancel startup requests; native reply failures must settle Promise rejections. HarmonyOS cookie dictionaries use Map to retain data keys such as `__proto__`; executing the actual method against a controlled store exposes the old lost-key behavior. All 575 affected tests pass; device/HAP acceptance remains unrun. See the SDK record.
- Follow-up: All 3611 post-review tests pass. With Reduce Transparency enabled, the official plugin passes 19 assertions on the Android 34 emulator, including actual HttpOnly cookies and startup replies. Default effects previously exited the emulator and some control glyphs remain absent: retain environment conditions and visual gaps rather than generalizing functional success to complete native acceptance. See `/tmp/songloft-sdk-e2e/native-validation.json`.
- Done right: The uncommitted tree passes TypeScript, all 3610 Vitest tests, Lynx/Web bundles, Web deployment, 87 release checks and Android `assembleDebug`. Interfaces and this batch's browser boundaries appear in the [client SDK reference](docs/en/reference/plugin-client-sdk.md). Favorite refresh cancels older GETs before updating a complete cache; a cold cache reloads rather than treating one notification as the entire set.
- Not run: iOS/HarmonyOS host compilation and real native cookie-store / device acceptance on all three platforms. Android compilation does not establish device behavior.
- Seen 1× (2026-10-20). Status: lesson; not committed, pushed or released.

### LYRIC-002: Readable text does not establish visible cover changes

- Scope: Lynx player scrims and lyric foregrounds, songloft-org/songloft#523 feedback on 2026-10-17.
- Evidence: baseline `364607b0cb7a0ed07378e59b27ff6827549fde3e` passed contrast regressions, but the reporter confirmed normal mode remained too faint. New separation tests at both gradient ends failed in light and dark modes on the old implementation; the lower scrim left only 6%/10% artwork.
- Done right: constrain cover separation independently, reduce the veil, and recheck black/white extremes and every built-in palette against 7:1 / 4.5:1 text targets. Verify switching, fallbacks and accessibility restoration in a real browser. Full objects and platform limits are in the [record](docs/en/project/issue-523.md#2026-10-17--stronger-cover-backgrounds).
- Seen 1× (2026-10-17). Status: lesson; currently an uncommitted worktree.

### WEB-002: Desktop mobile viewports do not validate Android Chrome IME or browser controls

- Scope: Web `Input` / `TextArea`, asynchronous controlled-value echoes and fixed navigation; no associated Issue.
- Evidence: on 2026-10-16, baseline `209f6c88b071c187064194a2ae197e48c23fa6c3` reproduces on an Android 34 / Chrome 113 / Gboard emulator. One letter triggers a roughly 9.5ms readonly pulse: DOM focus remains, but the OS dismisses the keyboard. A 912px root exceeds the 856px visible viewport, placing the capsule 48px outside it. Earlier 390px desktop screenshots did not exercise either OS behavior.
- Rule: independently observe OS IME visibility, real continuous/composition input and geometry with browser chrome. Removing the readonly lock alone still lets older echoes overwrite newer edits: the first fix loses `l`, and four additional asynchronous echo tests fail on it. Acknowledge inputs in order; an equal value must not consume later repeated events prematurely.
- Done right: Web avoids temporary readonly changes and skips value echoes already applied by the browser; native locking remains. The host uses dynamic viewport height and Android `resizes-content`. Installed source/distributed controllers pass 36 regressions, the full suite passes 3580, and type checks, dual bundles and 87 release checks pass. Final device results are in the [record](docs/en/project/web-android-input-viewport.md), with evidence under `/home/hanxi/work/songloft-review/android-web-input-20261016/`.
- Follow-up: dynamic viewport resizing also raises fixed capsules above the IME; the previous acceptance incorrectly counted that side effect as a pass. Added acceptance must check hiding during input, no hit targets, restoration after dismissal and uninterrupted playback, beyond fitting navigation inside the reduced viewport. HTTP has no universal precise keyboard API; the same record documents focus/height fallback limits and actual emulator evidence. ADB input requests the IME again and is not physical external-keyboard acceptance.
- Seen 1× (2026-10-16). Status: lesson; a single emulator/browser version does not establish physical Android, latest Chrome or Safari acceptance.

### WEB-001: HTML packaging changes must pass the actual archive verifier

- Scope: embedded Web HTML, copy-bundle-web.mjs and verify-package.py.
- Evidence: on 2026-10-16, local JS/package tests and real browser checks pass at `6edca8561eeaa375c82c725c2cfd097f0ef3f996`, but run `38883061236` fails Web embedded because its regex treats the new base href as an empty asset path. Generic verifier fixtures had not consumed the changed copy output.
- Done right: HTMLParser separates base tags from assets and validates embedded/standalone base policies. The regression archives actual copy output and invokes the verifier, then removes a real asset to ensure missing files still fail. The old verifier fails this new regression; the fix passes 85 release checks and the exact CI archive command. Evidence: `logs/{lynx-ci-web-job,archive-verifier-negative,lynx-release-tests-archive-fix}.log` under `/home/hanxi/work/songloft-review/lynx-default-20261016/`.
- Seen 1× (2026-10-16). Status: lesson; delivery records the fix commit and subsequent CI. Cancelled old builds do not count as passing.

### LYRIC-001: Explain when accessibility disables cover backgrounds

- Scope: Lynx player and appearance settings; songloft-org/songloft#523 feedback on 2026-10-16.
- Evidence: an actual Web build of baseline `1ad0eaf1cba340d644660f64198fed6b8b6d6d6d` unmounts the cover and shows a solid background with either Increase Contrast or Reduce Transparency. Old descriptions only mentioned labels/separators or solid surfaces. The screenshots match this path, but device settings remain unconfirmed.
- Done right: disable each option through the real settings UI and confirm the cover returns; clarify the effect in both languages while retaining the accessibility policy. Screenshot similarity does not prove a device cause. See the [#523 follow-up record](docs/en/project/issue-523.md) for comparisons and commands.
- Seen 1× (2026-10-16). Status: lesson; copy was uncommitted during validation, with final validation objects in the task record.

### LIST-001: Delegating to a virtual list does not establish large-queue runtime performance

- Scope: playback queues, shared `VirtualList`, Web and native runtimes, songloft-org/songloft#525.
- Evidence: on 2026-10-15, all 80 relevant tests pass at baseline `e924f05a334254b6eb754927b2808f87a7943302`; the 500-song test mocks the list and verifies delegation. An actual 30,000-song queue causes Web query timeouts after clicking and hits the native bridge's 15-second deadline on Android 34 with ARM64 translation, while its media session continues playing the same song.
- Rule: component names, native layout virtualization and mocked structural assertions do not prove that background JS processes only visible rows. Check JS construction, layout, measurement, interaction and media progress at the actual scale. Passing at 100/500 songs does not establish 30,000 songs.
- Done right: bound row creation to the viewport and keep font-scaled sizing/offsets aligned. Progress saves update small keys; queue changes encode in batches. The final 3,543-test suite, four Web cases and native Android 30,000-song opening/tail/removal/navigation checks pass. During automatic saving, 20 UI probes respond within 35ms. See the [#525 record](docs/en/project/issue-525.md) for objects, baseline failures, final evidence and Not run.
- Seen 1× (2026-10-15). Status: lesson; the fix is uncommitted and this incident does not increment Seen. Hardware and other native platforms remain unverified.

### RELEASE-001: Send confirmation prompts to stderr and fail on cancellation

- Scope: `scripts/bump-version.mjs` and command substitution in the parent release orchestrator.
- Rule: reserve stdout for the successful version result; send plans/prompts to stderr immediately. Enter, rejection and EOF must cancel with a nonzero exit so orchestration stops; input handling must terminate cleanly on EOF.
- Evidence: on 2026-10-15, baseline `0de993ff272ee29df96c8401b46df56256646438` hid prompts when the parent captured stdout and returned 0 on Enter. All 5 new relevant checks failed against the original implementation and pass after the fix. Full record and Not run: [handoff](docs/en/project/handoff.md#2026-10-15--release-confirmation).
- Done right: all 81 release-tool tests pass. A PTY with actual command substitution shows the version and prompt before input; Enter exits 1 without writes, and yes creates only the expected local commit/tag, preserving fixture remote refs. Evidence: `/tmp/songloft-release-terminal-result.json`.
- Seen 1× (2026-10-15). Status: lesson; no commits, pushes or actual releases performed by this task.

### UI-003: A correct color getter does not update persistent SVGs

- Scope: built-in palettes, server packs and persistent navigation, songloft-org/songloft#523.
- Rule: ThemeProvider updating inherited CSS variables does not rerender identical children. Native SVGs need their persistent owner to subscribe explicitly. Inspect rendered SVG content and actual icon/text/selection screenshots instead of only calling a color getter.
- Evidence: On 2026-10-15, this batch's initial screenshot on baseline `4d73b793890494301d44b1a19e9df4dd178429e3` showed Rose text/background with a blue navigation gear, although getter assertions passed. The isolated original ShellLayout fails the rendered `#984061` assertion. Explicit palette/pack subscriptions pass 13 navigation regressions and the final 3531-test suite. See the [batch record](docs/en/project/issue-523.md) for the source fingerprint and retained screenshots.
- Done right: ShellLayout subscribes to `subscribeBuiltInPalette` / `subscribeActiveThemePack`; the same mounted SVG follows Blue → Rose → pack → restored Rose. Browser checks assert rendered SVGs match the root accent for all six palettes.
- Seen 1× (2026-10-15). Status: lesson; below the three-date promotion threshold.

### UI-002: Slider release and bounds measurement must belong to one gesture

- Scope: shared lynx-ui 3.135.4 sliders and older native-shell capabilities, songloft-org/songloft#520.
- Rule: Release must be recorded even before value updates begin, then commit the same gesture's last position after its bounds arrive. Reject earlier gestures/unmounted callbacks and measure rail/fill separately.
- Evidence: On 2026-10-14, the library at baseline `992eb4930bc686f7160a1ca0bfbab42368dad284` lost commit when release preceded `getRectByRef`, while a late callback could start dragging. The actual-controller fixture fails three tests with the original library and passes four after patching. API 34 measured cache-fill width as zero; displayed labels/ticks do not prove the fill or gesture works. Evidence: `/tmp/songloft-520-slider-{negative,final}-test.log`, [#520 record](docs/en/project/issue-520.md).
- Done right: Lock source/dist patches covering short taps, the final move, interleaved measurements and unmount. Give the inner fill explicit width/centering. Older Android `exitApp` only backgrounds, so the new JS entry consumes host capability `androidExitAppStopsPlayback` and stays hidden on old shells; method existence alone is insufficient.
- Coordinate evidence: API 34 touch x=196.36 and measured left=0 yielded ratio 0.597 for the visible midpoint. The common helper passed relativeTo:'', returning local bounds despite LynxView-relative touches. Use null for native bounds and screen for Web clientX. The final controller suite passes 8 tests; the original fails 7. Actual device/server endpoints and midpoint values persist correctly. See `/tmp/songloft-520-coordinate-{tests,negative}-final.log` and `/tmp/songloft-520-lynx-{device,server}-final.json`.
- Wrapper follow-up: ProgressBar also discarded its first value through a pre-render dragging closure, unlike the size/font sliders that seed their preview. Two wrapper regressions fail before the fix and pass after; API 34 taps at 25%/50%/75% reach the matching 30/60/90-second positions without stopping playback. This is follow-up validation of the same incident, not an extra Seen event.
- Not run: HarmonyOS 4.2 hardware. Standard Android did not reproduce all reported touch symptoms; deterministic shared regressions do not accept that device.
- Seen 1× (2026-10-14). Status: lesson; final native/persistence evidence is in the batch record.

### TEST-001: Run artifact-reading tests after builds finish

- Scope: Lynx/Web builds and release artifact gates.
- Rule: builds clean `dist/`; tests reading `dist/main.lynx.bundle` must not run concurrently with a build. Complete the dual build and Web packaging before the full test suite.
- Failure: on 2026-10-14, songloft-org/songloft#520 ran builds and tests concurrently in the uncommitted worktree based on `a69a45f4c3048171ddbc1f0f33c9922fa3af74d8`. `release-build.test.ts` failed with `ENOENT`; log: `/tmp/songloft-520-lynx-tests.log`. This is a verification orchestration failure, not a source regression or grounds to skip the gate.
- Done right: sequential execution after building passed 3494 tests in `/tmp/songloft-520-lynx-tests-final.log`. Final verification after adding lyrics visibility cases is recorded in [#520](docs/en/project/issue-520.md).
- Seen 1× (2026-10-14). Status: lesson.

### TEST-002: Keep the pnpm directory layout in isolated regression runs

- Scope: Run the shared Lynx suite against a previously packaged source snapshot.
- Evidence: On 2026-11-19, dependency symlinks from the isolated 2.13.24 snapshot to the original worktree put ReactLynx setup outside the Vite root. All 374 suites failed during setup. Using local pnpm directories with hard links to the installed dependency files let all 19 Android manifest and auth-interceptor pilot tests pass. The snapshot was based on `debad6e80`.
- Keep dependency directories and build artifacts local to the test root. Build Lynx and Web before running the tests, then record the result with the package source digest. [Verification record](docs/en/project/desktop-implementation.md#21324-development-packages-from-one-source-snapshot)
- Seen 1× (2026-11-19). Status: lesson.

### UI-001: Verify scroll hints against visible songs and host callback shapes

- Scope: virtual-list positioning, initials and numeric hints (songloft-org/songloft#518).
- Rule: a visible bubble does not prove positioning. Native `attachedCells` uses list-relative coordinates; Web's `getVisibleCells` array cache can lag, so use binary searches over actual row bounds. Supply a realistic Web placeholder-height estimate; scroll offset divided by row height is only provisional. Keep one row-bound read in flight, coalesce the latest pending position, and revisit it afterward to avoid backlog or losing the final scroll. Reject stale callbacks. A void `scrollToPosition` success does not prove new rows have committed; require visible-destination confirmation with bounded retries.
- Failure evidence: on 2026-10-14, the initial uncommitted browser implementation displayed row 14 while the hint remained at row 1. `/tmp/songloft-518-ui/lynx-full-drag.png`, `lynx-debug.json` and installed web-elements source confirm the callback differences.
- Fix evidence: the current uncommitted worktree normalizes visible cells, follows actual scroll events, finishes void invokes, estimates song placeholders at 64px and paginates destinations; Git identifies the eventual commit. Tests cover native objects, Web array coordinates, immutable query chains, interleaved callbacks and settled positions without a subsequent scroll event. Both final browser runs continue to offset=100; at scroll offset 6592, row 104, “夜空中最亮的星”, appears at the list top with `Y` and `104 / 130` in the hint. See `/tmp/songloft-518-ui/lynx-final-{result,repeat}.json` and the validation object in the [batch record](docs/en/project/issue-518.md).
- Done right: verify bubbles, visible rows, real page requests and restored preferences separately. Keep hints visible throughout a held drag and confirm virtual rows that settle after the last scroll event. When the viewport has not moved, a newer pending query must not invalidate a valid response; reject responses older than an already-applied result instead. Browser assertions record held and released hints separately. Cancel old positioning and query timers on navigation.
- Seen **1×**: 2026-10-14. Status: lesson; native devices remain unverified, and Web evidence is not native acceptance.

### API-001: Validate Upgrade Payloads Against the Backend Channel Contract

- Scope: Lynx backend update checks, start requests, and page tests.
- Rule: A write mock returning 200 for any body cannot prove an upgrade action works. Check the running channel, its version/notes, and actual POST JSON. Online upgrades stay on the current stable/dev channel; non-Docker deployments have no action.
- Failure evidence: [songloft-org/songloft-player-lynx#11](https://github.com/songloft-org/songloft-player-lynx/issues/11) screenshot and baseline [`0651222`](https://github.com/songloft-org/songloft-player-lynx/commit/0651222b87b5a97daebef7e48c5d497c32a7e71a): the widget sent `{}`, rejected by the backend for missing `version_type`; the old mock did not inspect the payload.
- Fix evidence: source worktree `faec7a428a9675dc1d3e5c98191d963555b8616c409e93658daae6f651e8389b`; five regressions fail with the isolated old widget, the final 36 related tests pass, and browser records confirm dev/stable payloads and rejection/retry. See [progress](docs/project/progress.md). Actual binary replacement and Android devices remain untested; the Git commit containing this entry records the fix.
- Done right: `SettingsApi.startUpgrade(channel)` sends `{version_type: channel}`. About tests use the real API class, transport tests inspect JSON, and browser fixtures reject the wrong channel and record requests, beyond button-presence checks.
- Seen **1×**: 2026-10-14. Existing API rules apply; the three-date promotion threshold has not been met.

### UI-004: A scroll-view needs an explicit height; flex is not a substitute

- Scope: Lynx/Web scroll containers and bottom panels, songloft-org/songloft#536.
- Rule: A `<scroll-view>` with only `flex: 1` does not automatically get a bounded viewport height; content may expand it and no scrolling occurs. Give full-height scroll pages `height: 100%`; an absolute bottom panel needs an explicit `height: %` on the panel (not `max-height`) before its `flex: 1` body can scroll. Pages whose content may exceed a short viewport must be verified at landscape / keyboard-open heights.
- Failure evidence: `.login__scroll` in `LoginPage.css` originally had only `flex: 1`, leaving the login button unreachable on short viewports. The added `login-css` gate requires `height: 100%` in that rule and fails on the old CSS.
- Done right: Headless Chrome at 390×420 measured `.login__scroll` at scrollHeight 426 / clientHeight 356, and the button is fully visible after scrolling (`/home/hanxi/songloft-ui-verify/login-390x420-{top,bottom}.png`). The add-songs panel uses `height: 72%`, with a scrollable list at 1280×800.
- Not run: iOS/Android/HarmonyOS devices; Web evidence does not cover native gestures or soft-keyboard behavior.
- Seen 1× (2026-10-23). Status: lesson; below the three-date promotion threshold.

### AUDIO-002: Persist app-level volume and keep platform volume semantics distinct

- Scope: volume restore on all hosts, iOS AVPlayer multiplier and the Web host, songloft-org/songloft#536.
- Rule: The store's 0–100 volume is an app-level setting. Persist it to the `player_volume` pref (shared with preference sync), and run `restoreVolume` before restoring playback so auto-resume does not start at the host default. Android volume belongs to the system media stream and must not overwrite the saved value. A remote app-volume preference must also be filtered during Android startup so it cannot be replayed into the system media stream. iOS records the app-level multiplier and re-applies it whenever a player is created; it must not read or observe `AVAudioSession.outputVolume` (that is system volume, unrelated to the app slider, and made the slider jump back). Host `volumeChanged` must not overwrite the local preference before restore completes.
- Evidence: The old iOS implementation read system volume and lost the multiplier when replacing the player; Web `getVolume` was a no-op. The new `volume-persistence` regressions cover debounced writes, startup restore and event gating. The Android remote app-volume filter regression, 98 player/preference tests and the TypeScript type check pass. Headless Chrome measured the wide mini-player panel dragged 50% → 30% and still at 30% after a full reload.
- Done right: `volume-prefs.ts` owns the shared key and coercion, with a 400 ms debounced write. The mini-player trigger is wide-only, and its panel mounts in root overlays so the capsule cannot clip it. Screenshots: `/home/hanxi/songloft-ui-verify/volume-*.png`.
- Not run: iOS/Android/HarmonyOS devices; hardware keys, lock screen and Bluetooth paths remain unverified.
- Seen 1× (2026-10-23). Status: lesson; below the three-date promotion threshold.

### UI-005: A popover inside a tappable ancestor must isolate every layer

- Scope: the popover embedded in the Lynx mini player and the shared PopoverSurface; no linked issue (mini-player button parity batch and its follow-up fix).
- Rule: Lynx `bindtap` bubbles to ancestors. For a popover placed inside an element with its own `bindtap` (such as the mini-player root navigating to `/player`), catching on the trigger alone is not enough: the panel and the backdrop are siblings of the trigger but still descendants of that tappable ancestor. The trigger's catch only protects the toggle; row taps and backdrop taps keep bubbling. Shared overlay components should expose an explicit isolation switch covering trigger, panel and backdrop — a no-op `catchtap` on the panel to stop the bubble, and `catchtap` on the backdrop that also closes — instead of asking callers to wrap the trigger in another view.
- Failure evidence: The first headless-Chrome run tapping the mini-player "more" button landed on `/player` instead of the menu; the trigger bubbled through `bindtap` to the capsule root's navigation. After that trigger fix, the same batch reported: song info navigated to the full player before its (root-mounted) dialog appeared, the equalizer was overridden by the second `/player` navigation and never opened, and the sleep-timer sheet disappeared with the unmounted shell. In tests `fireEvent.tap` only reaches `bindtap`; call `eventMap['catchEvent:tap']` directly.
- Done right: `PopoverSurface`'s `stopTriggerPropagation` now switches trigger, panel and backdrop together (the mini player passes `true`; other call sites are unchanged). Headless Chrome at 1024×768 confirms song info opens in place over the list, the equalizer enters its page, the sleep-timer sheet opens, and a backdrop tap closes without navigating (`/home/hanxi/songloft-ui-verify/mini-menu-{song-info,equalizer,sleep-timer}.png`).
- Seen 1× (2026-10-23; the follow-up defect on 2026-10-24 is the same batch and is not counted again). Status: lesson; below the three-date promotion threshold.

### IOS-001: Async picker results must not depend on a weak delegate

- Scope: shared iOS upload, songloft-org/songloft#545; baseline `ab96b325565241cc62850fba01e5efe63385754b`.
- Rule: retain completion independently of the dismissible picker delegate. Success, HTTP errors and transport errors must all reach JS.
- Evidence / Done right: 317 native contract checks and type checking pass; the new structural check fails against isolated old source. ARC timing and device behavior remain unverified. See [this batch](docs/project/progress.md).
- Seen 1× (2026-10-28). Status: source fixed; native build and device acceptance pending.

### DESKTOP-003: Wait for the consumer's real readiness boundary

- Scope: desktop Bundle update migration confirmation, Lynx native child-frame bridge, and updater download cleanup.
- Evidence: source review on 2026-11-18 found three timing gaps: a remote-mode launch had not yet migrated the local database; a child Lynx runtime could report ready before its host bound the frame identity; and update-directory creation happened outside the download cleanup block. The old code could confirm an app too early, reject plugin calls permanently, or remain stuck in `downloading`.
- Rule and fix: resolve readiness at each actual consumer boundary. Confirm migration after the local backend health check, resolve a child identity on its first bridge call, and keep download setup within the same error/cancel/finally path.
- Done right: JS sources pass Prettier and `node --check`; the native extension is clang-formatted. The installer atomically publishes its immutable manifest and startup confirmation record; if confirmation cannot be written after app replacement, it restores and restarts the previous app. The implementation record lists exact unverified paths. Not run: updater/plugin runtime checks, native build, real migration-failure recovery, or installer upgrade.
- Same incident follow-up. Dev can upgrade within one version, so confirmation checks the client and backend SHAs and waits for local backend health. A pending update blocks another installation. Backup serializes mode switches and holds the backend stopped. The two regressions failed against old code on premature app removal and session shutdown. Actual macOS arm64 packages migrated schema 43 to 44. An isolated fixture that aborted migration 0044 recovered the old database with a matching checksum. [Desktop implementation record](docs/en/project/desktop-implementation.md#database-migration-and-recovery-on-macos-arm64).
- Seen 1× (2026-11-18). Status: lesson; device and upgrade acceptance remain.

### DESKTOP-005: Automatic and manual updates share the mirror setting

- Scope: Lynxtron desktop updates. The previous host only received the proxy during manual checks. The new regression observed its first automatic check and download connecting directly to GitHub.
- Rule: Fetch the proxy from the current authenticated session for each check. Use the same proxy for the manifest and its asset. Discard replies from sessions that ended during the request.
- Evidence: The isolated prior host fails. The actual business bundle on both Mac architectures read the proxy under a reverse-proxy subpath and downloaded a test-signed asset. [Implementation record](docs/en/project/desktop-implementation.md#automatic-update-proxy-verification)
- Seen 1× (2026-11-18). Status: fixed, release acceptance remains open.

### DESKTOP-006: Build Windows media controls against the official SDK

- Scope: Windows x64 SMTC. MinGW built other COFF objects while media controls were still uncompiled due to missing SDK headers.
- Rule: Compile with the official Win32 and C++/WinRT headers together. Qualify projected types and enable C++20.
- Evidence: Windows SDK 10.0.26100.4204 reported namespace ambiguity and experimental coroutine errors against the prior code. All 12 sources cross-compile and link with the Lynxtron import library and an mpv link fixture after the fix. [Implementation record](docs/en/project/desktop-implementation.md#windows-x64-native-cross-compilation-and-linking)
- Seen 1× (2026-11-18). Status: build fixed, Windows device testing remains open.

### DESKTOP-007: Avoid waiting for a Mac video buffer during draw

- Scope: The Mac video element in Lynxtron 0.0.31. The original double-buffer path sometimes stalled. Rosetta x64 still timed out with a borrowed single buffer.
- Rule: Try to submit an owned IOSurface through `PresentSurface`. Preserve redraw on a full buffer. Lynx retains accepted surfaces. Check pixel changes, engine position, dimensions and wait timeouts.
- Evidence: Both final runs sampled frame 560, paused, resumed and resized with zero buffer wait timeouts. [Implementation record](docs/en/project/desktop-implementation.md#mac-video-buffering-and-cef-window-tests)
- Seen 1× (2026-11-18). Status: probe reproduction fixed, full-client and endurance acceptance remain.

### DESKTOP-008 · Exercise the first plugin call and window teardown

- Covers Lynx child frames and CEF HTML plugins in Lynxtron 0.0.31.
- The first readiness push synchronously reentered the Lynx bridge. Mac thread samples showed the callback and teardown waiting for the same routing mutex. With the original CEF helper, the existing plugin SDK reported the bridge unavailable during page load.
- Deliver plugin frame events on the UI thread, release the routing mutex before sending, and discard queued events on teardown. Install the CEF bridge when the renderer creates the main document context. Verify with an installed plugin that writes, plays a song and reads back persisted data after a server restart. [Implementation record](docs/en/project/desktop-implementation.md#mac-plugin-writes-and-playback)
- Seen 1× (2026-11-18). The isolated Mac arm64 and Rosetta x64 scenarios passed. Windows runtime verification is open.

### DESKTOP-009 · Check the packaged version and architecture before replacement

- Covers desktop dev rolling releases and signed update assets.
- The old host, Go helper and publisher accepted a lower version published later. Signatures and digests can all pass because they authenticate the supplied manifest and file bytes.
- Check semantic version before applying same-version dev source and time rules. Match embedded version, channel, client and backend identities to the signed manifest before activating an update. On Windows check the new application after signed NSIS exits and before deciding whether to restart or restore the previous app. [Implementation record](docs/en/project/desktop-implementation.md#update-package-identity-and-upgrades-on-both-mac-architectures)
- Seen 1× (2026-11-18). The Mac packages and wrong-architecture comparisons passed. Windows execution remains open.

### DESKTOP-010 · Match the app and database during rollback

- Packages with the same version can carry different backends. The previous arm64 helper rolled back with a valid file digest and the wrong backup backend SHA.
- Match the backup version and backend SHA to the previous app, and validate all files before moving them. If the old app cannot be activated or only part of the database has been restored, attempt to undo completed moves. The [implementation record](docs/en/project/desktop-implementation.md#matching-database-rollback-and-partial-recovery-failure) covers an actual Mac schema migration, library reads after recovery and the digest of the retained failed database.
- Seen 1× (2026-11-18). Mac arm64, Rosetta x64 and fault injection passed. Windows installation and recovery await runtime testing.

### DESKTOP-011 · Inspect the resource directory the builder actually creates

- On Windows, Lynxtron builder 0.0.30 placed `extraResources` under the installation root. The old build produced `songloft/build-info.json`, while the host and updater read `resources/songloft/build-info.json`.
- Set an explicit Windows path from the install root. Verify the installed metadata, local tools and business bundle before upload. A scan fixture generated by the bundled tools must satisfy the backend's file-stability guard. [Implementation record](docs/en/project/desktop-implementation.md#verify-the-actual-install-assets-before-uploading)
- Seen 1× (2026-11-18). The rebuilt Windows layout and both Mac ZIP backend checks passed.

### DESKTOP-012 · Import and synchronize shared textures by handle type

- The Clay backend in Lynxtron 0.0.31 uses NT shared handles and keyed mutexes on Windows x64. The old import API returned `E_INVALIDARG` in a Windows 11 24H2 VM. Audio played but the video surface failed.
- Use `OpenSharedResource1` for NT handles and retain legacy import. Synchronize writes with Clay on key 0 and retry the draw when the reader owns the texture. Compare rendered frames, virtual audio output, and playback position after fullscreen changes. [Implementation record](docs/en/project/desktop-implementation.md#windows-shared-textures-and-packaged-playback-on-three-architectures)
- Seen 1× (2026-11-19). Windows 11 x64 VM passed. Physical GPUs remain open.

### DESKTOP-013 · Validate the platform values in release manifests

- The release signer derives the manifest from `win32-x64`, and the host uses Node's `win32`. The Go installer helper previously compared the manifest with Go's `windows`. The Windows 11 x64 VM rejected a correctly signed release-format manifest with `invalid update target`.
- Validate the release platform name in the helper while retaining OS and architecture checks. The Windows regression uses the published `win32` value directly and checks that `windows` is rejected. It failed against the old implementation. The fixed helper tests passed on Windows and on both Mac architectures. See `/tmp/songloft-windows-package.p7uZmv/vm/guest-serial-resumed.log` and `windows-update-lab/mac-helper-tests.log`.
- Seen 1× (2026-11-19).

### DESKTOP-014 · Run the Windows installer helper outside the application directory

- The Windows app started with its installation directory as the working directory. The restart-to-install action shut the app down. Although the helper executable was copied to application data, it inherited the installation directory as its working directory, and Windows refused to rename that directory.
- The helper changes to the update directory before reading the manifest and waiting for exit. In the same VM both helpers started from the application directory. The old one failed to rename it. The fixed one reached the signed installer fixture, which returned the expected error 17, and restored the original directory. See `/tmp/songloft-windows-package.p7uZmv/vm/guest-serial-resumed.log`.
- Seen 1× (2026-11-19).

### DESKTOP-015 · Confirm backend health before removing the previous package

- A real test-signed Windows upgrade relaunched the new app and the backend returned HTTP 200. The old confirmation used the ASAR-aware filesystem to clean the previous package. Windows returned `EBUSY` for `rmdir` on `resources/app.asar`, causing a recovery prompt. The raw filesystem can also find the archive busy until a process that opened it through the virtual filesystem exits.
- Record healthy startup before cleanup and use `original-fs` to remove the previous package. Temporary cleanup failures retain the confirmation so the matching version can retry. See the [implementation record](docs/en/project/desktop-implementation.md#windows-signed-update-manifest-verification) for the Windows Lynxtron comparison, host regression and database readback.
- Seen 1× (2026-11-19).

### DESKTOP-016 · Render the login form from the mode confirmed by the host

- The test-signed Windows 11 24H2 x64 client continued waiting for auto-login after cancelling the folder picker. Switching to remote displayed login before the host finished switching, leaving the local-mode action and masked embedded-backend credentials in the form.
- Cancelling the picker ends the transition. Login observes the mode confirmed by the host, and local auto-login keeps the generated credentials within the local session. The actual Windows UI passed cancellation, directory selection, switching both ways in Settings and restoring the remote credentials. See the [verification record](docs/en/project/desktop-implementation.md#switching-between-local-and-remote-modes-in-the-windows-client).
- Seen 1× (2026-11-19).

### DESKTOP-017 · Verify which native messages close the Windows window

- Windows window close in Lynxtron 0.0.31 bypasses the cancellable close event. Clicking the title bar’s close button on the installed test-signed client removed both its tray icon and process.
- When a tray is available, intercept Win32 close messages and hide the existing window through its visibility API. Explicit quit removes the handler and allows the app and embedded backend to finish cleanup. The Windows comparison confirmed continuous audio output while hidden, restoring the same window from the tray and no processes remaining after quit. See the [verification record](docs/en/project/desktop-implementation.md#keeping-playback-active-when-closing-the-windows-window).
- Seen 1× (2026-11-19).

### DESKTOP-018 · Show the installed desktop package identity in About

- The 2.13.15 test-signed NSIS installed successfully, while About showed `dev` and `unknown` from the shared bundle. Its compile-time metadata could differ from the version selected when packaging the host.
- The desktop host supplies the package version, client SHA and build time used by the updater to the root page. Updating the ASAR and business bundle made Windows About show the actual 2.13.15 version and SHA. See the [verification record](docs/en/project/desktop-implementation.md#complete-test-signed-windows-installer-21315).
- Seen 1× (2026-11-19).

### DESKTOP-019 · Exercise CEF startup in the installed Windows app

- A Windows 11 24H2 VM had only Microsoft Basic Display Adapter. The 2.13.17 development install exited after repeated `0xc0000005` failures in CEF GPU subprocesses. Launching the same installation with the OS command-line switch `--disable-gpu` opened sign-in.
- If DXGI finds no usable hardware adapter, the host relaunches once in software mode before initializing CEF and acquiring the single-instance lock. Install the complete 2.13.18 NSIS, verify the actual process arguments from a normal launch, and check that a repeat launch keeps the original window. Exercise plugin rendering, backend writes and playback with the installed CEF. [Verification record](docs/en/project/desktop-implementation.md#complete-21318-development-packages)
- On the same date, a physical Iris Plus 655 rendered libmpv video. Opening an HTML plugin caused repeated CEF GPU process failures that terminated the host. Windows now starts CEF rendering in software. The same physical device passed normal startup, plugin persistence and video fullscreen. Its custom dev directory received a separate CEF profile. [Physical device record](docs/en/project/desktop-implementation.md#physical-windows-cef-process-crash-and-fix)
- Seen 1× (2026-11-19).

### DESKTOP-020 · Isolate system credentials for custom development data roots

- On the 2.13.19 Mac development build, `SONGLOFT_DESKTOP_DATA_ROOT` separated the settings and library but directories still shared a Keychain service. Console preflight found credentials in the default development service. Restoring the old lookup in isolation caused the regression to read the default directory's fixture password from the test directory.
- Include a digest of the custom development data path in the Keychain service name. Restarting with the same directory continues using that service. The regression covers the default and two custom directories, and 27 host checks passed. See the [desktop build guide](desktop/README.en.md).
- Seen 1× (2026-11-19).

### DESKTOP-021 · Verify MV from the actual library

- The packaged Windows 2.13.19 host drew video in its probe, but Watch MV played only the soundtrack. None of 306 screen samples from the library action contained video. Desktop entry points need the shared video route. Opening and sizing the picture must wait for `sourceReady` from the current `sourceId`.
- Scan a video with the packaged backend and open it from the ordinary menu. All 16 color and audio cues matched during the fullscreen round trip. Regressions cover source replacement, early dismissal and preparation failure. [Verification record](docs/en/project/desktop-implementation.md#windows-21319-library-mv-and-fullscreen)
- Seen 1× (2026-11-19).

### DESKTOP-022 · Pass the Mac development data root explicitly on update relaunch

- On macOS 26.6.2, Launch Services corrupted the non-ASCII portion of the data root inherited through plain `open -a`. The relaunched application could read a different preference directory and Keychain service after installation or recovery.
- The host passes the absolute directory from the current session to the helper. For dev packages, the helper forwards that variable through `open --env`. Signed installation and recovery fixtures both relaunched into the same directory containing Chinese characters, spaces and an equals sign. Failed files remained available. [Implementation record](docs/en/project/desktop-implementation.md)
- Seen 1× (2026-11-19).

### DESKTOP-023 · Record TLS connections and media requests by mode

- The self-signed media fixture received a TLS alert from macOS. Windows 2.13.19 recorded only the strict-mode TCP connection. The player reported an error and sent no media GET. The original verifier still failed because it required the Mac alert.
- Mark the TLS mode from the client and record connections and media requests separately. Assert rejection and the absence of a media GET in strict mode. Then assert 206 and decoding for the same URL after enabling the fixture setting. All nine Windows media cases passed. [Verification record](docs/en/project/desktop-implementation.md)
- Seen 1× (2026-11-19).

### DESKTOP-024 · Verify relaunch after restoring an app on installation failure

- Windows 2.13.21 downloaded an NSIS whose embedded version did not match a valid signed manifest. The helper restored the previous application directory and library, but the old process had exited and the failure log had no UI entry point.
- Before the new app launches, verify the original install path, previous identity and signature, then relaunch it. The main process reads the failure marker and offers the installer log. The real Settings comparison checked the new PID, four songs and log reveal, and signed fixtures on both Mac architectures verified relaunch. [Record](docs/en/project/desktop-implementation.md#relaunching-the-restored-app-after-installation-fails)
- Seen 1× (2026-11-19).

### DESKTOP-025 · Check the read-only attribute on Windows test media copies

- PowerShell `Copy-Item` retained the read-only attribute when restoring genuine signed package metadata from a CD. The test script could not set its loopback update URL.
- Clear the attribute on the isolated copies, verify the restored bytes, then set the test URL. The original package retained its signature and the Settings upgrade from 2.13.21 to 2.13.22 passed. See [Windows 2.13.22](docs/en/project/desktop-implementation.md#windows-21322-settings-upgrade-and-locked-playback).
- Seen 1× (2026-11-19).

### DESKTOP-026 · Require local backend readiness before showing the home page

- When the music directory of an authenticated Windows 2.13.22 profile became unavailable, a saved token opened an unusable home page after the launch error was dismissed.
- Let local session startup resolve authentication even on failure. Sign-in offers retry and folder selection. A replacement folder is saved after the backend starts. Moving the directory out and back on the test VM retained four tracks and the administrator credential. Retry restored sign-in and audio output. [Record](docs/en/project/desktop-implementation.md#keeping-the-local-session-when-its-music-folder-is-unavailable)
- Seen 1× (2026-11-19).

### DESKTOP-027 · Recreate the macOS CEF framework links during staging

- A frozen offline install on macOS arm64 materialized the CEF framework links as files and directories. Packaging copied those aliases, and `codesign` rejected the ambiguous framework structure.
- Stage the framework only from `Versions/A` and recreate its standard relative links. The host test covers a flattened installation tree. Full macOS packages undergo strict signature verification. [Record](docs/en/project/desktop-implementation.md#21323-complete-development-packages)
- Seen 1× (2026-11-19).

### DESKTOP-028 · Compare source digests before staging desktop installers

- The release-tool fixture changed one architecture's `clientSourceSha256` while retaining the same client SHA, version, backend, and update key. The previous script staged the mixed packages and signed their manifests.
- Pin checkout line-ending behavior in the release workflow. Read all three architectures' metadata and compare their source digests and shared build identity before creating output. The regression rejects differing source digests with the same commit and checks that no output directory was created. [Record](docs/en/project/desktop-implementation.md#desktop-release-preflight)
- Seen 1× (2026-11-19).

### DESKTOP-029 · Recheck downloaded installers before stopping playback

- The installer can change on disk after download verification. When the regression overwrote it with damaged bytes of the same length, the old host stopped its session before the helper discovered the failure.
- Recompute the digest on Install and offer another download when verification fails. The helper rechecks the package after the old process exits. On failure after handoff, relaunch the old app only after verifying its identity and signature. Windows and both Mac architectures verified rejection of a damaged package and the previous app's relaunch. [Record](docs/en/project/desktop-implementation.md#verifying-update-packages-before-and-after-handoff)
- Seen 1× (2026-11-19).

### DESKTOP-030 · Use confirmed startup to reclaim updater downloads

- The regression found a full installer left on disk after startup confirmation. Earlier removal would deprive the recovery helper of the pending update's asset.
- Persist confirmation before deleting the recorded digest file and old app. A real Windows file lock produced `EBUSY` without undoing confirmation. A later check reclaimed the download after the lock was released. Database backups and failure records are retained. [Record](docs/en/project/desktop-implementation.md#reclaiming-installer-downloads-after-startup-confirmation)
- Seen 1× (2026-11-19).

### LIST-005 · Tie title marquees to row visibility

- ReactLynx runs component effects for offscreen list items. Offscreen titles also requested measurements, and replacing the original animation with a zero-duration animation let the original keep writing styles.
- Two touch gestures reached 482px in both versions of the 40-long-title Docker Chrome fixture. In the sample after scrolling, the number of titles writing transforms fell from 40 to 10. Measure and start on `uiappear`, then stop the original animation handle on `uidisappear`. The regression also covers re-entry and the title-scrolling preference.
- Seen 1× (2026-11-18). Comparison uses `baef0f9` and this Lynx worktree. Evidence is in `/tmp/songloft-lynx-scroll-tabs.j14OKU/`.

### DESKTOP-031 · Retain unchanged libmpv video properties during source replacement

- Scope covers desktop source replacement and video-track detection. On 2.13.24 arm64, replacing MP4 with an MKV of the same dimensions advanced to 2,267 ms while the host reported 0×0.
- Keep the latest dimensions and duration observations. Clear each property when mpv reports it unavailable and publish it once the current source is ready. The original implementation failed the regression. With the fix, separately signed fixtures on native arm64 and Rosetta x64 played four containers in sequence. [Record](docs/en/project/desktop-implementation.md#preserve-video-dimensions-when-replacing-a-source-on-macos)
- Seen 1× (2026-11-19). Status: lesson.

### NAV-002 · Save plugin SVG icons in the cold-start snapshot

- Scope is plugin tabs in Lynx main navigation. Baseline `debad6e` restored the tab layout and icon filename and showed a settings gear while the SVG loaded.
- Save loaded SVGs by server and account. Restore markup for the matching filename before publishing the layout. Reserve the icon slot while loading from an older snapshot or requesting a new icon. Keep usable cached artwork when revalidation fails.
- Seen 1× (2026-11-19). The cold-start component regression saw a gear in the baseline's first frame. [Docker Chrome comparison and evidence](docs/project/progress.md#nav-tab-icons).

### NAV-001 · Start with the last confirmed tab layout

- The capsule uses the local snapshot for the current server and account on its first frame. Revalidate both the tab configuration and enabled plugins in the background, then save the confirmed layout. Mobile Bundle reuses the snapshot for the same local library across listener port changes.
- With both endpoints delayed in Docker Chrome, the baseline drew built-in tabs first and inserted the plugin later. The fixed version showed the saved plugin on the first frame, kept the layout on an identical response or a 503, and updated it once when the layout changed. The regression also covers mobile Bundle port changes and account isolation.
- Seen 1× (2026-11-18). Comparison uses `baef0f9` and this Lynx worktree. Evidence is in `/tmp/songloft-lynx-scroll-tabs.j14OKU/`.

### PLUGIN-006 · Check built-ins on the actual Android host JS runtime

- Scope is the Lynx Android host's plugin EQ bridge, songloft-org/songloft-player-lynx#15.
- On an API 34 emulator the WebView started host playback and detected the system EQ. The first preset application then failed in the host with `Object.hasOwn is not a function`, despite the Node/Vitest bridge tests passing.
- Validate the profile's own keys with `Object.keys` and exercise the real dispatcher in a regression with `Object.hasOwn` removed. Verify the plugin WebView transport and the separate Lynx host JS runtime.
- Seen 1× (2026-11-19).

### DESKTOP-032 · Allow for first-load latency when checking packaged tools

- Lynx desktop Bundle resources used client `6929fc8` and backend `35b1e33`. On native arm64 macOS 26.6.2, the first `ffmpeg -version` exceeded 30 seconds. Sampling during a repeat showed dyld loading signed libraries. An earlier Rosetta run took 61 seconds on its first launch.
- Give each packaged tool invocation a bounded 120 seconds and still verify tool versions, scanning, Range, and restart persistence. Newly built native arm64 resources and the verified Rosetta x64 ZIP passed. The x64 `ffmpeg -version` took 29.322 seconds. [Desktop implementation record](docs/en/project/desktop-implementation.md).
- Seen 1× (2026-11-19).

### DESKTOP-033 · Follow the replacement process when checking Windows startup

- The actual 2.13.25 NSIS ran in a clean Windows 10 22H2 x64 VM. The virtual GPU triggered the automatic `--disable-gpu` relaunch. The initial PID exited as expected and the timer reported a false failure. The replacement host opened the stock login screen.
- Measure from launch and wait for a visible window from the same verified executable path. Follow that process for sampling. Use the overall startup timeout and the replacement's actual window to decide whether startup succeeded. [Desktop implementation record](docs/en/project/desktop-implementation.md).
- Seen 1× (2026-11-19).
