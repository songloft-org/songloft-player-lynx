import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const {
  writeQualitySpy,
  setQualityCacheSpy,
  writeNormalizeSpy,
  setNormalizeEnabledSpy,
  updateVolumeNormalizeSpy,
  writeAutoResumeSpy,
  requestPermissionSpy,
  hasPermissionSpy,
  isShowingSpy,
  showSpy,
  hideSpy,
  writeEnabledSpy,
  readEnabled,
  writeTwoLineSpy,
  setTwoLineSpy,
  webKeysAvailable,
} = vi.hoisted(() => ({
  writeQualitySpy: vi.fn(async () => {}),
  setQualityCacheSpy: vi.fn(),
  writeNormalizeSpy: vi.fn(async () => {}),
  setNormalizeEnabledSpy: vi.fn(),
  updateVolumeNormalizeSpy: vi.fn(async () => {}),
  writeAutoResumeSpy: vi.fn(async () => {}),
  requestPermissionSpy: vi.fn(async () => true),
  hasPermissionSpy: vi.fn(async () => true),
  isShowingSpy: vi.fn(async () => false),
  showSpy: vi.fn(async () => {}),
  hideSpy: vi.fn(async () => {}),
  writeEnabledSpy: vi.fn(async () => {}),
  readEnabled: vi.fn(async () => false),
  writeTwoLineSpy: vi.fn(async () => {}),
  setTwoLineSpy: vi.fn(async () => {}),
  webKeysAvailable: { value: false },
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../../native/web-playback-keys.js', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasPlaybackKeys: () => webKeysAvailable.value,
}))
// The real Switch is a native gesture leaf; the mock keeps the checked→className
// mapping so an ON switch stays distinguishable from an OFF one.
vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)

vi.mock('../data/settings-prefs.js', () => ({
  readAudioQuality: vi.fn(async () => 'original'),
  writeAudioQuality: writeQualitySpy,
  readAutoResume: vi.fn(async () => false),
  writeAutoResume: writeAutoResumeSpy,
  readNormalize: vi.fn(async () => false),
  writeNormalize: writeNormalizeSpy,
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
vi.mock('../../player/store/player-store.js', () => ({
  setAudioQualityCache: setQualityCacheSpy,
  setNormalizeEnabled: setNormalizeEnabledSpy,
}))
vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({ updateVolumeNormalize: updateVolumeNormalizeSpy }),
}))
vi.mock('../../../native/floating-lyric.js', () => ({
  getFloatingLyricModule: () => ({
    hasPermission: hasPermissionSpy,
    requestPermission: requestPermissionSpy,
    isShowing: isShowingSpy,
    show: showSpy,
    hide: hideSpy,
    setFontSize: vi.fn(async () => {}),
    setLocked: vi.fn(async () => {}),
    setOpacity: vi.fn(async () => {}),
    setTwoLine: setTwoLineSpy,
  }),
}))

const { PlaybackPage } = await import('../pages/PlaybackPage.js')

/** Turns the `floatingLyric` platform capability on for the current test. */
function withFloatingLyricHost() {
  ;(globalThis as Record<string, unknown>).NativeModules = {
    SongloftFloatingLyric: { show: () => {} },
  }
}

afterEach(() => {
  webKeysAvailable.value = false
  vi.clearAllMocks()
  readEnabled.mockResolvedValue(false)
  requestPermissionSpy.mockResolvedValue(true)
  hasPermissionSpy.mockResolvedValue(true)
  isShowingSpy.mockResolvedValue(false)
  delete (globalThis as Record<string, unknown>).NativeModules
  delete (globalThis as Record<string, unknown>).SystemInfo
})

/**
 * Lets the mount effect's promise chains finish. Two macrotask turns rather than
 * one microtask flush because the overlay reconciliation is several awaits deep
 * (pref → grant → isShowing → show), and a single flush leaves the switch showing
 * the pre-reconciliation value.
 */
async function settle() {
  for (let i = 0; i < 2; i++) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
  }
}

async function renderPage() {
  render(<PlaybackPage />)
  await settle()
  return getQueriesForElement(elementTree.root!)
}

