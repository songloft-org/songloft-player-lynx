import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { pickAndUploadFile } from '../../../native/native-platform.js'
import type { JSPlugin } from '../../../models/jsplugin.js'
import { usePluginsQuery } from '../data/jsplugin-query.js'
import { getJSPluginApi } from '../api/index.js'
import {
  useTogglePluginMutation,
  useDeletePluginMutation,
  useUpdateAllPluginsMutation,
} from '../data/jsplugin-mutations.js'
import './PluginManagerPage.css'

export function PluginManagerPage({ onOpenStore }: { onOpenStore?: () => void }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { data, isLoading, isError, refetch } = usePluginsQuery()
  const plugins = data?.plugins ?? []

  const toggleMutation = useTogglePluginMutation()
  const deleteMutation = useDeletePluginMutation()
  const updateAllMutation = useUpdateAllPluginsMutation()

  /*
   * The dialog's visibility and its subject are separate state on purpose. Driving
   * `show` off `pendingDelete !== null` meant cancelling cleared the subject while
   * lynx-ui was still animating the panel out — so for the length of that
   * animation the dialog stayed on screen reading 「将删除「」…」 with an empty
   * name, which is what got reported as "cancel shows an extra screen".
   * The subject now outlives the close and is only replaced when the next delete
   * opens.
   */
  const [pendingDelete, setPendingDelete] = useState<JSPlugin | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  const onToggle = (plugin: JSPlugin) => {
    toggleMutation.mutate({ id: plugin.id, enable: !plugin.isActive })
  }

  /**
   * Uninstalling deletes the plugin's files and its stored data, so it asks first.
   *
   * This used to be a two-tap confirm on the `×` glyph, whose entire armed-state
   * feedback was the 16px icon turning red — indistinguishable from a hover tint,
   * and reported as "there is no confirmation".
   */
  const onConfirmDelete = () => {
    const plugin = pendingDelete
    if (!plugin) return
    setDeleteOpen(false)
    deleteMutation.mutate(plugin.id)
  }

  const onUpdateAll = () => {
    updateAllMutation.mutate()
  }

  /**
   * Open the plugin store. In the wide settings master–detail this page sits in
   * the right pane and `onOpenStore` swaps the pane to the registry in place —
   * a route navigation would unmount SettingsPage and drop the settings list. As
   * a standalone route (single-column) there is no pane, so fall back to routing.
   */
  const onStore = () => {
    if (onOpenStore) {
      onOpenStore()
    } else {
      navigate({ to: '/settings/plugins/registry' })
    }
  }

  const onInstallFromFile = async () => {
    if (installing) return
    setInstalling(true)
    setInstallError(null)
    try {
      const uploadUrl = getJSPluginApi().getUploadUrl()
      await pickAndUploadFile(uploadUrl, 'plugin', 'application/zip')
      void refetch()
    } catch (e: unknown) {
      /*
       * Never swallow this. The upload URL used to be a bare relative path with no
       * credentials, so the POST was a guaranteed 401 on every platform — and
       * because the failure landed in an empty `catch`, the button simply did
       * nothing, which is exactly how it was reported. Cancelling is not an error.
       */
      const msg = e instanceof Error ? e.message : String(e)
      if (msg !== 'cancelled') setInstallError(msg || t('jsplugin.installFailed'))
    } finally {
      setInstalling(false)
    }
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
          <view className='plugin-manager__action-btn' bindtap={onInstallFromFile} data-testid='plugins-upload'>
            <text className='plugin-manager__action-text'>
              {installing ? t('common.loading') : t('jsplugin.installFromFile')}
            </text>
          </view>
          <view className='plugin-manager__action-btn' bindtap={onStore} data-testid='plugins-store'>
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

      {installError
        ? (
          <view className='plugin-manager__error' data-testid='plugins-install-error'>
            <text className='plugin-manager__error-text'>
              {t('jsplugin.installFailed')}: {installError}
            </text>
          </view>
        )
        : null}

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
                          className='plugin-manager__delete'
                          bindtap={() => { setPendingDelete(plugin); setDeleteOpen(true) }}
                          data-testid={`plugin-delete-${plugin.id}`}
                        >
                          <Icon name='x' size={16} color={ICON_COLORS.contentMuted} />
                        </view>
                      </view>
                    </view>
                  ))}
                </view>
              )}
      </scroll-view>

      <ConfirmDialog
        show={deleteOpen}
        title={t('jsplugin.uninstallTitle')}
        message={t('jsplugin.uninstallMessage', { name: pendingDelete?.displayName ?? '' })}
        confirmLabel={t('jsplugin.uninstallConfirm')}
        onConfirm={onConfirmDelete}
        onCancel={() => setDeleteOpen(false)}
        testId='plugin-delete-dialog'
        confirmTestId='plugin-delete-confirm'
        cancelTestId='plugin-delete-cancel'
      />
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
