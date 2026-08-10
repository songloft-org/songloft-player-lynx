import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { JSPlugin } from '../../../models/jsplugin.js'
import { usePluginsQuery } from '../data/jsplugin-query.js'
import './PluginGrid.css'

export function PluginGrid() {
  const { t } = useTranslation()
  const { data } = usePluginsQuery()
  const activePlugins = (data?.plugins ?? []).filter((p) => p.isActive && p.entryPath)

  if (activePlugins.length === 0) return null

  return (
    <view className='plugin-grid'>
      <view className='plugin-grid__header'>
        <Icon name='settings' size={18} color={ICON_COLORS.content} />
        <text className='plugin-grid__title'>{t('jsplugin.gridTitle')}</text>
      </view>
      <view className='plugin-grid__items'>
        {activePlugins.map((plugin) => (
          <PluginCard key={String(plugin.id)} plugin={plugin} />
        ))}
      </view>
    </view>
  )
}

function PluginCard({ plugin }: { plugin: JSPlugin }) {
  const iconSrc = plugin.icon && plugin.entryPath
    ? buildCoverUrl(`/api/v1/jsplugin/${plugin.entryPath}/static/${plugin.icon}`)
    : ''

  return (
    <view className='plugin-grid__card' data-testid={`plugin-card-${plugin.id}`}>
      {iconSrc
        ? <image className='plugin-grid__card-icon' src={iconSrc} />
        : (
          <view className='plugin-grid__card-icon plugin-grid__card-icon--placeholder'>
            <Icon name='settings' size={24} color={ICON_COLORS.contentMuted} />
          </view>
        )}
      <text className='plugin-grid__card-name'>{plugin.displayName}</text>
    </view>
  )
}
