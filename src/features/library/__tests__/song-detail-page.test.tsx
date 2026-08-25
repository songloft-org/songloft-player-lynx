import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

const { navigateToSongEditMock } = vi.hoisted(() => ({
  navigateToSongEditMock: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ songId: '42' }),
}))
vi.mock('../../../shared/nav/navigate-to-song-detail.js', () => ({
  useNavigateToSongEdit: () => navigateToSongEditMock,
}))

const getSongSpy = vi.fn(async () => ({
  id: 42, type: 'local', title: 'Test Song', artist: 'Test Artist', album: 'Test Album',
  year: 2024, genre: 'Pop', language: undefined, style: undefined, duration: 180,
  filePath: '/music/test.mp3', url: undefined, coverUrl: undefined, lyricUrl: undefined,
  labels: [], bitRate: 320, sampleRate: 44100, channels: 2, format: 'mp3',
  fileSize: 5000000, playCount: 10, createdAt: '', updatedAt: '', sourceData: undefined,
  isVideo: false, isLive: false, pluginEntryPath: undefined,
}))

vi.mock('../api/index.js', () => ({
  getSongsApi: () => ({ getSong: getSongSpy, writeTags: vi.fn(async () => {}) }),
}))

const { SongDetailPage } = await import('../pages/SongDetailPage.js')

test('renders song detail with metadata', async () => {
  render(<SongDetailPage />)
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  const { queryByText } = getQueriesForElement(elementTree.root!)

  expect(queryByText('Test Song')).toBeInTheDocument()
  expect(queryByText('Test Artist')).toBeInTheDocument()
  expect(queryByText('Test Album')).toBeInTheDocument()
  expect(queryByText('Pop')).toBeInTheDocument()
  expect(queryByText('2024')).toBeInTheDocument()
})

/*
 * The technical read-outs the player's "song info" entry exists to surface. The
 * fixture song is `bitRate: 320` (already kbps), `sampleRate: 44100`, `format:
 * mp3`, `fileSize: 5000000`, `duration: 180` — so the expected strings exercise
 * the formatters' happy paths.
 */
test('renders the technical fields (duration / format / bit rate / sample rate / size)', async () => {
  render(<SongDetailPage />)
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  const { queryByText } = getQueriesForElement(elementTree.root!)

  expect(queryByText('03:00')).toBeInTheDocument()
  expect(queryByText('MP3')).toBeInTheDocument()
  expect(queryByText('320 kbps')).toBeInTheDocument()
  expect(queryByText('44.1 kHz')).toBeInTheDocument()
  expect(queryByText('4.8 MB')).toBeInTheDocument()
})

/*
 * The edit button used to swap the page into an inline form; it now opens the
 * standalone edit page (the Flutter build's `SongEditPage`), where closing the
 * form can return to wherever it was opened from.
 */
test('the edit button opens the song edit page', async () => {
  render(<SongDetailPage />)
  await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  const { getByTestId } = getQueriesForElement(elementTree.root!)

  fireEvent.tap(getByTestId('song-detail-edit'), {})
  expect(navigateToSongEditMock).toHaveBeenCalledWith(42)
})
