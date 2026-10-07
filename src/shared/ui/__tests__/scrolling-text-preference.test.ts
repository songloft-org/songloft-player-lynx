import { beforeEach, expect, test, vi } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/memory-storage.js'
import {
  applySavedSongTitleScrolling,
  changeSongTitleScrolling,
  getSongTitleScrolling,
  PREF_SONG_TITLE_SCROLLING,
  songTitleScrolling,
  subscribeSongTitleScrolling,
} from '../scrolling-text-preference.js'

beforeEach(() => songTitleScrolling.setState({ enabled: true }))

test('missing preference defaults on; saved false restores after a fresh session', async () => {
  const storage = createMemoryStorage()
  await applySavedSongTitleScrolling(storage)
  expect(getSongTitleScrolling()).toBe(true)
  await changeSongTitleScrolling(false, storage)
  songTitleScrolling.setState({ enabled: true })
  await applySavedSongTitleScrolling(storage)
  expect(getSongTitleScrolling()).toBe(false)
})

test('every mounted consumer is notified immediately, before persistence resolves', async () => {
  const storage = createMemoryStorage()
  let release: () => void = () => {}
  storage.prefs.set = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
  const observed: boolean[] = []
  const stop = subscribeSongTitleScrolling(() => observed.push(getSongTitleScrolling()))
  const saved = changeSongTitleScrolling(false, storage)
  expect(observed).toEqual([false])
  await Promise.resolve()
  release()
  await saved
  stop()
})

test('a stale startup read cannot overwrite the user choice', async () => {
  const storage = createMemoryStorage()
  let release: (value: string | null) => void = () => {}
  storage.prefs.get = vi.fn(() => new Promise<string | null>(resolve => { release = resolve }))
  const loading = applySavedSongTitleScrolling(storage)
  await Promise.resolve()
  await changeSongTitleScrolling(false, storage)
  release('true')
  await loading
  expect(getSongTitleScrolling()).toBe(false)
})

test('rapid switches persist in order and leave the last value on disk', async () => {
  const storage = createMemoryStorage()
  const originalSet = storage.prefs.set
  const savedValues: string[] = []
  storage.prefs.set = async (key, value) => {
    // Delay OFF writes so an unqueued implementation would overwrite ON last.
    if (value === 'false') await new Promise(resolve => setTimeout(resolve, 10))
    savedValues.push(value)
    await originalSet(key, value)
  }
  await Promise.all([changeSongTitleScrolling(false, storage), changeSongTitleScrolling(true, storage)])
  expect(savedValues).toEqual(['false', 'true'])
  expect(await storage.prefs.get(PREF_SONG_TITLE_SCROLLING)).toBe('true')
  expect(getSongTitleScrolling()).toBe(true)
})

test('unavailable storage falls back on and does not prevent session toggles', async () => {
  const storage = createMemoryStorage()
  storage.prefs.get = async () => { throw new Error('unavailable') }
  storage.prefs.set = async () => { throw new Error('unavailable') }
  await applySavedSongTitleScrolling(storage)
  expect(getSongTitleScrolling()).toBe(true)
  await changeSongTitleScrolling(false, storage)
  expect(getSongTitleScrolling()).toBe(false)
  // A failed write does not poison the queue for later choices.
  await changeSongTitleScrolling(true, storage)
  expect(getSongTitleScrolling()).toBe(true)
})
