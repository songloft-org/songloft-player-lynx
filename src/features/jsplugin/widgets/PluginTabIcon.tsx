import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, activeAccentIconColor, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { isSvgIcon } from '../domain/plugin-icon.js'
import type { ShellPluginTabEntry } from '../data/tab-config.js'

/**
 * Plugin tab icon in the nav bar.
 *
 * The shell restores SVG markup with the tab layout. If the icon still needs
 * loading, reserve its space until the request finishes. A missing or failed
 * icon uses the settings glyph.
 *
 * Extracted from `ShellLayout` when the More sheet needed it too: the sheet's
 * rows list the same plugin tabs the bar does, and the fallback rule must not
 * drift between the two.
 */
export function PluginTabIcon({ tab, active }: { tab: ShellPluginTabEntry; active: boolean }) {
  const { icon, svgMarkup } = tab
  if (icon && isSvgIcon(icon)) {
    if (svgMarkup) return <svg className='nav-item__plugin-icon' content={svgMarkup} />
    if (svgMarkup === undefined) return <view className='nav-item__plugin-icon' />
  } else if (icon) {
    return (
      <image
        className='nav-item__plugin-icon'
        mode='aspectFit'
        src={buildCoverUrl(`/api/v1/jsplugin/${tab.entryPath}/static/${icon}`)}
      />
    )
  }
  // The tint style: active glyphs carry the accent (pack seedColor at render
  // time — SVG cannot read the CSS vars). Served SVG/bitmap icons keep their
  // own colours in both states; only the fallback glyph re-tints.
  const color = active ? activeAccentIconColor() : ICON_COLORS.contentMuted

  // Pinned: the sibling branches above are `<svg>`/`<image>` sized by
  // `--nav-icon-size` in CSS, which the font scale cannot reach. Scaling only
  // this fallback would give the same slot two different glyph sizes.
  return <Icon name='settings' size={24} color={color} scale={false} />
}
