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
 * The page reads two zustand stores via `getState()` (non-subscribing) and the
 * settings prefs (async I/O). To keep the render hermetic + deterministic:
 * - `@tanstack/react-router` `useNavigate` → a spy (assert navigation targets);
 * - `../../auth/store/index.js` → a minimal `useAuthStore.getState().logout`
 *   spy (the real logout does storage/network work);
 * - `../../player/store/player-store.js` → `makePlayerStoreMock` with a
 *   `setPlayMode` spy so selecting a mode is observable;
 * - `../data/settings-prefs.js` → `readDefaultPlayMode` resolving a known mode +
 *   a `writeDefaultPlayMode` spy.
 *
 * The real domain helpers (labels/icons), `SettingsSection`, `SettingsRow` and
 * `Icon` all run; assertions check the rendered structure + that interactions
 * call the correct store/config, not fixtures echoed back.
 */
const { navigateSpy, logoutSpy, setPlayModeSpy, writePrefSpy, readPref, changeLangSpy, changeThemeSpy, getLogLevelSpy, setLogLevelSpy, openURLSpy } =
  vi.hoisted(() => ({
    navigateSpy: vi.fn(),
    logoutSpy: vi.fn(),
    setPlayModeSpy: vi.fn(),
    writePrefSpy: vi.fn(),
    readPref: vi.fn(async () => 'random' as const),
    changeLangSpy: vi.fn(async () => 'en' as const),
    changeThemeSpy: vi.fn(async () => 'dark' as const),
    getLogLevelSpy: vi.fn(async () => 'warn' as const),
    setLogLevelSpy: vi.fn(async () => {}),
    openURLSpy: vi.fn(),
  }))

// react-i18next → deterministic English `t` (real English resource values); the
// i18n module → real option list/coerce + a `changeAppLanguage` spy so the
// language-switch wiring is observable without driving i18next/storage.
vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('../../../i18n/index.js', () => ({
  APP_LANGUAGE_OPTIONS: ['system', 'en', 'zh'],
  PREF_LANGUAGE: 'app_language',
  coerceAppLanguage: (raw: unknown) => (raw === 'en' || raw === 'zh' ? raw : 'system'),
  changeAppLanguage: changeLangSpy,
}))

// theme model → real option list/coerce + a `changeAppTheme` spy, same shape as
// the language mock above (the settings-switch wiring is observable without
// driving the actual storage/ThemeProvider subscription).
vi.mock('../../../shared/theme/theme-model.js', () => ({
  APP_THEME_OPTIONS: ['system', 'light', 'dark'],
  PREF_THEME: 'app_theme',
  coerceAppTheme: (raw: unknown) => (raw === 'light' || raw === 'dark' ? raw : 'system'),
  getAppTheme: () => 'dark',
  resolveTheme: (app: string) => (app === 'system' ? 'dark' : app),
  changeAppTheme: changeThemeSpy,
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))

vi.mock('../../../core/network/token-cache.js', () => ({
  getCachedAccessToken: () => 'test-token',
}))

vi.mock('../../../native/native-platform.js', () => ({
  openURL: openURLSpy,
  isNativePlatformAvailable: () => true,
}))

vi.mock('../../auth/store/index.js', () => ({
  useAuthStore: { getState: () => ({ logout: logoutSpy }) },
}))

vi.mock('../../player/store/player-store.js', async () => {
  const { makePlayerStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return { ...makePlayerStoreMock({}, { playMode: 'order', setPlayMode: setPlayModeSpy }), setAudioQualityCache: vi.fn(), setNormalizeEnabled: vi.fn() }
})

vi.mock('../data/settings-prefs.js', () => ({
  readDefaultPlayMode: readPref,
  writeDefaultPlayMode: writePrefSpy,
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
  readFloatingLyricFontSize: vi.fn(async () => 'medium'),
  writeFloatingLyricFontSize: vi.fn(async () => {}),
  readFloatingLyricLocked: vi.fn(async () => false),
  writeFloatingLyricLocked: vi.fn(async () => {}),
  readFloatingLyricOpacity: vi.fn(async () => 0.4),
  writeFloatingLyricOpacity: vi.fn(async () => {}),
  coerceAudioQuality: (raw: unknown) => (raw === '320' || raw === '192' || raw === '128' ? raw : 'original'),
}))

vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({ getLogLevel: getLogLevelSpy, setLogLevel: setLogLevelSpy, getVersion: vi.fn(async () => '1.0.0') }),
}))

