# #572: Play next from playlists and favorites

Related: [songloft-org/songloft#572](https://github.com/songloft-org/songloft/issues/572). The user requested Lynx parity with the Flutter fix. Lynx already provides Play next through `PlaylistDetailSongRow` → `SongListRow` → root `SongRowOverlays`. Ordinary playlists and built-in favorites, narrow and wide layouts, all call the existing `playSongNext`; no duplicate production entry is needed.

Four new regressions exercise the actual row's more action, real overlay state, menu construction and command dispatch. They assert that only the selected song is scheduled, the menu closes, and immediate playback/playlist removal are not triggered. Existing queue rules remain in place. Tests invoke `catchtap` explicitly and rerender the overlay manually, matching the current ReactLynx test renderer's constraints.

Tested object: 2026-11-17, baseline `6df678d10c078dcbe495ac47720ce86eab38825a` plus this test and the existing desktop candidate worktree. Final file/diff hashes: `/tmp/songloft-572/verification.json`. This task does not edit or commit concurrent desktop-host, audio-facade or build-configuration changes.

Results (Linux amd64, Node/pnpm, Docker Chrome, real temporary Go backend and four generated silent WAV tracks):

- `pnpm exec tsc -b` and `git diff --check` passed.
- Final `pnpm test`: 367 files / 3843 passed. New entry and existing queue-navigation focused checks: 37 passed.
- A temporary Vitest transform loads an isolated copy of `SongRowOverlays.tsx` without the `playNext` dispatch. All four regressions fail because the scheduling command is never called. The actual worktree is not reverted or damaged.
- `pnpm run build` produced both Lynx and Web bundles; `pnpm run build:web-embedded` passed. Existing unsupported `touch-action` warnings remain.
- Actual Chinese browser interactions, unpaused and advancing audio, queue order and source context: `/tmp/songloft-572/lynx-{full,mobile}.json`; corresponding `playlistScreenshot.png` / `favoriteScreenshot.png` files show the menus. Songs are scheduled from another playlist and favorites while the persisted queue retains its original playlist context.

Not run: Android/iOS/HarmonyOS host compilation, physical devices and native audio acceptance. This batch changes neither native hosts nor production TS. Render/Web checks do not replace native-device acceptance. The user authorized commits, pushes, parent gitlink updates and a reply to #572; no stable version is created. Final commits and same-SHA CI status: `/tmp/songloft-572/delivery.json`.
