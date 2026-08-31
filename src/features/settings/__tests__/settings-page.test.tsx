import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import type { ReactNode } from '@lynx-js/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  act,
  fireEvent,
  getQueriesForElement,
  render,
} from '@lynx-js/react/testing-library'

/**
 * SettingsPage render smoke.
 *
 * The page is an **entry list**: one row per sub-page, no controls of its own. So
 * the assertions here are about the rows and where they lead; what each sub-page
 * then does is covered by its own test file (`appearance-page`, `playback-page`,
 * `data-page`, `about-page`, `diagnostics-page`).
 *
 * To keep the render hermetic: `useNavigate` → a spy (assert navigation targets),
 * the auth store → a `logout` spy. The remaining mocks are for the **sub-page
 * modules** this page imports (all 16 of them are imported for the dual-column
 * pane, so their module bodies get evaluated even though they never mount here).
 */
const { navigateSpy, logoutSpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  logoutSpy: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('../../../i18n/index.js', () => ({
  APP_LANGUAGE_OPTIONS: ['system', 'en', 'zh'],
  PREF_LANGUAGE: 'app_language',
  coerceAppLanguage: (raw: unknown) => (raw === 'en' || raw === 'zh' ? raw : 'system'),
  changeAppLanguage: vi.fn(async () => {}),
}))
vi.mock('../../../shared/theme/theme-model.js', () => ({
  APP_THEME_OPTIONS: ['system', 'light', 'dark'],
  PREF_THEME: 'app_theme',
  coerceAppTheme: (raw: unknown) => (raw === 'light' || raw === 'dark' ? raw : 'system'),
  getAppTheme: () => 'dark',
  resolveTheme: (app: string) => (app === 'system' ? 'dark' : app),
  changeAppTheme: vi.fn(async () => {}),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))

vi.mock('../../../core/network/token-cache.js', () => ({
  getCachedAccessToken: () => 'test-token',
}))

vi.mock('../../../native/native-platform.js', () => ({
  openURL: vi.fn(),
  isNativePlatformAvailable: () => true,
}))

vi.mock('../../auth/store/index.js', () => ({
  useAuthStore: { getState: () => ({ logout: logoutSpy }) },
}))

vi.mock('../../player/store/player-store.js', async () => {
  const { makePlayerStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return { ...makePlayerStoreMock({}), setAudioQualityCache: vi.fn(), setNormalizeEnabled: vi.fn() }
})

vi.mock('../data/settings-prefs.js', () => ({
  readAudioQuality: vi.fn(async () => 'original'),
  writeAudioQuality: vi.fn(async () => {}),
  readAutoResume: vi.fn(async () => false),
  writeAutoResume: vi.fn(async () => {}),
  readNormalize: vi.fn(async () => false),
  writeNormalize: vi.fn(async () => {}),
  readAutoEnterLyrics: vi.fn(async () => false),
  writeAutoEnterLyrics: vi.fn(async () => {}),
  readNotificationLyricInTitle: vi.fn(async () => true),
  writeNotificationLyricInTitle: vi.fn(async () => {}),
  readFloatingLyricEnabled: vi.fn(async () => false),
  writeFloatingLyricEnabled: vi.fn(async () => {}),
  readFloatingLyricFontSize: vi.fn(async () => 'medium'),
  writeFloatingLyricFontSize: vi.fn(async () => {}),
  readFloatingLyricLocked: vi.fn(async () => false),
  writeFloatingLyricLocked: vi.fn(async () => {}),
  readFloatingLyricOpacity: vi.fn(async () => 0.4),
  writeFloatingLyricOpacity: vi.fn(async () => {}),
}))

vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({
    getLogLevel: vi.fn(async () => 'warn'),
    setLogLevel: vi.fn(async () => {}),
    getVersion: vi.fn(async () => '1.0.0'),
    updateVolumeNormalize: vi.fn(async () => {}),
  }),
  // Imported via AppearancePage's theme-pack card; only called at render, which
  // never happens here — standing it in keeps the mock a complete barrel
  // stand-in for every sub-page module this page pulls in.
  getThemePacksApi: () => ({
    list: vi.fn(async () => []),
    deletePack: vi.fn(async () => {}),
    refreshCatalog: vi.fn(async () => []),
    installFromCatalog: vi.fn(async () => {}),
  }),
}))

vi.mock('../data/log-export.js', () => ({
  exportAndShareLogs: vi.fn(async () => ({ hasBackend: true, hasFrontend: true })),
}))

vi.mock('@lynx-js/lynx-ui-dialog', () => ({
  DialogRoot: ({ children, show }: { children: ReactNode; show: boolean }) => show ? <view>{children}</view> : null,
  DialogView: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogBackdrop: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogContent: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogClose: ({ children }: { children: ReactNode }) => <view>{children}</view>,
}))

// Real module (not mocked): the scroll offset it holds is the thing under test in
// the round-trip case below. Module state outlives a `render()`, so it is reset
// per test.
const { clearScrollMemory } = await import('../../../shared/nav/scroll-memory.js')

const { SettingsPage } = await import('../pages/SettingsPage.js')

beforeEach(() => clearScrollMemory())
afterEach(() => {
  vi.clearAllMocks()
  delete (globalThis as Record<string, unknown>).NativeModules
})

