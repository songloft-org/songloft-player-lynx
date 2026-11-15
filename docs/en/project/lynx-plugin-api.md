# Lynx plugin API verification

2026-11-15: baseline `025ed82319233c8b64e734cb4c6cdbca84da9833` plus this worktree adds `plugin.apiRequest` for native/Web frames. The host binds entryPath and uses the authenticated HTTP client; only GET/POST under the plugin's own `/api` route are accepted. The SDK does not read tokens.

Production build, Web build and `tsc -b` passed. Full Vitest initially reported 3812 passed and one release-check failure because dist contained TestBridge artifacts. After rebuilding production assets, release and targeted plugin request/host checks passed (12 tests). Android API 34 ran the new JS bundle in an existing Debug shell: opened bili's native frame, scrolled settings, saved medium quality and confirmed medium through the backend. Browser frames and independent HTML fallback saved settings too. Evidence: `/tmp/songloft-bili-verification/`; full limits: bili's `VERIFICATION.en.md`.

Not run: complete source `assembleDebug` (slow Gradle download), Flutter devices, iOS/HarmonyOS and authenticated Bilibili favorites/downloads. Lynx HTML fallback omits COEP; isolated cross-origin HTML embedding remains unsupported. No native-module signatures changed. No commits, pushes or releases.
