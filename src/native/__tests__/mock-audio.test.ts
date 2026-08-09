import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { MockSongloftAudio } from '../mock-audio.js'
import { safeClearInterval, safeClearTimeout } from '../safe-timers.js'
import type { AudioEvent } from '../audio-types.js'

describe('safe timers (Lynx strict clear guard)', () => {
  test('do not call the underlying clear for a non-number handle', () => {
    const iSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {})
    const tSpy = vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {})
    try {
      safeClearInterval(undefined)
      safeClearInterval(null)
      safeClearTimeout(undefined)
      expect(iSpy).not.toHaveBeenCalled()
      expect(tSpy).not.toHaveBeenCalled()
      safeClearInterval(123)
      expect(iSpy).toHaveBeenCalledWith(123)
    } finally {
      iSpy.mockRestore()
      tSpy.mockRestore()
    }
  })

  test('survive a Lynx-style clearInterval that throws on non-Number', () => {
    const spy = vi.spyOn(globalThis, 'clearInterval').mockImplementation((id) => {
      // Mirror Lynx: `clearInterval(undefined)` throws "param 0 should be Number".
      if (typeof id !== 'number') throw new Error('param 0 should be Number')
    })
    try {
      expect(() => safeClearInterval(undefined)).not.toThrow()
      expect(() => safeClearInterval(7)).not.toThrow()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('MockSongloftAudio', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test('play advances position and emits progress each tick', async () => {
    const audio = new MockSongloftAudio()
    const progress: AudioEvent[] = []
    audio.on('progress', (e) => progress.push(e))

    await audio.load('mock://song', { durationMs: 10_000 })
    await audio.play()

    vi.advanceTimersByTime(1_000) // 4 ticks @ 250ms
    const last = progress[progress.length - 1]
    expect(last.type).toBe('progress')
    if (last.type === 'progress') {
      expect(last.positionMs).toBe(1_000)
      expect(last.durationMs).toBe(10_000)
    }
    audio.dispose()
  })

  test('reaching the duration emits completed and stops ticking', async () => {
    const audio = new MockSongloftAudio()
    const states: string[] = []
    let progressCount = 0
    audio.on('stateChanged', (e) => states.push(e.state))
    audio.on('progress', () => progressCount++)

    await audio.load('mock://song', { durationMs: 500 })
    await audio.play()

    vi.advanceTimersByTime(500) // exactly reaches duration
    expect(states).toContain('completed')

    const countAtCompletion = progressCount
    vi.advanceTimersByTime(2_000) // interval must be stopped now
    expect(progressCount).toBe(countAtCompletion)
    audio.dispose()
  })

  test('stop before play does not throw (null handle cleared safely)', async () => {
    const audio = new MockSongloftAudio()
    await expect(audio.stop()).resolves.toBeUndefined()
    audio.dispose()
  })

  test('seek clamps to [0, duration] and emits progress', async () => {
    const audio = new MockSongloftAudio()
    let last: AudioEvent | undefined
    audio.on('progress', (e) => (last = e))
    await audio.load('mock://song', { durationMs: 5_000 })

    await audio.seek(9_999)
    expect(last?.type === 'progress' && last.positionMs).toBe(5_000)
    await audio.seek(-100)
    expect(last?.type === 'progress' && last.positionMs).toBe(0)
    audio.dispose()
  })

  test('off() removes a listener', async () => {
    const audio = new MockSongloftAudio()
    const cb = vi.fn()
    audio.on('stateChanged', cb)
    audio.off('stateChanged', cb)
    await audio.load('mock://song')
    expect(cb).not.toHaveBeenCalled()
    audio.dispose()
  })
})
