import type { AudioLoadOptions, SongloftAudio } from './audio-types.js'
import { safeClearTimeout } from './safe-timers.js'

let nextSourceId = 0
const pending = new WeakMap<SongloftAudio, () => void>()

export class SourceLoadCancelled extends Error {
  constructor() { super('Source load cancelled') }
}

export function cancelSourceLoad(audio: SongloftAudio): void {
  pending.get(audio)?.()
}

/** load() only issues a command; this waits for native preparation + seek. */
export function loadAudioSource(audio: SongloftAudio, options: {
  url: string
  load: AudioLoadOptions
  timeoutMs?: number
}): Promise<number> {
  cancelSourceLoad(audio)
  const sourceId = `source-${++nextSourceId}`
  return new Promise<number>((resolve, reject) => {
    let settled = false
    let timer: number | null = null
    const removers: Array<() => void> = []
    const finish = (error?: Error, positionMs = 0) => {
      if (settled) return
      settled = true
      timer = safeClearTimeout(timer)
      for (const remove of removers) remove()
      if (pending.get(audio) === cancel) pending.delete(audio)
      if (error) reject(error)
      else resolve(positionMs)
    }
    const cancel = () => finish(new SourceLoadCancelled())
    pending.set(audio, cancel)
    removers.push(audio.on('sourceReady', (event) => {
      if (event.sourceId === sourceId) finish(undefined, event.positionMs)
    }))
    removers.push(audio.on('error', (event) => {
      if (event.sourceId === sourceId) finish(new Error(event.message))
    }))
    timer = setTimeout(() => finish(new Error('Source load timed out')), options.timeoutMs ?? 30_000) as unknown as number
    void audio.load(options.url, { ...options.load, sourceId }).catch((error: unknown) => {
      finish(error instanceof Error ? error : new Error(String(error)))
    })
  })
}
