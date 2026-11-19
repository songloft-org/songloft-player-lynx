import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { expect, test, vi } from 'vitest'

interface Dom { window: Window & typeof globalThis }
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string, options: { url: string }) => Dom }

test('Web getVolume forwards the real audio volume through the existing event channel', () => {
  const dom = new JSDOM('<body><lynx-view id="app"></lynx-view></body>', { url: 'https://music.example/songloft/' })
  try {
    const app = dom.window.document.getElementById('app') as HTMLElement & {
      sendGlobalEvent: (name: string, values: unknown[]) => void
      onNativeModulesCall: (name: string, data: unknown[], moduleName: string) => void
    }
    const events: { name: string; values: unknown[] }[] = []
    app.sendGlobalEvent = (name, values) => { events.push({ name, values }) }
    const context = vm.createContext({
      window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
      Audio: dom.window.Audio, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    })
    vm.runInContext(readFileSync(resolve(__dirname, '../../web/audio-host.js'), 'utf8'), context)
    app.onNativeModulesCall('getVolume', [], 'SongloftAudio')
    expect(events.at(-1)).toEqual({ name: 'SongloftAudio.volumeChanged', values: [{ volume: 100 }] })
    app.onNativeModulesCall('setVolume', [0.37], 'SongloftAudio')
    app.onNativeModulesCall('getVolume', [], 'SongloftAudio')
    expect(events.at(-1)).toEqual({ name: 'SongloftAudio.volumeChanged', values: [{ volume: 37 }] })
  } finally { dom.window.close() }
})

test('Web media play and pause send explicit user intent even when audio is already paused', () => {
  const dom = new JSDOM('<body><lynx-view id="app"></lynx-view></body>', { url: 'https://music.example/' })
  const handlers = new Map<string, () => void>()
  const events: { name: string; values: unknown[] }[] = []
  const play = vi.spyOn(dom.window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const pause = vi.spyOn(dom.window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  try {
    Object.defineProperty(dom.window.navigator, 'mediaSession', { value: {
      setActionHandler: (name: string, handler: () => void) => handlers.set(name, handler),
    } })
    const app = dom.window.document.getElementById('app') as HTMLElement & {
      sendGlobalEvent: (name: string, values: unknown[]) => void
      onNativeModulesCall: (name: string, data: unknown[], moduleName: string) => void
    }
    app.sendGlobalEvent = (name, values) => { events.push({ name, values }) }
    const context = vm.createContext({
      window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
      Audio: dom.window.Audio, MediaMetadata: class {}, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    })
    vm.runInContext(readFileSync(resolve(__dirname, '../../web/audio-host.js'), 'utf8'), context)
    app.onNativeModulesCall('setQueue', [[{ id: 1, title: 'Station', url: 'https://radio.test/live' }], 0], 'SongloftAudio')
    handlers.get('pause')!()
    handlers.get('play')!()
    expect(pause).toHaveBeenCalled()
    expect(play).toHaveBeenCalled()
    expect(events.filter(e => e.name === 'SongloftAudio.remoteCommand').map(e => e.values[0])).toEqual([
      { command: 'pause' }, { command: 'play' },
    ])
  } finally {
    play.mockRestore()
    pause.mockRestore()
    dom.window.close()
  }
})

test('Web plugin EQ waits for an active context and clearing restores the user gains', async () => {
  const dom = new JSDOM('<body><lynx-view id="app"></lynx-view></body>', { url: 'https://music.example/' })
  const createMediaElementSource = vi.fn(() => ({ connect() {}, disconnect() {} }))
  const filters: { gain: { value: number } }[] = []
  let unlocked = false
  class AudioContext {
    get state() { return unlocked ? 'running' : 'suspended' }
    readonly destination = {}
    createMediaElementSource = createMediaElementSource
    async resume() {}
    async close() {}
    createBiquadFilter() {
      const filter = { frequency: {}, Q: {}, gain: { value: 0 }, connect() {}, disconnect() {} }
      filters.push(filter)
      return filter
    }
  }
  try {
    const app = dom.window.document.getElementById('app') as HTMLElement & {
      onNativeModulesCall: (name: string, args: unknown[], namespace: string) => unknown
    }
    const context = vm.createContext({
      window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
      Audio: dom.window.Audio, AudioContext, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    })
    vm.runInContext(readFileSync(resolve(__dirname, '../../web/audio-host.js'), 'utf8'), context)
    const audio = (method: string, args: unknown[] = []) => app.onNativeModulesCall(method, args, 'SongloftAudio')
    const profile = JSON.stringify({ gains: Array(10).fill(-3) })
    audio('setEqualizerBand', [0, 2])
    expect(await audio('setPluginEqualizer', [profile])).toBe(false)
    expect(createMediaElementSource).not.toHaveBeenCalled()
    unlocked = true
    expect(await audio('setPluginEqualizer', [profile])).toBe(true)
    expect(filters[0].gain.value).toBe(-3)
    expect(await audio('setPluginEqualizer', [''])).toBe(true)
    expect(filters[0].gain.value).toBe(2)
  } finally { dom.window.close() }
})
