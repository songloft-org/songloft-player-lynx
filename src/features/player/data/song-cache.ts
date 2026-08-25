import { readNativeModules } from '../../../native/native-modules.js'

/**
 * TS facade over the `SongloftSongCache` native module (per-method promise
 * wrapping of its callbacks — see AGENTS §5 "调用约定").
 *
 * The module stores user-directed song caches on device. This facade exists so the
 * rest of the app never touches the bridge shape directly.
 *
 * Capability detection is deliberately **not** here: it lives in
 * `platform-capabilities.ts` (`songCache`), which probes the *new* `getCacheInfo`
 * method. Probing `download` would be wrong — its arity changed this batch, and a
 * stale shell that still has the old `download` would report "available" and then be
 * fed arguments it cannot bind. `getCacheInfo` only exists on the new module, so it
 * stands in for the whole new contract.
 */

/** Cached-song report returned by `getCacheInfo`. */
export interface SongCacheStatus {
  cached: boolean
  /** Playable `file://` URL when cached; undefined otherwise. */
  url?: string
  sizeBytes?: number
}

/**
 * Machine-readable sentinel the native side reports when a download would exceed
 * the byte cap. Shared verbatim with the Kotlin/Swift modules and asserted by the
 * native-module contract test, so the wording cannot drift.
 */
export const SONG_CACHE_LIMIT_ERROR = 'limit_exceeded'

interface NativeSongCacheModule {
  download(songId: string, url: string, ext: string, maxBytes: number, callback: (json: string) => void): void
  getCacheInfo(songId: string, callback: (json: string) => void): void
  remove(songId: string, callback: (json: string) => void): void
  getCacheSize(callback: (json: string) => void): void
  clearAll(callback: (json: string) => void): void
}

function getModule(): NativeSongCacheModule | null {
  const mods = readNativeModules()
  if (!mods) return null
  const mod = mods.SongloftSongCache as Record<string, unknown> | undefined
  // Key off the *new* method (see header note) — a stale shell lacks it.
  if (!mod || typeof mod.getCacheInfo !== 'function') return null
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

/**
 * Ensure a playable `file://` URL. The native modules already return one, but a
 * hot-updated bundle talking to an older shell could still receive a bare absolute
 * path — normalize it rather than hand the audio engine something it cannot load.
 */
function toFileUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  return value.startsWith('file://') ? value : `file://${value}`
}

/**
 * Download a song into the device cache.
 *
 * `ext` becomes the file extension (the player uses it to pick a decoder); pass the
 * container `songCacheExtOf` resolves so the name matches the bytes. `maxBytes` is
 * the storage cap — the native side aborts and reports `SONG_CACHE_LIMIT_ERROR`
 * rather than exceed it. Resolves on success; rejects with `Error(<message>)`
 * otherwise (`message === SONG_CACHE_LIMIT_ERROR` for the cap case).
 */
export async function downloadSong(
  songId: number,
  url: string,
  ext: string,
  maxBytes: number,
): Promise<void> {
  const mod = getModule()
  if (!mod) throw new Error('Song cache module not available')
  await invoke((cb) => mod.download(String(songId), url, ext, maxBytes, cb))
}

/** Report whether a song is cached, and its playable URL + size if so. */
export async function getCacheInfo(songId: number): Promise<SongCacheStatus> {
  const mod = getModule()
  if (!mod) return { cached: false }
  const result = (await invoke((cb) => mod.getCacheInfo(String(songId), cb))) as {
    cached?: boolean
    url?: string
    sizeBytes?: number
  }
  return {
    cached: result?.cached ?? false,
    url: toFileUrl(result?.url),
    sizeBytes: result?.sizeBytes,
  }
}

/**
 * Playable URL for a cached song, or `null` when it is not cached. This is the
 * lookup the player store uses to prefer the local copy; it must return the same
 * URL the native side will hand back, so it is built on `getCacheInfo`.
 */
export async function getCachedPath(songId: number): Promise<string | null> {
  const info = await getCacheInfo(songId)
  return info.cached && info.url ? info.url : null
}

/** Remove a song from the device cache (no-op when the module is absent). */
export async function removeCachedSong(songId: number): Promise<void> {
  const mod = getModule()
  if (!mod) return
  await invoke((cb) => mod.remove(String(songId), cb))
}

/** Total size of the device song cache in bytes (0 when the module is absent). */
export async function getSongCacheSize(): Promise<number> {
  const mod = getModule()
  if (!mod) return 0
  const result = (await invoke((cb) => mod.getCacheSize(cb))) as { bytes?: number }
  return result?.bytes ?? 0
}

/** Clear the entire device song cache. */
export async function clearSongCache(): Promise<void> {
  const mod = getModule()
  if (!mod) return
  await invoke((cb) => mod.clearAll(cb))
}
