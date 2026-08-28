import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

// lynx-ui: imported per component package (never the `@lynx-js/lynx-ui` barrel,
// which eagerly loads every sub-package and corrupts the test reconciler).
import { Button } from '@lynx-js/lynx-ui-button'
import { Input } from '@lynx-js/lynx-ui-input'

import { appConfig, devCredentials } from '../../../core/config/app-config.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import {
  PREF_LAST_USERNAME,
  PREF_SERVER_URL,
  SECURE_LAST_PASSWORD,
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
  const { t } = useTranslation()

  const isLoading = useAuthStore((s) => s.isLoading)
  const error = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)

  const showServerFields = !appConfig.isEmbedded

  // Username starts empty and is written **once**, at the tail of the async
  // prefill below (persisted value, else the dev default). Each distinct `value`
  // prop on the controlled lynx-ui `Input` costs a native `setValue` round-trip
  // with a main-thread readonly lock/unlock; an initial value *plus* the
  // persisted read would be two, and on device — with several native storage
  // reads already contending for the JSB queue — that double write is what made
  // the password field and login button visibly flicker (batch 11 in PROGRESS).
  // So do NOT "simplify" this to `useState(devCredentials.username)`.
  const [username, setUsername] = useState('')
  // The password field starts EMPTY and is only ever filled with a genuinely
  // remembered password (secure store, written on a successful login). It is
  // deliberately NOT seeded with `devCredentials.password`: doing so put the
  // literal string "admin" in the field on every fresh install / upgraded
  // install that had not yet re-logged-in under this build, which read to the
  // user as "my password got reset to admin" and, if submitted, spent a failed
  // login on a misleading "invalid credentials". A secret must never be
  // prefilled with a value the user did not actually save.
  const [password, setPassword] = useState('')
  const [apiUrl, setApiUrl] = useState(showServerFields ? appConfig.baseUrl : '')
  const [insecureTls, setInsecureTls] = useState(appConfig.insecureTls)

  // Best-effort prefill of the last username / remembered password / server
  // URL. Reads reject on the native storage stub (until the JSB binding
  // lands) — swallow and skip. All reads run in parallel and all writes happen
  // in the same synchronous tail, so the controlled Inputs still cost a
  // single commit (the one-write discipline from the useState comments).
  useEffect(() => {
    let cancelled = false
    const storage = getSongloftStorage()
    void (async () => {
      const read = async (ns: 'prefs' | 'secure', key: string) => {
        try {
          return await storage[ns].get(key)
        } catch {
          return null
        }
      }
      const [savedName, savedPassword, savedUrl] = await Promise.all([
        read('prefs', PREF_LAST_USERNAME),
        read('secure', SECURE_LAST_PASSWORD),
        showServerFields
          ? read('prefs', PREF_SERVER_URL)
          : Promise.resolve(null),
      ])
      if (cancelled) return
      // One write per field, whichever source wins — see the useState comments.
      const nextName = savedName || devCredentials.username
      if (nextName) setUsername(nextName)
      // Only ever fill the password from a genuinely remembered one. Never fall
      // back to a dev default here (see the useState comment) — an empty field
      // is the correct state when we have no saved password, on both a fresh
      // install and an upgraded one that has not re-logged-in yet.
      if (savedPassword) setPassword(savedPassword)
      if (savedUrl) setApiUrl(savedUrl)
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
      <view style={{ flex: 1 }} />
      <view className='login__card'>
        <image
          className='login__logo'
          src='/app_icon.png'
          mode='aspectFit'
        />
        <text className='login__title'>{t('auth.title')}</text>
        <text className='login__subtitle'>{t('auth.subtitle')}</text>

        <view className='login__field'>
          <text className='login__label'>{t('auth.username')}</text>
          <Input
            className='login__input'
            placeholder={t('auth.usernamePlaceholder')}
            value={username}
            onInput={(value) => setUsername(value)}
          />
        </view>

        <view className='login__field'>
          <text className='login__label'>{t('auth.password')}</text>
          <Input
            className='login__input'
            type='password'
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            confirmType='done'
            onInput={(value) => setPassword(value)}
            onConfirm={() => void handleLogin()}
          />
        </view>

        {showServerFields ? (
          <view className='login__field'>
            <text className='login__label'>{t('auth.apiBaseUrl')}</text>
            <Input
              className='login__input'
              type='text'
              placeholder={t('auth.apiBaseUrlPlaceholder')}
              value={apiUrl}
              onInput={(value) => setApiUrl(value)}
            />
            <view className='login__toggle'>
              <AppSwitch
                checked={insecureTls}
                onChange={(checked) => setInsecureTls(checked)}
              />
              <view className='login__toggle-text'>
                <text className='login__toggle-title'>
                  {t('auth.insecureTls')}
                </text>
                <text className='login__toggle-subtitle'>
                  {t('auth.insecureTlsHint')}
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
              data-testid='login-button'
            >
              <text className='login__button-text'>
                {isLoading ? t('auth.signingIn') : t('auth.logIn')}
              </text>
            </view>
          )}
        </Button>
      </view>
      <view style={{ flex: 1 }} />
    </view>
  )
}
