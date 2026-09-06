import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { RegistryPluginEntry } from '../../../models/jsplugin.js'
import { useRegistryIconQuery } from '../data/jsplugin-query.js'
import { isSvgIcon } from './PluginGrid.js'
import { PluginIconTile } from './PluginIconTile.js'

/**
 * A store entry's tile.
 *
 * Unlike the installed-plugin surfaces, the icon here is an external URL (a
 * GitHub raw link in the common case), so the markup comes from
 * `useRegistryIconQuery` rather than the authenticated plugin-static route. The
 * tile itself is the shared one — a store entry and an installed plugin are the
 * same kind of object, and the two lists sit one tap apart.
 */
export function RegistryIcon({ entry }: { entry: RegistryPluginEntry }) {
  const icon = entry.icon ?? ''
  const resolved = icon ? buildCoverUrl(icon) : ''
  const isSvg = isSvgIcon(icon)
  const { data: markup } = useRegistryIconQuery(resolved, isSvg)

  return (
    <PluginIconTile
      markup={isSvg ? markup : undefined}
      imageSrc={icon && !isSvg ? resolved : undefined}
      name={entry.name}
      testId='registry-icon'
    />
  )
}
