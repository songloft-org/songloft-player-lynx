import { useQuery } from '@tanstack/react-query'

import { getScanApi } from '../api/index.js'

/**
 * Progress queries for the library-ops sub-page — batch 19, polling reworked in
 * batch 40.
 *
 * These hooks own **only the fetch + cache**; the poll cadence lives in the page
 * (`LibraryOpsPage`), which drives `refetch()` from an explicit `setInterval`.
 *
 * They used to poll via query-core's functional `refetchInterval`. That is not
 * reliable on this Lynx 4.0 build: batch 29b verified on device that the
 * interval callback stops firing after the first fetch even while the interval
 * function keeps returning `2000` (the fingerprint `computed/total` count froze
 * at its first value while the backend advanced). The scan poll appeared to keep
 * working only because `refetchIntervalInBackground: true` masked a second
 * hazard — without it the callback fetches only when `focusManager.isFocused()`,
 * which returned `true` by accident (`globalThis.document?.visibilityState`
 * being `undefined !== 'hidden'`) and would have gone silently dead the moment
 * anyone called `setFocused(false)`. A plain BTS `setInterval` was verified to
 * fire every tick, so the page owns the cadence for both queries.
 *
 * The semantics the Flutter notifier hand-coded are preserved by that split:
 * - **immediate first fetch** — `useQuery` still fetches on mount, so
 *   re-entering the page picks up a scan already running server-side
 *   (Flutter's "takeover");
 * - **stop on terminal state / auto-takeover** — `scanPollInterval` and
 *   `metadataPollInterval` (`domain/scan-model.ts`) stay the single source of
 *   truth for *whether* to poll and *how fast*; the page arms its interval from
 *   their return value and tears it down when they return `false`;
 * - **errors keep polling** — the predicates read the last *successful* value
 *   (`query.data`), so a transient network blip cannot stop the interval.
 *
 * Two non-obvious options remain, each load-bearing:
 *
 * 1. **`staleTime: 0`** overrides the global 30s (`lib/query/query-client.ts`).
 *    Without it, re-entering the page within 30s serves a cached snapshot and
 *    the first real read is deferred by one interval.
 * 2. **`retry: 0`** overrides the global `retry: 1`. A failed poll should simply
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
  fingerprintStatus: () => ['libops', 'fingerprint-status'] as const,
  fingerprintProgress: () => ['libops', 'fingerprint-progress'] as const,
  duplicates: () => ['libops', 'duplicates'] as const,
}

/**
 * Scan progress. Fetches on mount; the page re-`refetch()`es it on a timer for
 * as long as `scanPollInterval` says to.
 */
export function useScanProgressQuery() {
  return useQuery({
    queryKey: libopsQueryKeys.scanProgress(),
    queryFn: () => getScanApi().getScanProgress(),
    staleTime: 0,
    retry: 0,
  })
}

/** Metadata-refresh progress, same contract via `metadataPollInterval`. */
export function useMetadataProgressQuery() {
  return useQuery({
    queryKey: libopsQueryKeys.metadataProgress(),
    queryFn: () => getScanApi().getMetadataProgress(),
    staleTime: 0,
    retry: 0,
  })
}
