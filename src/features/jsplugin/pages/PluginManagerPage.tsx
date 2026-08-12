import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { JSPlugin } from '../../../models/jsplugin.js'
import { usePluginsQuery } from '../data/jsplugin-query.js'
import {
  useTogglePluginMutation,
  useDeletePluginMutation,
  useUpdateAllPluginsMutation,
} from '../data/jsplugin-mutations.js'
import './PluginManagerPage.css'

export function PluginManagerPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data, isLoading, isError } = usePluginsQuery()
  const plugins = data?.plugins ?? []

  const toggleMutation = useTogglePluginMutation()
  const deleteMutation = useDeletePluginMutation()
  const updateAllMutation = useUpdateAllPluginsMutation()

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const onToggle = (plugin: JSPlugin) => {
    toggleMutation.mutate({ id: plugin.id, enable: !plugin.isActive })
  }

  const onDelete = (plugin: JSPlugin) => {
    if (confirmDeleteId !== plugin.id) {
      setConfirmDeleteId(plugin.id)
      return
    }
    deleteMutation.mutate(plugin.id, {
      onSuccess: () => setConfirmDeleteId(null),
    })
  }

  const onUpdateAll = () => {
    updateAllMutation.mutate()
  }

  return (
    <view className='plugin-manager'>
      <view className='plugin-manager__topbar'>
        <view
          className='plugin-manager__back'
          bindtap={() => navigate({ to: '/settings' })}
          data-testid='plugins-back'
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='plugin-manager__title'>{t('jsplugin.managerTitle')}</text>
        <view className='plugin-manager__topbar-actions'>
          <view className='plugin-manager__action-btn' bindtap={() => navigate({ to: '/settings/plugins/registry' })} data-testid='plugins-store'>
            <text className='plugin-manager__action-text'>{t('jsplugin.store')}</text>
          </view>
          <view
            className={updateAllMutation.isPending
              ? 'plugin-manager__action-btn plugin-manager__action-btn--disabled'
              : 'plugin-manager__action-btn'}
            bindtap={onUpdateAll}
            data-testid='plugins-update-all'
          >
            <text className='plugin-manager__action-text'>
              {updateAllMutation.isPending ? t('common.loading') : t('jsplugin.updateAll')}
            </text>
          </view>
        </view>
      </view>

      <scroll-view className='plugin-manager__scroll' scroll-y>
        {isLoading
          ? <PluginState text={t('common.loading')} testId='plugins-loading' />
          : isError
            ? <PluginState text={t('jsplugin.loadError')} testId='plugins-error' tone='error' />
            : plugins.length === 0
              ? <PluginState text={t('jsplugin.noPlugins')} testId='plugins-empty' />
              : (
                <view className='plugin-manager__list'>
                  {plugins.map((plugin) => (
                    <view key={String(plugin.id)} className='plugin-manager__item' data-testid={`plugin-item-${plugin.id}`}>
                      <view className='plugin-manager__item-info'>
                        <text className='plugin-manager__item-name'>{plugin.displayName}</text>
                        <text className='plugin-manager__item-meta'>
                          {[plugin.version, plugin.author].filter(Boolean).join(' · ') || plugin.entryPath || ''}
                        </text>
                      </view>
                      <view className='plugin-manager__item-actions'>
                        <view
                          className={plugin.isActive
                            ? 'plugin-manager__toggle plugin-manager__toggle--active'
                            : 'plugin-manager__toggle'}
                          bindtap={() => onToggle(plugin)}
                          data-testid={`plugin-toggle-${plugin.id}`}
                        >
                          <text className='plugin-manager__toggle-text'>
                            {plugin.isActive ? t('jsplugin.disable') : t('jsplugin.enable')}
                          </text>
                        </view>
                        <view
                          className={confirmDeleteId === plugin.id
                            ? 'plugin-manager__delete plugin-manager__delete--confirm'
                            : 'plugin-manager__delete'}
                          bindtap={() => onDelete(plugin)}
                          data-testid={`plugin-delete-${plugin.id}`}
                        >
                          <Icon
                            name='x'
                            size={16}
                            color={confirmDeleteId === plugin.id ? ICON_COLORS.danger : ICON_COLORS.contentMuted}
                          />
                        </view>
                      </view>
                    </view>
                  ))}
                </view>
              )}
      </scroll-view>
    </view>
  )
}

function PluginState({ text, testId, tone }: { text: string; testId?: string; tone?: 'error' }) {
  return (
    <view className='plugin-manager__state' data-testid={testId}>
      <text
        className={tone === 'error'
          ? 'plugin-manager__state-text plugin-manager__state-text--error'
          : 'plugin-manager__state-text'}
      >
        {text}
      </text>
    </view>
  )
}
