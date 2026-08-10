import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'

import { Input } from '@lynx-js/lynx-ui-input'
import { Switch, SwitchThumb, SwitchTrack } from '@lynx-js/lynx-ui-switch'

import { appConfig } from '../../../core/config/app-config.js'
import { useAppSessionStore } from '../../../store/index.js'
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
    setSaved(true)
    goBack()
  }

  return (
    <view className='server-settings'>
      <view className='server-settings__topbar'>
        <view className='server-settings__back' bindtap={goBack} data-testid='server-back'>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='server-settings__title'>Server</text>
      </view>

      <scroll-view className='server-settings__scroll' scroll-y>
        <view className='server-settings__content'>
          {editable
            ? (
              <view className='server-settings__card'>
                <view className='server-settings__field'>
                  <text className='server-settings__label'>API base URL</text>
                  <Input
                    className='server-settings__input'
                    type='text'
                    placeholder='http://localhost:58091'
                    value={url}
                    onInput={(value) => setUrl(value)}
                  />
                </view>

                <view className='server-settings__toggle'>
                  <Switch
                    className='server-settings__switch'
                    checked={insecureTls}
                    onChange={(checked) => setInsecureTls(checked)}
                  >
                    <SwitchTrack className='server-settings__switch-track'>
                      <SwitchThumb className='server-settings__switch-thumb' />
                    </SwitchTrack>
                  </Switch>
                  <view className='server-settings__toggle-text'>
                    <text className='server-settings__toggle-title'>Allow insecure TLS</text>
                    <text className='server-settings__toggle-subtitle'>
                      Skip certificate validation (self-signed servers)
                    </text>
                  </view>
                </view>

                {saved
                  ? <text className='server-settings__saved'>Saved. Requests now use the new server.</text>
                  : null}

                <view
                  className={canSave ? 'server-settings__save' : 'server-settings__save server-settings__save--disabled'}
                  bindtap={canSave ? () => void onSave() : undefined}
                  data-testid='server-save'
                >
                  <text className='server-settings__save-text'>Save</text>
                </view>
              </view>
            )
            : (
              <view className='server-settings__card'>
                <text className='server-settings__note'>
                  This build is bundled with its backend; the server address is fixed.
                </text>
              </view>
            )}
        </view>
      </scroll-view>
    </view>
  )
}
