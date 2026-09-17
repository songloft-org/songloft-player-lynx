import { getSongloftStorage } from '../../../core/storage/index.js'
import type { SongloftStorage } from '../../../core/storage/types.js'
import type { ScaleMode } from '../../../native/video.js'

export const PREF_VIDEO_SCALE_MODE = 'video_scale_mode'

export const DEFAULT_VIDEO_SCALE_MODE: ScaleMode = 'fit'

function coerce(value: unknown): ScaleMode {
  return value === 'zoom' ? 'zoom' : 'fit'
}

export async function readVideoScaleMode(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<ScaleMode> {
  try {
    return coerce(await storage.prefs.get(PREF_VIDEO_SCALE_MODE))
  } catch {
    return DEFAULT_VIDEO_SCALE_MODE
  }
}

export async function writeVideoScaleMode(
  mode: ScaleMode,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<void> {
  try {
    await storage.prefs.set(PREF_VIDEO_SCALE_MODE, mode)
  } catch {
    // best-effort
  }
}
