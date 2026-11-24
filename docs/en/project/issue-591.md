# #591 Favorite long-poll cancellation after page changes

The baseline is `2f3010c5beff70b1e2263ff1ecdb47840201c3fb`, with this change kept in the uncommitted working tree. The report describes controls becoming unresponsive after several minutes on the voice settings page while the server sees the favorite-change long poll repeatedly time out and reconnect.

The favorite-change watcher now owns the lifetime of its HTTP request. Stopping the watcher, or switching server, account, foreground state, or background state, aborts the in-flight request immediately. Calling `run()` twice on the same watcher reuses one loop. Each session captures its server address so a global configuration update cannot retarget an old subscription. The 35-second receive deadline, cursor advancement after a successful refresh, and exponential retry backoff remain in place.

## Verification

- `pnpm exec vitest run src/features/library/__tests__/favorite-change-watcher.test.ts src/features/library/__tests__/favorite-changes.test.ts`: 8 tests passed.
- `pnpm exec tsc -b`: passed.
- `pnpm test`: 376 files, 3929 tests passed.
- `pnpm run build`: Lynx and Web bundles passed, with the existing `touch-action` warnings.
- `pnpm run build:web`: Web bundle build and deployment copy passed.
- New regressions cover aborting an in-flight request, ignoring a late response, and single-flight execution for one watcher. The isolated negative run against the old implementation was not run. The new abort assertion would fail there because no abort signal was available.

Not run: a long-lived Docker Chromium reproduction, the reporter's Docker image, Android/iOS/HarmonyOS, and desktop devices. The code has not been committed, pushed, or released.
