# Web v2 backup compatibility verification

- Date: 2026-11-15; repository `songloft-org/songloft-player-lynx`.
- Baselines: Lynx `1de473505589ec74e358e72bd7b95f06ba5df1a9`, backend `2326b38a6ab97b194cc7b7cb1595f49d75bcd32b`, plus this uncommitted worktree. Final diff identity: `/tmp/songloft-backup-v2/verification.json`.
- Environment: Linux x86_64, Node 22.17.1, pnpm 11.15.1; Docker Chrome over ordinary HTTP, a temporary embedded Web package and two independent SQLite backends.

## Fix and regression

The shared validator in `data-transfer.ts` checks import files and export responses. The old implementation accepted only v1. It now accepts v1/v2, retains the version/playlist-array checks, and transfers the original text and tag fields. Both invalid-file translations were updated.

Three v2 regressions fail on old code with `invalid_json`, covering import, export, and authentication refresh/subpath replay. After the fix, all 28 transfer/data-page checks pass. Logs: `/tmp/songloft-backup-v2-{before-final,focused}.log`.

## Actual browser flow

1. Instance A has a shared tag, song and audiobook playlist. Export through Data downloads v2 JSON matching the backend export, excluding the changing export timestamp, including definitions and song/playlist references.
2. Instance B already occupies tag ID 1. Import the actual downloaded file through its file chooser: one new playlist, two merged built-ins, one song. Read-only SQLite checks confirm ID 1 → 2, preserved color/system markers and correct song/playlist bindings.
3. A legacy v1 backup creates another playlist. v3 displays the updated validation error; B receives exactly two import POSTs, proving the unknown version was not uploaded.
4. Neither browser flow reports page errors. Data/screenshots: `/tmp/songloft-backup-v2/{browser-export.json,roundtrip.json,downloaded.json,export.png,import.png}`.

## Final checks

| Command | Result |
| --- | --- |
| `pnpm run build` | Both Lynx/Web artifacts pass |
| `pnpm exec tsc -b` | Pass |
| `pnpm test` | 360 files / 3809 tests pass |
| `pnpm run test:release` | 89 pass, none skipped |
| `node scripts/copy-bundle-web.mjs --embedded --out-dir /tmp/songloft-backup-v2/web` | Pass; browser uses this temporary package |
| Parent `npm run docs:build` in `docs/` | Pass, 197.12 seconds |
| Both repositories: `git diff --check`, UTF-8 | Pass |

Logs use prefix `/tmp/songloft-backup-v2-`: `build-final.log`, `types-final.log`, `tests.log`, `release-tests.log`, `docs.log`. Final identity and results are in `verification.json`. Early browser harness attempts encountered replaced nodes and Worker-network observation limits; the corrected harness reran acceptance without product-code workarounds.

Not run: Android/iOS/HarmonyOS native builds/devices, Firefox/Safari. This changes shared Web backup validation and leaves native upload paths unchanged. No commit, push, parent gitlink update or release.
