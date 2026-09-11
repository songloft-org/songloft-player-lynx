import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { SongRow } from '../widgets/SongRow.js'
import type { Song } from '../../../models/song.js'

// `SongRow` reads `t` for the accessible names on its heart and ⋯ buttons, so it
// needs the shared react-i18next mock like every other rendering test.
vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

function makeSong(isVideo: boolean): Song {
  return {
    id: 1,
    type: 'local',
    title: 'Test Song',
    artist: 'Artist',
    album: '',
    year: 0,
    duration: 60,
    fileSize: 0,
    bitRate: 0,
    sampleRate: 0,
    isLive: false,
    isVideo,
    addedAt: '',
    updatedAt: '',
  } as Song
}

test('video badge appears for video songs', () => {
  render(<SongRow song={makeSong(true)} index={0} />)
  const root = getQueriesForElement(elementTree.root!)
  expect(root.queryByText('▶')).toBeInTheDocument()
})

test('video badge does not appear for audio-only songs', () => {
  render(<SongRow song={makeSong(false)} index={0} />)
  const root = getQueriesForElement(elementTree.root!)
  expect(root.queryByText('▶')).not.toBeInTheDocument()
})
