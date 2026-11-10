# #563 Server favorite synchronization

Authenticated sessions subscribe to `/playlists/favorites/changes` and reconcile complete favorite IDs on invalidation, independently of settings/plugin WebViews. Backgrounding, logout and server/account changes stop old subscriptions; resume reconciles. Older-host 404 stops subscription; network failures back off.

Baseline `bc692c14be23190aef4d3468e428dc292fd456af` plus uncommitted tree. `pnpm exec tsc -b`, all 3793 Vitest cases and Lynx/Web builds passed. New regressions cover reconnect/stop, cache replacement and stale-session responses. Actual browser verification observes the current playlist-row heart changing on real QuickJS add/remove writes.

Evidence: test/build logs, screenshots and `worktree-final.json` under `/tmp/songloft-563-extra/`. Initial parallel compilation hit memory pressure and was retried sequentially by target. The first Lynx full suite failed on a missing artifact from that build; the full suite passed after successful builds.

Not run: Android/iOS/HarmonyOS or desktop devices, release packages and remote CI. This records pre-commit code, Web and injected checks only. The user subsequently authorized commits, pushes, SDK publication and an Issue reply. GitHub and the parent delivery record govern final commits and CI.
