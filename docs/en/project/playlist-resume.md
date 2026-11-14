# Playlist resume verification (2026-11-14)

Implementation, commits and pushes are authorized. Clients are committed before updating parent gitlinks; no stable release tags are created. Baselines: parent 493e02b, Flutter c0cfa70, Lynx 84a1f56, plus the verified pre-commit working trees. Final diff identities are recorded in /tmp/songloft-resume/worktrees.json; delivery records identify final commits and their CI results.

## Behavior and contract

Normal playlists independently persist listening position and mode on the server. The audiobook system label defaults a new playlist to sequential playback. Explicit song taps start from zero; Continue restores milliseconds and the saved playlist mode. Search selection builds the entire playlist in persisted order, retaining the current audio instance and confirmed source identity while hydrating.

The parent docs/playlist-resume.md documents the API. Old history does not fabricate positions; basic playback remains available against older servers.

## Validation

Linux amd64, Go 1.26, Flutter 3.41.5, Node 22, Docker Chrome:

- Parent services/database/handlers/app tests, progress HTTP and real SQLite regressions, corresponding vet, sqlc and Swagger passed. Cases include conflicts, stale writes after clear, mode-only updates, removed membership, invalid parameters and missing playlists. Logs: /tmp/songloft-resume-{go,http-tests,go-final}.log.
- Flutter analyze passed; 295 player tests passed. New sync tests cover unconfirmed loads, serialized versions, mode-only writes and conflict shutdown. Embedded Web build passed. Logs: /tmp/songloft-resume-flutter-*.
- Lynx full suite passed: 360 files, 3798 tests. Later edits add audiobook label text and prevent deferred completion from decrementing the sleep timer twice. The 32 playlist tests, final 88 player tests, types and both builds were rerun. Coverage includes initial source position, a full 150-track queue, removed songs, retained source identity and terminal completion surviving a normal flush. Logs: /tmp/songloft-resume-{lynx-final,playlist-acceptance,player-final,types-final,bundle-final}.log.
- Browser fixtures use an isolated database and 150 generated 900-second WAV files under /home/hanxi/.cache/songloft-resume/music, without private media.
- Actual Lynx Continue started at 754 seconds and advanced to about 760; server state advanced to about 759, retaining single mode. Flutter then read the same playlist and advanced audio/server progress to about 764. Both had no pageerror.
- Lynx search injects a real host input event, followed by mouse clicks: the queue shows 150 tracks, episode 128 starts from zero and Next actually plays episode 129. Flutter mouse/keyboard search likewise starts 128 from zero and Next plays 129. Results: /tmp/songloft-resume/browser-search-verified.json and flutter-search-final.json. Resume evidence: browser-seek-result.json and flutter-play-result.json; screenshots: lynx-seek.png and flutter-play.png in that directory.

## Finding and fix

The first browser run showed 12:34 while actual audio was only about six seconds in and server progress stayed unchanged. A command Promise resolved before native preparation, so the following seek was overwritten by loading. Resume now uses source-load with initialPositionMs and retains the loading Song object during queue hydration. The first three public playPlaylist arguments remain compatible; an optional fourth argument carries initialPositionMs.

## Not run

Android/iOS/HarmonyOS devices, process termination in the background and cast resume: Not run, no corresponding devices are available. Web and mock-audio checks do not substitute for device acceptance. No stable release is performed; remote CI will be tracked against the pushed commits.
