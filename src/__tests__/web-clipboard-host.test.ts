import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { expect, test, vi } from 'vitest'

type Reply = { error: string | null } | undefined
const platformFactory = vm.runInNewContext(`(${readFileSync(
  resolve(__dirname, '../../web/songloft-platform-module.js'), 'utf8',
).replace('export default', '')})`) as (
  modules: Record<string, never>, call: (method: string, args: unknown[]) => Promise<Reply>,
) => { setClipboardWithResult: (text: string, callback: (error: string | null) => void) => void }

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string) => { window: Window & typeof globalThis }
}
function host(clipboard?: { writeText: (text: string) => Promise<void> }) {
  const dom = new JSDOM('<body><lynx-view id="app"></lynx-view></body>')
  const fallback = vi.fn().mockReturnValue(false)
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: clipboard })
  Object.defineProperty(dom.window.document, 'execCommand', { value: fallback })
  const app = dom.window.document.getElementById('app') as HTMLElement & {
    onNativeModulesCall: (method: string, args: unknown[], module: string) => Promise<{ error: string | null }>
  }
  vm.runInContext(readFileSync(resolve(__dirname, '../../web/audio-host.js'), 'utf8'), vm.createContext({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    Audio: dom.window.Audio, URL, setTimeout, clearTimeout, setInterval, clearInterval,
  }))
  return { dom, fallback, copy: (text: string) => app.onNativeModulesCall('setClipboardWithResult', [text], 'SongloftPlatform') }
}

test('Web confirms only after the asynchronous clipboard accepts the text', async () => {
  let finish!: () => void
  const writeText = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const h = host({ writeText })
  try {
    let done = false
    const task = h.copy('中文🎵\n路径').then(result => { done = true; return result })
    await Promise.resolve()
    expect(done).toBe(false)
    finish()
    expect(await task).toEqual({ error: null })
    expect(writeText).toHaveBeenCalledWith('中文🎵\n路径')
    expect(h.fallback).not.toHaveBeenCalled()
  } finally { h.dom.window.close() }
})

test('denial or an insecure context uses the fallback result and cleans temporary input', async () => {
  for (const clipboard of [undefined, { writeText: () => Promise.reject(new Error('denied')) }]) {
    const h = host(clipboard)
    try {
      expect(await h.copy('text')).toEqual({ error: 'clipboard_failed' })
      h.fallback.mockReturnValue(true)
      expect(await h.copy('text')).toEqual({ error: null })
      h.fallback.mockImplementation(() => { throw new Error('blocked') })
      expect(await h.copy('text')).toEqual({ error: 'clipboard_failed' })
      expect(h.dom.window.document.querySelector('textarea')).toBeNull()
    } finally { h.dom.window.close() }
  }
})

test('Worker proxy rejects RPC failure and absent host results instead of false success', async () => {
  for (const result of [{ error: null }, { error: 'clipboard_failed' }, undefined]) {
    const callback = vi.fn()
    const proxy = platformFactory({}, () => Promise.resolve(result))
    proxy.setClipboardWithResult('text', callback)
    await Promise.resolve()
    expect(callback).toHaveBeenCalledWith(result?.error === null ? null : 'clipboard_failed')
  }
  const callback = vi.fn()
  platformFactory({}, () => Promise.reject(new Error('rpc'))).setClipboardWithResult('text', callback)
  await Promise.resolve()
  expect(callback).toHaveBeenCalledWith('clipboard_failed')
})
