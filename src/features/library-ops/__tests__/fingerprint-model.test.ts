import { describe, expect, test } from 'vitest'

import type { FingerprintProgress } from '../../../models/fingerprint.js'
import type { DuplicateGroup } from '../../../models/duplicate.js'
import {
  fingerprintPollInterval,
  FINGERPRINT_POLL_MS,
  recommendedKeepId,
  groupDeleteIds,
  allDeleteIds,
  countTotalToDelete,
} from '../domain/fingerprint-model.js'

/* ─────────────────────────── fingerprintPollInterval ─────────────────────── */

describe('fingerprintPollInterval', () => {
  const running: FingerprintProgress = {
    status: 'running',
    computed: 10,
    total: 100,
    failed: 0,
    percent: 10,
    isRunning: true,
    isFinished: false,
    isIdle: false,
  }

  const done: FingerprintProgress = {
    status: 'done',
    computed: 100,
    total: 100,
    failed: 0,
    percent: 100,
    isRunning: false,
    isFinished: true,
    isIdle: false,
  }

  const idle: FingerprintProgress = {
    status: 'idle',
    computed: 0,
    total: 0,
    failed: 0,
    percent: 0,
    isRunning: false,
    isFinished: false,
    isIdle: true,
  }

  test('returns POLL_MS when running', () => {
    expect(fingerprintPollInterval(running, false, false)).toBe(FINGERPRINT_POLL_MS)
  })

  test('returns false when done', () => {
    expect(fingerprintPollInterval(done, false, false)).toBe(false)
  })

  test('returns false when paused', () => {
    expect(fingerprintPollInterval(running, true, true)).toBe(false)
  })

  test('returns POLL_MS when forced even if idle', () => {
    expect(fingerprintPollInterval(idle, true, false)).toBe(FINGERPRINT_POLL_MS)
  })

  test('returns false when idle and not forced', () => {
    expect(fingerprintPollInterval(idle, false, false)).toBe(false)
  })

  test('returns POLL_MS when progress is undefined and forced', () => {
    expect(fingerprintPollInterval(undefined, true, false)).toBe(FINGERPRINT_POLL_MS)
  })

  test('returns false when progress is undefined and not forced', () => {
    expect(fingerprintPollInterval(undefined, false, false)).toBe(false)
  })
})

/* ─────────────────────────── recommendedKeepId ───────────────────────────── */

describe('recommendedKeepId', () => {
  const group: DuplicateGroup = {
    fingerprint: 'fp1',
    songs: [
      { id: 1, title: 'A', artist: 'X', album: '', duration: 0, filePath: '/a.mp3', format: 'mp3', bitRate: 192, fileSize: 5000, fileSizeDisplay: '4.9 KB', coverUrl: undefined, addedAt: undefined },
      { id: 2, title: 'A', artist: 'X', album: '', duration: 0, filePath: '/a.flac', format: 'flac', bitRate: 320, fileSize: 30000, fileSizeDisplay: '29.3 KB', coverUrl: undefined, addedAt: undefined },
      { id: 3, title: 'A', artist: 'X', album: '', duration: 0, filePath: '/a.wav', format: 'wav', bitRate: 320, fileSize: 50000, fileSizeDisplay: '48.8 KB', coverUrl: undefined, addedAt: undefined },
    ],
  }

  test('picks the song with the highest bitRate', () => {
    expect(recommendedKeepId(group)).toBe(3) // 320kbps, largest file
  })

  test('breaks ties by fileSize', () => {
    // id=2 and id=3 both have 320kbps, but id=3 has larger fileSize
    expect(recommendedKeepId(group)).toBe(3)
  })
})

/* ─────────────────────────── groupDeleteIds ──────────────────────────────── */

