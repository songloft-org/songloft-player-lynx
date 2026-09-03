import { getSongloftStorage } from '../../core/storage/index.js'
import type { SongloftStorage } from '../../core/storage/types.js'

export const PREF_MATERIAL = 'glass_material'

export type MaterialVariant = 'ultra-thin' | 'thin' | 'regular' | 'thick'
export const MATERIAL_VARIANT_OPTIONS: readonly MaterialVariant[] = [
  'ultra-thin',
  'thin',
  'regular',
  'thick',
]

export function coerceMaterialVariant(
  raw: string | null | undefined,
): MaterialVariant {
  if (
    raw === 'ultra-thin' ||
    raw === 'thin' ||
    raw === 'regular' ||
    raw === 'thick'
  )
    return raw
  return 'regular'
}

let current: MaterialVariant = 'regular'
const listeners = new Set<() => void>()

export function getMaterialVariant(): MaterialVariant {
  return current
}

export function subscribeMaterialVariant(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setLive(next: MaterialVariant): void {
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

export async function readSavedMaterial(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<MaterialVariant> {
  return coerceMaterialVariant(await tryReadPref(storage, PREF_MATERIAL))
}

export async function applySavedMaterial(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<MaterialVariant> {
  const saved = await readSavedMaterial(storage)
  setLive(saved)
  return saved
}

export async function changeMaterialVariant(
  variant: MaterialVariant,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<MaterialVariant> {
  setLive(variant)
  try {
    if (variant === 'regular') await storage.prefs.remove(PREF_MATERIAL)
    else await storage.prefs.set(PREF_MATERIAL, variant)
  } catch {
    // best-effort
  }
  return variant
}
