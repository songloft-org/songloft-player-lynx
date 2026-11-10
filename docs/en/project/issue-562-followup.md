# #562 shared tags, artwork and layout follow-up

2026-11-11; baseline `2a18bb57819886a2c9b2c0476bdf51a127f09ae1`, uncommitted. Playlists reuse shared tag definitions through labels, expose the existing tag editor and separate playlist/song browsing. Home/grid/list/detail show source labels and scrolling titles. Phone covers are 96px with larger counts and tighter row spacing.

Types, 3,781 tests and Lynx/Web artifacts pass. The ReactLynx scanner reports zero issues; flex/text CSS uses existing backend-compatible features without media queries. Chrome against real temporary SQLite/HTTP: at 320/390px title widths are 142/212px with 44px actions; covers are 96px and counts 15px. Wide covers remain 160px. Opened tag management and confirmed the saved empty binding through GET. No page errors.

Evidence: `/tmp/songloft-562-implementation/`; central record in parent `docs/en/issue-562-verification.md`. Native Android/iOS/HarmonyOS and reporter hardware: Not run. No commit, push, gitlink update, release or Issue write.

Same-day review invalidates playlist caches when a shared tag is deleted, preventing stale references from displaying a wrong source after ID reuse. A real QueryClient regression retains the old reference before the fix and passes afterward. All 36 affected library/playlist test files, 380 tests and type checking pass. The parent record tracks subsequent builds and revised fingerprints.

The same review refreshes visible-playlist tag counts after individual/batch deletion and hiding/restoring playlists. QueryClient regressions return old counts before the fix and pass afterward for all four operations.

The final review object passes all 357 files and 3,786 tests, type checking and Lynx/Web builds. Earlier browser evidence identifies the pre-review snapshot; final code fingerprints are recorded in the parent verification notes.
