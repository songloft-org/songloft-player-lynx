import { readNativeModules } from '../../../native/native-modules.js'

export interface SongCacheStatus {
  cached: boolean
  path?: string
  sizeBytes?: number
}

interface NativeSongCacheModule {
  download(songId: string, url: string, callback: (json: string) => void): void
  getCachedPath(songId: string, callback: (json: string) => void): void
  remove(songId: string, callback: (json: string) => void): void
  getCacheSize(callback: (json: string) => void): void
}

function getModule(): NativeSongCacheModule | null {
  const mods = readNativeModules()
  if (!mods) return null
  const mod = mods.SongloftSongCache as Record<string, unknown> | undefined
  if (!mod || typeof mod.download !== 'function') return null
  return mod as unknown as NativeSongCacheModule
}

function invoke(run: (cb: (json: string) => void) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      run((json) => {
        const parsed = JSON.parse(json)
        if (parsed?.error) reject(new Error(parsed.error))
        else resolve(parsed)
      })
    } catch (e) {
      reject(e instanceof Error ? e : new Error('song-cache invoke failed'))
    }
  })
}

export function isSongCacheAvailable(): boolean {
  return getModule() !== null
}

export async function downloadSong(songId: number, url: string): Promise<void> {
  const mod = getModule()
  if (!mod) throw new Error('Song cache module not available')
  await invoke((cb) => mod.download(String(songId), url, cb))
}

export async function getCachedPath(songId: number): Promise<string | null> {
  const mod = getModule()
  if (!mod) return null
  const result = (await invoke((cb) => mod.getCachedPath(String(songId), cb))) as {
    path?: string
  }
  return result?.path ?? null
}

export async function removeCachedSong(songId: number): Promise<void> {
  const mod = getModule()
  if (!mod) return
  await invoke((cb) => mod.remove(String(songId), cb))
}

export async function getSongCacheSize(): Promise<number> {
  const mod = getModule()
  if (!mod) return 0
  const result = (await invoke((cb) => mod.getCacheSize(cb))) as { bytes?: number }
  return result?.bytes ?? 0
}