vi.mock('@lynx-js/lynx-ui', () => ({
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
afterEach(() => vi.clearAllMocks())

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

test('renders every section, version, server and log-out rows', async () => {
  const { queryByText, queryByTestId, queryAllByTestId } = await renderPage()

  // Section headers.
  expect(queryByText('Appearance')).toBeInTheDocument()
  expect(queryByText('Playback')).toBeInTheDocument()
  expect(queryByText('Library')).toBeInTheDocument()
  expect(queryByText('Extensions')).toBeInTheDocument()
  expect(queryByText('Cache')).toBeInTheDocument()
  expect(queryByText('Network')).toBeInTheDocument()
  expect(queryByText('About & Updates')).toBeInTheDocument()
  expect(queryByText('Account')).toBeInTheDocument()

  expect(queryByTestId('play-mode-order')).not.toBeInTheDocument()
  expect(queryByTestId('play-mode-random')).not.toBeInTheDocument()

  // The three language option rows.
  expect(queryByTestId('language-system')).toBeInTheDocument()
  expect(queryByTestId('language-en')).toBeInTheDocument()
  expect(queryByTestId('language-zh')).toBeInTheDocument()

  // The three theme option rows.
  expect(queryByTestId('theme-system')).toBeInTheDocument()
  expect(queryByTestId('theme-light')).toBeInTheDocument()
  expect(queryByTestId('theme-dark')).toBeInTheDocument()

  // The four log-level option rows + the export-logs row.
  expect(queryByTestId('log-level-debug')).toBeInTheDocument()
  expect(queryByTestId('log-level-info')).toBeInTheDocument()
  expect(queryByTestId('log-level-warn')).toBeInTheDocument()
  expect(queryByTestId('log-level-error')).toBeInTheDocument()
  expect(queryByTestId('settings-export-logs')).toBeInTheDocument()

  // Persisted defaults (system language + system theme + warn log level + audio
  // quality original) → four check glyphs.
  expect(queryAllByTestId('icon-check')).toHaveLength(4)

  // About shows the client version, and the log-out row is present.
  expect(queryByTestId('settings-version')).toBeInTheDocument()
  expect(queryByTestId('settings-server')).toBeInTheDocument()
  expect(queryByText('Log out')).toBeInTheDocument()
})

test('selecting a language applies + persists it via changeAppLanguage', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('language-zh')!)
  })

  expect(changeLangSpy).toHaveBeenCalledWith('zh')
})

test('selecting a theme applies + persists it via changeAppTheme', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('theme-light')!)
  })

  expect(changeThemeSpy).toHaveBeenCalledWith('light')
})

test('selecting a log level persists it via SettingsApi.setLogLevel', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('log-level-error')!)
  })

  expect(setLogLevelSpy).toHaveBeenCalledWith('error')
})

test('the export-logs row triggers openURL with logs endpoint', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('settings-export-logs')!)
  })

  expect(openURLSpy).toHaveBeenCalledWith(expect.stringContaining('/logs/export'))
})

// Choosing a play mode moved to the player's own toggle, along with persisting it
// — covered by `player/__tests__/full-player.test.tsx`.

test('the server row navigates to the server sub-page', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('settings-server')!)
  })

  expect(navigateSpy).toHaveBeenCalledWith({ to: '/settings/servers' })
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
    fireEvent.tap(getByTestId('theme-light')!) // any state change → re-render
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
