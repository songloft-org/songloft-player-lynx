import { resolveVideoSourceKind } from '../../../core/network/video-source.js'
import type { Song } from '../../../models/song.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { getVideoModule } from '../../../native/video.js'
import { usePlayerStore } from '../store/index.js'

/**
 * Whether this song's picture can be put on screen here and now — the one predicate
 * behind both entry points (the player's cover badge and the library's "watch MV").
 *
 * They have to agree. The badge earned its own comment the hard way: it used to ask
 * only "is this a video song", so on Web and in a build without the host module it
 * rendered a tappable pill that did nothing. A menu item that offers the same dead
 * tap is that bug on a second surface, which is why the question lives here instead
 * of being answered twice.
 *
 * Three separate things, all required:
 *
 *  - `isVideo` — the song has a picture at all. A scan-time fact about the *original*
 *    file, so it can be true while the stream that plays has no video track (a remote
 *    song served from a cache entry transcoded with `-vn`); that case is only
 *    detectable by the host, and `openCurrentSongVideo` reports it as `'noTrack'`.
 *  - the host has a native video surface. Web has none (Lynx 4.0.x ships no video
 *    element and web-core's tag map has no entry for one) and HarmonyOS does not
 *    register the module.
 *  - the source is reachable here: not a live stream (the `/video-hls` endpoints work
 *    off a file), and not a container this platform would have to transcode.
 */
export function canWatchVideo(song: Song | null | undefined): boolean {
  if (song == null || !song.isVideo) return false
  if (!getPlatformCapabilities().video) return false
  return resolveVideoSourceKind(song, getPlatformTarget()) !== 'none'
}

/**
 * Why the picture is — or is not — on screen, for callers that must say so.
 *
 * The three failures need different words: `'noTrack'` means the file has no picture
 * to show, `'transcodeFailed'` means it has one that the server could not re-encode,
 * and both are unlike `'opened'`. Reporting the first when the second happened is how
 * a 503 without ffmpeg came to read as "this file has no video track".
 */
export type VideoOpenOutcome = 'opened' | 'noTrack' | 'transcodeFailed'

/**
 * Whether this platform puts the picture in a JS-owned page (the native host only
 * lends a surface under the Lynx view) instead of opening a native fullscreen
 * player. The two entry points agree through this predicate.
 */
export function usesJsVideoSurface(): boolean {
  return getPlatformTarget() === 'android'
}

/**
 * Put the current song's picture on screen, switching to the transcoded stream first
 * when the container needs it.
 *
 * Takes no song on purpose: the surface is lent to the engine the audio path already
 * uses, so "which picture" is decided by what is loaded, not by an argument. Callers
 * that need a *different* song than the one playing must play it first
 * (`playSong`) — otherwise this opens the picture of whatever was already there.
 *
 * The transcode wait (minutes, on a weak NAS) is inside here, unchanged: the endpoint
 * reports nothing until it is done, so callers show a pending state and get one of the
 * three outcomes at the end.
 */
export async function openCurrentSongVideo(): Promise<VideoOpenOutcome> {
  const video = getVideoModule()
  /*
   * Idempotent, and not merely for tidiness: iOS keeps a single `presentedVC`, so a
   * second `open()` overwrites it and orphans the first controller — the orphan is
   * never dismissed through `close()`, so its video output is never detached. Android
   * would start a second activity on top of the first.
   */
  if (await video.isOpen().catch(() => false)) return 'opened'

  const outcome = await usePlayerStore.getState().enterVideoSource()
  if (outcome === 'failed') return 'transcodeFailed'

  /*
   * The host alone sees the difference between "the stream has no picture" and "the
   * stream itself cannot be loaded" (`open()` returns a reason, not a boolean). Both
   * used to arrive as a bare `false` and were reported as a missing track.
   */
  const reason = await video.open()
  return reason === 'opened'
    ? 'opened'
    : reason === 'noTrack'
      ? 'noTrack'
      : 'transcodeFailed'
}
