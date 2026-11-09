# Mobile song-row layout (songloft-org/songloft#562)

2026-11-09. The report describes a Honor 30 Pro running HarmonyOS 4 and a Bundle dev build. The screenshot's horizontal more button and separate removal button match the Lynx row. The installed version was not obtained and that device was not tested.

## Changes

- Narrow rows put duration on the artist/album line. Long subtitles truncate while duration remains visible; missing artist/album leaves duration alone.
- Favorite and more sit adjacent at the right, retaining 44×44px targets. Outer and cover-to-title gaps shrink; the original number-column width and initial hints remain.
- Ordinary mobile playlists move `×` into the root song menu, reusing existing confirmation and membership APIs. Removing membership and deleting a library song remain separate actions. Desktop shortcuts, built-in protection, selection and manual ordering retain existing behavior.
- `ScrollingText` owns clipping/static ellipsis; its outer box gets shrinkable width and the MV badge does not shrink. Preferences and animation code are unchanged. The baseline already scrolls in Chrome, so this does not establish a fix for the reporter's device-specific no-scroll symptom.

## Verification

- Object: `songloft-org/songloft-player-lynx` baseline `5e6fe23055eb6512fe185e2fcb9b3acaf9e73497` plus this uncommitted tree. Parent `7089a9b032591dd305b26e1d22636bc9f6562f8b`, Flutter source and parent gitlink are unchanged. Final file hashes, diff, tool versions and results: `/tmp/songloft-562/verification.json`.
- Environment: Linux amd64, Node 22.17.1, pnpm 11.15.1, TypeScript 6.0.3, Docker Headless Chrome. Actual Web output runs against an isolated HTTP fixture with synthetic songs, favorites and members. This is not real-backend, private-library or HarmonyOS-device acceptance.
- Negative check: three new tests fail on isolated old source: narrow duration placement, contextual callback and menu item. Log: `/tmp/songloft-562/before-tests.log`. Initially Vite disallowed dependencies outside the copy and ran no tests; allowing those paths in the copy produced effective failures without replacing the working tree.
- `pnpm exec tsc -b`, dual Lynx/Web output and embedded Web build pass. Native encoding retains two existing `touch-action` warnings. After the final CSS spacing adjustment, 84 focused checks and all 355 files / 3,779 tests pass. Logs: `final-focused.log`, `full-tests-final.log` and `verification.json`. Focused coverage includes dispatch, playlist confirmation, desktop shortcuts, built-in protection and scrolling preferences.
- Actual Chrome covers 390px playlist/library, 320px dark with 1.3× text, 1440px desktop, scrolling disabled and system reduce-motion. At 390px, playlist title width increases from about 104px to 194px; library width goes from about 188px to 226px. Long titles actually move between samples, while disabled/reduced-motion titles remain static with ellipsis. Results/screenshots: `/tmp/songloft-562/*-browser.json`, `*.png`.
- Clicking favorite adds the target to fixture favorites. More → remove → cancel sends no DELETE. Confirming a second attempt sends only `DELETE /api/v1/playlists/9/songs/11`; fixture membership and the page drop that member while the library retains the song. Request evidence: `interactions.audit` in `mobile-zh-browser.json`.

## Delivery boundaries

Not run: the actual Honor/HarmonyOS device; native Android/iOS/HarmonyOS builds/devices; WebKit; real backend and audio playback. Only shared UI, menu wiring and docs changed; host contracts, native code and backend are unchanged. No remote CI triggered.

No commit, push, formal release, parent gitlink update or Issue write had occurred when the local verification above finished. The user subsequently authorized this batch's commit, push, parent gitlink update and Issue reply. GitHub delivery records govern actual commits, same-SHA CI and the comment; this excludes formal release and Issue closure.
