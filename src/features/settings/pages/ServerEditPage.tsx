import { useEffect, useState } from '@lynx-js/react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import { useServerStore } from '../store/server-store.js'
import './ServerEditPage.css'

export interface ServerEditPageProps {
  /**
   * Profile to edit, or omitted to add a new one.
   *
   * Only the settings detail pane passes it: in the pane there is no route, so
   * there are no `$id` params to read — the page id comes from the pane's own
   * state. As a route the two forms are two paths (`/settings/servers/add` and
   * `/settings/servers/edit/$id`) and the id comes from the params below.
   */
  editId?: string
  /**
   * Go back without a route navigation. The settings detail pane passes this so
   * server form → server list is a swap *inside* the pane; routing there would
   * unmount the whole master–detail page and drop the settings list.
   */
  onBack?: () => void
}

export function ServerEditPage({ editId: editIdProp, onBack }: ServerEditPageProps = {}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const params = useParams({ strict: false }) as { id?: string }
  const editId = editIdProp ?? params.id

  const existing = useServerStore((s) =>
    editId ? s.profiles.find((p) => p.id === editId) : undefined,
  )
  const activeProfile = useServerStore((s) =>
    s.activeProfileId ? s.profiles.find((p) => p.id === s.activeProfileId) : undefined,
  )

  const [name, setName] = useState(existing?.name ?? '')
  const [url, setUrl] = useState(existing?.url ?? '')
  const [insecureTls, setInsecureTls] = useState(existing?.insecureTls ?? false)

  // Username: for edit mode, start with existing. For add mode, inherit from
  // the currently active profile (matches Flutter's "default credentials from
  // current server" behavior). The user can clear/override either way.
  const [username, setUsername] = useState(
    existing?.username ?? activeProfile?.username ?? '',
  )

  // Password: loaded async to avoid the controlled-Input flicker (same
  // discipline as LoginPage — one write per field). Empty string means "no
  // stored password"; the save action treats empty as "clear".
  const [password, setPassword] = useState('')
  useEffect(() => {
    if (!editId) return
    let cancelled = false
    void useServerStore.getState().readCredentials(editId).then((creds) => {
      if (!cancelled && creds?.password) setPassword(creds.password)
    })
    return () => { cancelled = true }
  }, [editId])

  /** Where saving (and the shell's back arrow) lands: the server list. */
  const goBack = () => {
    if (onBack) onBack()
    else void navigate({ to: '/settings/servers' })
  }

  const canSave = name.trim().length > 0 && url.trim().length > 0

  const onSave = async () => {
    if (!canSave) return
    if (editId && existing) {
      await useServerStore.getState().editProfile(editId, {
        name,
        url,
        insecureTls,
        username: username.trim(),
        password,
      })
    } else {
      await useServerStore.getState().addProfile({
        name,
        url,
        insecureTls,
        username: username.trim(),
        password,
      })
    }
    goBack()
  }

  const title = editId ? t('servers.edit') : t('servers.add')

  return (
    <SubPageShell
      title={title}
      // Forwarded, not built here: in the pane this is a real sibling swap back to
      // the server list, so the arrow must survive. As a route `onBack` is
      // undefined and the shell falls through to `performRouteBack`, whose answer
      // (`/settings/servers`) is declared once in `shared/nav/route-back.ts`.
      onBack={onBack}
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

        <view className='server-edit__field'>
          <text className='server-edit__label'>{t('servers.username')}</text>
          <Input
            className='server-edit__input'
            type='text'
            placeholder={t('servers.usernamePlaceholder')}
            value={username}
            onInput={(value) => setUsername(value)}
          />
        </view>

        <view className='server-edit__field'>
          <text className='server-edit__label'>{t('servers.password')}</text>
          <Input
            className='server-edit__input'
            type='password'
            placeholder={t('servers.passwordPlaceholder')}
            value={password}
            onInput={(value) => setPassword(value)}
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
