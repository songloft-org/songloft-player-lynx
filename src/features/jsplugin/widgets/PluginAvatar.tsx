import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { JSPlugin } from '../../../models/jsplugin.js'
import { usePluginIconQuery } from '../data/jsplugin-query.js'
import { isSvgIcon } from './PluginGrid.js'

/**
 * The plugin's tile in the manager list — its declared icon inside a ring that
 * carries the status colour (running / stopped / error), mirroring the Flutter
 * manager's `PluginIcon` + `statusColor`.
 *
 * Icon rendering follows `PluginTabIcon` / the grid's `PluginIcon`: SVG markup is
 * fetched over the authenticated client and handed to `<svg content>` (the
 * native SVG element cannot fetch URLs on this host), bitmaps go to `<image>`
 * with `aspectFit` (cropping a non-square logo cuts the mark). No usable icon →
 * the first character of the display name on a neutral tile.
 */
export function PluginAvatar({ plugin }: { plugin: JSPlugin }) {
  const icon = plugin.icon ?? ''
  const entryPath = plugin.entryPath ?? ''
  const isSvg = isSvgIcon(icon)
  const { data: markup } = usePluginIconQuery(entryPath, icon, isSvg)

  const tone = plugin.isError ? 'error' : plugin.isActive ? 'active' : 'inactive'
  const initial = plugin.displayName.slice(0, 1) || '?'

  return (
    <view className={`plugin-avatar plugin-avatar--${tone}`} data-testid={`plugin-avatar-${plugin.id}`}>
      {icon && entryPath && isSvg && markup
        ? <svg className='plugin-avatar__icon' content={markup} />
        : icon && entryPath && !isSvg
          ? (
            <image
              className='plugin-avatar__icon'
              mode='aspectFit'
              src={buildCoverUrl(`/api/v1/jsplugin/${entryPath}/static/${icon}`)}
            />
          )
          : <text className='plugin-avatar__initial'>{initial}</text>}
    </view>
  )
}
