# Permanent access tokens (songloft-org/songloft#546)

Settings → Permanent access tokens supports the desktop detail pane and mobile `/settings/personal-tokens` route. Create a named device credential, copy the token or full Authorization header once, and retry copying or select manually on failure. The paginated list displays timestamps and revocation status; revocation requires confirmation.

The authenticated `PersonalTokenApi` calls `/api/v1/auth/personal-tokens`. Requests/auth retries are bound to the server/account session that opened the page, and obsolete responses cannot enter a new session. TanStack Query caches management metadata only; complete credentials never enter Query/Mutation caches or storage. Existing Input, ConfirmDialog, back-navigation and acknowledged clipboard facade are reused without native-module changes.

2026-10-28, Linux x86_64 / Node 22.17.1 / pnpm 11.15.1, baseline `1d9317a87ef2967b6acfd90ba6ac8b731fbe5c48` plus the uncommitted worktree: types, dual bundles, embedded Web build and all 430 related tests pass. The first run exposed two stale Markdown fixtures. Both tests now read independent bilingual table samples while preserving their existing assertions. The final full suite passes all 3724 tests across 352 files; all 89 release-tool checks also pass.

Docker Chrome exercises actual creation, both clipboard formats, clearing the credential after closing, real cover download with the token (200 / 248 bytes), confirmed revocation and subsequent 401. Evidence: `/tmp/songloft-546-lynx-ui-result.json` and matching PNG; source fingerprints/log index: `/tmp/songloft-546-verification.json`.

Not run: Android/iOS/HarmonyOS host builds/devices and the reporter's NAS/HA/ESPHome/speakers. Commit, push, parent gitlink synchronization and a reply to #546 are authorized for this batch. Formal release and Issue closure are outside authorization; GitHub records govern actual delivery.

Actual Chrome flow passes at both 1280×900 (detail pane) and 390×844 (narrow route). Narrow evidence: `/tmp/songloft-546-lynx-mobile-ui-result.json` and matching PNG. This does not establish mobile-device acceptance.
