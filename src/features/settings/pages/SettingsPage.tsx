import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { appConfig } from '../../../core/config/app-config.js'
import { logInfo } from '../../../core/logging/client-logger.js'
import { readNativeModules } from '../../../native/native-modules.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
// Vanilla (non-subscribing) store reads only — same pattern as HomePage /
// LibraryPage — so the settings graph never mounts a zustand subscription
// (which crashes the ReactLynx Vitest snapshot tree).
import { useAuthStore } from '../../auth/store/index.js'
import { serverDisplay } from '../domain/settings-model.js'
import {
  DEFAULT_SUB_PAGE,
  SUB_PAGE_ROUTES,
  parentSubPage,
  type SettingsSubPage,
} from '../domain/sub-page-nav.js'
import { useShellSeededBreakpoint } from '../../../shared/responsive/use-shell-seeded-breakpoint.js'
import { useScrollMemory } from '../../../shared/nav/scroll-memory.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageEmbedContext } from '../widgets/SubPageShell.js'
import { DuplicateCheckPage } from '../../library-ops/pages/DuplicateCheckPage.js'
import { LibraryOpsPage } from '../../library-ops/pages/LibraryOpsPage.js'
import { PluginManagerPage } from '../../jsplugin/pages/PluginManagerPage.js'
import { PluginRegistryPage } from '../../jsplugin/pages/PluginRegistryPage.js'
import { TabConfigPage } from '../../jsplugin/pages/TabConfigPage.js'
import { AboutPage } from './AboutPage.js'
import { releaseAllPluginFrames } from '../../jsplugin/domain/plugin-frame-release.js'
import { AppearancePage } from './AppearancePage.js'
import { CacheManagePage } from './CacheManagePage.js'
import { CacheTasksPage } from '../../player/pages/CacheTasksPage.js'
import { indexedSongCacheAvailable } from '../../player/data/indexed-song-cache.js'
import { DataPage } from './DataPage.js'
import { DiagnosticsPage } from './DiagnosticsPage.js'
import { LicensesPage } from './LicensesPage.js'
import { PlaybackPage } from './PlaybackPage.js'
import { ProxySettingsPage } from './ProxySettingsPage.js'
import { ServerEditPage } from './ServerEditPage.js'
import { ServerListPage } from './ServerListPage.js'
import { ThemeCatalogPage } from './ThemeCatalogPage.js'
import './SettingsPage.css'

/** Width threshold (px) for activating the dual-column layout. */
const DUAL_COLUMN_MIN_WIDTH = 768

/** Scroll-memory key for the settings list; see {@link useScrollMemory}. */
const SCROLL_KEY = 'settings'

/**
 * Settings page, rendered inside the shell at `/settings`.
 *
 * The list is **entry rows only** — one row per sub-page, grouped into cards.
 * Nothing is set in place here. It used to be both at once: theme, language,
 * quality, log level, four lyric toggles and the whole floating-lyric group were
 * expanded inline while six other categories were single rows, so reaching "about"
 * meant scrolling past forty rows of controls. Each of those groups is now its own
 * sub-page owning its own state and prefs, which also means this page issues **no
 * reads at all** on mount (it used to fire eleven).
 *
 * Two behaviours the rows carry:
 * - **capability guards** — the data row is hidden where the platform has no file
 *   picker, and the server row where the backend is bundled (`isEmbedded`);
 * - **dual-column** (>=768px) — rows swap the right pane instead of routing, so
 *   the list stays put. `SubPageEmbedContext` tells the sub-pages they are in the
 *   pane, which is how they drop their (there, dead) back arrow. Third-level pages
 *   (theme store, duplicates, plugin store, licenses, server form) swap the pane
 *   too — see `domain/sub-page-nav.ts` for how the pane derives their parents.
 */
