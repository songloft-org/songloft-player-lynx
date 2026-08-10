import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { appConfig } from '../../../core/config/app-config.js'
import { clientVersion, type PlayMode } from '../../../core/config/constants.js'
import {
  APP_LANGUAGE_OPTIONS,
  type AppLanguage,
  changeAppLanguage,
  coerceAppLanguage,
  PREF_LANGUAGE,
} from '../../../i18n/index.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import {
  APP_THEME_OPTIONS,
  type AppTheme,
  changeAppTheme,
  coerceAppTheme,
  getAppTheme,
  PREF_THEME,
} from '../../../shared/theme/theme-model.js'
// Vanilla (non-subscribing) store reads only — same pattern as HomePage /
// LibraryPage — so the settings graph never mounts a zustand subscription
// (which crashes the ReactLynx Vitest snapshot tree) and never pulls the player
// barrel + its lynx-ui gesture leaves.
import { useAuthStore } from '../../auth/store/index.js'
import { usePlayerStore } from '../../player/store/player-store.js'
import {
  PLAY_MODE_OPTIONS,
  playModeDescriptionKey,
  playModeIcon,
  playModeLabelKey,
  serverDisplay,
} from '../domain/settings-model.js'
import { readDefaultPlayMode, writeDefaultPlayMode } from '../data/settings-prefs.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import './SettingsPage.css'

/**
 * Settings page (batch 8), rendered inside the shell at `/settings`. Replaces
 * the batch-1 placeholder.
 *
 * Ported as the **self-contained** slice of the Flutter settings surface:
 * - **Playback** — default play mode (persisted to prefs + applied live to the
 *   batch-5 player store);
 * - **Connection** (standalone only) — view the server address, open the server
 *   sub-page to switch it;
 * - **Appearance** — theme (system/light/dark), persisted + applied live via
 *   `theme-model.ts` (batch 13; light token set added alongside the
 *   previously dark-only `tokens.css`);
 * - **About** — client version + current server + project info;
 * - **Account** — log out (two-tap confirm) → auth store `logout()` → `/login`.
 *
 * The remaining Flutter categories (library scan / cache / upgrade / plugins /
 * downloads / licenses / language) depend on capabilities not yet built and are
 * surfaced as a disabled "Coming later" section; see PROGRESS for the phase each
 * is deferred to.
 */
/** i18n key for a language option's label. */
function languageLabelKey(lang: AppLanguage): string {
  switch (lang) {
    case 'en':
      return 'settings.languageEnglish'
    case 'zh':
      return 'settings.languageChinese'
    default:
      return 'settings.languageSystem'
  }
}

