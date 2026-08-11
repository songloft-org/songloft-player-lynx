import { describe, expect, test } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

import {
  applyOptimistic,
  remoteSettingQueryFn,
  rollback,
  type RemoteSetting,
} from '../data/remote-setting.js'
import { invalidateAfterScan } from '../data/scan-mutations.js'
import { libopsQueryKeys } from '../data/scan-query.js'

/**
 * The optimistic write path is covered here rather than through the page,
 * because the lynx-ui `Switch` has to be mocked in render tests (it is a native
 * gesture leaf) and a mocked switch cannot emit `onChange`. Keeping the cache
 * mutations as plain functions over a `QueryClient` makes them directly testable
 * without a provider; only the "gesture → onChange" hop stays device-only.
 */
describe('remoteSettingQueryFn', () => {
  test('a successful read is not flagged', async () => {
    await expect(remoteSettingQueryFn(async () => 'tag', 'filename')).resolves.toEqual({
      value: 'tag',
      readFailed: false,
    })
  })

  test('a failed read degrades to the fallback and flags it, without throwing', async () => {
    await expect(
      remoteSettingQueryFn(async () => {
        throw new Error('offline')
      }, 'filename'),
    ).resolves.toEqual({ value: 'filename', readFailed: true })
  })

  test('the flag is what lets the row distinguish "really default" from "read failed"', async () => {
    const real = await remoteSettingQueryFn(async () => true, true)
    const degraded = await remoteSettingQueryFn<boolean>(async () => {
      throw new Error('nope')
    }, true)
    expect(real.value).toBe(degraded.value)
    expect(real.readFailed).toBe(false)
    expect(degraded.readFailed).toBe(true)
  })
})

describe('applyOptimistic / rollback', () => {
  test('applyOptimistic writes the pending value and clears the failure flag', () => {
    const qc = new QueryClient()
    const key = libopsQueryKeys.playlistMode()
    qc.setQueryData<RemoteSetting<string>>(key, { value: 'directory', readFailed: true })

    applyOptimistic(qc, key, 'top_level')

    expect(qc.getQueryData(key)).toEqual({ value: 'top_level', readFailed: false })
  })

  test('rollback restores the captured snapshot', () => {
    const qc = new QueryClient()
    const key = libopsQueryKeys.playlistMode()
    const previous: RemoteSetting<string> = { value: 'directory', readFailed: false }
    qc.setQueryData(key, previous)

    applyOptimistic(qc, key, 'bubble_up')
    expect(qc.getQueryData(key)).toEqual({ value: 'bubble_up', readFailed: false })

    rollback(qc, key, previous)
    expect(qc.getQueryData(key)).toEqual(previous)
  })

  test('rollback with no snapshot leaves the cache alone instead of throwing', () => {
    const qc = new QueryClient()
    const key = libopsQueryKeys.autoFingerprint()
    applyOptimistic(qc, key, true)
    expect(() => rollback(qc, key, undefined)).not.toThrow()
    expect(qc.getQueryData(key)).toEqual({ value: true, readFailed: false })
  })
})

/**
 * Regression for the Flutter defect: it only invalidated the playlist list after
 * a scan, so newly imported songs did not show up in Library until something
 * else happened to refetch.
 */
describe('invalidateAfterScan', () => {
  test('drops song, facet and playlist caches across every filter variant', () => {
    const qc = new QueryClient()
    const songsA = ['library', 'songs', { keyword: '' }] as const
    const songsB = ['library', 'songs', { keyword: 'blue' }] as const
    const facets = ['library', 'facets', 'artist', ''] as const
    const playlists = ['playlist', 'list', { type: 'normal' }] as const
    for (const key of [songsA, songsB, facets, playlists]) qc.setQueryData(key, {})

    invalidateAfterScan(qc)

    for (const key of [songsA, songsB, facets, playlists]) {
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true)
    }
  })

  test('leaves unrelated caches intact', () => {
    const qc = new QueryClient()
    const scanProgress = libopsQueryKeys.scanProgress()
    qc.setQueryData(scanProgress, {})
    qc.setQueryData(['playlist', 'detail', 7], {})

    invalidateAfterScan(qc)

    expect(qc.getQueryState(scanProgress)?.isInvalidated).toBe(false)
    expect(qc.getQueryState(['playlist', 'detail', 7])?.isInvalidated).toBe(false)
  })
})
