# Lynx Client Development Lessons

## Scope and Sources

Record dual-thread behavior, shared JS, and four platform hosts in songloft-org/songloft-player-lynx. See the [local AI workflow](docs/en/guides/ai-development.md) and parent host constraints. Existing AGENTS/business references remain authoritative; link evidence rather than duplicating incident histories.

## Recording and Promotion

Include rule, scope, full owner/repo#number, failure/fix commit SHAs, actual validation, and Done right examples (pending if unavailable). Seen counts independent events on distinct dates, not repeated reviews. Three dates make promotion candidates; mark the authoritative destination. Existing hard rules/serious failures apply immediately. Synchronize the [Chinese version](LESSONS.md), never invent counts/resolution/device acceptance, and redact sensitive information.

## Entries

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
- Seen 1× (2026-10-27). Status: lesson; the reporter's Chromium 150 and real library still need verification.

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
- Rule: The store's 0–100 volume is an app-level setting. Persist it to the `player_volume` pref (shared with preference sync), and run `restoreVolume` before restoring playback so auto-resume does not start at the host default. Android volume belongs to the system media stream and must not overwrite the saved value. iOS records the app-level multiplier and re-applies it whenever a player is created; it must not read or observe `AVAudioSession.outputVolume` (that is system volume, unrelated to the app slider, and made the slider jump back). Host `volumeChanged` must not overwrite the local preference before restore completes.
- Evidence: The old iOS implementation read system volume and lost the multiplier when replacing the player; Web `getVolume` was a no-op. The new `volume-persistence` regressions cover debounced writes, startup restore and event gating. Headless Chrome measured the wide mini-player panel dragged 50% → 30% and still at 30% after a full reload.
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
