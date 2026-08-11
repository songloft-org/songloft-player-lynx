import { useQuery } from '@tanstack/react-query'

import { getScanApi } from '../api/index.js'
import { metadataPollInterval, scanPollInterval } from '../domain/scan-model.js'

/**
 * Progress polling for the library-ops sub-page — batch 19.
 *
 * Polling uses TanStack Query's **functional `refetchInterval`** rather than a
 * hand-rolled `setInterval`. That was verified safe on Lynx: query-core 5.101's
 * `#clearRefetchInterval` / `#clearStaleTimeout` / `clearGcTimeout` all guard
 * with `!== void 0`, so `undefined` never reaches Lynx's strict `clearInterval`
 * (which throws `param 0 should be Number`, unlike the browser's no-op).
 * `configureQueryGlobals()` additionally routes query-core's timers through
 * `safe-timers` as belt-and-braces.
 *
 * The functional form buys the semantics the Flutter notifier hand-coded:
 * - **immediate first fetch** — `useQuery` fetches on mount, so re-entering the
 *   page picks up a scan already running server-side (Flutter's "takeover");
 * - **stop on terminal state** — returning `false` tears the interval down;
 * - **auto-takeover** — the same predicate starts polling as soon as a response
 *   says `isScanning`, with no separate branch;
 * - **errors keep polling** — the predicate reads `query.state.data` (the last
 *   *successful* value), so a transient network blip cannot stop the interval.
 *
 * Three non-obvious options, each load-bearing:
 *
 * 1. **`staleTime: 0`** overrides the global 30s (`lib/query/query-client.ts`).
 *    Without it, re-entering the page within 30s serves a cached snapshot and
 *    the first real read is deferred by one interval.
 * 2. **`refetchIntervalInBackground: true`** removes a hidden dependency. The
 *    interval callback only fetches when
 *    `refetchIntervalInBackground || focusManager.isFocused()`. We install a
 *    no-op focus listener but never call `setFocused`, so `isFocused()` falls
 *    through to `globalThis.document?.visibilityState !== 'hidden'` →
 *    `undefined !== 'hidden'` → `true`. Polling therefore works **by accident**
 *    today, and would silently die if anyone ever called `setFocused(false)`.
 * 3. **`retry: 0`** overrides the global `retry: 1`. A failed poll should simply
 *    be skipped until the next tick; retrying doubles requests inside one
 *    interval for no benefit, since a fresh attempt is 2s away regardless.
 */

export const libopsQueryKeys = {
  scanProgress: () => ['libops', 'scan-progress'] as const,
  metadataProgress: () => ['libops', 'metadata-progress'] as const,
  autoCreatePlaylists: () => ['libops', 'auto-create-playlists'] as const,
  playlistMode: () => ['libops', 'playlist-mode'] as const,
  titleSource: () => ['libops', 'title-source'] as const,
  autoScan: () => ['libops', 'auto-scan'] as const,
  autoFingerprint: () => ['libops', 'auto-fingerprint'] as const,
  remoteTitleSource: () => ['libops', 'remote-title-source'] as const,
  musicPathSetting: () => ['libops', 'music-path'] as const,
  dirNames: () => ['libops', 'dir-names'] as const,
}

export interface PollOptions {
  /**
   * Sticky flag set after a successful start request, cleared on the first
   * terminal status. Covers the window where the backend has accepted the job
   * but still reports `idle` — see `scanPollInterval`.
   */
  forced?: boolean
  /** Cancel handshake: stop polling before sending the cancel request. */
  paused?: boolean
}

/** Scan progress, polled while the server is working. */
export function useScanProgressQuery({ forced = false, paused = false }: PollOptions = {}) {
  return useQuery({
    queryKey: libopsQueryKeys.scanProgress(),
    queryFn: () => getScanApi().getScanProgress(),
    staleTime: 0,
    retry: 0,
    refetchIntervalInBackground: true,
    refetchInterval: (query) => scanPollInterval(query.state.data, forced, paused),
  })
}

/** Metadata-refresh progress, same polling contract as the scan. */
export function useMetadataProgressQuery({ forced = false, paused = false }: PollOptions = {}) {
  return useQuery({
    queryKey: libopsQueryKeys.metadataProgress(),
    queryFn: () => getScanApi().getMetadataProgress(),
    staleTime: 0,
    retry: 0,
    refetchIntervalInBackground: true,
    refetchInterval: (query) => metadataPollInterval(query.state.data, forced, paused),
  })
}