async function renderPage() {
  const { unmount } = render(<SettingsPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return { ...getQueriesForElement(elementTree.root!), unmount }
}

/**
 * Fires `bindscroll` on the settings list.
 *
 * The event has to be addressed through a selector query: jsdom makes the
 * hyphenated `<scroll-view>` an `HTMLElement`, and the testing library's
 * `getElement` only accepts an `HTMLUnknownElement` (what non-hyphenated tags like
 * `<view>` become) — so passing the element straight in throws. Its `.d.ts` types
 * the target as `Element`, hence the cast.
 */
function scrollListTo(scrollTop: number) {
  const target = lynx.createSelectorQuery().select('[data-testid="settings-scroll"]')
  fireEvent.scroll(target as unknown as Element, { detail: { scrollTop } })
}

/** Entry rows always present, paired with where each one leads. */
const ENTRY_ROWS: Array<[string, string]> = [
  ['settings-appearance', '/settings/appearance'],
  ['settings-playback', '/settings/playback'],
  ['settings-library-ops', '/settings/library'],
  ['settings-plugins', '/settings/plugins'],
  ['settings-tab-config', '/settings/tab-config'],
  ['settings-cache', '/settings/cache'],
  ['settings-server', '/settings/servers'],
  ['settings-proxy', '/settings/proxy'],
  ['settings-diagnostics', '/settings/diagnostics'],
  ['settings-about', '/settings/about'],
]

/**
 * Controls that used to be expanded inline on this page. Every one of them now
 * belongs to a sub-page, so finding any of them here means a group was not moved
 * — the single assertion that keeps this page an entry list.
 */
const IN_PLACE_CONTROLS = [
  'theme-system', 'theme-light', 'theme-dark',
  'language-system', 'language-en', 'language-zh',
  'audio-quality-original', 'audio-quality-320', 'audio-quality-192', 'audio-quality-128',
  'settings-auto-resume', 'settings-normalize',
  'settings-auto-enter-lyrics', 'settings-notification-lyric-title',
  'settings-floating-lyric-toggle',
  'log-level-debug', 'log-level-info', 'log-level-warn', 'log-level-error',
  'settings-export-logs',
  'settings-version',
  'settings-licenses',
  'settings-export', 'settings-import',
]

test('renders one entry row per sub-page, plus log out', async () => {
  const { queryByTestId } = await renderPage()

  for (const [testId] of ENTRY_ROWS) {
    expect(queryByTestId(testId), testId).toBeInTheDocument()
  }
  expect(queryByTestId('settings-logout')).toBeInTheDocument()
})

test('holds no in-place control of its own', async () => {
  const { queryByTestId, queryAllByTestId } = await renderPage()

  for (const testId of IN_PLACE_CONTROLS) {
    expect(queryByTestId(testId), testId).not.toBeInTheDocument()
  }
  // No option groups left, so not a single tick either (this used to be 4).
  expect(queryAllByTestId('icon-check')).toHaveLength(0)
})

test.each(ENTRY_ROWS)('%s navigates to %s', async (testId, route) => {
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId(testId)!)
  })

  expect(navigateSpy).toHaveBeenCalledWith({ to: route })
})

test('the data row is hidden where the platform has no file picker', async () => {
  // Tapping it would open a page whose only two actions cannot work — on Web the
  // picker does not exist in the render realm at all.
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('settings-data')).not.toBeInTheDocument()
})

test('the data row appears, and navigates, on a host with a file picker', async () => {
  ;(globalThis as Record<string, unknown>).NativeModules = {
    SongloftPlatform: { pickFile: () => {} },
  }
  const { queryByTestId } = await renderPage()

  expect(queryByTestId('settings-data')).toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(queryByTestId('settings-data')!)
  })
  expect(navigateSpy).toHaveBeenCalledWith({ to: '/settings/data' })
})

test('the list starts at the top on the first visit of a session', async () => {
  const { getByTestId } = await renderPage()
  expect(getByTestId('settings-scroll').getAttribute('initial-scroll-offset')).toBe('0')
})

test('returning from a sub-page restores where the list was scrolled to', async () => {
  // Sub-pages are *sibling* routes (`/settings/cache` is not nested under
  // `/settings`), so opening one unmounts this page — which is why the offset
  // cannot live in a `useRef`.
  const first = await renderPage()
  scrollListTo(428)
  first.unmount()

  const second = await renderPage()
  // `initial-scroll-offset` rather than `scroll-top` — see `scroll-memory.ts` for
  // why that is the only prop wired on all five scroller implementations.
  expect(second.getByTestId('settings-scroll').getAttribute('initial-scroll-offset')).toBe('428')
})

test('the restore offset is frozen for the lifetime of the mount', async () => {
  // Re-applying a *changed* offset would re-issue a programmatic scroll on every
  // unrelated re-render and fight the user's finger, so scrolling must not feed
  // back into the rendered attribute.
  const { getByTestId } = await renderPage()

  scrollListTo(428)
  await act(async () => {
    // Opening the log-out dialog is the only state this page still owns, so it is
    // now how a re-render gets provoked (it used to tap a theme option row).
    fireEvent.tap(getByTestId('settings-logout')!)
  })

  expect(getByTestId('settings-scroll').getAttribute('initial-scroll-offset')).toBe('0')
})

test('log out shows dialog, confirm calls auth logout then routes to /login', async () => {
  const { queryByTestId } = await renderPage()

  // Tap opens the dialog; no logout / navigation yet.
  await act(async () => {
    fireEvent.tap(queryByTestId('settings-logout')!)
  })
  expect(logoutSpy).not.toHaveBeenCalled()
  expect(navigateSpy).not.toHaveBeenCalled()

  // Confirm button in dialog logs out + routes to /login.
  await act(async () => {
    fireEvent.tap(queryByTestId('logout-confirm')!)
  })
  expect(logoutSpy).toHaveBeenCalledTimes(1)
  expect(navigateSpy).toHaveBeenCalledWith({ to: '/login' })
})
