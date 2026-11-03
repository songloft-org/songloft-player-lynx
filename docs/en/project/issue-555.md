# Restore saved lyrics after reopening Web (songloft-org/songloft#555)

2026-11-03, targeting the default Docker Lynx Web client. The reporter has not confirmed the client or supplied a queue snapshot. This records a reproduced path, not the only proven cause in their environment.

## Cause and change

Persisted queues hold song snapshots. When a snapshot lacks `lyric_url`, manual re-fetch supplies the endpoint only to the lyric store without updating the queued Song. After reopening, `loadForSong` cleared lyrics before reading the cache, even when the database and client cache contained saved lyrics.

Normal local-song loading now also supplies `/api/v1/songs/{id}/lyric`, reads valid cached lyrics first and otherwise uses the ordinary endpoint without `refresh=1`. Ordinary backend requests prefer saved database lyrics. A 404 means no lyrics; other errors remain failures. Offline snapshots, URL-less radio/remote songs and invalid IDs do not enter the new fallback.

## Verification

- Repository: songloft-org/songloft-player-lynx, baseline `07eb9b25c851b19eadb005f8345f2493aab72b2b`. Parent backend `88c0b4138aea53a0caf65c3c29c1713c72586177` is unchanged. SHA-256 of `git diff -- <store and three test files>`: `e3f2727d7377e745c7cc5de165e19c09141fdf99be1f6bac0d2bc1dc2aab5a1a`.
- Linux amd64, Node 22.17.1, pnpm 11.15.1, Docker Headless Chrome at 1280×800. Temporary real backend/SQLite and a synthetic 10-second MP3; no user library accessed.
- Two new tests failed on the old implementation: restoring a persisted queue made no request; re-fetching then restoring failed to recover valid cached lyrics. Log: `/tmp/songloft-555-before.log`. The final 16 lyric-store tests include these cases, offline isolation and 404/502 semantics; see `/tmp/songloft-555-tests-final2.log`.
- `pnpm run build` (Lynx/Web outputs), `pnpm run build:web` and `pnpm exec tsc -b` passed; logs `/tmp/songloft-555-{build,web,types-final}.log`.
- Parent `go build -tags dev,lite -o /tmp/songloft-555-server .` passed, producing the backend used for real HTTP verification. No Go source changed.
- Each of the first two full runs passed 3771 tests and failed one: first home-widget commands, then position persistence. Their fixtures did not mock lyric fetching, allowing the new fallback into the real auth lifecycle and affecting state assertions. Both now isolate the lyric fetcher while retaining all behavioral assertions. Failure logs: `/tmp/songloft-555-tests.log`, `/tmp/songloft-555-tests-final.log`. Final full-suite results: `/tmp/songloft-555-tests-final2.log`.
- Real browser: persist a URL-less queue snapshot while the backend holds `lyric_source=scraped`; two full-page loads render both lines, making one ordinary `/lyric` request and no forced scraping requests. The second load uses persistent cache. Clicking Play advances to `00:01` and highlights the first line, with no page errors. Evidence: `/tmp/songloft-555-runtime/browser-summary.json`, `reload.png`. Initial fixture issues with gzip forwarding and querying a detached Audio element were corrected; these are not product failures or passing evidence.
- `git diff --check`, UTF-8 and bilingual file pairing passed.
- Final `pnpm test`: all 3772 tests in 355 files passed (134.44 seconds). Full worktree file hashes: `/tmp/songloft-555-runtime/verification.json`.

Not run: Flutter Web, the reporter's NAS/Docker instance, native Android/iOS/HarmonyOS builds or devices, and the full backend test suite. Only shared Lynx lyric loading changed; backend/native hosts are unchanged. The backend was verified through compilation and real HTTP requests.

No commit, push, parent pointer update, release or Issue write. Suggested commit: `fix(lyrics): 恢复旧播放队列中的已保存歌词`, with `Ref songloft-org/songloft#555`.
