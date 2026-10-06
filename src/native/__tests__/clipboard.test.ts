import { afterEach, expect, test, vi } from 'vitest'
import { copyToClipboard } from '../native-platform.js'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
function host(method?: (text: string, callback: (error: string | null) => void) => void) {
  vi.stubGlobal('NativeModules', { SongloftPlatform: { openURL() {}, setClipboardWithResult: method } })
}

test('copy waits for an explicit acknowledgement and preserves Unicode', async () => {
  let finish!: (error: string | null) => void
  host((text, callback) => { expect(text).toBe('中文🎵\n路径'); finish = callback })
  let done = false
  const task = copyToClipboard('中文🎵\n路径').then(() => { done = true })
  await Promise.resolve()
  expect(done).toBe(false)
  finish(null)
  await task
  expect(done).toBe(true)
  finish('late_error')
})

test('old shells do not call the void method or report success', async () => {
  const legacy = vi.fn()
  vi.stubGlobal('NativeModules', { SongloftPlatform: { openURL() {}, setClipboard: legacy } })
  await expect(copyToClipboard('text')).rejects.toThrow('clipboard_unavailable')
  expect(legacy).not.toHaveBeenCalled()
})

test('host rejection, exceptions and a missing acknowledgement fail', async () => {
  host((_text, callback) => callback('clipboard_failed'))
  await expect(copyToClipboard('text')).rejects.toThrow('clipboard_failed')
  host(() => { throw new Error('denied') })
  await expect(copyToClipboard('text')).rejects.toThrow('clipboard_failed')
  host((_text, callback) => callback(undefined as unknown as null))
  await expect(copyToClipboard('text')).rejects.toThrow('clipboard_failed')
})

test('a host stub times out and a late callback cannot change failure', async () => {
  vi.useFakeTimers()
  let finish!: (error: string | null) => void
  host((_text, callback) => { finish = callback })
  const task = expect(copyToClipboard('text')).rejects.toThrow('clipboard_timeout')
  await vi.advanceTimersByTimeAsync(15000)
  await task
  finish(null)
})
