# MIoT re-entry and cover flicker (2026-11-17)

## Confirmed mechanisms

Client baseline: `b952231c253aad1938d3020ee74157b100a11291`; plugin baseline: `6fba93e6f3bdb4e73c00a9a58da67475cd0519d1`. This is an uncommitted worktree preserving existing desktop and parent-repository changes. Source hashes and check results are in `/tmp/songloft-miot-reentry/verification.json`.

The home grid opens `/plugin/miot` without `tab=true`, while the original `RetainedPluginTabs` only retained native frames entered through navigation tabs. Returning home unmounted the page and child engine; reopening necessarily recreated them. All native Lynx plugin entries now belong to the stable Shell. Routed pages supply the pushed entry's topbar; the retained area participates in flex layout below it without covering the toolbar or duplicating the Shell's top safe area. Home and tab entries share one frame, update embed for their presentation, and preserve the last presentation while hidden. Disabling, package version/update identity, server changes and Shell teardown retain their existing disposal behavior.

The user's report of cover flicker even in tabs exposed a separate plugin defect: `Cover` incremented nonce, cleared source, replaced the image key and added `_r` to local URLs on every resumed event. This forced every cover to reload even when the plugin instance survived. Recovery now targets failed/timed-out covers, leaving successful, queued and loading images intact. Two automatic retries, later foreground recovery and opaque data/signed URLs remain supported. Plugin evidence is also recorded in its `docs/en/lynx-migration.md`.

Repeated child-engine creation and forced image loading add unnecessary work, but this batch has no HarmonyOS crash stack, device-memory measurements or device reproduction. **Neither OOM nor an SDK disposal race is established, and the crash is not declared fixed.** Client/OS versions and crash logs are needed. The earlier blank-page defect and required native-shell upgrade are documented separately in [Harmony plugin frame](harmony-plugin-frame.md). This batch changes no ArkTS/Kotlin/Swift.

## Verification and limits

The user subsequently authorized commit, push and parent gitlink synchronization. This batch's candidate is exported and validated separately, excluding existing desktop and other concurrent changes. Commit identity, validation and same-SHA CI results are recorded in `/tmp/songloft-miot-delivery/delivery.json`. Earlier worktree results retain the initial investigation record; device/crash boundaries remain open.

Environment: Linux x86_64, Node 22.17.1, Docker Chromium 121.0.6167.85. Harmony SDK 4.0.1 source was inspected for lifecycle wiring only. Logs: `/tmp/songloft-miot-reentry/`. The complete worktree includes existing desktop changes and is not an isolated clean release candidate.

- New home-entry regressions fail against the old implementation because the retained frame is missing. The fix preserves the same node/search across 20 home round-trips with one mount and no disposal. Home/tab transitions share one frame; pushed topbar/external links and chromeless tab presentation are checked separately.
- New cover checks fail with isolated old `Cover` source. The fix covers healthy images, loading/queued work, timeouts, rejected/unavailable resource URLs and failure recovery.
- Frontend types, shared Lynx/Web builds, full client tests, plugin types/1499 backend tests, 124 frontend tests, dual bundles/QuickJS packaging and package validation are recorded in the evidence directory.
- Final client types and dual builds pass, as do all 112 related checks. The full client run has 368 files/3858 tests: 3857 pass and one fails because the existing desktop `src/desktop/UpdateSection.tsx` references missing `clientUpdate.download`. That independent desktop work is preserved; the full run is not reported passing. An initial new test returned boolean from act, failing types/build; changing the callback to void makes both reruns pass. The first isolated old-client check failed to resolve dependencies and ran no tests; after fixing temporary dependency resolution, two checks fail as expected on missing retained nodes.
- A fresh SQLite instance on port 30618 receives the built plugin. Docker browser checks at widths 390/1100 exercise actual Lynx rendering. Ten pause/resume cycles preserve the first three healthy image nodes with no removals/source mutations or new local cover requests; a 404 cover still recovers. Data/signed sources, empty placeholders and list/mini/full-player geometry remain covered. Device/image HTTP responses are fixtures, with no real speaker connection.

Not run: HarmonyOS device/emulator repeated entry, cover rendering and process-crash acceptance; `hdc list targets` is empty. Native HAP/APK/Apple compilation and device checks were not run because native host source is unchanged. Browser/component tests do not substitute for HarmonyOS acceptance. No commit, push, parent gitlink update, release or Issue write.

[中文](../../project/miot-reentry.md)
