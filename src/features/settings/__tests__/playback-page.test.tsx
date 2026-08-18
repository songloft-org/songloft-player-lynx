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
} = vi.hoisted(() => ({
  writeQualitySpy: vi.fn(async () => {}),
  setQualityCacheSpy: vi.fn(),
  writeNormalizeSpy: vi.fn(async () => {}),
  setNormalizeEnabledSpy: vi.fn(),
  updateVolumeNormalizeSpy: vi.fn(async () => {}),
  writeAutoResumeSpy: vi.fn(async () => {}),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
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
}))
vi.mock('../../player/store/player-store.js', () => ({
  setAudioQualityCache: setQualityCacheSpy,
  setNormalizeEnabled: setNormalizeEnabledSpy,
}))
vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({ updateVolumeNormalize: updateVolumeNormalizeSpy }),
}))

const { PlaybackPage } = await import('../pages/PlaybackPage.js')

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<PlaybackPage />)
  await act(async () => { await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

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
