import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import { appConfig } from '../../../core/config/app-config.js'
import { getQueryClient } from '../../../lib/query/index.js'
import { useAppSessionStore } from '../../../store/index.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { applyServerSettings } from '../data/settings-prefs.js'
import './ServerSettingsPage.css'

/**
 * Server settings sub-page (`/settings/server`, inside the shell). Standalone
 * deployments switch the API base URL + insecure-TLS opt-in here, reusing the
 * batch-3 login address logic via `applyServerSettings` (writes `appConfig` +
 * `SongloftStorage.prefs`). The switch is immediately effective: the auth'd
 * `HttpClient` reads `appConfig.resolvedBaseUrl` live on every request.
 *
 * Embedded builds hide the login address controls entirely, so this page simply
 * shows a note (it should not be reachable — the Connection section that links
 * here is standalone-only — but it degrades gracefully if it is).
 */
export function ServerSettingsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const goBack = () => {
    void navigate({ to: '/settings' })
  }

  const editable = !appConfig.isEmbedded
  const [url, setUrl] = useState(appConfig.baseUrl)
  const [insecureTls, setInsecureTls] = useState(appConfig.insecureTls)
  const [saved, setSaved] = useState(false)

  const canSave = editable && url.trim().length > 0

  const onSave = async () => {
    if (!canSave) return
    const normalized = await applyServerSettings({ url, insecureTls })
    // Reflect the new base into the reactive session store (UI concern).
    useAppSessionStore.getState().setBaseUrl(normalized)
    // Invalidate cached data from the previous server — stale entries would
    // otherwise linger until their queries naturally refetch.
    try {
      getQueryClient().clear()
    } catch {
      // query client may not be initialized yet
    }
    setSaved(true)
    goBack()
  }

  return (
    <view className='server-settings'>
      <view className='server-settings__topbar'>
        <view className='server-settings__back' bindtap={goBack} data-testid='server-back'>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='server-settings__title'>{t('settings.serverPageTitle')}</text>
      </view>

      <scroll-view className='server-settings__scroll' scroll-y>
        <view className='server-settings__content'>
          {editable
            ? (
              <view className='server-settings__card'>
                <view className='server-settings__field'>
                  <text className='server-settings__label'>{t('settings.apiBaseUrl')}</text>
                  <Input
                    className='server-settings__input'
                    type='text'
                    placeholder={t('settings.apiBaseUrlPlaceholder')}
                    value={url}
                    onInput={(value) => setUrl(value)}
                  />
                </view>

                <view className='server-settings__toggle'>
                  <AppSwitch
                    checked={insecureTls}
                    onChange={(checked) => setInsecureTls(checked)}
                  />
                  <view className='server-settings__toggle-text'>
                    <text className='server-settings__toggle-title'>{t('settings.insecureTls')}</text>
                    <text className='server-settings__toggle-subtitle'>
                      {t('settings.insecureTlsHint')}
                    </text>
                  </view>
                </view>

                {saved
                  ? <text className='server-settings__saved'>{t('settings.savedNote')}</text>
                  : null}

                <view
                  className={canSave ? 'server-settings__save' : 'server-settings__save server-settings__save--disabled'}
                  bindtap={canSave ? () => void onSave() : undefined}
                  data-testid='server-save'
                >
                  <text className='server-settings__save-text'>{t('settings.save')}</text>
                </view>
              </view>
            )
            : (
              <view className='server-settings__card'>
                <text className='server-settings__note'>
                  {t('settings.embeddedNote')}
                </text>
              </view>
            )}
        </view>
      </scroll-view>
    </view>
  )
}
