import { useEffect, useState } from '@lynx-js/react'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import { useServerStore } from '../store/server-store.js'
import './ServerListPage.css'

export function ServerListPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const profiles = useServerStore((s) => s.profiles)
  const activeProfileId = useServerStore((s) => s.activeProfileId)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Back disarms the two-tap delete instead of leaving the page with it still armed.
  useBackHandler(confirmDeleteId !== null, () => {
    setConfirmDeleteId(null)
    return true
  })

  useEffect(() => {
    void useServerStore.getState().hydrate()
  }, [])


  const onAdd = () => {
    void navigate({ to: '/settings/servers/add' })
  }

  const onTapProfile = async (id: string) => {
    if (id === activeProfileId) return
    const { hasToken } = await useServerStore.getState().switchTo(id)
    if (hasToken) {
      void navigate({ to: '/' })
    } else {
      void navigate({ to: '/login' })
    }
  }

  const onDeleteProfile = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id)
      return
    }
    await useServerStore.getState().removeProfile(id)
    setConfirmDeleteId(null)
  }

  return (
    <SubPageShell
      grouped
      title={t('servers.title')}
      // Deliberately no `onBack` — see CacheManagePage. Routing to /settings is a
      // dead key inside the settings pane, so the shell must be free to hide it.
      backTestId='servers-back'
      contentClassName='server-list__content'
      actions={(
        <view className='server-list__add' bindtap={onAdd} data-testid='servers-add'>
          <Icon name='plus' size={22} color={ICON_COLORS.primary} />
        </view>
      )}
    >
      {profiles.length === 0 ? (
        <view className='server-list__empty'>
          <text className='server-list__empty-title'>{t('servers.noServers')}</text>
          <text className='server-list__empty-hint'>{t('servers.noServersHint')}</text>
        </view>
      ) : (
        <SettingsSection title={t('servers.title')} icon='link'>
          {profiles.map((profile) => (
            <view key={profile.id} className='server-list__row-wrap'>
              <SettingsRow
                icon='link'
                title={profile.name}
                subtitle={profile.url}
                selected={profile.id === activeProfileId}
                trailingIcon={profile.id === activeProfileId ? 'check' : undefined}
                onTap={() => void onTapProfile(profile.id)}
                testId={`server-${profile.id}`}
              />
              {profile.id !== activeProfileId ? (
                <view className='server-list__actions'>
                  <view
                    className='server-list__edit'
                    bindtap={() => void navigate({ to: `/settings/servers/edit/$id`, params: { id: profile.id } })}
                    data-testid={`server-edit-${profile.id}`}
                  >
                    <text className='server-list__edit-text'>{t('servers.edit')}</text>
                  </view>
                  <view
                    className='server-list__delete'
                    bindtap={() => void onDeleteProfile(profile.id)}
                    data-testid={`server-delete-${profile.id}`}
                  >
                    <text className='server-list__delete-text'>
                      {confirmDeleteId === profile.id
                        ? t('servers.deleteConfirm')
                        : t('servers.delete')}
                    </text>
                  </view>
                </view>
              ) : null}
            </view>
          ))}
        </SettingsSection>
      )}
    </SubPageShell>
  )
}