/** Taps the switch inside a `SwitchRow` and lets the resulting chain settle. */
async function tapSwitch(row: Element) {
  await act(async () => {
    fireEvent.tap(row.querySelector('.app-switch') as unknown as Element)
  })
  await settle()
}

/** The compound Switch mock appends `ui-checked` to every part when checked. */
const isOn = (row: Element): boolean =>
  row.querySelector('.app-switch')!.className.includes('ui-checked')

// ── Playback ────────────────────────────────────────────────────────────────

test('renders the four quality rows and the two toggles', async () => {
  const { queryByTestId } = await renderPage()

  for (const id of ['audio-quality-original', 'audio-quality-320', 'audio-quality-192', 'audio-quality-128']) {
    expect(queryByTestId(id), id).toBeInTheDocument()
  }
  expect(queryByTestId('settings-auto-resume')).toBeInTheDocument()
  expect(queryByTestId('settings-normalize')).toBeInTheDocument()
})

test('picking a concrete quality persists it and overrides the player store', async () => {
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('audio-quality-320')!) })

  expect(writeQualitySpy).toHaveBeenCalledWith('320')
  expect(setQualityCacheSpy).toHaveBeenCalledWith('320')
})

test('Web shortcuts are visible only with the host method and the switch changes the local preference', async () => {
  const { webShortcuts } = await import('../../player/data/web-shortcuts.js')
  webShortcuts.setState({ enabled: true })
  webKeysAvailable.value = true
  ;(globalThis as Record<string, unknown>).SystemInfo = { platform: 'web' }
  ;(globalThis as Record<string, unknown>).NativeModules = { SongloftPlatform: { setPlaybackShortcuts() {} } }
  const { queryByTestId } = await renderPage()
  const row = queryByTestId('settings-keyboard-shortcuts')!
  expect(row).toBeInTheDocument()
  await act(async () => { fireEvent.tap(row.querySelector('.app-switch') as unknown as Element) })
  expect(webShortcuts.getState().enabled).toBe(false)
  webShortcuts.setState({ enabled: true })
})

test('native hosts and older Web hosts do not advertise playback keyboard settings', async () => {
  ;(globalThis as Record<string, unknown>).SystemInfo = { platform: 'web' }
  ;(globalThis as Record<string, unknown>).NativeModules = { SongloftPlatform: {} }
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('settings-keyboard-shortcuts')).not.toBeInTheDocument()
})

test('picking "original" clears the player-store override rather than passing the string', async () => {
  // `'original'` means "do not ask the backend to transcode", which the player
  // store expresses as null. Passing the literal string through would make every
  // request carry a bogus quality parameter.
  const { queryByTestId } = await renderPage()

  await act(async () => { fireEvent.tap(queryByTestId('audio-quality-192')!) })
  await act(async () => { fireEvent.tap(queryByTestId('audio-quality-original')!) })

  expect(setQualityCacheSpy).toHaveBeenLastCalledWith(null)
  expect(writeQualitySpy).toHaveBeenLastCalledWith('original')
})

test('the normalize toggle writes all three destinations', async () => {
  // Local state + player store (so the *current* track picks it up) + pref +
  // backend. Dropping any one leaves the toggle silently half-working, which is
  // why all three spies are asserted together.
  const { queryByTestId } = await renderPage()

  // The tap target is the switch itself, not the row: `SwitchRow` puts its testId
  // on the row wrapper and the toggle lives in the trailing slot. `.app-switch` is
  // the root `Switch` (`.app-switch__track` is a separate class token, so this
  // does not match the inner parts).
  const row = queryByTestId('settings-normalize')!
  await act(async () => {
    fireEvent.tap(row.querySelector('.app-switch') as unknown as Element)
  })

  expect(setNormalizeEnabledSpy).toHaveBeenCalledWith(true)
  expect(writeNormalizeSpy).toHaveBeenCalledWith(true)
  expect(updateVolumeNormalizeSpy).toHaveBeenCalledWith(true)
})

// ── Lyrics (merged in from the former /settings/lyrics page) ──────────────────

