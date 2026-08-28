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
  // The password starts at the dev default so a *fresh* dev install is
  // submittable without typing; the async prefill below replaces it with the
  // remembered password, or clears it for a returning user we have no password
  // for (see the prefill tail for why an empty field beats a wrong one).
  const [password, setPassword] = useState(devCredentials.password)
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
      // The dev default password applies to a **fresh install only**. Once a
      // real account has logged in here (a remembered username proves it) but
      // we have no password for it — the upgrade case, since the password is
      // only recorded from the first login *after* this feature shipped —
      // prefilling `admin` is worse than prefilling nothing: it is a wrong
      // password that looks exactly like "my password got reset", and
      // submitting it costs a failed login with a misleading "invalid
      // credentials". An empty field says "type it once" instead, and the next
      // sign-out prefills it correctly.
      const nextPassword = savedPassword ?? (savedName ? '' : devCredentials.password)
      // The field shows `devCredentials.password` at mount, so comparing against
      // it (rather than the `password` state, which would be a stale closure
      // read) is what keeps this at zero round-trips on a fresh install.
      if (nextPassword !== devCredentials.password) setPassword(nextPassword)
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
