import { afterEach, expect, test, vi } from 'vitest'
import { desktopVideoModule, desktopVideoState } from './video.js'
import { createDesktopAudio } from './audio.js'
import { setAudioForTests } from '../native/audio-facade.js'
import { NATIVE_EVENT } from '../native/native-audio.js'

async function setup() {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  vi.stubGlobal('lynx', {
    __globalProps: {
      songloftDesktop: {
        id: 'test',
        token: 'test',
        capabilities: { video: true },
      },
    },
    getJSModule: () => ({
      addListener: (name: string, listener: (...args: unknown[]) => void) => {
        listeners.set(name, listener)
      },
      removeListener: (name: string) => listeners.delete(name),
    }),
  })
  const status = vi.fn(() => ({
    ready: true,
    videoWidth: 640,
    videoHeight: 360,
  }))
  vi.stubGlobal('NativeModules', {
    bridge: {
      call(_name: string, request: string, reply: (json: string) => void) {
        const value =
          JSON.parse(request).method === 'player.status' ? status() : null
        reply(JSON.stringify({ ok: true, value }))
      },
    },
  })
  const audio = createDesktopAudio()
  setAudioForTests(audio)
  await audio.load('/fixture.mp4', { sourceId: 'first' })
  return {
    audio,
    status,
    video: desktopVideoModule()!,
    emit: (name: string, sourceId: string) =>
      listeners.get(name)?.({
        sourceId,
        positionMs: 0,
        code: 'fixture_error',
        message: 'Fixture error',
      }),
  }
}

afterEach(() => {
  setAudioForTests(null)
  desktopVideoState.setState({ open: false })
  vi.unstubAllGlobals()
})

test('opens the surface only after the current desktop source is ready', async () => {
  const { audio, video, status, emit } = await setup()
  const first = video.open()
  expect(status).not.toHaveBeenCalled()
  await audio.load('/next.mp4', { sourceId: 'second' })
  await expect(first).resolves.toBe('failed')
  const second = video.open()
  emit(NATIVE_EVENT.sourceReady, 'first')
  await Promise.resolve()
  expect(status).not.toHaveBeenCalled()
  emit(NATIVE_EVENT.sourceReady, 'second')
  await expect(second).resolves.toBe('opened')
  expect(desktopVideoState.getState().open).toBe(true)
  audio.dispose()
})

test('closing while the player prepares leaves the surface closed', async () => {
  const { audio, video, status, emit } = await setup()
  const opening = video.open()
  await video.close()
  emit(NATIVE_EVENT.sourceReady, 'first')
  await expect(opening).resolves.toBe('failed')
  expect(status).not.toHaveBeenCalled()
  expect(desktopVideoState.getState().open).toBe(false)
  audio.dispose()
})

test('a preparation error finishes opening without querying stale dimensions', async () => {
  const { audio, video, status, emit } = await setup()
  const opening = video.open()
  emit(NATIVE_EVENT.error, 'first')
  await expect(opening).resolves.toBe('failed')
  expect(status).not.toHaveBeenCalled()
  audio.dispose()
})
