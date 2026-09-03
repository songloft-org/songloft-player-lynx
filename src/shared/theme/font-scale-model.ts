import { getSongloftStorage } from '../../core/storage/index.js'
import type { SongloftStorage } from '../../core/storage/types.js'

export const PREF_FONT_SCALE = 'font_scale'

export type FontScaleOption = 'small' | 'default' | 'large' | 'xlarge'
export const FONT_SCALE_OPTIONS: readonly FontScaleOption[] = [
  'small',
  'default',
  'large',
  'xlarge',
]

const SCALE_VALUES: Record<FontScaleOption, number> = {
  small: 0.85,
  default: 1,
  large: 1.15,
  xlarge: 1.3,
}

export function fontScaleValue(option: FontScaleOption): number {
  return SCALE_VALUES[option]
}

export function coerceFontScale(raw: string | null | undefined): FontScaleOption {
  if (raw === 'small' || raw === 'large' || raw === 'xlarge') return raw
  return 'default'
}

let current: FontScaleOption = 'default'
const listeners = new Set<() => void>()

export function getFontScale(): FontScaleOption {
  return current
}

export function getFontScaleNumber(): number {
  return SCALE_VALUES[current]
}

export function subscribeFontScale(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setLive(next: FontScaleOption): void {
  if (current === next) return
  current = next
  listeners.forEach((l) => l())
}

async function tryReadPref(
  storage: SongloftStorage,
  key: string,
): Promise<string | null> {
  try {
    return await storage.prefs.get(key)
  } catch {
    return null
  }
}

export async function readSavedFontScale(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<FontScaleOption> {
  return coerceFontScale(await tryReadPref(storage, PREF_FONT_SCALE))
}

export async function applySavedFontScale(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<FontScaleOption> {
  const saved = await readSavedFontScale(storage)
  setLive(saved)
  return saved
}

export async function changeFontScale(
  option: FontScaleOption,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<FontScaleOption> {
  setLive(option)
  try {
    if (option === 'default') await storage.prefs.remove(PREF_FONT_SCALE)
    else await storage.prefs.set(PREF_FONT_SCALE, option)
  } catch {
    // best-effort
  }
  return option
}
