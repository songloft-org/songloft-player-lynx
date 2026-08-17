import { useCallback, useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { getFloatingLyricModule } from '../../../native/floating-lyric.js'
import { openURL } from '../../../native/native-platform.js'
import { clientVersion } from '../../../core/config/constants.js'
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
// (which crashes the ReactLynx Vitest snapshot tree).
import { useAuthStore } from '../../auth/store/index.js'
import { getSettingsApi } from '../api/index.js'
import { type AudioQuality, type FloatingLyricFontSize, type FloatingLyricOpacity, coerceAudioQuality, readAudioQuality, readAutoEnterLyrics, readAutoResume, readFloatingLyricEnabled, readFloatingLyricFontSize, readFloatingLyricLocked, readFloatingLyricOpacity, readNormalize, readNotificationLyricInTitle, writeAudioQuality, writeAutoEnterLyrics, writeAutoResume, writeFloatingLyricEnabled, writeFloatingLyricFontSize, writeFloatingLyricLocked, writeFloatingLyricOpacity, writeNormalize, writeNotificationLyricInTitle } from '../data/settings-prefs.js'
import { setAudioQualityCache, setNormalizeEnabled } from '../../player/store/player-store.js'
import { canExport, exportPlaylists, importPlaylists } from '../domain/data-transfer.js'
import { exportAndShareLogs } from '../data/log-export.js'
import { LOG_LEVELS, coerceLogLevel, logLevelLabelKey, type LogLevel } from '../domain/log-level.js'
import { serverDisplay } from '../domain/settings-model.js'
import { useBreakpoint } from '../../../shared/responsive/useBreakpoint.js'
import { useScrollMemory } from '../../../shared/nav/scroll-memory.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SwitchRow } from '../widgets/SwitchRow.js'
import { LibraryOpsPage } from '../../library-ops/pages/LibraryOpsPage.js'
import { PluginManagerPage } from '../../jsplugin/pages/PluginManagerPage.js'
import { TabConfigPage } from '../../jsplugin/pages/TabConfigPage.js'
import { CacheManagePage } from './CacheManagePage.js'
import { EqualizerPage } from './EqualizerPage.js'
import { LicensesPage } from './LicensesPage.js'
import { ProxySettingsPage } from './ProxySettingsPage.js'
import { ServerListPage } from './ServerListPage.js'
import { ThemePacksPage } from './ThemePacksPage.js'
import { UpgradePage } from './UpgradePage.js'
import { BrowseViewsPage } from './BrowseViewsPage.js'
import './SettingsPage.css'

const AUDIO_QUALITY_OPTIONS: AudioQuality[] = ['original', '320', '192', '128']
const FLOATING_LYRIC_FONT_SIZE_OPTIONS: FloatingLyricFontSize[] = ['small', 'medium', 'large']
const FLOATING_LYRIC_OPACITY_OPTIONS: FloatingLyricOpacity[] = [0.2, 0.4, 0.6, 0.8]

/**
 * Settings page (batch 8), rendered inside the shell at `/settings`. Replaces
 * the batch-1 placeholder.
 *
 * Ported as the **self-contained** slice of the Flutter settings surface:
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
 *
 * There is deliberately **no Playback section**: play mode is set from the player's
 * own mode toggle, which is where you are when you care about it, and duplicating
 * it here was reported as clutter. `PlayControls` persists the choice, so the
 * `default_play_mode` pref this page used to own still round-trips.
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

/** Width threshold (px) for activating the dual-column layout. */
const DUAL_COLUMN_MIN_WIDTH = 768

/**
 * Sub-page identifiers for the right pane in dual-column mode.
 * Each value corresponds to a navigation target that would normally route away.
 *
 * There is deliberately no "nothing selected" member: an empty right pane is
 * dead space on a wide screen, so the pane always shows a page and defaults to
 * the first row of the list ({@link DEFAULT_SUB_PAGE}).
 */
type SettingsSubPage =
  | 'library'
  | 'servers'
  | 'theme-packs'
  | 'cache'
  | 'eq'
  | 'proxy'
  | 'upgrade'
  | 'licenses'
  | 'browse-views'
  | 'plugins'
  | 'tab-config'

/** Sub-page shown in the right pane before the user picks one. */
const DEFAULT_SUB_PAGE: SettingsSubPage = 'library'

/** Scroll-memory key for the settings list; see {@link useScrollMemory}. */
const SCROLL_KEY = 'settings'

export function SettingsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // The list is long and every row leads to a sub-page, so losing the offset on
  // the way back means re-scrolling past everything each time. In single-column
  // mode a sub-page is a sibling route, which unmounts this page — hence the
  // module-level memory rather than a `useRef`.
  const { initialOffset, onScroll } = useScrollMemory(SCROLL_KEY)
  const { width: layoutWidth, onLayoutChange } = useBreakpoint()
  const isDualColumn = layoutWidth >= DUAL_COLUMN_MIN_WIDTH

  /**
   * Active sub-page for the right pane in dual-column mode. Seeded with the
   * first row of the list so the pane is never blank on a wide screen.
   */
  const [activeSubPage, setActiveSubPage] = useState<SettingsSubPage>(DEFAULT_SUB_PAGE)

  const [showLogoutDialog, setShowLogoutDialog] = useState(false)
  // Persisted language choice ('system' until the pref resolves). Selecting an
  // option applies it to i18next live (re-renders the whole tree) + persists it.
  const [language, setLanguage] = useState<AppLanguage>('system')
  // Persisted theme choice; initialised from the live module state (already
  // applied at startup by `applySavedTheme`, see `src/index.tsx`), then
  // overridden below once the persisted pref is re-read (same belt-and-suspenders
  // pattern as `language`).
  const [theme, setTheme] = useState<AppTheme>(getAppTheme)
  // Backend log level (batch 15) — unlike theme/language this is a *server*
  // setting (`GET/PUT /api/v1/settings/log-level`), so it has no local module
  // state to seed from; starts at the same 'info' fallback the API layer uses
  // and is best-effort overridden once the read resolves (offline/unreachable
  // backend just leaves the fallback, same degrade-gracefully pattern as the
  // rest of this page).
  const [logLevel, setLogLevel] = useState<LogLevel>('info')
  const [audioQuality, setAudioQuality] = useState<AudioQuality>('original')
  const [autoResume, setAutoResume] = useState(false)
  const [normalize, setNormalize] = useState(false)
  const [autoEnterLyrics, setAutoEnterLyrics] = useState(false)
  const [notificationLyricInTitle, setNotificationLyricInTitle] = useState(true)
  const [floatingLyricEnabled, setFloatingLyricEnabled] = useState(false)
  const [floatingLyricFontSize, setFloatingLyricFontSize] = useState<FloatingLyricFontSize>('medium')
  const [floatingLyricLocked, setFloatingLyricLocked] = useState(false)
  const [floatingLyricOpacity, setFloatingLyricOpacity] = useState<FloatingLyricOpacity>(0.4)
  const [backendVersion, setBackendVersion] = useState('')
  // Log export (Flutter `LogExportService` parity): busy flag + inline notice
  // (Lynx has no toast primitive; same banner pattern as LibraryOpsPage).
  const [exportingLogs, setExportingLogs] = useState(false)
  const [exportNotice, setExportNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
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
    void getSettingsApi()
      .getLogLevel()
      .then((level) => {
        if (!cancelled) setLogLevel(coerceLogLevel(level))
      })
      .catch(() => {
        /* best-effort — backend unreachable, keep the 'info' fallback */
      })
    void readAudioQuality()
      .then((q) => { if (!cancelled) setAudioQuality(q) })
      .catch(() => {})
    void readAutoResume()
      .then((v) => { if (!cancelled) setAutoResume(v) })
      .catch(() => {})
    void readNormalize()
      .then((v) => { if (!cancelled) setNormalize(v) })
      .catch(() => {})
    void readAutoEnterLyrics()
      .then((v) => { if (!cancelled) setAutoEnterLyrics(v) })
      .catch(() => {})
    void readNotificationLyricInTitle()
      .then((v) => { if (!cancelled) setNotificationLyricInTitle(v) })
      .catch(() => {})
    void readFloatingLyricEnabled()
      .then((v) => { if (!cancelled) setFloatingLyricEnabled(v) })
      .catch(() => {})
    void readFloatingLyricFontSize()
      .then((v) => { if (!cancelled) setFloatingLyricFontSize(v) })
      .catch(() => {})
    void readFloatingLyricLocked()
      .then((v) => { if (!cancelled) setFloatingLyricLocked(v) })
      .catch(() => {})
    void readFloatingLyricOpacity()
      .then((v) => { if (!cancelled) setFloatingLyricOpacity(v) })
      .catch(() => {})
    void getSettingsApi().getVersion()
      .then((v) => { if (!cancelled) setBackendVersion(v) })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const selectLanguage = (next: AppLanguage) => {
    setLanguage(next)
    void changeAppLanguage(next)
  }

  const selectTheme = (next: AppTheme) => {
    setTheme(next)
    void changeAppTheme(next)
  }

  const selectLogLevel = (next: LogLevel) => {
    setLogLevel(next)
    void getSettingsApi().setLogLevel(next).catch(() => {
      /* best-effort — backend unreachable; local selection still reflects intent */
    })
  }

  const selectAudioQuality = (next: AudioQuality) => {
    setAudioQuality(next)
    setAudioQualityCache(next === 'original' ? null : next)
    void writeAudioQuality(next)
  }

  /**
   * Export logs (Flutter `LogExportService` parity). On native the backend +
   * client logs are zipped and handed to the OS share sheet; on Web there is
   * no share target reachable from this realm, so the pre-alignment behavior
   * is kept — open the sanitized backend log URL in the browser.
   */
  const onExportLogs = () => {
    if (!getPlatformCapabilities().shareSheet) {
      const token = getCachedAccessToken()
      if (!token) return
      const url = `${appConfig.resolvedBaseUrl}${apiPrefix}/logs/export?access_token=${encodeURIComponent(token)}`
      openURL(url)
      return
    }
    if (exportingLogs) return
    setExportingLogs(true)
    setExportNotice(null)
    void exportAndShareLogs()
      .then((result) => {
        setExportNotice(result.hasBackend
          ? { kind: 'success', text: t('settings.exportLogsSuccess') }
          : { kind: 'success', text: t('settings.exportLogsSuccessNoBackend') })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e)
        setExportNotice({ kind: 'error', text: t('settings.exportLogsFailed', { error: message }) })
      })
      .finally(() => {
        setExportingLogs(false)
      })
  }

  const serverText = serverDisplay(appConfig.baseUrl, appConfig.isEmbedded, {
    embedded: t('settings.serverEmbedded'),
    notConfigured: t('settings.serverNotConfigured'),
  })

  const onLogout = () => {
    setShowLogoutDialog(true)
  }

  const confirmLogout = () => {
    setShowLogoutDialog(false)
    void useAuthStore.getState().logout()
    void navigate({ to: '/login' })
  }

  const showConnection = !appConfig.isEmbedded

  /**
   * Navigate to a sub-page: in dual-column mode, show it in the right pane;
   * in single-column mode, use the router.
   */
  const goToSubPage = (page: SettingsSubPage, route: string) => {
    if (isDualColumn) {
      setActiveSubPage(page)
    } else {
      void navigate({ to: route })
    }
  }

  /**
   * Whether a sub-page row is the one currently shown in the right pane. Only
   * meaningful in dual-column mode — in single-column mode the rows are plain
   * navigation entries and highlighting one of them would look like a stuck
   * selection.
   */
  const isActive = (page: SettingsSubPage) => isDualColumn && activeSubPage === page

  return (
    <view className='settings' bindlayoutchange={onLayoutChange}>
      <view className='settings__topbar'>
        <text className='settings__title'>{t('settings.title')}</text>
      </view>

      <view className={isDualColumn ? 'settings__body settings__body--dual' : 'settings__body'}>
      <scroll-view
        className={isDualColumn ? 'settings__scroll settings__scroll--dual' : 'settings__scroll'}
        scroll-y
        initial-scroll-offset={initialOffset}
        bindscroll={onScroll}
        data-testid='settings-scroll'
      >
        <view className='settings__content'>
          {/* ── 1. Appearance ─────────────────────────────────────────── */}
          <SettingsSection
            title={t('settings.categoryAppearance')}
            subtitle={t('settings.categoryAppearanceSubtitle')}
            icon='palette'
          >
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
          <SettingsSection>
            <SettingsRow
              icon='palette'
              title={t('themePacks.title')}
              subtitle={t('themePacks.subtitle')}
              trailingIcon='chevron-right'
              selected={isActive('theme-packs')}
              onTap={() => goToSubPage('theme-packs', '/settings/theme-packs')}
              testId='settings-theme-packs'
            />
          </SettingsSection>

          {/* ── 2. Playback ───────────────────────────────────────────── */}
          <SettingsSection
            title={t('settings.categoryPlayback')}
            subtitle={t('settings.categoryPlaybackSubtitle')}
            icon='music'
          >
            {AUDIO_QUALITY_OPTIONS.map((option) => (
              <SettingsRow
                key={option}
                title={t(`settings.quality_${option}`)}
                selected={option === audioQuality}
                trailingIcon={option === audioQuality ? 'check' : undefined}
                onTap={() => selectAudioQuality(option)}
                testId={`audio-quality-${option}`}
              />
            ))}
          </SettingsSection>
          <SettingsSection>
            <SwitchRow
              icon='music'
              title={t('settings.autoResume')}
              subtitle={t('settings.autoResumeSubtitle')}
              checked={autoResume}
              onChange={(next) => { setAutoResume(next); void writeAutoResume(next) }}
              testId='settings-auto-resume'
            />
            <SwitchRow
              icon='volume'
              title={t('settings.normalize')}
              subtitle={t('settings.normalizeSubtitle')}
              checked={normalize}
              onChange={(next) => { setNormalize(next); setNormalizeEnabled(next); void writeNormalize(next); void getSettingsApi().updateVolumeNormalize(next).catch(() => {}) }}
              testId='settings-normalize'
            />
            <SettingsRow
              icon='music'
              title={t('eq.title')}
              subtitle={t('eq.subtitle')}
              trailingIcon='chevron-right'
              selected={isActive('eq')}
              onTap={() => goToSubPage('eq', '/settings/eq')}
              testId='settings-eq'
            />
          </SettingsSection>
          <SettingsSection title={t('settings.lyricsSection')} icon='music'>
            <SwitchRow
              icon='music'
              title={t('settings.autoEnterLyrics')}
              subtitle={t('settings.autoEnterLyricsSubtitle')}
              checked={autoEnterLyrics}
              onChange={(next) => { setAutoEnterLyrics(next); void writeAutoEnterLyrics(next) }}
              testId='settings-auto-enter-lyrics'
            />
            <SwitchRow
              icon='music'
              title={t('settings.notificationLyricInTitle')}
              subtitle={t('settings.notificationLyricInTitleSubtitle')}
              checked={notificationLyricInTitle}
              onChange={(next) => { setNotificationLyricInTitle(next); void writeNotificationLyricInTitle(next) }}
              testId='settings-notification-lyric-title'
            />
            {getPlatformCapabilities().floatingLyric
              ? (
                <>
                  <SwitchRow
                    icon='music'
                    title={t('settings.floatingLyrics')}
                    subtitle={t('settings.floatingLyricsSubtitle')}
                    checked={floatingLyricEnabled}
                    onChange={(next) => {
                      setFloatingLyricEnabled(next)
                      void writeFloatingLyricEnabled(next)
                      const m = getFloatingLyricModule()
                      if (next) {
                        void m.requestPermission().then(granted => { if (granted) void m.show() })
                      } else {
                        void m.hide()
                      }
                    }}
                    testId='settings-floating-lyric-toggle'
                  />
                  {floatingLyricEnabled
                    ? (
                      <>
                        <SettingsSection title={t('settings.floatingLyricFontSize')} icon='music'>
                          {FLOATING_LYRIC_FONT_SIZE_OPTIONS.map((option) => (
                            <SettingsRow
                              key={option}
                              title={t(`settings.floatingLyricFont${option.charAt(0).toUpperCase()}${option.slice(1)}`)}
                              selected={option === floatingLyricFontSize}
                              trailingIcon={option === floatingLyricFontSize ? 'check' : undefined}
                              onTap={() => { setFloatingLyricFontSize(option); void writeFloatingLyricFontSize(option); void getFloatingLyricModule().setFontSize(option).catch(() => {}) }}
                              testId={`floating-lyric-font-${option}`}
                            />
                          ))}
                        </SettingsSection>
                        <SettingsSection>
                          <SwitchRow
                            icon='music'
                            title={t('settings.floatingLyricLock')}
                            checked={floatingLyricLocked}
                            onChange={(next) => { setFloatingLyricLocked(next); void writeFloatingLyricLocked(next); void getFloatingLyricModule().setLocked(next).catch(() => {}) }}
                            testId='settings-floating-lyric-lock'
                          />
                        </SettingsSection>
                        <SettingsSection title={t('settings.floatingLyricOpacity')} icon='music'>
                          {FLOATING_LYRIC_OPACITY_OPTIONS.map((option) => (
                            <SettingsRow
                              key={option}
                              title={`${Math.round(option * 100)}%`}
                              selected={option === floatingLyricOpacity}
                              trailingIcon={option === floatingLyricOpacity ? 'check' : undefined}
                              onTap={() => { setFloatingLyricOpacity(option); void writeFloatingLyricOpacity(option); void getFloatingLyricModule().setOpacity(option).catch(() => {}) }}
                              testId={`floating-lyric-opacity-${String(option)}`}
                            />
                          ))}
                        </SettingsSection>
                      </>
                    )
                    : null}
                </>
              )
              : null}
          </SettingsSection>

          {/* ── 3. Library ────────────────────────────────────────────── */}
          <SettingsSection
            title={t('settings.categoryLibrary')}
            subtitle={t('settings.categoryLibrarySubtitle')}
            icon='library'
          >
            <SettingsRow
              icon='search'
              title={t('libops.pageTitle')}
              subtitle={t('libops.entrySubtitle')}
              trailingIcon='chevron-right'
              selected={isActive('library')}
              onTap={() => goToSubPage('library', '/settings/library')}
              testId='settings-library-ops'
            />
            <SettingsRow
              icon='music'
              title={t('library.browseViews')}
              subtitle={t('library.browseViewsSubtitle')}
              trailingIcon='chevron-right'
              selected={isActive('browse-views')}
              onTap={() => goToSubPage('browse-views', '/settings/browse-views')}
              testId='settings-browse-views'
            />
          </SettingsSection>

          {/* ── 4. Extensions ─────────────────────────────────────────── */}
          <SettingsSection
            title={t('settings.categoryExtensions')}
            subtitle={t('settings.categoryExtensionsSubtitle')}
            icon='settings'
          >
            <SettingsRow
              icon='menu'
              title={t('settings.plugins')}
              subtitle={t('jsplugin.managerSubtitle')}
              trailingIcon='chevron-right'
              selected={isActive('plugins')}
              onTap={() => goToSubPage('plugins', '/settings/plugins')}
              testId='settings-plugins'
            />
            <SettingsRow
              icon='menu'
              title={t('jsplugin.tabConfigTitle')}
              subtitle={t('jsplugin.tabConfigSubtitle')}
              trailingIcon='chevron-right'
              selected={isActive('tab-config')}
              onTap={() => goToSubPage('tab-config', '/settings/tab-config')}
              testId='settings-tab-config'
            />
          </SettingsSection>

          {/* ── 5. Cache ──────────────────────────────────────────────── */}
          <SettingsSection
            title={t('settings.categoryCache')}
            subtitle={t('settings.categoryCacheSubtitle')}
            icon='settings'
          >
            <SettingsRow
              icon='settings'
              title={t('settings.storageCache')}
              subtitle={t('settings.cacheManageSubtitle')}
              trailingIcon='chevron-right'
              selected={isActive('cache')}
              onTap={() => goToSubPage('cache', '/settings/cache')}
            />
          </SettingsSection>

          {/* ── 6. Network ────────────────────────────────────────────── */}
          <SettingsSection
            title={t('settings.categoryNetwork')}
            subtitle={t('settings.categoryNetworkSubtitle')}
            icon='link'
          >
            {showConnection
              ? (
                <SettingsRow
                  icon='link'
                  title={t('servers.title')}
                  subtitle={serverText}
                  trailingIcon='chevron-right'
                  selected={isActive('servers')}
                  onTap={() => goToSubPage('servers', '/settings/servers')}
                  testId='settings-server'
                />
              )
              : null}
            <SettingsRow
              icon='link'
              title={t('settings.networkProxy')}
              subtitle={t('settings.proxySubtitle')}
              trailingIcon='chevron-right'
              selected={isActive('proxy')}
              onTap={() => goToSubPage('proxy', '/settings/proxy')}
              testId='settings-proxy'
            />
          </SettingsSection>

          {/* ── 7. Data ───────────────────────────────────────────────── */}
          <DataSection />

          {/* ── 8. About & Updates ─────────────────────────────────────── */}
          <SettingsSection
            title={t('settings.categoryAbout')}
            subtitle={t('settings.categoryAboutSubtitle')}
            icon='info'
          >
            <SettingsRow
              icon='info'
              title={t('settings.appVersion')}
              trailingText={clientVersion}
              testId='settings-version'
            />
            {backendVersion
              ? <SettingsRow icon='info' title={t('settings.backendVersion')} trailingText={backendVersion} />
              : null}
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
            <SettingsRow
              icon='info'
              title={t('settings.licenses')}
              trailingIcon='chevron-right'
              selected={isActive('licenses')}
              onTap={() => goToSubPage('licenses', '/settings/licenses')}
              testId='settings-licenses'
            />
            <SettingsRow
              icon='refresh'
              title={t('upgrade.title')}
              subtitle={t('upgrade.subtitle')}
              trailingIcon='chevron-right'
              selected={isActive('upgrade')}
              onTap={() => goToSubPage('upgrade', '/settings/upgrade')}
              testId='settings-upgrade'
            />
          </SettingsSection>
          <SettingsSection title={t('settings.diagnostics')} icon='settings'>
            {/* Nested section so the four level rows read as "log level
                options" — Flutter has a dedicated 日志等级 tile for this. */}
            <SettingsSection title={t('settings.logLevelTitle')}>
              {LOG_LEVELS.map((option) => (
                <SettingsRow
                  key={option}
                  title={t(logLevelLabelKey(option))}
                  selected={option === logLevel}
                  trailingIcon={option === logLevel ? 'check' : undefined}
                  onTap={() => selectLogLevel(option)}
                  testId={`log-level-${option}`}
                />
              ))}
            </SettingsSection>
            {exportNotice
              ? (
                <view
                  className={exportNotice.kind === 'error'
                    ? 'settings__banner settings__banner--error'
                    : 'settings__banner'}
                  data-testid='export-logs-notice'
                >
                  <Icon
                    name={exportNotice.kind === 'error' ? 'warning' : 'check-circle'}
                    size={18}
                    color={exportNotice.kind === 'error' ? ICON_COLORS.danger : ICON_COLORS.primary}
                  />
                  <text className='settings__banner-text'>{exportNotice.text}</text>
                  <view
                    className='settings__banner-close'
                    bindtap={() => setExportNotice(null)}
                    data-testid='export-logs-notice-dismiss'
                  >
                    <Icon name='x' size={16} color={ICON_COLORS.content2} />
                  </view>
                </view>
              )
              : null}
            <SettingsRow
              icon='menu'
              title={t('settings.exportLogs')}
              subtitle={exportingLogs ? t('settings.exportLogsBusy') : t('settings.exportLogsSubtitle')}
              trailingIcon='chevron-right'
              disabled={exportingLogs}
              onTap={onExportLogs}
              testId='settings-export-logs'
            />
          </SettingsSection>

          {/* ── 9. Account ────────────────────────────────────────────── */}
          <SettingsSection
            title={t('settings.categoryAccount')}
            subtitle={t('settings.categoryAccountSubtitle')}
            icon='logout'
          >
            <SettingsRow
              icon='logout'
              title={t('settings.logOut')}
              danger
              onTap={onLogout}
              testId='settings-logout'
            />
          </SettingsSection>
        </view>
      </scroll-view>

      {isDualColumn
        ? (
          <view className='settings__detail' data-testid='settings-detail-pane'>
            <SettingsDetailPane activeSubPage={activeSubPage} />
          </view>
        )
        : null}
      </view>

      <ConfirmDialog
        show={showLogoutDialog}
        title={t('settings.logOut')}
        message={t('settings.logOutConfirmSubtitle')}
        confirmLabel={t('settings.logOutConfirm')}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutDialog(false)}
        testId='logout-dialog'
        confirmTestId='logout-confirm'
      />
    </view>
  )
}

