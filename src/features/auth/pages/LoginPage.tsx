import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

// lynx-ui: imported per component package (never the `@lynx-js/lynx-ui` barrel,
// which eagerly loads every sub-package and corrupts the test reconciler).
import { Button } from '@lynx-js/lynx-ui-button'
import { Input } from '@lynx-js/lynx-ui-input'

import {
  appConfig,
  devCredentials,
  hostAssetUrl,
} from '../../../core/config/app-config.js'
import { AppCheckbox } from '../../../shared/ui/AppCheckbox.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import {
  bundleModeAvailable,
  readBundleMode,
  switchBundleMode,
  type BundleRunMode,
} from '../../../core/backend/local-mode.js'
import { readLynxGlobal } from '../../../native/native-modules.js'
import { desktopConfig } from '../../../desktop/client.js'
import {
  PREF_LAST_USERNAME,
  PREF_SERVER_URL,
  SECURE_LAST_PASSWORD,
  useAuthStore,
} from '../store/index.js'
import { normalizeServerUrl, PREF_INSECURE_TLS } from '../store/auth-store.js'
import { useServerStore } from '../../settings/store/server-store.js'
import { useOfflineOwner } from '../../player/widgets/use-offline-owner.js'
import { indexedSongCacheAvailable } from '../../player/data/indexed-song-cache.js'
import { TermsDialog } from '../widgets/TermsDialog.js'

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
  const offlineOwner = useOfflineOwner()
  const showServerFields = !appConfig.isEmbedded
  const localModeAvailable = bundleModeAvailable()

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
  const [apiUrl, setApiUrl] = useState(
    showServerFields && !localModeAvailable ? appConfig.baseUrl : '',
  )
  const [insecureTls, setInsecureTls] = useState(!localModeAvailable && appConfig.insecureTls)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [localModeBusy, setLocalModeBusy] = useState(false)
  const [localModeError, setLocalModeError] = useState(false)
  const [runMode, setRunMode] = useState<BundleRunMode | null>(
    localModeAvailable ? desktopConfig()?.sessionKind ?? null : 'remote',
  )
  const desktopLocalRecovery =
    localModeAvailable && runMode === 'local' && !!desktopConfig()
  const localModeDisabled =
    !runMode || localModeBusy || isLoading || !agreedToTerms
  const localModeClassName =
    'login__bundle-mode' + (localModeDisabled ? ' login__bundle-mode--disabled' : '')
  const missingMusicDirectory = error === 'bundle_music_directory_unavailable'
  const displayedError = missingMusicDirectory
    ? t('desktopLocal.musicDirectoryUnavailable')
    : error === 'keychain_interaction_required'
      ? t('desktopLocal.keychainInteractionRequired')
      : error === 'keychain_signing_required'
        ? t('desktopLocal.keychainSigningRequired')
        : localModeError || error === 'desktop_host_failed'
          ? t('desktopLocal.failed')
          : error

  useEffect(() => {
    if (!localModeAvailable) return
    let active = true
    let receivedChange = false
    const listener = ({ mode }: { mode: string }) => {
      if (mode !== 'remote' && mode !== 'local') return
      receivedChange = true
      setRunMode(mode)
    }
    const emitter = readLynxGlobal()?.getJSModule?.('GlobalEventEmitter')
    emitter?.addListener?.('SongloftDesktop.sessionChanged', listener)
    void readBundleMode().then((mode) => {
      if (active && !receivedChange) setRunMode(mode)
    })
    return () => {
      active = false
      emitter?.removeListener?.('SongloftDesktop.sessionChanged', listener)
    }
  }, [localModeAvailable])

  // Best-effort prefill of the last username / remembered password / server
  // URL. Reads reject on the native storage stub (until the JSB binding
  // lands) — swallow and skip. All reads run in parallel and all writes happen
  // in the same synchronous tail, so the controlled Inputs still cost a
  // single commit (the one-write discipline from the useState comments).
  //
  // Prefill priority (standalone): per-profile credentials for `apiUrl` first,
  // then fall back to the global last credentials. This matches Flutter's
  // `login_page.dart` semantics: switching servers prefills the credentials
  // the user last used *on that server*, not the global last.
  useEffect(() => {
    if (runMode !== 'remote') return
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
      const [savedName, savedPassword, savedUrl, savedTls, currentProfile] =
        await Promise.all([
          read('prefs', PREF_LAST_USERNAME),
          read('secure', SECURE_LAST_PASSWORD),
          showServerFields
            ? read('prefs', PREF_SERVER_URL)
            : Promise.resolve(null),
          localModeAvailable ? read('prefs', PREF_INSECURE_TLS) : Promise.resolve(null),
          showServerFields && !localModeAvailable
            ? useServerStore.getState().loadCredentialsForUrl(appConfig.baseUrl)
            : Promise.resolve(null),
        ])
      const targetUrl = savedUrl || (localModeAvailable ? appConfig.defaultBaseUrl : appConfig.baseUrl)
      const profileCreds = showServerFields && localModeAvailable
        ? await useServerStore.getState().loadCredentialsForUrl(targetUrl)
        : currentProfile
      if (cancelled) return
      // One write per field, whichever source wins — see the useState comments.
      // Per-profile credentials win over global last credentials.
      const nextName =
        profileCreds?.username || savedName || devCredentials.username
      if (nextName) setUsername(nextName)
      // Only ever fill the password from a genuinely remembered one. Never fall
      // back to a dev default here (see the useState comment) — an empty field
      // is the correct state when we have no saved password, on both a fresh
      // install and an upgraded one that has not re-logged-in yet.
      setPassword(profileCreds?.password || savedPassword || '')
      if (showServerFields) setApiUrl(targetUrl)
      if (localModeAvailable) setInsecureTls(savedTls === 'true')
    })()
    return () => {
      cancelled = true
    }
  }, [localModeAvailable, runMode, showServerFields])

  const canSubmit =
    runMode === 'remote' &&
    !localModeBusy &&
    !isLoading &&
    username.trim().length > 0 &&
    password.length > 0 &&
    (!showServerFields || apiUrl.trim().length > 0) &&
    agreedToTerms

  const handleLogin = async () => {
    if (!canSubmit) return
    await login({
      username: username.trim(),
      password,
      apiBaseUrl: showServerFields ? apiUrl.trim() : undefined,
      insecureTls: showServerFields ? insecureTls : undefined,
    })
    if (useAuthStore.getState().status === 'authenticated') {
      // Persist credentials to the profile matching the server URL (if any).
      // The global last credentials are still written by auth-store.login for
      // backward compatibility with embedded mode and legacy flows.
      if (showServerFields) {
        void useServerStore
          .getState()
          .rememberCredentials(apiUrl.trim(), {
            username: username.trim(),
            password,
          })
      }
      navigate({ to: '/' })
    }
  }

  const handleBundleMode = async (
    target: BundleRunMode,
    chooseMusicDirectory = false,
  ) => {
    if (!localModeAvailable || localModeDisabled) return
    setLocalModeBusy(true)
    setLocalModeError(false)
    try {
      if (!(await switchBundleMode(target, { chooseMusicDirectory }))) return
      setRunMode(target)
      if (target === 'local' && useAuthStore.getState().status === 'authenticated') {
        navigate({ to: '/' })
      }
    } catch {
      setLocalModeError(true)
    } finally {
      setLocalModeBusy(false)
    }
  }

  return (
    <view className="login">
      {offlineOwner && indexedSongCacheAvailable() && (
        <view
          className="login__offline"
          bindtap={() => {
            void navigate({ to: '/device-cache' })
          }}
          data-testid="login-device-cache"
        >
          <text className="login__offline-text">
            {t('deviceCache.openOffline')}
          </text>
        </view>
      )}
      <scroll-view className="login__scroll" scroll-y>
        <view className="login__content">
          <view style={{ flex: 1 }} />
          <view className="login__card">
            <image
              className="login__logo"
              src={hostAssetUrl('app_icon.png')}
              mode="aspectFit"
            />
            <text className="login__title">{t('auth.title')}</text>
            {!desktopLocalRecovery ? (
              <>
                <text className="login__subtitle">{t('auth.subtitle')}</text>

                <view className="login__field">
                  <text className="login__label">{t('auth.username')}</text>
                  <Input
                    className="login__input"
                    placeholder={t('auth.usernamePlaceholder')}
                    value={username}
                    onInput={(value) => setUsername(value)}
                  />
                </view>

                <view className="login__field">
                  <text className="login__label">{t('auth.password')}</text>
                  <Input
                    className="login__input"
                    type="password"
                    placeholder={t('auth.passwordPlaceholder')}
                    value={password}
                    confirmType="done"
                    onInput={(value) => setPassword(value)}
                    onConfirm={() => void handleLogin()}
                  />
                </view>

                {showServerFields ? (
                  <view className="login__field">
                    <text className="login__label">{t('auth.apiBaseUrl')}</text>
                    <Input
                      className="login__input"
                      type="text"
                      placeholder={t('auth.apiBaseUrlPlaceholder')}
                      value={apiUrl}
                      onInput={(value) => setApiUrl(value)}
                    />
                    <view className="login__toggle">
                      <AppSwitch
                        checked={insecureTls}
                        onChange={(checked) => setInsecureTls(checked)}
                      />
                      <view className="login__toggle-text">
                        <text className="login__toggle-title">
                          {t('auth.insecureTls')}
                        </text>
                        <text className="login__toggle-subtitle">
                          {t('auth.insecureTlsHint')}
                        </text>
                      </view>
                    </view>
                  </view>
                ) : null}
              </>
            ) : null}

            {displayedError ? (
              <text className="login__error">{displayedError}</text>
            ) : null}

            <view
              className="login__agreement"
              data-testid="login-agreement"
              bindtap={() => setAgreedToTerms(!agreedToTerms)}
            >
              <AppCheckbox
                checked={agreedToTerms}
                testId="agreement-checkbox"
              />
              <text className="login__agreement-text">
                {t('auth.agreePrefix')}
                <text
                  className="login__agreement-link"
                  data-testid="login-terms-link"
                  catchtap={() => setShowTerms(true)}
                >
                  {t('auth.termsAndPrivacy')}
                </text>
              </text>
            </view>

            {!desktopLocalRecovery ? (
              <Button disabled={!canSubmit} onClick={() => void handleLogin()}>
                {({ active = false, disabled = false }) => (
                  <view
                    className={
                      'login__button' +
                      (disabled ? ' login__button--disabled' : '') +
                      (active ? ' login__button--active' : '')
                    }
                    data-testid="login-button"
                  >
                    <text className="login__button-text">
                      {isLoading ? t('auth.signingIn') : t('auth.logIn')}
                    </text>
                  </view>
                )}
              </Button>
            ) : null}
            {desktopLocalRecovery ? (
              <>
                <view
                  className={localModeClassName}
                  bindtap={() => void handleBundleMode('local')}
                  data-testid="login-retry-local"
                >
                  <text className="login__bundle-mode-text">
                    {t(localModeBusy ? 'desktopLocal.starting' : 'desktopLocal.retryLocal')}
                  </text>
                </view>
                {missingMusicDirectory ? (
                  <view
                    className={localModeClassName}
                    bindtap={() => void handleBundleMode('local', true)}
                    data-testid="login-choose-music-directory"
                  >
                    <text className="login__bundle-mode-text">{t('desktopLocal.chooseMusicDirectory')}</text>
                  </view>
                ) : null}
              </>
            ) : null}
            {localModeAvailable ? (
              <view
                className={localModeClassName}
                bindtap={() => void handleBundleMode(runMode === 'local' ? 'remote' : 'local')}
                data-testid="login-bundle-mode"
              >
                <text className="login__bundle-mode-text">
                  {localModeBusy && !desktopLocalRecovery
                    ? t('desktopLocal.starting')
                    : t(runMode === 'local' ? 'desktopLocal.remote' : 'desktopLocal.local')}
                </text>
              </view>
            ) : null}
          </view>
          <view style={{ flex: 1 }} />
        </view>
      </scroll-view>
      <TermsDialog show={showTerms} onClose={() => setShowTerms(false)} />
    </view>
  )
}