test('the two always-available lyric toggles render', async () => {
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
  await tapSwitch(queryByTestId('settings-floating-lyric-two-line')!)

  expect(writeTwoLineSpy).toHaveBeenCalledWith(false)
  expect(setTwoLineSpy).toHaveBeenCalledWith(false)
})

test('enabling the overlay asks for permission before showing it', async () => {
  withFloatingLyricHost()
  const { queryByTestId } = await renderPage()

  await tapSwitch(queryByTestId('settings-floating-lyric-toggle')!)

  expect(writeEnabledSpy).toHaveBeenCalledWith(true)
  expect(requestPermissionSpy).toHaveBeenCalled()
  expect(showSpy).toHaveBeenCalled()
  expect(hideSpy).not.toHaveBeenCalled()
})

/*
 * The grant is not observable until the user comes back from the system screen,
 * so `requestPermission` resolves *late* (see `OverlayPermission.kt`). The bug
 * this covers: the page treated the pre-return answer as final, left the switch
 * on and never called `show()` — the reported "toggle is on but no lyrics until I
 * switch it off and on again".
 */
test('a grant that lands after the round trip still shows the overlay', async () => {
  withFloatingLyricHost()
  let grant: (granted: boolean) => void = () => {}
  requestPermissionSpy.mockReturnValueOnce(new Promise<boolean>((r) => { grant = r }))
  const { queryByTestId } = await renderPage()

  await tapSwitch(queryByTestId('settings-floating-lyric-toggle')!)
  // Still on the system screen: nothing to show yet, but the switch already
  // reads on so the tap does not look ignored.
  expect(showSpy).not.toHaveBeenCalled()
  expect(isOn(queryByTestId('settings-floating-lyric-toggle')!)).toBe(true)

  await act(async () => { grant(true) })
  await settle()

  expect(showSpy).toHaveBeenCalled()
  expect(isOn(queryByTestId('settings-floating-lyric-toggle')!)).toBe(true)
})

test('a refused grant puts the switch back down instead of lying', async () => {
  withFloatingLyricHost()
  requestPermissionSpy.mockResolvedValue(false)
  const { queryByTestId } = await renderPage()

  await tapSwitch(queryByTestId('settings-floating-lyric-toggle')!)

  expect(showSpy).not.toHaveBeenCalled()
  expect(writeEnabledSpy).toHaveBeenLastCalledWith(false)
  expect(isOn(queryByTestId('settings-floating-lyric-toggle')!)).toBe(false)
})

test('entering the page re-shows an overlay the pref says is on', async () => {
  // A fresh process has the pref but no window: the service died with the last one.
  withFloatingLyricHost()
  readEnabled.mockResolvedValue(true)
  await renderPage()

  expect(showSpy).toHaveBeenCalled()
  // Entering a page must never send the user to system settings.
  expect(requestPermissionSpy).not.toHaveBeenCalled()
})

test('entering the page leaves an already-visible overlay alone', async () => {
  withFloatingLyricHost()
  readEnabled.mockResolvedValue(true)
  isShowingSpy.mockResolvedValue(true)
  await renderPage()

  expect(showSpy).not.toHaveBeenCalled()
})

test('a grant revoked in system settings turns the pref and the switch off', async () => {
  withFloatingLyricHost()
  readEnabled.mockResolvedValue(true)
  hasPermissionSpy.mockResolvedValue(false)
  const { queryByTestId } = await renderPage()

  expect(showSpy).not.toHaveBeenCalled()
  expect(writeEnabledSpy).toHaveBeenCalledWith(false)
  expect(isOn(queryByTestId('settings-floating-lyric-toggle')!)).toBe(false)
  // …and with it the appearance controls, which only mean something for a
  // visible overlay.
  expect(queryByTestId('floating-lyric-font-medium')).not.toBeInTheDocument()
})

test('disabling the overlay hides it and clears the pref', async () => {
  withFloatingLyricHost()
  readEnabled.mockResolvedValue(true)
  isShowingSpy.mockResolvedValue(true)
  const { queryByTestId } = await renderPage()

  await tapSwitch(queryByTestId('settings-floating-lyric-toggle')!)

  expect(writeEnabledSpy).toHaveBeenLastCalledWith(false)
  expect(hideSpy).toHaveBeenCalled()
})
