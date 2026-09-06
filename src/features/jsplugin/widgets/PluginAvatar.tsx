import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { JSPlugin } from '../../../models/jsplugin.js'
import { usePluginIconQuery } from '../data/jsplugin-query.js'
import { isSvgIcon } from './PluginGrid.js'
import { PluginIconTile } from './PluginIconTile.js'

/**
 * The plugin's tile in the manager list.
 *
 * It used to draw its own 36px circle inside a 2px ring whose colour carried the
 * status (running / stopped / error). The ring is gone: the row already states
 * the status twice over — a tinted dot with a text label, plus the enable switch
 * — so the ring was a third encoding of the same fact, and the circular clip cut
 * the corners off the square logos plugins ship. Status now lives only in the
 * row; the icon is the shared tile every other plugin surface uses.
 */
export function PluginAvatar({ plugin }: { plugin: JSPlugin }) {
  const icon = plugin.icon ?? ''
  const entryPath = plugin.entryPath ?? ''
  const isSvg = isSvgIcon(icon)
  const { data: markup } = usePluginIconQuery(entryPath, icon, isSvg)
  const hasIcon = Boolean(icon && entryPath)

  return (
    <PluginIconTile
      markup={hasIcon && isSvg ? markup : undefined}
      imageSrc={hasIcon && !isSvg
        ? buildCoverUrl(`/api/v1/jsplugin/${entryPath}/static/${icon}`)
        : undefined}
      name={plugin.displayName}
      testId={`plugin-avatar-${plugin.id}`}
    />
  )
}
