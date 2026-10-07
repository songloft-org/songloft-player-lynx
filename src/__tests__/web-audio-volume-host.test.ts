import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { expect, test } from 'vitest'

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
