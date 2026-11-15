# About/Updates release emoji verification

Date: 2026-11-15. Repository `songloft-org/songloft-player-lynx`, baseline `1de473505589ec74e358e72bd7b95f06ba5df1a9` plus this uncommitted worktree, including the same conversation's backup fix. Final diff/artifact hashes: `/tmp/songloft-release-emoji/verification.json`.

## Behavior and regressions

The user confirmed literal `:sparkles:` on Android. `marked` GFM lexing does not expand these shortcodes; shared `Markdown.tsx` previously emitted them as text. Prose text nodes now resolve names through `gemoji`, including headings, emphasis, tables and link labels. Raw Markdown is not preprocessed: code, escaped shortcodes, autolinks, URLs and unknown names remain literal. Dictionary lookups use own properties. MIT attribution is added; the lockfile only adds `gemoji`. License checks now understand GitHub repository shorthand in package manifests.

Three old-code regressions fail because shortcodes remain literal: shared Markdown, backend notes in About, and client release notes. All 36 focused checks pass after repair, including literal code, URL clicks and unknown names. Logs: `/tmp/songloft-release-emoji-{regression-before,focused-final}.log`.

## Verification matrix

| Check | Result |
| --- | --- |
| `pnpm exec tsc -b` | Pass |
| `pnpm run build` | Both Lynx/Web artifacts pass |
| `pnpm test` | 360 files / 3811 tests pass |
| `pnpm run test:release` | 89 pass, none skipped |
| Temporary embedded Web, 1100px/390px | Old package retains shortcodes; new package converts 12 real changelog category headings, preserving code and URLs; zero page errors |
| Android 34 x86_64 native About | Actual touch login, Settings, About and scrolling; painted ✨, 🐛, 📝, 🔧, ⚡, ✅ and other glyphs are correct |
| Full Android native rebuild | **Attempted then cancelled** during Gradle 8.7 download; not passed |

Environment: Linux, Node 22.17.1, pnpm 11.15.1. Both platforms use a temporary backend. Update-check metadata is a controlled fixture based on real repository category headings; no upgrade is executed. Web screenshots/assertions: `/tmp/songloft-release-emoji/{browser.json,before-1100.png,after-1100.png,after-390.png}`.

Android reuses the workspace's debug APK (native shell 0.1.6), replacing only `assets/main.lynx.bundle`, retaining native classes/libraries/host identity, and signing with a temporary test key. Hashes: `android-artifact.json`. `android-emoji.png` proves actual native glyph rendering, not a successful rebuild of current native sources. The original emulator disconnected; a separate read-only AVD crashed with Vulkan enabled and passed after Vulkan was disabled. Rapid text input initially dropped a port character; verifying the field and using adb reverse completed actual login. These were environment/harness issues, without product-code workarounds.

Not run: reporter's device, other Android versions, iOS/HarmonyOS, this emoji acceptance on Firefox/Safari, actual Release metadata download/upgrade installation, remote CI. No commit, push, parent gitlink update or release.
