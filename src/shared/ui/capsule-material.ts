import { useEffect, useState } from '@lynx-js/react'

import { getMaterialVariant, subscribeMaterialVariant } from '../theme/material-model.js'
import { resolveMaterialTokens } from '../theme/material-tokens.js'
import { useSurfaceAppearance } from '../theme/surface-appearance.js'

/** Tint sits above the captured bitmap. Write resolved paint directly so the
 * native leaf consumes live thickness and accessibility values without relying
 * on inherited runtime variables. Share the root's policy and token resolver. */
export function useCapsuleMaterialStyle() {
  const surface = useSurfaceAppearance()
  const [variant, setVariant] = useState(getMaterialVariant)
  useEffect(() => {
    const update = () => setVariant(getMaterialVariant())
    const unsubscribe = subscribeMaterialVariant(update)
    update()
    return unsubscribe
  }, [])
  const tokens = resolveMaterialTokens({
    variant,
    theme: surface.theme,
    nativeGlass: surface.liquidGlass,
    increaseContrast: surface.increaseContrast,
    opaque: surface.opaque,
  })
  // Match Flutter's capsule fill, including its .7 tint factor for a lens.
  // Modal/menu fills have their own readability constraints and must not
  // inherit this lighter optical material.
  const referenceAlpha = (surface.theme === 'light' ? 0.72 : 0.68) * (surface.androidGlass || surface.webGlass || surface.harmonyGlass ? 0.7 : 1)
  const fill = tokens['--material-fill']
  const alpha = Number(fill.slice(fill.lastIndexOf(',') + 1, -1))
  const capsuleFill =
    surface.opaque || surface.increaseContrast || surface.liquidGlass
      ? fill
      : fill.replace(/[^,]+\)$/, ` ${Number(((alpha * referenceAlpha) / 0.85).toFixed(3))})`)
  return {
    backgroundColor: capsuleFill,
    backgroundImage: 'none',
    boxShadow: `inset 0 1px 0 ${tokens['--material-highlight']}, var(--material-rim-sides), inset 0 -1px 0 var(--separator)`,
  }
}
