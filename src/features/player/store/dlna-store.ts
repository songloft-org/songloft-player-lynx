import { create } from 'zustand'
import type { Song } from '../../../models/song.js'
import { getDlnaModule, type DlnaDevice, type DlnaAction } from '../../../native/dlna.js'
import { dlnaMedia } from '../data/dlna-media.js'

interface DlnaSession {
  activeDevice: DlnaDevice | null
  isPlaying: boolean
  isBusy: boolean
  positionMs: number
  durationMs: number
  error: string | null
  castTo(device: DlnaDevice, song: Song): Promise<void>
  castSong(song: Song): Promise<void>
  togglePlay(): Promise<void>
  seek(positionMs: number): Promise<void>
  setVolume(volume: number): Promise<void>
  disconnect(): Promise<void>
}

let pauseLocal: () => Promise<void> = async () => { }
let onCompleted: () => void = () => { }
let generation = 0
let queue: Promise<unknown> = Promise.resolve()
let pollTimer: ReturnType<typeof setTimeout> | null = null
let sawPlaying = false
let pendingDevice: DlnaDevice | null = null

/** Inject the local player without a circular store import. */
export function configureDlnaPlayer(callbacks: { pauseLocal(): Promise<void>; onCompleted(): void }): void {
  pauseLocal = callbacks.pauseLocal
  onCompleted = callbacks.onCompleted
}

function serialized<T>(action: () => Promise<T>): Promise<T> {
  const result = queue.then(action, action)
  queue = result.catch(() => { })
  return result
}

function cancelPoll(): void {
  if (pollTimer !== null) clearTimeout(pollTimer)
  pollTimer = null
}

function schedulePoll(): void {
  cancelPoll()
  if (!useDlnaStore.getState().activeDevice) return
  pollTimer = setTimeout(() => { void pollPlayback() }, 2_000)
}

/** Query AVTransport, independently of the cast page's mount lifecycle. */
export async function pollPlayback(): Promise<void> {
  cancelPoll()
  const session = useDlnaStore.getState()
  const device = session.activeDevice
  const gen = generation
  if (!device || session.isBusy) { schedulePoll(); return }
  try {
    const status = await serialized(() => getDlnaModule().getPlaybackState(device.id))
    if (gen !== generation || !useDlnaStore.getState().activeDevice) return
    if (status) {
      const playing = status.state === 'PLAYING'
      const stopped = status.state === 'STOPPED' || status.state === 'NO_MEDIA_PRESENT'
      const completed = stopped && sawPlaying && useDlnaStore.getState().isPlaying
      if (playing) sawPlaying = true
      if (stopped) sawPlaying = false
      useDlnaStore.setState({
        positionMs: status.positionMs,
        ...(status.durationMs > 0 ? { durationMs: status.durationMs } : {}),
        ...(playing || stopped || status.state.startsWith('PAUSED') ? { isPlaying: playing } : {}),
      })
      if (completed) onCompleted()
    }
  } catch {
    // Renderers may close the connection while changing tracks; retry next poll.
  } finally {
    schedulePoll()
  }
}

export const useDlnaStore = create<DlnaSession>((set, get) => {
  async function castTo(device: DlnaDevice, song: Song): Promise<void> {
    if (!song.url || !getDlnaModule().available) return
    const gen = ++generation
    sawPlaying = false
    set({ isBusy: true, error: null })
    try {
      await serialized(async () => {
        if (gen !== generation) return
        pendingDevice = device
        await getDlnaModule().cast({ deviceId: device.id, title: song.title, ...dlnaMedia(song) })
        if (gen !== generation) return
        await pauseLocal()
        if (gen !== generation) return
        const oldDevice = get().activeDevice
        if (oldDevice && oldDevice.id !== device.id) {
          await getDlnaModule().control('stop', { deviceId: oldDevice.id })
        }
        set({
          activeDevice: device, isPlaying: true, isBusy: false, positionMs: 0,
          durationMs: Math.max(0, Math.round(song.duration * 1000)), error: null
        })
      })
    } catch (error) {
      if (gen === generation) set({ isBusy: false, error: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      if (pendingDevice?.id === device.id) pendingDevice = null
      schedulePoll()
    }
  }

  async function control(action: DlnaAction | 'toggle', value?: number): Promise<void> {
    const device = get().activeDevice
    if (!device) return
    const gen = generation
    try {
      await serialized(async () => {
        if (gen !== generation) return
        const command = action === 'toggle' ? (get().isPlaying ? 'pause' : 'play') : action
        await getDlnaModule().control(command, { deviceId: device.id, value })
        if (gen !== generation) return
        if (command === 'play' || command === 'pause') {
          sawPlaying = false
          set({ isPlaying: command === 'play', error: null })
        }
        if (action === 'seek') set({ positionMs: (value ?? 0) * 1000 })
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  return {
    activeDevice: null, isPlaying: false, isBusy: false, positionMs: 0, durationMs: 0, error: null,
    castTo,
    async castSong(song) { const device = get().activeDevice; if (device) await castTo(device, song) },
    async togglePlay() { await control('toggle') },
    async seek(positionMs) { await control('seek', Math.max(0, Math.floor(positionMs / 1000))) },
    async setVolume(volume) { await control('volume', Math.min(100, Math.max(0, Math.round(volume)))) },
    async disconnect() {
      const device = get().activeDevice
      const pending = pendingDevice
      ++generation
      sawPlaying = false
      cancelPoll()
      set({ isBusy: true })
      try {
        if (device) await serialized(() => getDlnaModule().control('stop', { deviceId: device.id }))
        if (pending && pending.id !== device?.id) await serialized(() => getDlnaModule().control('stop', { deviceId: pending.id }))
        set({ activeDevice: null, isPlaying: false, isBusy: false, positionMs: 0, durationMs: 0, error: null })
      } catch (error) {
        set({ isBusy: false, error: error instanceof Error ? error.message : String(error) })
        schedulePoll()
        throw error
      }
    },
  }
})
