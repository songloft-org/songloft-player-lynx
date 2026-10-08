import { isWebPlatform } from '../../native/web-platform.js'
import { readSystemInfo } from '../../native/native-modules.js'

/** The shell has a 1px border on each edge; padding scrolls with the rows. */
export function menuScrollMaxHeight({ panelMaxHeight }: { panelMaxHeight?: string } = {}): string {
  if (panelMaxHeight?.endsWith('px')) {
    return `${Math.max(0, parseFloat(panelMaxHeight) - 2)}px`
  }
  // No measured anchor: match the docked shell's 60% cap. Native scroll-view
  // needs a direct limit; relying on its parent's flex shrink clips long menus.
  if (!isWebPlatform()) {
    const info = readSystemInfo()
    const height = info?.pixelHeight
    const ratio = info?.pixelRatio
    if (typeof height === 'number' && typeof ratio === 'number'
      && Number.isFinite(height) && Number.isFinite(ratio) && height > 0 && ratio > 0) {
      return `${Math.max(0, Math.floor(height / ratio * 0.6) - 2)}px`
    }
  }
  return 'calc(60vh - 2px)'
}