/** i18n key for a theme option's label. */
function themeLabelKey(theme: AppTheme): string {
  switch (theme) {
    case 'light':
      return 'settings.themeLight'
    case 'dark':
      return 'settings.themeDark'
    default:
      return 'settings.themeSystem'
  }
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // Default play mode: initialise from the live player state (non-subscribing),
  // then override from the persisted pref once it resolves. Selecting an option
  // both persists it AND applies it to the live player (immediate effect).
  const [mode, setMode] = useState<PlayMode>(() => usePlayerStore.getState().playMode)
  const [confirmLogout, setConfirmLogout] = useState(false)
  // Persisted language choice ('system' until the pref resolves). Selecting an
  // option applies it to i18next live (re-renders the whole tree) + persists it.
  const [language, setLanguage] = useState<AppLanguage>('system')
  // Persisted theme choice; initialised from the live module state (already
  // applied at startup by `applySavedTheme`, see `src/index.tsx`), then
  // overridden below once the persisted pref is re-read (same belt-and-suspenders
  // pattern as `language`).
  const [theme, setTheme] = useState<AppTheme>(getAppTheme)

  useEffect(() => {
    let cancelled = false
    void readDefaultPlayMode().then((saved) => {
      if (!cancelled) setMode(saved)
    })
    void (async () => {
      try {
        const saved = coerceAppLanguage(
          await getSongloftStorage().prefs.get(PREF_LANGUAGE),
        )
        if (!cancelled) setLanguage(saved)
      } catch {
        /* best-effort — leave 'system' */
      }
    })()
    void (async () => {
      try {
        const saved = coerceAppTheme(
          await getSongloftStorage().prefs.get(PREF_THEME),
        )
        if (!cancelled) setTheme(saved)
      } catch {
        /* best-effort — leave the live module state */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectMode = (next: PlayMode) => {
    setMode(next)
    usePlayerStore.getState().setPlayMode(next)
    void writeDefaultPlayMode(next)
  }

  const selectLanguage = (next: AppLanguage) => {
    setLanguage(next)
    void changeAppLanguage(next)
  }

  const selectTheme = (next: AppTheme) => {
    setTheme(next)
    void changeAppTheme(next)
  }

  const serverText = serverDisplay(appConfig.baseUrl, appConfig.isEmbedded, {
    embedded: t('settings.serverEmbedded'),
    notConfigured: t('settings.serverNotConfigured'),
  })

  const openServer = () => {
    void navigate({ to: '/settings/server' })
  }

  const onLogout = () => {
    if (!confirmLogout) {
      setConfirmLogout(true)
      return
    }
    void useAuthStore.getState().logout()
    void navigate({ to: '/login' })
  }

  const showConnection = !appConfig.isEmbedded

  return (
    <view className='settings'>
      <view className='settings__topbar'>
        <text className='settings__title'>{t('settings.title')}</text>
      </view>

      <scroll-view className='settings__scroll' scroll-y>
        <view className='settings__content'>
          <SettingsSection title={t('settings.playback')} icon='play'>
            {PLAY_MODE_OPTIONS.map((option) => (
              <SettingsRow
                key={option}
                icon={playModeIcon(option)}
                title={t(playModeLabelKey(option))}
                subtitle={t(playModeDescriptionKey(option))}
                selected={option === mode}
                trailingIcon={option === mode ? 'check' : undefined}
                onTap={() => selectMode(option)}
                testId={`play-mode-${option}`}
              />
            ))}
          </SettingsSection>

          <SettingsSection title={t('settings.languageSection')} icon='settings'>
            {APP_LANGUAGE_OPTIONS.map((option) => (
              <SettingsRow
                key={option}
                title={t(languageLabelKey(option))}
                selected={option === language}
                trailingIcon={option === language ? 'check' : undefined}
                onTap={() => selectLanguage(option)}
                testId={`language-${option}`}
              />
            ))}
          </SettingsSection>

          {showConnection
            ? (
              <SettingsSection title={t('settings.connection')} icon='link'>
                <SettingsRow
                  icon='link'
                  title={t('settings.server')}
                  subtitle={serverText}
                  trailingIcon='chevron-right'
                  onTap={openServer}
                  testId='settings-server'
                />
              </SettingsSection>
            )
            : null}

          <SettingsSection title={t('settings.appearance')} icon='palette'>
            {APP_THEME_OPTIONS.map((option) => (
              <SettingsRow
                key={option}
                title={t(themeLabelKey(option))}
                selected={option === theme}
                trailingIcon={option === theme ? 'check' : undefined}
                onTap={() => selectTheme(option)}
                testId={`theme-${option}`}
              />
            ))}
          </SettingsSection>

          <SettingsSection title={t('settings.about')} icon='info'>
            <SettingsRow
              icon='info'
              title={t('settings.appVersion')}
              trailingText={clientVersion}
              testId='settings-version'
            />
            <SettingsRow
              icon='link'
              title={t('settings.server')}
              subtitle={serverText}
            />
            <SettingsRow
              icon='music'
              title={t('settings.songloft')}
              subtitle={t('settings.songloftUrl')}
            />
          </SettingsSection>

          <SettingsSection title={t('settings.moreLater')} icon='settings'>
            <SettingsRow icon='library' title={t('settings.musicLibraryScan')} subtitle={t('settings.deferred')} disabled />
            <SettingsRow icon='settings' title={t('settings.storageCache')} subtitle={t('settings.deferred')} disabled />
            <SettingsRow icon='menu' title={t('settings.plugins')} subtitle={t('settings.deferred')} disabled />
          </SettingsSection>

          <SettingsSection title={t('settings.account')} icon='logout'>
            <SettingsRow
              icon='logout'
              title={confirmLogout ? t('settings.logOutConfirm') : t('settings.logOut')}
              subtitle={confirmLogout ? t('settings.logOutConfirmSubtitle') : undefined}
              danger
              onTap={onLogout}
              testId='settings-logout'
            />
          </SettingsSection>
        </view>
      </scroll-view>
    </view>
  )
}