export function SettingsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // The list is entry rows and every one leads to a sub-page, so losing the offset
  // on the way back means re-scrolling each time. In single-column mode a sub-page
  // is a sibling route, which unmounts this page — hence the module-level memory
  // rather than a `useRef`.
  const { initialOffset, onScroll } = useScrollMemory(SCROLL_KEY)
  // The selector is how the width gets measured on mount: this page is not in the
  // first paint, so on Web `bindlayoutchange` never fires for it at all. Seeded
  // from the shell cache so frame 1 is right (songloft-player-lynx#6).
  const { width: layoutWidth, onLayoutChange } = useShellSeededBreakpoint('.settings')
  const isDualColumn = layoutWidth >= DUAL_COLUMN_MIN_WIDTH

  /**
   * Active sub-page for the right pane in dual-column mode. Seeded with the
   * first row of the list so the pane is never blank on a wide screen.
   */
  const [activeSubPage, setActiveSubPage] = useState<SettingsSubPage>(DEFAULT_SUB_PAGE)
  /**
   * Profile the pane's server form is editing, or `undefined` for "add a server".
   * Held here rather than inside `ServerListPage` because the form is a pane page
   * of its own — the list unmounts when the pane swaps to it.
   */
  const [serverFormId, setServerFormId] = useState<string | undefined>(undefined)
  const [showLogoutDialog, setShowLogoutDialog] = useState(false)

  const serverText = serverDisplay(appConfig.baseUrl, appConfig.isEmbedded, {
    embedded: t('settings.serverEmbedded'),
    notConfigured: t('settings.serverNotConfigured'),
  })

  const confirmLogout = () => {
    setShowLogoutDialog(false)
    /*
     * Plugin frames outlive their pages on Web (they are kept alive so a tab
     * switch never detaches them — see `plugin-frame-release.ts`), so logging out
     * has to release them explicitly. Otherwise a logged-out session leaves
     * plugin documents polling with a token that is no longer valid.
     */
    releaseAllPluginFrames()
    void useAuthStore.getState().logout()
    void navigate({ to: '/login' })
  }

  const showConnection = !appConfig.isEmbedded
  // Export/import both go through the platform module's file picker, which does not
  // exist in the render realm on Web. `DataPage` guards itself too (for deep
  // links); this keeps the row out of the list so the tap is never a dead end.
  const caps = getPlatformCapabilities()
  const showData = caps.dataTransfer
  const showBackgroundKeepAlive = caps.backgroundKeepAlive

  /**
   * Navigate to a sub-page: in dual-column mode, show it in the right pane;
   * in single-column mode, use the router.
   *
   * The route is looked up rather than passed in: every row used to hand over both
   * its page id and its path, which is the same "sub-page ↔ route" fact written
   * sixteen times. It now lives once, in `SUB_PAGE_ROUTES`.
   */
  const goToSubPage = (page: SettingsSubPage) => {
    if (isDualColumn) {
      // Logged because a pane swap unmounts a whole page and mounts another
      // inside one commit; when something goes wrong mid-swap the exported log
      // is the only record of which pair it was.
      logInfo('settings', `pane ${activeSubPage} → ${page}`)
      setActiveSubPage(page)
    } else {
      const route = SUB_PAGE_ROUTES[page]
      logInfo('settings', `route → ${route}`)
      void navigate({ to: route })
    }
  }

  /**
   * Open the pane's server form — `id` set to edit that profile, omitted to add a
   * new one. Only reached in dual-column mode: as a route, `ServerListPage` does
   * its own `navigate` instead (it is the one holding the `+` button).
   */
  const openServerForm = (id?: string) => {
    logInfo('settings', `pane ${activeSubPage} → server-form${id ? ` (${id})` : ''}`)
    setServerFormId(id)
    setActiveSubPage('server-form')
  }

  /**
   * Whether a sub-page row is the one currently shown in the right pane — or the
   * parent of it, so drilling one level deeper (library → duplicates, plugins →
   * store, about → licenses, appearance → theme store, servers → server form)
   * keeps the row the user came through lit rather than unlighting the whole list.
   *
   * Only meaningful in dual-column mode — in single-column mode the rows are plain
   * navigation entries and highlighting one of them would look like a stuck
   * selection.
   */
  const isActive = (page: SettingsSubPage) =>
    isDualColumn && (activeSubPage === page || parentSubPage(activeSubPage) === page)

  /*
   * In the dual-column layout the right pane swaps sub-pages in place — the router
   * stays on `/settings`, so there is no route for the back key to pop. Back moves
   * the pane one level up instead: to the parent sub-page for a third-level page,
   * and to the default page for a second-level one. Only while a non-default page
   * is showing: at the default, back falls through to the route level, which (this
   * being a tab root) offers "press again to exit".
   *
   * `parentSubPage` reads the route table, so the pane and the hardware key agree
   * with the back arrows without a second parent table (AGENTS §3.4). Without it a
   * third-level page's back jumped straight to "appearance", skipping the page the
   * user had drilled in from.
   *
   * The sub-pages themselves register nothing here — `SubPageShell` hides its back
   * affordance inside the pane (this is the "dead key" its comment names), and any
   * overlay they open registers above this handler and so closes first.
   */
  useBackHandler(isDualColumn && activeSubPage !== DEFAULT_SUB_PAGE, () => {
    setActiveSubPage(parentSubPage(activeSubPage) ?? DEFAULT_SUB_PAGE)
    return true
  })

  return (
    <view className='settings' data-testid='settings-root' bindlayoutchange={onLayoutChange}>
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
            {/* Cards carry the grouping, so none of them needs a heading — the
                row labels are the sub-page titles and say enough on their own. */}

            {/* ── Presentation & playback ──────────────────────────────── */}
            <SettingsSection>
              <SettingsRow
                icon='palette'
                title={t('settings.categoryAppearance')}
                subtitle={t('settings.categoryAppearanceSubtitle')}
                trailingIcon='chevron-right'
                selected={isActive('appearance')}
                onTap={() => goToSubPage('appearance')}
                testId='settings-appearance'
              />
              <SettingsRow
                icon='music'
                title={t('settings.categoryPlayback')}
                subtitle={t('settings.categoryPlaybackSubtitle')}
                trailingIcon='chevron-right'
                selected={isActive('playback')}
                onTap={() => goToSubPage('playback')}
                testId='settings-playback'
              />
            </SettingsSection>

            {/* ── Content & extensions ─────────────────────────────────── */}
            <SettingsSection>
              <SettingsRow
                icon='search'
                title={t('libops.pageTitle')}
                subtitle={t('libops.entrySubtitle')}
                trailingIcon='chevron-right'
                selected={isActive('library')}
                onTap={() => goToSubPage('library')}
                testId='settings-library-ops'
              />
              <SettingsRow
                icon='menu'
                title={t('settings.plugins')}
                subtitle={t('jsplugin.managerSubtitle')}
                trailingIcon='chevron-right'
                selected={isActive('plugins')}
                onTap={() => goToSubPage('plugins')}
                testId='settings-plugins'
              />
              <SettingsRow
                icon='menu'
                title={t('jsplugin.tabConfigTitle')}
                subtitle={t('jsplugin.tabConfigSubtitle')}
                trailingIcon='chevron-right'
                selected={isActive('tab-config')}
                onTap={() => goToSubPage('tab-config')}
                testId='settings-tab-config'
              />
            </SettingsSection>

            {/* ── System ───────────────────────────────────────────────── */}
            <SettingsSection>
              {indexedSongCacheAvailable() && <SettingsRow
                icon='download' title={t('deviceCache.title')} subtitle={t('deviceCache.entrySubtitle')}
                trailingIcon='chevron-right' onTap={() => { void navigate({ to: '/device-cache' }) }} testId='settings-device-cache' />}
              {indexedSongCacheAvailable() && <SettingsRow
                icon='download' title={t('cacheTasks.title')} subtitle={t('cacheTasks.entrySubtitle')}
                trailingIcon='chevron-right' selected={isActive('cache-tasks')}
                onTap={() => goToSubPage('cache-tasks')} testId='settings-cache-tasks' />}
              <SettingsRow
                icon='settings'
                title={t('settings.storageCache')}
                subtitle={t('settings.cacheManageSubtitle')}
                trailingIcon='chevron-right'
                selected={isActive('cache')}
                onTap={() => goToSubPage('cache')}
                testId='settings-cache'
              />
              {showConnection
                ? (
                  <SettingsRow
                    icon='link'
                    title={t('servers.title')}
                    subtitle={serverText}
                    trailingIcon='chevron-right'
                    selected={isActive('servers')}
                    onTap={() => goToSubPage('servers')}
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
                onTap={() => goToSubPage('proxy')}
                testId='settings-proxy'
              />
              {showData
                ? (
                  <SettingsRow
                    icon='folder'
                    title={t('settings.categoryData')}
                    subtitle={t('settings.categoryDataSubtitle')}
                    trailingIcon='chevron-right'
                    selected={isActive('data')}
                    onTap={() => goToSubPage('data')}
                    testId='settings-data'
                  />
                )
                : null}
              {showBackgroundKeepAlive
                ? (
                  <SettingsRow
                    icon='settings'
                    title={t('settings.backgroundKeepAlive')}
                    subtitle={t('settings.backgroundKeepAliveSubtitle')}
                    trailingIcon='open-external'
                    onTap={() => {
                      const mod = readNativeModules()?.SongloftAudio as Record<string, Function> | undefined
                      mod?.openManufacturerWhitelist?.()
                    }}
                    testId='settings-background-keepalive'
                  />
                )
                : null}
            </SettingsSection>

            {/* ── Diagnostics & about ──────────────────────────────────── */}
            <SettingsSection>
              <SettingsRow
                icon='settings'
                title={t('settings.diagnostics')}
                subtitle={t('settings.diagnosticsSubtitle')}
                trailingIcon='chevron-right'
                selected={isActive('diagnostics')}
                onTap={() => goToSubPage('diagnostics')}
                testId='settings-diagnostics'
              />
              <SettingsRow
                icon='info'
                title={t('settings.aboutUpdates')}
                subtitle={t('settings.aboutSubtitle')}
                trailingIcon='chevron-right'
                selected={isActive('about')}
                onTap={() => goToSubPage('about')}
                testId='settings-about'
              />
            </SettingsSection>

            {/* ── Account ──────────────────────────────────────────────── */}
            <SettingsSection>
              <SettingsRow
                icon='logout'
                title={t('settings.logOut')}
                danger
                onTap={() => setShowLogoutDialog(true)}
                testId='settings-logout'
              />
            </SettingsSection>
          </view>
        </scroll-view>

        {isDualColumn
          ? (
            <view className='settings__detail' data-testid='settings-detail-pane'>
              {/* Tells every `SubPageShell` below that it is in the pane, so it
                  drops the back arrow (the list is right there and the router is
                  already at `/settings`). */}
              <SubPageEmbedContext.Provider value={true}>
                <SettingsDetailPane
                  activeSubPage={activeSubPage}
                  serverFormId={serverFormId}
                  onOpenSubPage={setActiveSubPage}
                  onOpenServerForm={openServerForm}
                />
              </SubPageEmbedContext.Provider>
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

/**
 * Renders the appropriate sub-page component in the right pane of the
 * dual-column layout. The pane always holds a page — `appearance` doubles as the
 * default (see {@link DEFAULT_SUB_PAGE}), so there is no empty state.
 *
 * `onOpenSubPage` lets a pane swap to another sub-page *without* a route
 * navigation. Every third-level drill-in uses it — appearance → theme store,
 * library → duplicates, plugins → store, about → licenses, servers → server form
 * — because routing there would unmount this whole master–detail page and drop the
 * settings list (the wide-screen "first-level" menu).
 *
 * `onOpenServerForm` is the one drill-in that carries an argument (which profile),
 * so it cannot go through `onOpenSubPage` alone.
 */
function SettingsDetailPane({
  activeSubPage,
  serverFormId,
  onOpenSubPage,
  onOpenServerForm,
}: {
  activeSubPage: SettingsSubPage
  serverFormId: string | undefined
  onOpenSubPage: (page: SettingsSubPage) => void
  onOpenServerForm: (id?: string) => void
}) {
  switch (activeSubPage) {
    case 'appearance':
      return (
        <AppearancePage
          onOpenCatalog={() => onOpenSubPage('theme-catalog')}
        />
      )
    case 'theme-catalog':
      return <ThemeCatalogPage onBack={() => onOpenSubPage('appearance')} />
    case 'playback':
      return <PlaybackPage />
    case 'library':
      return <LibraryOpsPage onOpenDuplicates={() => onOpenSubPage('duplicates')} />
    case 'duplicates':
      return <DuplicateCheckPage onBack={() => onOpenSubPage('library')} />
    case 'plugins':
      return <PluginManagerPage onOpenStore={() => onOpenSubPage('registry')} />
    case 'registry':
      return <PluginRegistryPage onBack={() => onOpenSubPage('plugins')} />
    case 'tab-config':
      return <TabConfigPage />
    case 'cache':
      return <CacheManagePage />
    case 'cache-tasks':
      return <CacheTasksPage />
    case 'servers':
      return <ServerListPage onOpenServerForm={onOpenServerForm} />
    case 'server-form':
      return (
        <ServerEditPage
          // Keyed on the profile because the form seeds three `useState` from that
          // store row: the component's identity IS "which server am I editing".
          // Today the list always sits between two visits (there is no form → form
          // path), so this is insurance rather than a live fix.
          key={serverFormId ?? '__add__'}
          editId={serverFormId}
          onBack={() => onOpenSubPage('servers')}
        />
      )
    case 'proxy':
      return <ProxySettingsPage />
    case 'data':
      return <DataPage />
    case 'diagnostics':
      return <DiagnosticsPage />
    case 'about':
      return <AboutPage onOpenLicenses={() => onOpenSubPage('licenses')} />
    case 'licenses':
      return <LicensesPage onBack={() => onOpenSubPage('about')} />
    default: {
      // Every member is listed above, so adding one to `SettingsSubPage` without
      // a case here is a compile error rather than a silent fall-through to the
      // wrong page (17 branches is well past the size where that goes unnoticed).
      const exhaustive: never = activeSubPage
      void exhaustive
      return <AppearancePage />
    }
  }
}
