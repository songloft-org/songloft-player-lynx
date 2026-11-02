# Built-in favorites ordering (songloft-org/songloft#550)

2026-11-02; baseline `a90cded03be18426de61c6df436d08a29e7a3077` plus uncommitted changes. Linux amd64 / Node 22.17.1 / pnpm 11.15.1 / Docker Chrome 121. Backend baseline `71635ae30ec76a6a0a8bf4efa94304fe2276a057` plus the uncommitted server fix.

The backend incorrectly applied built-in identity protection to member ordering; the fix permits reorder / move / sort. Lynx also enables the manual sorting entry for Favorites and Radio favorites while retaining edit, visibility and deletion guards. Entering manual mode saves custom ascending view order so position changes are visible rather than masked by name or other view sorting.

The original `onSortEnd` chose the first displaced row. For `[1,2,3] → [2,3,1]`, it moved song 2 to the front and produced `[2,1,3]`. Identify the single dragged song by its largest displacement instead; intervening rows move only one place. The two single-song moves for an adjacent swap are equivalent.

## Verification

- New built-in normal/radio menu regressions failed twice against the old entry guard. The downward multi-row drag test failed with the old callback, and the non-custom-view entry test failed with the old implementation. Logs: `/tmp/songloft-550-lynx-{before,move-before,view-before}.log`.
- Final `pnpm run build` produced Lynx and Web outputs. `pnpm run build:web-embedded`, `pnpm exec tsc -b` and `pnpm test` passed (354 files, 3761 tests). Logs: `/tmp/songloft-550-lynx-{build,web,types,tests}-final.log`.
- In a real 1200×900 browser, open each built-in playlist, enter manual sorting through the menu and drag the first song across three rows to the end. Real `/songs/move` requests, backend position order and the page agree; the reopened UI after reload preserves the order. No page errors. Authentication uses a real isolated test-account API login with an IndexedDB session fixture; sorting uses real mouse input.
- The actual embedded artifact is in the parent repository's `clients/player-build/web-embedded`; stale `web/dist` must not substitute for the final build. Evidence: `/tmp/songloft-550-ui/lynx.js`, `lynx-final.json`, `lynx-*.png`; source fingerprints: `/tmp/songloft-550-verification.json`.

Not run: Android/iOS/HarmonyOS devices, native host compilation, Safari/Firefox and remote CI. No native code changed; Web checks do not establish native gesture behavior. No commit, push, release or Issue reply. Deployment requires both the backend and Lynx client updates.
