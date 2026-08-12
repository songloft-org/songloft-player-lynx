import { describe, expect, test } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import { parseFingerprintProgress } from '../../../models/fingerprint.js'
import { resetFingerprintCachesForNewRun } from '../data/fingerprint-mutations.js'
import { libopsQueryKeys } from '../data/scan-query.js'

/**
 * Regression test for the batch 29b Computing-phase bug.
 *
 * Root cause: starting a new run left the *previous* run's **terminal** progress
 * (`done`/`cancelled`) and its duplicate results in the cache. The stale
 * terminal `progress.isFinished` then made the page's auto-transition skip the
 * computing phase (and, on a never-computed library, froze the count at `0/0`).
 *
 * `resetFingerprintCachesForNewRun` — invoked by `useStartFingerprintMutation`'s
 * `onSuccess` — is the fix: invalidate the progress query (so the stale terminal
 * value is refetched fresh) and drop the stale duplicates. We assert both
 * against a real `QueryClient`, matching `playlist-mutations.test.ts`.
 */
describe('resetFingerprintCachesForNewRun (batch 29b fix)', () => {
  test('invalidates a leftover terminal progress so it is refetched', () => {
    const queryClient = new QueryClient()
    // Leftover terminal progress from a previous run.
    queryClient.setQueryData(
      libopsQueryKeys.fingerprintProgress(),
      parseFingerprintProgress({ status: 'done', computed: 356, total: 356, failed: 0 }),
    )
    expect(
      queryClient.getQueryState(libopsQueryKeys.fingerprintProgress())?.isInvalidated,
    ).toBe(false)

    resetFingerprintCachesForNewRun(queryClient)

    // Marked stale → the page's next read/poll refetches instead of trusting the
    // old run's `isFinished`.
    expect(
      queryClient.getQueryState(libopsQueryKeys.fingerprintProgress())?.isInvalidated,
    ).toBe(true)
  })

  test('drops the previous run duplicate results', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(libopsQueryKeys.duplicates(), {
      groups: [{ fingerprint: 'x', songs: [] }],
      totalGroups: 1,
      totalDuplicates: 0,
    })
    expect(queryClient.getQueryData(libopsQueryKeys.duplicates())).toBeDefined()

    resetFingerprintCachesForNewRun(queryClient)

    expect(queryClient.getQueryData(libopsQueryKeys.duplicates())).toBeUndefined()
  })
})
