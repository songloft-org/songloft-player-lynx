# Playlist drag auto-scrolling (songloft-org/songloft#551)

2026-11-02, comment `6576318751`. Fix existing ordering only; no pinning feature.

## Cause and changes

The page nested a plain `SortableRoot` in an independent scroll-view without configuring a drag scroll boundary. Use its existing `as='ScrollView'` so the component owns the viewport. A pinned pnpm patch forwards scroll callbacks, the pagination threshold and footer, preserving pagination and bottom navigation space.

Real Web long-list testing exposed two additional issues:

- `scrollBy({offset})` reaches HTMLElement directly on Web, where offset is ignored. Retain native offset and add Web top and instant scrolling parameters.
- After pagination appends rows, the running main-thread timer retains callbacks over the old key array: the page scrolls but the drop stops in the old page. Refresh the running callback and preserve the active drag overlay during append. Stop the loop on unmount; release follows the original lifecycle.

The existing single-song move API and custom ascending semantics remain; backend source is unchanged.

## Verification identity and results

- Lynx baseline `8ed3c6484d6107a5f5fd0dc417b6d984578524fd` plus this uncommitted worktree; parent `e204855590bdf4c38483ff87ee19769ba91df1fc`, with the companion Flutter fix in its worktree. Final file hashes: `/tmp/songloft-551-scroll/verification.json`.
- Linux amd64 / Node 22.17.1 / pnpm 11.15.1 / Docker HeadlessChrome 121.0.6167.85. Isolated database, real temporary backend and 140 synthetic MP3s scanned into Scroll551; no user music.
- `pnpm exec tsc -b`, `pnpm run build` (Lynx/Web artifacts), and `pnpm run build:web-embedded` pass. All 355 files / 3768 tests and all 36 focused page and source/distribution controller cases pass.
- The isolated old page fails the new ScrollView boundary case. The unpatched upstream controller fails four of six cases; its two native-parameter cases pass. These detect Web zero movement and missing pagination callback refresh; all pass after the patch. Logs: `/tmp/songloft-551-scroll-lynx-{negative-final,controller-negative-delivery,focused-delivery,all-final,types-final,build-final,web-final}.log`.
- Real browser at 1200×900, same page: one drag moves the first song to position 46, scrollTop 0→2030, fetching offset=20/40 and later pages. Another drag moves song 43 to position 2, scrollTop 2031→69. Backend drop positions match and all 140 IDs retain their order after reload; no page exceptions. A separate upward case also moves song 20 to the first position and verifies reload.
- Browser evidence: `/tmp/songloft-551-scroll/lynx-ui.json`, `lynx-{drag,beforeUp,saved,reloaded}.png`; separate upward run `lynx-up.json`. Intermediate failed runs remain: enabling the component alone did not scroll on Web; adding Web parameters still retained the old drop range after pagination; the first consecutive-drag driver sampled coordinates before the preceding asynchronous update settled, then passed on the same source after waiting for it. None are passing evidence. Early dependency-path failures in isolated copies are not negative evidence either.
- Diff, UTF-8 and bilingual pairing checks pass. pnpm patch temporarily upgraded unrelated transitive dependencies; these were restored, retaining only sortable patch lock changes.

Not run: Android/iOS/HarmonyOS native compilation and device gestures, or the reporter's Windows acceptance. Native Lynx parameters are covered by controller tests and dual artifacts only. Flutter separately passes all 813 tests, narrow/wide bidirectional real Widget gestures, analysis and embedded Web build; see its `docs/en/issue-551.md`. No commit, push, parent pointer update, release or Issue write in this batch.

Suggested commit: `fix(playlist): 修复拖动排序跨屏自动滚动`, `Ref songloft-org/songloft#551`.
