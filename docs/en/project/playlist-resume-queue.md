# Large-playlist resume queues (2026-11-14)

Baselines: parent bb8cc5c, Flutter 4708c64, Lynx c10e790, plus this working tree. Implementation, commits and pushes follow the ongoing playlist-resume authorization; no stable release tag is created.

## Cause and fix

Previously playback started with a temporary single-track queue. All pages were fetched serially and the queue was replaced only at the end. A 1000-track playlist exposed the delay; the same-song shortcut also retained restored incomplete queues. Two new regressions failed against the old implementation: /tmp/songloft-resume-1000-before.log.

Both clients now load up to 100 neighbouring tracks first and publish every batch, with at most 100 tracks per request. The loaded interval stays contiguous: extend forward, then prepend earlier tracks. Index mapping preserves audio identity, time and mode navigation. A loaded next episode can play before prefix loading completes. Requests retry up to three times; failures retain successful batches and suggest Continue. Audio reuse checks the complete ordered IDs and repairs incomplete queues without reload/seek.

## Validation

- Lynx: tsc -b, both builds and embedded Web packaging passed. After building, pnpm test passed all 3802 tests in 360 files. Cases include a delayed second page, intermediate publication, incomplete same-song resume without reload/seek, and automatic advance while the prefix still loads.
- Flutter: analyze clean, all 298 player tests passed, embedded Web build passed. The pure Dart loader covers 1000-track contiguous windows, retained batches on failure and stale-response cancellation.
- Docker Chrome: isolated database and 1000 generated WAVs; later page requests delayed by one second. Both clients initially showed 100 queued tracks, advanced actual audio to episode 129 before completion, and finally showed 1000 tracks, with no pageerror.
- Logs: /tmp/songloft-resume-1000-{all,types-verified,build-verified,flutter-all,flutter-analyze-after,flutter-build}.log. Browser results: /tmp/songloft-resume-1000/browser-result.json and flutter-result.json; screenshots: *-first-window.png and *-full.png in that directory.
- Final source/commit identities are recorded under /tmp/songloft-resume-1000/. Native devices, background and casting: Not run. The preceding Flutter Android CI for 4708c64 failed its release JNI check; this batch does not change Android/ProGuard and Web success does not imply APK acceptance.

No backend API or schema changes. The parent docs/playlist-resume.md remains the behavior reference.
