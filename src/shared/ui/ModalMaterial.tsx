import { useEffect, useState } from '@lynx-js/react'

import { getMaterialVariant, subscribeMaterialVariant } from '../theme/material-model.js'
import { resolveMaterialTokens } from '../theme/material-tokens.js'
import { useSurfaceAppearance } from '../theme/surface-appearance.js'
import { BackdropBlur } from './BackdropBlur.js'
import './ModalMaterial.css'

/** A readable content material, independently of the compact iOS glass tint. */
export function resolveModalFill(options: Parameters<typeof resolveMaterialTokens>[0]): string {
  const fill = resolveMaterialTokens({ ...options, nativeGlass: false })['--material-fill-elevated']
  const alpha = Number(fill.slice(fill.lastIndexOf(',') + 1, -1))
  const minimum = options.theme === 'light' ? 0.94 : 0.82
  return fill.replace(/[^,]+\)$/, ` ${Math.max(alpha, minimum)})`)
}

/** Local blur, then a single tint, then the owner's foreground. No full-face ramp. */
export function ModalMaterial({ shape = 'dialog', captureTarget }: { shape?: 'dialog' | 'sheet', captureTarget?: string }) {
  const surface = useSurfaceAppearance()
  const [variant, setVariant] = useState(getMaterialVariant)
  useEffect(() => {
    const update = () => setVariant(getMaterialVariant())
    const stop = subscribeMaterialVariant(update)
    update()
    return stop
  }, [])
  const options = {
    variant,
    theme: surface.theme,
    nativeGlass: false,
    increaseContrast: surface.increaseContrast,
    opaque: surface.opaque,
  }
  const tokens = resolveMaterialTokens(options)
  const fill = resolveModalFill(options)
  return (
    <>
      <BackdropBlur className={shape === 'sheet' ? 'ui-backdrop-blur--modal-sheet' : 'ui-backdrop-blur--modal-dialog'} captureTarget={captureTarget} />
      <view
        className={`ui-modal-material ui-modal-material--${shape}`}
        flatten={false}
        accessibility-element={false}
        style={{
          backgroundColor: fill,
          boxShadow: `inset 0 1px 0 ${tokens['--material-highlight']}, var(--material-rim-sides), inset 0 -1px 0 var(--separator)`,
        }}
      />
    </>
  )
}
