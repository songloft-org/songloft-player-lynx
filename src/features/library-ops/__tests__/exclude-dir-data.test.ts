import { describe, expect, test } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import { buildMusicPathUpdate, type ExcludeConfigDraft } from '../data/exclude-dir-data.js'
import { libopsQueryKeys } from '../data/scan-query.js'
import type { RemoteSetting } from '../data/remote-setting.js'
import type { MusicPathSetting } from '../../../models/library-ops.js'

/**
 * `buildMusicPathUpdate` is the entire safety net for the batch-26 write
 * invariant: `path` (the music root) must never be sent as whatever the caller
 * happens to pass, only as whatever was last read from the server. Extracted as
 * a plain function over a `QueryClient` (same pattern as `applyOptimistic`/
 * `rollback` in `remote-setting.test.ts`) so this is testable without a
 * `QueryClientProvider`.
 */
describe('buildMusicPathUpdate', () => {
  const key = libopsQueryKeys.musicPathSetting()
  const draft: ExcludeConfigDraft = {
    excludeDirs: ['a'],
    excludePaths: ['/music/b'],
    autoCreateExcludeDirs: ['c'],
  }

  test('uses the path from the cached read, regardless of the draft', () => {
    const qc = new QueryClient()
    qc.setQueryData<RemoteSetting<MusicPathSetting>>(key, {
      value: { path: '/music', excludeDirs: [], excludePaths: [], autoCreateExcludeDirs: [] },
      readFailed: false,
    })

    const body = buildMusicPathUpdate(qc, key, draft)

    expect(body.path).toBe('/music')
    expect(body.excludeDirs).toEqual(['a'])
    expect(body.excludePaths).toEqual(['/music/b'])
    expect(body.autoCreateExcludeDirs).toEqual(['c'])
  })

  test('a draft cannot carry its own path — the type excludes the field', () => {
    // @ts-expect-error `path` is not assignable on ExcludeConfigDraft.
    const withPath: ExcludeConfigDraft = { ...draft, path: '/evil' }
    const qc = new QueryClient()
    qc.setQueryData<RemoteSetting<MusicPathSetting>>(key, {
      value: { path: '/music', excludeDirs: [], excludePaths: [], autoCreateExcludeDirs: [] },
      readFailed: false,
    })

    const body = buildMusicPathUpdate(qc, key, withPath)

    expect(body.path).toBe('/music')
  })

  test('falls back to an empty path when nothing has been read yet, instead of throwing', () => {
    const qc = new QueryClient()
    const body = buildMusicPathUpdate(qc, key, draft)
    expect(body.path).toBe('')
  })

  test('a read that degraded to the fallback still supplies its path', () => {
    const qc = new QueryClient()
    qc.setQueryData<RemoteSetting<MusicPathSetting>>(key, {
      value: { path: '', excludeDirs: [], excludePaths: [], autoCreateExcludeDirs: [] },
      readFailed: true,
    })
    const body = buildMusicPathUpdate(qc, key, draft)
    expect(body.path).toBe('')
  })
})
