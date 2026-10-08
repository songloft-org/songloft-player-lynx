import { getBackdropCapabilities } from '../../native/backdrop-capabilities.js'
import { getSystemAppearance, subscribeSystemAppearance } from '../../native/system-appearance.js'
import { getIncreaseContrast, subscribeIncreaseContrast } from './increase-contrast-model.js'
import { getReduceTransparency, subscribeReduceTransparency } from './reduce-transparency-model.js'

export function getSurfacePolicy() {
  const system = getSystemAppearance()
  const capabilities = getBackdropCapabilities()
  const reduceTransparency = getReduceTransparency() || system.reduceTransparency === true
  const increaseContrast = getIncreaseContrast() || system.increaseContrast === true
  const blur = capabilities.blur && !reduceTransparency
  return {
    reduceTransparency,
    increaseContrast,
    opaque: reduceTransparency || !capabilities.blur,
    blur,
    liquidGlass: blur && capabilities.liquidGlass && !increaseContrast,
    androidCapture: blur && capabilities.androidCapture,
  }
}

export function subscribeSurfacePolicy(listener: () => void): () => void {
  const unsubscribers = [
    subscribeSystemAppearance(listener),
    subscribeIncreaseContrast(listener),
    subscribeReduceTransparency(listener),
  ]
  return () => unsubscribers.forEach(unsubscribe => unsubscribe())
}