describe('groupDeleteIds', () => {
  const group: DuplicateGroup = {
    fingerprint: 'fp',
    songs: [
      { id: 1, title: '', artist: '', album: '', duration: 0, filePath: '', format: '', bitRate: 0, fileSize: 0, fileSizeDisplay: '', coverUrl: undefined, addedAt: undefined },
      { id: 2, title: '', artist: '', album: '', duration: 0, filePath: '', format: '', bitRate: 0, fileSize: 0, fileSizeDisplay: '', coverUrl: undefined, addedAt: undefined },
      { id: 3, title: '', artist: '', album: '', duration: 0, filePath: '', format: '', bitRate: 0, fileSize: 0, fileSizeDisplay: '', coverUrl: undefined, addedAt: undefined },
    ],
  }

  test('returns all IDs except the keep ID', () => {
    expect(groupDeleteIds(group, 2)).toEqual([1, 3])
  })

  test('returns empty when keep ID is the only song', () => {
    const single: DuplicateGroup = {
      fingerprint: 'x',
      songs: [group.songs[0]],
    }
    expect(groupDeleteIds(single, 1)).toEqual([])
  })
})

/* ─────────────────────────── allDeleteIds / countTotalToDelete ────────────── */

describe('allDeleteIds', () => {
  const groups: DuplicateGroup[] = [
    {
      fingerprint: 'fp1',
      songs: [
        { id: 1, title: '', artist: '', album: '', duration: 0, filePath: '', format: '', bitRate: 320, fileSize: 100, fileSizeDisplay: '', coverUrl: undefined, addedAt: undefined },
        { id: 2, title: '', artist: '', album: '', duration: 0, filePath: '', format: '', bitRate: 192, fileSize: 50, fileSizeDisplay: '', coverUrl: undefined, addedAt: undefined },
      ],
    },
    {
      fingerprint: 'fp2',
      songs: [
        { id: 3, title: '', artist: '', album: '', duration: 0, filePath: '', format: '', bitRate: 256, fileSize: 80, fileSizeDisplay: '', coverUrl: undefined, addedAt: undefined },
        { id: 4, title: '', artist: '', album: '', duration: 0, filePath: '', format: '', bitRate: 128, fileSize: 40, fileSizeDisplay: '', coverUrl: undefined, addedAt: undefined },
      ],
    },
  ]

  test('computes all IDs to delete across groups', () => {
    const keep = new Map([[0, 1], [1, 3]])
    const ignored = new Set<number>()
    expect(allDeleteIds(groups, keep, ignored)).toEqual([2, 4])
  })

  test('skips ignored groups', () => {
    const keep = new Map([[0, 1], [1, 3]])
    const ignored = new Set([1])
    expect(allDeleteIds(groups, keep, ignored)).toEqual([2])
  })

  test('uses recommended keep when not in the map', () => {
    // Group 0: recommended is id=1 (highest bitRate=320)
    // Group 1: recommended is id=3 (highest bitRate=256)
    const keep = new Map<number, number>()
    const ignored = new Set<number>()
    expect(allDeleteIds(groups, keep, ignored)).toEqual([2, 4])
  })
})

describe('countTotalToDelete', () => {
  const groups: DuplicateGroup[] = [
    {
      fingerprint: 'fp1',
      songs: [
        { id: 1, title: '', artist: '', album: '', duration: 0, filePath: '', format: '', bitRate: 320, fileSize: 0, fileSizeDisplay: '', coverUrl: undefined, addedAt: undefined },
        { id: 2, title: '', artist: '', album: '', duration: 0, filePath: '', format: '', bitRate: 192, fileSize: 0, fileSizeDisplay: '', coverUrl: undefined, addedAt: undefined },
        { id: 3, title: '', artist: '', album: '', duration: 0, filePath: '', format: '', bitRate: 128, fileSize: 0, fileSizeDisplay: '', coverUrl: undefined, addedAt: undefined },
      ],
    },
  ]

  test('counts songs to delete (total - 1 per non-ignored group)', () => {
    const keep = new Map([[0, 1]])
    expect(countTotalToDelete(groups, keep, new Set())).toBe(2)
  })

  test('returns 0 when all groups are ignored', () => {
    const keep = new Map([[0, 1]])
    expect(countTotalToDelete(groups, keep, new Set([0]))).toBe(0)
  })
})
