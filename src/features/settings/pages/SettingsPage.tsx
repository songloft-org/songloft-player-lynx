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
import { type AudioQuality, coerceAudioQuality, readAudioQuality, readAutoResume, readNormalize, writeAudioQuality, writeAutoResume, writeNormalize } from '../data/settings-prefs.js'
import { setAudioQualityCache, setNormalizeEnabled } from '../../player/store/player-store.js'
import { canExport, exportPlaylists, importPlaylists } from '../domain/data-transfer.js'
import { LOG_LEVELS, coerceLogLevel, logLevelLabelKey, type LogLevel } from '../domain/log-level.js'
import { serverDisplay } from '../domain/settings-model.js'
import { useBreakpoint } from '../../../shared/responsive/useBreakpoint.js'
import { useScrollMemory } from '../../../shared/nav/scroll-memory.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
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
  const [backendVersion, setBackendVersion] = useState('')

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

  const openLogs = () => {
    const token = getCachedAccessToken()
    if (!token) return
    const url = `${appConfig.resolvedBaseUrl}${apiPrefix}/logs/export?access_token=${encodeURIComponent(token)}`
    openURL(url)
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
          <SettingsSection title={t('settings.musicLibraryScan')} icon='library'>
            <SettingsRow
              icon='search'
              title={t('libops.pageTitle')}
              subtitle={t('libops.entrySubtitle')}
              trailingIcon='chevron-right'
              selected={isActive('library')}
              onTap={() => goToSubPage('library', '/settings/library')}
              testId='settings-library-ops'
            />
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
                  title={t('servers.title')}
                  subtitle={serverText}
                  trailingIcon='chevron-right'
                  selected={isActive('servers')}
                  onTap={() => goToSubPage('servers', '/settings/servers')}
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

          <SettingsSection title={t('settings.diagnostics')} icon='settings'>
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
            <SettingsRow
              icon='menu'
              title={t('settings.exportLogs')}
              subtitle={t('settings.exportLogsSubtitle')}
              trailingIcon='chevron-right'
              onTap={openLogs}
              testId='settings-export-logs'
            />
          </SettingsSection>

          <SettingsSection title={t('settings.about')} icon='info'>
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
          </SettingsSection>

          <SettingsSection title={t('settings.audioQuality')} icon='music'>
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

          <SettingsSection title={t('settings.playback')} icon='music'>
            {/*
              Switches, not trailing checks. These two are on/off; the check in the
              rows above means "this is the option chosen out of the group", and
              spelling both with the same glyph is what made the page look like it
              had two unrelated conventions.
            */}
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
            {/* SongloftFloatingLyric is not registered on any host yet (see fix
                plan P2-3), so this row's stub always refuses the permission and
                the tap does nothing. Hide it until the module actually exists. */}
            {getPlatformCapabilities().floatingLyric
              ? (
                <SettingsRow
                  icon='music'
                  title={t('settings.floatingLyrics')}
                  subtitle={t('settings.floatingLyricsSubtitle')}
                  trailingIcon='chevron-right'
                  onTap={() => {
                    const m = getFloatingLyricModule()
                    void m.requestPermission().then(granted => { if (granted) void m.show() })
                  }}
                  testId='settings-floating-lyrics'
                />
              )
              : null}
          </SettingsSection>

          <SettingsSection title={t('settings.advanced')} icon='settings'>
            <SettingsRow icon='music' title={t('library.browseViews')} subtitle={t('library.browseViewsSubtitle')} trailingIcon='chevron-right' selected={isActive('browse-views')} onTap={() => goToSubPage('browse-views', '/settings/browse-views')} testId='settings-browse-views' />
            <SettingsRow icon='music' title={t('eq.title')} subtitle={t('eq.subtitle')} trailingIcon='chevron-right' selected={isActive('eq')} onTap={() => goToSubPage('eq', '/settings/eq')} testId='settings-eq' />
            <SettingsRow icon='settings' title={t('settings.storageCache')} subtitle={t('settings.cacheManageSubtitle')} trailingIcon='chevron-right' selected={isActive('cache')} onTap={() => goToSubPage('cache', '/settings/cache')} />
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
            <SettingsRow icon='link' title={t('settings.networkProxy')} subtitle={t('settings.proxySubtitle')} trailingIcon='chevron-right' selected={isActive('proxy')} onTap={() => goToSubPage('proxy', '/settings/proxy')} testId='settings-proxy' />
            <SettingsRow icon='refresh' title={t('upgrade.title')} subtitle={t('upgrade.subtitle')} trailingIcon='chevron-right' selected={isActive('upgrade')} onTap={() => goToSubPage('upgrade', '/settings/upgrade')} testId='settings-upgrade' />
          </SettingsSection>

          <DataSection />

          <SettingsSection title={t('settings.account')} icon='logout'>
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
