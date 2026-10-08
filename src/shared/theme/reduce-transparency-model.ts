import { getSongloftStorage } from '../../core/storage/index.js'
import type { SongloftStorage } from '../../core/storage/types.js'

export const PREF_REDUCE_TRANSPARENCY = 'reduce_transparency'
let current = false
const listeners = new Set<() => void>()

export function getReduceTransparency(): boolean { return current }

export function subscribeReduceTransparency(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setLive(next: boolean): void {
  if (current === next) return
  current = next
  listeners.forEach(listener => listener())
}

export async function applySavedReduceTransparency(storage: SongloftStorage = getSongloftStorage()): Promise<void> {
  try { setLive(await storage.prefs.get(PREF_REDUCE_TRANSPARENCY) === 'true') }
  catch { setLive(false) }
}

export async function changeReduceTransparency(
  on: boolean,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  setLive(on)
  try {
    if (on) await storage.prefs.set(PREF_REDUCE_TRANSPARENCY, 'true')
    else await storage.prefs.remove(PREF_REDUCE_TRANSPARENCY)
  } catch { /* Keep the live preference when persistence is unavailable. */ }
}
