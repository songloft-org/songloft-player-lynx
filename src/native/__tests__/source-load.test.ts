import { afterEach, describe, expect, test, vi } from 'vitest'

import { NativeSongloftAudio, NATIVE_EVENT, type SongloftAudioNativeModule } from '../native-audio.js'
import { cancelSourceLoad, loadAudioSource, SourceLoadCancelled } from '../source-load.js'

function fixture(version: number | null = 1) {
  const handlers = new Map<string, (...args: unknown[]) => void>()
  const load = vi.fn()
  const native = {
    load, stop: vi.fn(), pause: vi.fn(), play: vi.fn(), dispose: vi.fn(),
    getSourceLoadVersion: version === null ? undefined : (callback: (value: number) => void) => callback(version),
  } as unknown as SongloftAudioNativeModule
  const audio = new NativeSongloftAudio(native, {
    addListener: (name, listener) => { handlers.set(name, listener) },
    removeListener: (name) => { handlers.delete(name) },
  })
  return { audio, load, native, fire: (name: string, data: unknown) => handlers.get(name)?.(data) }
}

afterEach(() => vi.useRealTimers())

describe('source load confirmation', () => {
  test('issuance and unrelated ready are insufficient; matching ready resolves actual seek position', async () => {
    const { audio, load, fire } = fixture()
    expect(await audio.getSourceLoadVersion()).toBe(1)
    const progress = vi.fn()
    audio.on('progress', progress)
    let done = false
    const task = loadAudioSource(audio, { url: 'http://a', load: { initialPositionMs: 5500, autoplay: false } })
    void task.then(() => { done = true })
    await Promise.resolve()
    const options = load.mock.calls[0][1]
    expect(options).toMatchObject({ initialPositionMs: 5500, autoplay: false })
    fire(NATIVE_EVENT.sourceReady, { sourceId: 'old', positionMs: 0 })
    fire(NATIVE_EVENT.progress, { sourceId: 'old', positionMs: 0 })
    fire(NATIVE_EVENT.progress, { positionMs: 0 })
    await Promise.resolve()
    expect(done).toBe(false)
    expect(progress).not.toHaveBeenCalled()
    fire(NATIVE_EVENT.sourceReady, { sourceId: options.sourceId, positionMs: 5480 })
    expect(await task).toBe(5480)
    audio.dispose()
  })

  test('replacement cancels the old waiter and late confirmation cannot finish the new source', async () => {
    const { audio, load, fire } = fixture()
    await audio.getSourceLoadVersion()
    const first = loadAudioSource(audio, { url: 'http://a', load: {} }).catch((error) => error)
    await Promise.resolve()
    const oldId = load.mock.calls[0][1].sourceId
    const second = loadAudioSource(audio, { url: 'http://b', load: {} })
    await Promise.resolve()
    expect(await first).toBeInstanceOf(SourceLoadCancelled)
    fire(NATIVE_EVENT.sourceReady, { sourceId: oldId, positionMs: 2 })
    fire(NATIVE_EVENT.sourceReady, { sourceId: load.mock.calls[1][1].sourceId, positionMs: 7 })
    expect(await second).toBe(7)
    audio.dispose()
  })

  test('source error, timeout and stop terminate waiters', async () => {
    vi.useFakeTimers()
    const { audio, load, fire } = fixture()
    await audio.getSourceLoadVersion()
    const failed = loadAudioSource(audio, { url: 'http://a', load: {} })
    const failure = expect(failed).rejects.toThrow('HTTP 404')
    await Promise.resolve()
    fire(NATIVE_EVENT.error, { sourceId: load.mock.calls[0][1].sourceId, message: 'HTTP 404' })
    await failure
    const timeout = loadAudioSource(audio, { url: 'http://a', load: {}, timeoutMs: 100 })
    const timedOut = expect(timeout).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(100)
    await timedOut
    const stopped = loadAudioSource(audio, { url: 'http://a', load: {} }).catch((error) => error)
    await audio.stop()
    expect(await stopped).toBeInstanceOf(SourceLoadCancelled)
    cancelSourceLoad(audio)
    audio.dispose()
  })

  test.each([null, 0, 2])('unsupported contract %s never receives new options', async (version) => {
    const { audio, load } = fixture(version)
    expect(await audio.getSourceLoadVersion()).toBe(0)
    await expect(audio.load('http://a', { sourceId: 'new' })).rejects.toThrow('unavailable')
    expect(load).not.toHaveBeenCalled()
    await audio.load('http://old')
    expect(load).toHaveBeenCalledWith('http://old', {})
    audio.dispose()
  })
})
