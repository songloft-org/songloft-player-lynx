import { useEffect, useState } from '@lynx-js/react'

import { getSurfacePolicy, subscribeSurfacePolicy } from './surface-policy.js'
import { getReduceMotion } from './reduce-motion-model.js'
import { getAppTheme, resolveTheme, subscribeAppTheme } from './theme-model.js'

export type SurfaceAppearance = ReturnType<typeof getSurfacePolicy> & {
  theme: 'light' | 'dark'
  reduceMotion: boolean
}

let cached: SurfaceAppearance | null = null
let published: SurfaceAppearance | null = null
let disconnect: (() => void) | null = null
const listeners = new Set<() => void>()

/** Stable identity until a value consumed by a surface actually changes. */
export function getSurfaceAppearance(): SurfaceAppearance {
  const next = {
    ...getSurfacePolicy(),
    theme: resolveTheme(getAppTheme()),
    reduceMotion: getReduceMotion(),
  }
  if (cached && (Object.keys(next) as (keyof SurfaceAppearance)[]).every(key => cached![key] === next[key])) {
    return cached
  }
  cached = next
  return next
}

function refresh(): void {
  const next = getSurfaceAppearance()
  if (published === next) return
  published = next
  listeners.forEach(listener => listener())
}

/** One upstream subscription set shared by the root and all mounted blur leaves. */
export function subscribeSurfaceAppearance(listener: () => void): () => void {
  listeners.add(listener)
  if (!disconnect) {
    published = getSurfaceAppearance()
    const stopPolicy = subscribeSurfacePolicy(refresh)
    const stopTheme = subscribeAppTheme(refresh)
    disconnect = () => { stopPolicy(); stopTheme() }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      disconnect?.()
      disconnect = null
      published = null
    }
  }
}

export function useSurfaceAppearance(): SurfaceAppearance {
  const [appearance, setAppearance] = useState(getSurfaceAppearance)
  useEffect(() => {
    const update = () => setAppearance(getSurfaceAppearance())
    const unsubscribe = subscribeSurfaceAppearance(update)
    update() // Catch changes between render and the background effect attaching.
    return unsubscribe
  }, [])
  return appearance
}
