import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, activeAccentIconColor, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { usePluginIconQuery } from '../data/jsplugin-query.js'
import { isSvgIcon } from './PluginGrid.js'
import type { PluginTabEntry } from '../data/tab-config.js'

/**
 * Plugin tab icon in the nav bar.
 *
 * Most plugin icons are SVG served from the backend; we fetch the markup via
 * `usePluginIconQuery` and render with `<svg content>`. Bitmap icons use
 * `<image>`. When no icon is declared (or the SVG is still loading / failed),
 * we fall back to the `settings` glyph — the same icon the old hardcoded code
 * used for every plugin tab.
 *
 * Extracted from `ShellLayout` when the More sheet needed it too: the sheet's
 * rows list the same plugin tabs the bar does, and the fallback rule must not
 * drift between the two.
 */
export function PluginTabIcon({ tab, active }: { tab: PluginTabEntry; active: boolean }) {
  const icon = tab.icon ?? ''
  const isSvg = isSvgIcon(icon)
  const { data: markup } = usePluginIconQuery(tab.entryPath, icon, isSvg)
  // The tint style: active glyphs carry the accent (pack seedColor at render
  // time — SVG cannot read the CSS vars). Served SVG/bitmap icons keep their
  // own colours in both states; only the fallback glyph re-tints.
  const color = active ? activeAccentIconColor() : ICON_COLORS.contentMuted

  if (icon && isSvg && markup) {
    return <svg className='nav-item__plugin-icon' content={markup} />
  }
  if (icon && !isSvg) {
    return (
      <image
        className='nav-item__plugin-icon'
        mode='aspectFit'
        src={buildCoverUrl(`/api/v1/jsplugin/${tab.entryPath}/static/${icon}`)}
      />
    )
  }
  return <Icon name='settings' size={24} color={color} />
}