function DataSection() {
  const { t } = useTranslation()
  const [importStatus, setImportStatus] = useState<string | null>(null)
  // Both directions go through the platform module's file picker / openURL, which
  // do not exist in the render realm on Web. Rendering the rows anyway meant
  // "export" was a dead tap and "import" surfaced the internal string
  // "SongloftPlatform native module not available" to the user.
  const canTransfer = getPlatformCapabilities().dataTransfer

  const handleExport = useCallback(() => {
    if (!canExport()) return
    exportPlaylists()
  }, [])

  const handleImport = useCallback(async () => {
    try {
      setImportStatus(null)
      const result = await importPlaylists()
      setImportStatus(
        t('data.importSuccess', {
          created: result.playlists_created,
          merged: result.playlists_merged,
          songs: result.songs_created + result.songs_matched,
        }),
      )
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'cancelled') {
        setImportStatus(t('data.importCancelled'))
      } else {
        setImportStatus(t('data.importFailed', { error: msg }))
      }
    }
  }, [t])

  if (!canTransfer) return null

  return (
    <SettingsSection title={t('data.sectionTitle')} icon='folder'>
      <SettingsRow
        icon='link'
        title={t('data.export')}
        subtitle={t('data.exportSubtitle')}
        trailingIcon='chevron-right'
        onTap={handleExport}
        testId='settings-export'
      />
      <SettingsRow
        icon='folder-open'
        title={t('data.import')}
        subtitle={importStatus ?? t('data.importSubtitle')}
        trailingIcon='chevron-right'
        onTap={() => void handleImport()}
        testId='settings-import'
      />
    </SettingsSection>
  )
}

/**
 * Renders the appropriate sub-page component in the right pane of the
 * dual-column layout. The pane always holds a page — `library` doubles as the
 * default (see {@link DEFAULT_SUB_PAGE}), so there is no empty state.
 */
function SettingsDetailPane({ activeSubPage }: { activeSubPage: SettingsSubPage }) {
  switch (activeSubPage) {
    case 'servers':
      return <ServerListPage />
    case 'theme-packs':
      return <ThemePacksPage />
    case 'cache':
      return <CacheManagePage />
    case 'eq':
      return <EqualizerPage />
    case 'proxy':
      return <ProxySettingsPage />
    case 'upgrade':
      return <UpgradePage />
    case 'licenses':
      return <LicensesPage />
    case 'browse-views':
      return <BrowseViewsPage />
    case 'plugins':
      return <PluginManagerPage />
    case 'tab-config':
      return <TabConfigPage />
    case 'library':
    default:
      return <LibraryOpsPage />
  }
}
