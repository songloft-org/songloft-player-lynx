import { createStore } from 'zustand/vanilla'
import { desktopCall, desktopConfig } from './client.js'
import { getAudio } from '../native/audio-facade.js'
import type { VideoModule, SurfaceRect } from '../native/video.js'

export const desktopVideoState = createStore<{
  open: boolean
  rect: SurfaceRect
}>(() => ({
  open: false,
  rect: { x: 0, y: 0, width: 0, height: 0 },
}))
let openRequest = 0
const module: VideoModule = {
  available: true,
  async open() {
    const request = ++openRequest
    const audio = getAudio()
    const ready = audio.currentSourceReady?.()
    if (!ready || !(await ready)) return 'failed'
    if (request !== openRequest || audio.currentSourceReady?.() !== ready)
      return 'failed'
    const status = await desktopCall<{
      videoWidth: number
      videoHeight: number
      ready: boolean
      error: string
    }>('player.status')
    if (request !== openRequest || audio.currentSourceReady?.() !== ready)
      return 'failed'
    if (status.error || !status.ready) return 'failed'
    if (!status.videoWidth || !status.videoHeight) return 'noTrack'
    desktopVideoState.setState({ open: true })
    return 'opened'
  },
  async close() {
    ++openRequest
    desktopVideoState.setState({ open: false })
    await desktopCall('window.fullscreen', { enabled: false })
  },
  async isOpen() {
    return desktopVideoState.getState().open
  },
  async setSurfaceLayout(rect) {
    desktopVideoState.setState({ rect })
  },
  async setOrientation() {},
  async getVideoSize() {
    const status = await desktopCall<{
      videoWidth: number
      videoHeight: number
    }>('player.status')
    return status.videoWidth > 0 && status.videoHeight > 0
      ? { width: status.videoWidth, height: status.videoHeight }
      : null
  },
}
export function desktopVideoModule() {
  return desktopConfig()?.capabilities.video ? module : null
}
export const desktopFullscreenModule = {
  fullscreenState(_request: string, callback: (json: string) => void) {
    void desktopCall('window.fullscreenState').then(
      (value) => callback(JSON.stringify(value)),
      () => callback('{"supported":false,"active":false}'),
    )
  },
  setFullscreen(request: string, callback: (json: string) => void) {
    void desktopCall('window.fullscreen', JSON.parse(request)).then(
      (value) => callback(JSON.stringify(value)),
      () => callback('{"error":"fullscreen_failed"}'),
    )
  },
}
