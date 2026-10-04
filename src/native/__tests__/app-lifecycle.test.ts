import { afterEach, expect, test, vi } from 'vitest'

import { APP_RESUMED_EVENT, subscribeAppResumed } from '../app-lifecycle.js'

afterEach(() => vi.unstubAllGlobals())

function host() {
  const listeners = new Set<() => void>()
  const emitter = {
    addListener: vi.fn((name: string, listener: () => void) => {
      expect(name).toBe(APP_RESUMED_EVENT)
      listeners.add(listener)
    }),
    removeListener: vi.fn((name: string, listener: () => void) => {
      expect(name).toBe(APP_RESUMED_EVENT)
      listeners.delete(listener)
    }),
  }
  vi.stubGlobal('lynx', {
    getJSModule: (name: string) => name === 'GlobalEventEmitter' ? emitter : null,
  })
  return { emitter, listeners, resume: () => listeners.forEach(fn => fn()) }
}

test('each subscriber receives resume and can unsubscribe independently', () => {
  const h = host()
  const first = vi.fn()
  const second = vi.fn()
  const unsubscribe = subscribeAppResumed(first)
  const stopSecond = subscribeAppResumed(second)
  h.resume()
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(1)
  unsubscribe()
  unsubscribe()
  h.resume()
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(2)
  expect(h.emitter.removeListener).toHaveBeenCalledTimes(1)
  stopSecond()
  expect(h.listeners.size).toBe(0)
})

test('a queued callback or failed native cleanup cannot reach an unmounted page', () => {
  const h = host()
  const listener = vi.fn()
  const unsubscribe = subscribeAppResumed(listener)
  const queued = [...h.listeners][0]!
  h.emitter.removeListener.mockImplementation(() => { throw new Error('host disposed') })
  expect(unsubscribe).not.toThrow()
  queued()
  expect(listener).not.toHaveBeenCalled()
})

test('missing or partial emitters are inert and do not leak listeners', () => {
  vi.stubGlobal('lynx', undefined)
  expect(subscribeAppResumed(vi.fn())).not.toThrow()
  const addListener = vi.fn()
  vi.stubGlobal('lynx', { getJSModule: () => ({ addListener }) })
  expect(subscribeAppResumed(vi.fn())).not.toThrow()
  expect(addListener).not.toHaveBeenCalled()
  vi.stubGlobal('lynx', { getJSModule: () => { throw new Error('unavailable') } })
  expect(subscribeAppResumed(vi.fn())).not.toThrow()
})
