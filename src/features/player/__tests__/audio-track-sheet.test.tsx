import '@testing-library/jest-dom'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { beforeEach, expect, test, vi } from 'vitest'

import type { PlayerState } from '../store/player-store.js'
import type { AudioTrackInfo } from '../../../models/audio-track.js'
import { installBackRouter, mockSong } from '../../../__tests__/_render-mocks.js'

const fixtures = vi.hoisted(() => ({
  state: {} as PlayerState,
  version: 1,
  casting: false,
  tracks: [] as AudioTrackInfo[],
  probeFailed: false,
  select: vi.fn(), close: vi.fn(), retry: vi.fn(),
}))
vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('../store/player-store.js', () => ({
  usePlayerStore: Object.assign((select: (state: PlayerState) => unknown) => select(fixtures.state), {
    getState: () => ({ setAudioTrack: fixtures.select, closeAudioTrackSheet: fixtures.close }),
  }),
}))
vi.mock('../store/dlna-store.js', () => ({
  useDlnaStore: (select: (state: { activeDevice: object | null }) => unknown) => select({ activeDevice: fixtures.casting ? {} : null }),
}))
vi.mock('../data/audio-tracks-query.js', () => ({
  useAudioTracks: () => ({ data: fixtures.tracks, isPending: false, isError: fixtures.probeFailed, refetch: fixtures.retry }),
}))
vi.mock('../../../native/index.js', () => ({
  getAudio: () => ({ getSourceLoadVersion: async () => fixtures.version }),
}))

const { AudioTrackSheet } = await import('../widgets/AudioTrackSheet.js')

beforeEach(() => {
  vi.clearAllMocks()
  installBackRouter('/player')
  fixtures.state = { currentSong: mockSong(), showAudioTrackSheet: true, audioTrack: null } as PlayerState
  fixtures.version = 1
  fixtures.casting = false
  fixtures.probeFailed = false
  fixtures.tracks = [
    { index: 2, title: '原唱', language: 'zho', codec: 'aac', default: true },
    { index: 5, title: null, language: null, codec: 'flac', default: false },
  ]
})

async function open() {
  render(<AudioTrackSheet />)
  await act(async () => { await Promise.resolve() })
  return getQueriesForElement(elementTree.root!)
}

test('renders metadata and passes the real stream index, including automatic default', async () => {
  const query = await open()
  expect(query.getByText('原唱')).toBeInTheDocument()
  expect(query.getByText('Track 6')).toBeInTheDocument()
  expect(query.getByText('zho · aac · Default')).toBeInTheDocument()
  await act(async () => { fireEvent.tap(query.getByTestId('audio-track-5')) })
  expect(fixtures.select).toHaveBeenLastCalledWith(5)
  await act(async () => { fireEvent.tap(query.getByTestId('audio-track-default')) })
  expect(fixtures.select).toHaveBeenLastCalledWith(null)
})

test('old hosts explain the upgrade and rows issue no selection', async () => {
  fixtures.version = 0
  const query = await open()
  expect(query.getByText('Update the client to switch audio tracks reliably.')).toBeInTheDocument()
  await act(async () => { fireEvent.tap(query.getByTestId('audio-track-5')) })
  expect(fixtures.select).not.toHaveBeenCalled()
})

test('probe errors offer retry; casting renders no local selector', async () => {
  fixtures.probeFailed = true
  const query = await open()
  await act(async () => { fireEvent.tap(query.getByTestId('audio-track-probe-retry')) })
  expect(fixtures.retry).toHaveBeenCalled()
})

test('DLNA suppresses the selector', async () => {
  fixtures.casting = true
  const query = await open()
  expect(query.queryByTestId('audio-track-sheet')).toBeNull()
})
