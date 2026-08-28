import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const { requestPermissionSpy, showSpy, hideSpy, writeEnabledSpy, readEnabled, writeTwoLineSpy, setTwoLineSpy } = vi.hoisted(() => ({
  requestPermissionSpy: vi.fn(async () => true),
  showSpy: vi.fn(async () => {}),
  hideSpy: vi.fn(async () => {}),
  writeEnabledSpy: vi.fn(async () => {}),
  readEnabled: vi.fn(async () => false),
  writeTwoLineSpy: vi.fn(async () => {}),
  setTwoLineSpy: vi.fn(async () => {}),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)

vi.mock('../data/settings-prefs.js', () => ({
  readAutoEnterLyrics: vi.fn(async () => false),
  writeAutoEnterLyrics: vi.fn(async () => {}),
  readNotificationLyricInTitle: vi.fn(async () => true),
  writeNotificationLyricInTitle: vi.fn(async () => {}),
  readFloatingLyricEnabled: readEnabled,
  writeFloatingLyricEnabled: writeEnabledSpy,
  readFloatingLyricFontSize: vi.fn(async () => 'medium'),
  writeFloatingLyricFontSize: vi.fn(async () => {}),
  readFloatingLyricLocked: vi.fn(async () => false),
  writeFloatingLyricLocked: vi.fn(async () => {}),
  readFloatingLyricOpacity: vi.fn(async () => 0.4),
  writeFloatingLyricOpacity: vi.fn(async () => {}),
  readFloatingLyricTwoLine: vi.fn(async () => true),
  writeFloatingLyricTwoLine: writeTwoLineSpy,
}))
vi.mock('../../../native/floating-lyric.js', () => ({
  getFloatingLyricModule: () => ({
    requestPermission: requestPermissionSpy,
    show: showSpy,
    hide: hideSpy,
    setFontSize: vi.fn(async () => {}),
    setLocked: vi.fn(async () => {}),
    setOpacity: vi.fn(async () => {}),
    setTwoLine: setTwoLineSpy,
  }),
}))

const { LyricsPage } = await import('../pages/LyricsPage.js')

/** Turns the `floatingLyric` platform capability on for the current test. */
function withFloatingLyricHost() {
  ;(globalThis as Record<string, unknown>).NativeModules = {
    SongloftFloatingLyric: { show: () => {} },
  }
}

afterEach(() => {
  vi.clearAllMocks()
  readEnabled.mockResolvedValue(false)
  delete (globalThis as Record<string, unknown>).NativeModules
})

async function renderPage() {
  render(<LyricsPage />)
  await act(async () => { await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

test('the two always-available toggles render', async () => {
  const { queryByTestId } = await renderPage()

  expect(queryByTestId('settings-auto-enter-lyrics')).toBeInTheDocument()
  expect(queryByTestId('settings-notification-lyric-title')).toBeInTheDocument()
})

test('the floating-lyric toggle is absent without a host that can draw an overlay', async () => {
  // No NativeModules in this realm → the capability is off. Rendering the toggle
  // anyway would offer a switch that can never do anything (Web has no overlay
  // window at all).
  const { queryByTestId } = await renderPage()

  expect(queryByTestId('settings-floating-lyric-toggle')).not.toBeInTheDocument()
})

test('the floating-lyric toggle appears once the host provides the module', async () => {
  withFloatingLyricHost()
  const { queryByTestId } = await renderPage()

  expect(queryByTestId('settings-floating-lyric-toggle')).toBeInTheDocument()
})

test('the appearance controls stay hidden until the overlay is switched on', async () => {
  withFloatingLyricHost()
  const { queryByTestId } = await renderPage()

  // Font size / lock / opacity only mean something for a visible overlay.
  expect(queryByTestId('floating-lyric-font-medium')).not.toBeInTheDocument()
  expect(queryByTestId('settings-floating-lyric-lock')).not.toBeInTheDocument()
  expect(queryByTestId('floating-lyric-opacity-0.4')).not.toBeInTheDocument()
})

test('the appearance controls render when the overlay is already on', async () => {
  withFloatingLyricHost()
  readEnabled.mockResolvedValue(true)
  const { queryByTestId } = await renderPage()

  expect(queryByTestId('floating-lyric-font-small')).toBeInTheDocument()
  expect(queryByTestId('floating-lyric-font-medium')).toBeInTheDocument()
  expect(queryByTestId('floating-lyric-font-large')).toBeInTheDocument()
  expect(queryByTestId('settings-floating-lyric-two-line')).toBeInTheDocument()
  expect(queryByTestId('settings-floating-lyric-lock')).toBeInTheDocument()
  for (const o of ['0.2', '0.4', '0.6', '0.8']) {
    expect(queryByTestId(`floating-lyric-opacity-${o}`), o).toBeInTheDocument()
  }
})

test('toggling two-line mode writes the pref and pushes it to the module', async () => {
  withFloatingLyricHost()
  readEnabled.mockResolvedValue(true)
  const { queryByTestId } = await renderPage()

  // The pref default is ON, so tapping the switch turns it off.
  const row = queryByTestId('settings-floating-lyric-two-line')!
  await act(async () => {
    fireEvent.tap(row.querySelector('.app-switch') as unknown as Element)
  })
  await act(async () => { await Promise.resolve() })

  expect(writeTwoLineSpy).toHaveBeenCalledWith(false)
  expect(setTwoLineSpy).toHaveBeenCalledWith(false)
})

test('enabling the overlay asks for permission before showing it', async () => {
  withFloatingLyricHost()
  const { queryByTestId } = await renderPage()

  const row = queryByTestId('settings-floating-lyric-toggle')!
  await act(async () => {
    fireEvent.tap(row.querySelector('.app-switch') as unknown as Element)
  })
  await act(async () => { await Promise.resolve() })

  expect(writeEnabledSpy).toHaveBeenCalledWith(true)
  expect(requestPermissionSpy).toHaveBeenCalled()
  expect(showSpy).toHaveBeenCalled()
  expect(hideSpy).not.toHaveBeenCalled()
})
