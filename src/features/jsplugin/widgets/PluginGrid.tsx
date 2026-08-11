import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { JSPlugin } from '../../../models/jsplugin.js'
import { usePluginIconQuery, usePluginsQuery } from '../data/jsplugin-query.js'
import './PluginGrid.css'

export function PluginGrid() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data } = usePluginsQuery()
  const activePlugins = (data?.plugins ?? []).filter((p) => p.isActive && p.entryPath)

  if (activePlugins.length === 0) return null

  const onTap = (plugin: JSPlugin) => {
    if (plugin.entryPath) {
      void navigate({ to: '/plugin/$entryPath', params: { entryPath: plugin.entryPath } })
    }
  }

  return (
    <view className='plugin-grid'>
      <view className='plugin-grid__header'>
        <Icon name='settings' size={18} color={ICON_COLORS.content} />
        <text className='plugin-grid__title'>{t('jsplugin.gridTitle')}</text>
      </view>
      <view className='plugin-grid__items'>
        {activePlugins.map((plugin) => (
          <PluginCard key={String(plugin.id)} plugin={plugin} onTap={() => onTap(plugin)} />
        ))}
      </view>
    </view>
  )
}

function PluginCard({ plugin, onTap }: { plugin: JSPlugin; onTap: () => void }) {
  return (
    <view className='plugin-grid__card' bindtap={onTap} data-testid={`plugin-card-${plugin.id}`}>
      <PluginIcon plugin={plugin} />
      <text className='plugin-grid__card-name'>{plugin.displayName}</text>
    </view>
  )
}

/**
 * Plugin icon, split by file type — the reason the grid used to look empty.
 *
 * Most backend plugin icons are `.svg`, and Lynx's `<image>` does not render SVG on
 * any mobile backend. The obvious fix, `<svg src={url}>`, does not work here either:
 * the native SVG element delegates URL loading to a host-registered
 * `GenericResourceFetcher`, and this Android host registers none — on device it logs
 * `getGenericResourceFetcher is null, svg fetch src failed!` and draws nothing. So
 * the markup is fetched over the app's authenticated client and handed to
 * `<svg content>`, which needs no host support (it is how `shared/ui/Icon.tsx` has
 * always worked).
 *
 * Bitmap icons keep the `<image>` path, where `mode` — not the non-existent
 * `object-fit` CSS property — controls fitting. `aspectFit` (= `contain`) rather
 * than `cover`, because cropping a non-square logo cuts the mark.
 */
function PluginIcon({ plugin }: { plugin: JSPlugin }) {
  const icon = plugin.icon ?? ''
  const entryPath = plugin.entryPath ?? ''
  const isSvg = isSvgIcon(icon)
  const { data: markup } = usePluginIconQuery(entryPath, icon, isSvg)

  if (icon && entryPath && isSvg && markup) {
    return <svg className='plugin-grid__card-icon' content={markup} />
  }
  if (icon && entryPath && !isSvg) {
    return (
      <image
        className='plugin-grid__card-icon'
        mode='aspectFit'
        src={buildCoverUrl(`/api/v1/jsplugin/${entryPath}/static/${icon}`)}
      />
    )
  }
  // No icon declared, or the SVG markup is still loading / came back unusable.
  return (
    <view className='plugin-grid__card-icon plugin-grid__card-icon--placeholder'>
      <Icon name='settings' size={24} color={ICON_COLORS.contentMuted} />
    </view>
  )
}

/** Extension sniffing on the declared filename, ignoring any query string. */
export function isSvgIcon(icon: string | undefined): boolean {
  return (icon ?? '').split('?')[0]!.trim().toLowerCase().endsWith('.svg')
}
