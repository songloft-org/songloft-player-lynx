# songloft-org/songloft#549: Library select-all and batch deletion

The [Issue](https://github.com/songloft-org/songloft/issues/549) screenshot shows the Lynx library and requests select-all and delete actions. There are no comments or linked fixes. On 2026-11-01, remote main and the local client both resolve to `ea55033d73456d9268d8e31069ced1e144511dce`; parent baseline: `2ef6118cf3436792b7d5c4d231ed5770f07c2978`. [中文](../../project/issue-549.md).

## Behavior

- All/local/remote/radio views show the selection toolbar immediately, including with zero selected songs. Select-all requests `/songs/ids` with the current source, search, sort and hidden-song settings, including unloaded pages; pressing again deselects all.
- Filter changes, new search input, leaving selection and unmounting invalidate late responses. Failures retain the selection and show an error. An earlier deletion completion cannot close a newer selection state.
- Deletion reuses the root confirmation dialog and displays the selected count. Files are preserved by default; deleting local files requires explicit opt-in. Cancel/failure retains selection; success exits selection and refreshes library, facet, statistics and playlist caches.
- Add-to-playlist and supported device-cache actions remain available. Caching a select-all result resolves offscreen metadata, submits only the frozen selected IDs, and retains session validation and the 10,000-song limit. Loaded pages do not define the batch-operation boundary.
- The toolbar wraps and reserves navigation space. Flutter already provides these actions; this batch changes neither Flutter nor backend APIs/native hosts.

## Validation

Environment: Linux x86_64, Node 22.17.1, pnpm 11.15.1, Go 1.26.0; Docker Chromium 121 and Linux WebKit 18.4. Object: the client baseline above plus the uncommitted worktree; the parent gitlink remains unchanged. Final source/worktree identities and artifact hashes: `/tmp/songloft-549-ui/verification.json` and `worktrees.json`.

- The first three new select-all regressions fail against the old implementation because the action is absent; the original 15 tests pass: `/tmp/songloft-549-before.log`. Coverage includes zero selection, complete IDs, late responses, failure, filter scope, confirmation/selection lifecycle, offscreen caching and overlay exclusivity.
- Full-suite snapshot, `pnpm test --maxWorkers=2`: 354 files / 3754 tests pass in `/tmp/songloft-549-tests.log`. Later changes isolate old completion callbacks, adjust the batch confirmation label and add two tests. The final five affected files / 72 tests pass in `/tmp/songloft-549-final-focused.log`; the earlier snapshot is not presented as a full rerun of the final source.
- Final `pnpm exec tsc -b`, `pnpm run build` (Lynx/Web outputs), `pnpm run build:web`, `pnpm run test:release` (89 tests) and diff checks pass. Logs: `/tmp/songloft-549-{types-final,build-final,web-final,release-tests}.log`. Existing `touch-action` encoding warnings remain.
- A real temporary Go backend, separate SQLite database and 48-song test library contain 45 remote songs, two synthetic local MP3 files and one radio. The music directory is `/home/hanxi/work/songloft-review/issue-549/music`, outside `/tmp`. No user data is touched.
- Chromium at 390×844, English: select-all selects 45 songs with only 40 loaded; cancel retains 45. A deliberately injected HTTP 500 is visible and retains selection; retry deletes exactly these 45 songs. The Chinese local flow sends `delete_files=false/true`: the former removes the record and preserves `keep.mp3`; the latter removes `delete.mp3`. Only the untouched radio remains in the database. Evidence: `browser-final-result.json`, `local-result.json`, `backend.log` and matching PNGs in the temporary directory above.
- WebKit, Chinese: selects two, deselects to zero, and retains two after cancelling deletion. All action buttons remain within the viewport above bottom navigation at 390×844, 320×568 and 390×420. No page errors. Evidence: `webkit-result.json`, `webkit-confirm.png`.
- Earlier driver/environment failures are retained: login controls and memory-router preconditions, clicking a zero-size raw-text node, and reading state before a Worker update. Temporary account/session setup, actual navigation and clickable containers resolve these attempts. WebKit initially lacked EGL vendor/driver paths; explicit temporary dependencies and system DRI allow validation. Failed logs remain in the same directory and are not counted as product passes.

Not run: the reporter's iPhone Safari, Android/iOS/HarmonyOS host builds/devices, native cache downloads, full backend tests and remote CI. Browser/shared JS validation does not replace devices. Backend source is unchanged; the real HTTP chain was built and exercised. No commit, push, release, Issue comment or closure; the submodule remains dirty and the parent pointer is not fabricated.

Suggested commit: `feat(library): 补齐曲库全选与批量删除 (songloft-org/songloft#549)`.

The above is the local validation snapshot. The user subsequently explicitly authorized this batch's commit, push and Issue reply, including committing the child repository before synchronizing the parent gitlink. Formal releases and Issue closure are outside that authorization. Actual commits, CI for the same SHAs and the comment link are recorded in `/tmp/songloft-549-ui/delivery.json`; GitHub records govern delivery.
