import { afterEach, expect, test, vi } from 'vitest'
import { resolveAudio } from '../audio-facade.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('desktop UI preview fails playback explicitly and never synthesizes progress', async () => {
  vi.stubGlobal('NativeModules', {})
  vi.stubGlobal('lynx', { __globalProps: { songloftDesktopProbe: true } })
  const audio = resolveAudio()
  const progress = vi.fn()
  audio.on('progress', progress)
  await expect(audio.load('https://example.invalid/media.mp4')).rejects.toThrow(
    'Desktop SongloftAudio is not integrated',
  )
  await expect(audio.play()).rejects.toThrow('mock playback is disabled')
  await audio.pause()
  await audio.stop()
  expect(progress).not.toHaveBeenCalled()
  audio.dispose()
})
