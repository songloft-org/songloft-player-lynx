import { useState } from '@lynx-js/react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import { useServerStore } from '../store/server-store.js'
import './ServerEditPage.css'

export function ServerEditPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { id?: string }
  const editId = params.id

  const existing = useServerStore((s) =>
    editId ? s.profiles.find((p) => p.id === editId) : undefined,
  )

  const [name, setName] = useState(existing?.name ?? '')
  const [url, setUrl] = useState(existing?.url ?? '')
  const [insecureTls, setInsecureTls] = useState(existing?.insecureTls ?? false)

  const goBack = () => {
    void navigate({ to: '/settings/servers' })
  }

  const canSave = name.trim().length > 0 && url.trim().length > 0

  const onSave = async () => {
    if (!canSave) return
    if (editId && existing) {
      await useServerStore.getState().editProfile(editId, { name, url, insecureTls })
    } else {
      await useServerStore.getState().addProfile({ name, url, insecureTls })
    }
    goBack()
  }

  const title = editId ? t('servers.edit') : t('servers.add')

  return (
    <SubPageShell
      title={title}
      // No `onBack`: this is a plain route-back (to the server list), and only an
      // in-pane sibling swap should survive inside the pane. Where it goes is
      // declared in `shared/nav/route-back.ts`.
      backTestId='server-edit-back'
      contentClassName='server-edit__content'
    >
      <view className='server-edit__card'>
        <view className='server-edit__field'>
          <text className='server-edit__label'>{t('servers.name')}</text>
          <Input
            className='server-edit__input'
            type='text'
            placeholder={t('servers.namePlaceholder')}
            value={name}
            onInput={(value) => setName(value)}
          />
        </view>

        <view className='server-edit__field'>
          <text className='server-edit__label'>{t('servers.url')}</text>
          <Input
            className='server-edit__input'
            type='text'
            placeholder={t('servers.urlPlaceholder')}
            value={url}
            onInput={(value) => setUrl(value)}
          />
        </view>

        <view className='server-edit__toggle'>
          <AppSwitch
            checked={insecureTls}
            onChange={(checked) => setInsecureTls(checked)}
          />
          <view className='server-edit__toggle-text'>
            <text className='server-edit__toggle-title'>
              {t('settings.insecureTls')}
            </text>
            <text className='server-edit__toggle-subtitle'>
              {t('settings.insecureTlsHint')}
            </text>
          </view>
        </view>

        <view
          className={canSave ? 'server-edit__save' : 'server-edit__save server-edit__save--disabled'}
          bindtap={canSave ? () => void onSave() : undefined}
          data-testid='server-edit-save'
        >
          <text className='server-edit__save-text'>{t('settings.save')}</text>
        </view>
      </view>
    </SubPageShell>
  )
}
