import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'

// lynx-ui: imported per component package (never the `@lynx-js/lynx-ui` barrel,
// which eagerly loads every sub-package and corrupts the test reconciler).
import { Button } from '@lynx-js/lynx-ui-button'
import { Input } from '@lynx-js/lynx-ui-input'
import { Switch, SwitchThumb, SwitchTrack } from '@lynx-js/lynx-ui-switch'

import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import {
  PREF_LAST_USERNAME,
  PREF_SERVER_URL,
  useAuthStore,
} from '../store/index.js'

import './LoginPage.css'

/**
 * Login page (replaces the batch-1 placeholder). Ported from the Flutter
 * `login_page.dart`:
 * - username + password always;
 * - **standalone only**: API base URL field + insecure-TLS toggle
 *   (`appConfig.isEmbedded` hides them);
 * - all colours/sizes go through LUNA tokens (no hard-coded values);
 * - submit → `useAuthStore.login(...)`; loading/error surfaced inline; on
 *   success we `navigate('/')` (the route guard would also redirect).
 */
export function LoginPage() {
  const navigate = useNavigate()

  const isLoading = useAuthStore((s) => s.isLoading)
  const error = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)

  const showServerFields = !appConfig.isEmbedded

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiUrl, setApiUrl] = useState(showServerFields ? appConfig.baseUrl : '')
  const [insecureTls, setInsecureTls] = useState(appConfig.insecureTls)

  // Best-effort prefill of the last username / server URL. Reads reject on the
  // native storage stub (until the JSB binding lands) — swallow and skip.
  useEffect(() => {
    let cancelled = false
    const storage = getSongloftStorage()
    void (async () => {
      try {
        const savedName = await storage.prefs.get(PREF_LAST_USERNAME)
        if (!cancelled && savedName) setUsername(savedName)
      } catch {
        /* ignore */
      }
      if (!showServerFields) return
      try {
        const savedUrl = await storage.prefs.get(PREF_SERVER_URL)
        if (!cancelled && savedUrl) setApiUrl(savedUrl)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showServerFields])

  const canSubmit =
    !isLoading &&
    username.trim().length > 0 &&
    password.length > 0 &&
    (!showServerFields || apiUrl.trim().length > 0)

  const handleLogin = async () => {
    if (!canSubmit) return
    await login({
      username: username.trim(),
      password,
      apiBaseUrl: showServerFields ? apiUrl.trim() : undefined,
      insecureTls: showServerFields ? insecureTls : undefined,
    })
    if (useAuthStore.getState().status === 'authenticated') {
      navigate({ to: '/' })
    }
  }

  return (
    <view className='page page--centered login'>
      <view className='login__card'>
        <text className='login__title'>Songloft</text>
        <text className='login__subtitle'>Sign in to continue</text>

        <view className='login__field'>
          <text className='login__label'>Username</text>
          <Input
            className='login__input'
            placeholder='admin'
            value={username}
            onInput={(value) => setUsername(value)}
          />
        </view>

        <view className='login__field'>
          <text className='login__label'>Password</text>
          <Input
            className='login__input'
            type='password'
            placeholder='••••••••'
            value={password}
            confirmType='done'
            onInput={(value) => setPassword(value)}
            onConfirm={() => void handleLogin()}
          />
        </view>

        {showServerFields ? (
          <view className='login__field'>
            <text className='login__label'>API base URL</text>
            <Input
              className='login__input'
              type='text'
              placeholder='http://localhost:58091'
              value={apiUrl}
              onInput={(value) => setApiUrl(value)}
            />
            <view className='login__toggle'>
              <Switch
                className='login__switch'
                checked={insecureTls}
                onChange={(checked) => setInsecureTls(checked)}
              >
                <SwitchTrack className='login__switch-track'>
                  <SwitchThumb className='login__switch-thumb' />
                </SwitchTrack>
              </Switch>
              <view className='login__toggle-text'>
                <text className='login__toggle-title'>
                  Allow insecure TLS
                </text>
                <text className='login__toggle-subtitle'>
                  Skip certificate validation (self-signed servers)
                </text>
              </view>
            </view>
          </view>
        ) : null}

        {error ? <text className='login__error'>{error}</text> : null}

        <Button disabled={!canSubmit} onClick={() => void handleLogin()}>
          {({ active = false, disabled = false }) => (
            <view
              className={
                'login__button' +
                (disabled ? ' login__button--disabled' : '') +
                (active ? ' login__button--active' : '')
              }
            >
              <text className='login__button-text'>
                {isLoading ? 'Signing in…' : 'Log in'}
              </text>
            </view>
          )}
        </Button>
      </view>
    </view>
  )
}
