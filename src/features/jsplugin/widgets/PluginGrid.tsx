import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { JSPlugin } from '../../../models/jsplugin.js'
import { usePluginsQuery } from '../data/jsplugin-query.js'
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
  const iconSrc = plugin.icon && plugin.entryPath
    ? buildCoverUrl(`/api/v1/jsplugin/${plugin.entryPath}/static/${plugin.icon}`)
    : ''

  return (
    <view className='plugin-grid__card' bindtap={onTap} data-testid={`plugin-card-${plugin.id}`}>
      {iconSrc
        ? (
          // `mode` is Lynx's fitting control — `<image>` has no `object-fit` CSS
          // property (the declaration that used to sit in the stylesheet was
          // dropped at template encode). `aspectFit` (= `contain`) rather than the
          // old `cover`: these are logos, and cropping a non-square one cuts the
          // mark. ⚠️ Most of these icons are `.svg`, which the native `<image>`
          // does not render at all — see the note in PROGRESS.
          <image className='plugin-grid__card-icon' mode='aspectFit' src={iconSrc} />
        )
        : (
          <view className='plugin-grid__card-icon plugin-grid__card-icon--placeholder'>
            <Icon name='settings' size={24} color={ICON_COLORS.contentMuted} />
          </view>
        )}
      <text className='plugin-grid__card-name'>{plugin.displayName}</text>
    </view>
  )
}
