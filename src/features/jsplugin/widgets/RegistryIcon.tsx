import { useState } from '@lynx-js/react'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { RegistryPluginEntry } from '../../../models/jsplugin.js'
import { useRegistryIconQuery } from '../data/jsplugin-query.js'
import { isSvgIcon } from './PluginGrid.js'
import './RegistryIcon.css'

/**
 * A store entry's tile, mirroring the Flutter registry's `_buildIcon`: the
 * entry's declared icon (external URL in the common case) or the first letter
 * of its name on a neutral tile.
 *
 * SVG icons follow the app-wide `<svg content>` path — the native SVG element
 * cannot fetch URLs on this host — with the markup fetched over the HTTP
 * client; bitmaps go to `<image>` and fall back to the initial on load error.
 */
export function RegistryIcon({ entry }: { entry: RegistryPluginEntry }) {
  const [bitmapFailed, setBitmapFailed] = useState(false)
  const icon = entry.icon ?? ''
  const resolved = icon ? buildCoverUrl(icon) : ''
  const isSvg = isSvgIcon(icon)
  const { data: markup } = useRegistryIconQuery(resolved, isSvg)

  const initial = entry.name.slice(0, 1).toUpperCase() || '?'

  return (
    <view className='registry-icon' data-testid='registry-icon'>
      {icon && isSvg && markup
        ? <svg className='registry-icon__img' content={markup} />
        : icon && !isSvg && !bitmapFailed
          ? (
            <image
              className='registry-icon__img'
              mode='aspectFit'
              src={resolved}
              binderror={() => setBitmapFailed(true)}
            />
          )
          : <text className='registry-icon__initial'>{initial}</text>}
    </view>
  )
}
