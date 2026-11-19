import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { afterEach, expect, test, vi } from 'vitest'

interface Dom { window: Window & typeof globalThis }
const { JSDOM } = createRequire(import.meta.url)('jsdom') as { JSDOM: new (html: string, options: { url: string }) => Dom }
const script = readFileSync(resolve(__dirname, '../../web/audio-host.js'), 'utf8')
let dom: Dom

afterEach(() => {
  vi.restoreAllMocks()
  dom.window.close()
})

function setup() {
  dom = new JSDOM('<body><lynx-view id="app"></lynx-view></body>', { url: 'https://music.example/' })
  const { window } = dom
  const { document } = window
  const elements: HTMLAudioElement[] = []
  const app = document.getElementById('app') as HTMLElement & {
    sendGlobalEvent: (name: string, values: unknown[]) => void
    onNativeModulesCall: (name: string, data: unknown[], moduleName: string) => void
  }
  const events: { name: string; value: unknown }[] = []
  app.sendGlobalEvent = (name, [value]) => { events.push({ name, value }) }
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vm.runInNewContext(script, {
    window, document, navigator: window.navigator, URL,
    Audio: function () {
      const audio = new window.Audio()
      elements.push(audio)
      return audio
    },
    // Simulate a Web wrapper that defers JS intervals while media still plays.
    setInterval: () => 1, clearInterval: () => {},
  })
  const video = document.querySelector('video')!
  return {
    emit(element: HTMLMediaElement, name: string) { element.dispatchEvent(new window.Event(name)) },
    load() {
      app.onNativeModulesCall('load', ['https://music.example/song.mp3', null], 'SongloftAudio')
      return elements.at(-1)!
    },
    events,
    progress() { return events.filter(event => event.name === 'SongloftAudio.progress').at(-1)?.value },
    video,
  }
}

function setMediaState(media: HTMLMediaElement, duration: number, position: number, ended = false) {
  Object.defineProperties(media, {
    readyState: { configurable: true, value: media.HAVE_CURRENT_DATA },
    duration: { configurable: true, value: duration },
    ended: { configurable: true, value: ended },
  })
  media.currentTime = position
}

test('Web progress follows media timeupdates and excludes inactive elements', () => {
  const host = setup()
  const outgoing = host.load()
  const active = host.load()
  setMediaState(active, 12, 3.5)
  host.emit(active, 'play')
  host.emit(active, 'timeupdate')
  expect(host.progress()).toMatchObject({ positionMs: 3500, durationMs: 12000 })

  host.events.length = 0
  setMediaState(outgoing, 60, 58)
  setMediaState(host.video, 70, 60)
  host.emit(outgoing, 'timeupdate')
  host.emit(outgoing, 'ended')
  host.emit(host.video, 'durationchange')
  expect(host.events).toEqual([])
})

test('Web publishes duration corrections even while playback is paused', () => {
  const host = setup()
  const audio = host.load()
  setMediaState(audio, 70, 0)
  host.emit(audio, 'loadedmetadata')
  setMediaState(audio, 35, 0)
  host.emit(audio, 'durationchange')
  expect(host.progress()).toMatchObject({ positionMs: 0, durationMs: 35000 })
})

test('Web completion publishes the current media clock before notifying the queue', () => {
  const host = setup()
  const audio = host.load()
  setMediaState(audio, 20, 0)
  host.emit(audio, 'loadedmetadata')
  setMediaState(audio, 10, 10, true)
  host.emit(audio, 'ended')
  expect(host.events.slice(-2)).toMatchObject([
    { name: 'SongloftAudio.progress', value: { positionMs: 10000, durationMs: 10000 } },
    { name: 'SongloftAudio.stateChanged', value: { state: 'completed' } },
  ])
})

test('Web reports indefinite media duration as unknown while position advances', () => {
  const host = setup()
  const audio = host.load()
  setMediaState(audio, Infinity, 0)
  host.emit(audio, 'loadedmetadata')
  audio.currentTime = 4
  host.emit(audio, 'timeupdate')
  expect(host.progress()).toMatchObject({ positionMs: 4000, durationMs: 0 })
})
