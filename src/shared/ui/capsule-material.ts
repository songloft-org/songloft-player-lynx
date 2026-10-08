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
  return {
    backgroundColor: tokens['--material-fill'],
    boxShadow: `inset 0 1px 0 ${tokens['--material-highlight']}, var(--material-rim-sides), inset 0 -1px 0 var(--separator)`,
  }
}
