import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ songId: '42' }),
}))
vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)

const getSongSpy = vi.fn(async () => ({
  id: 42, type: 'local', title: 'Test Song', artist: 'Test Artist', album: 'Test Album',
  year: 2024, genre: 'Pop', language: undefined, style: undefined, duration: 180,
  filePath: '/music/test.mp3', url: undefined, coverUrl: undefined, lyricUrl: undefined,
  labels: [], bitRate: 320, sampleRate: 44100, channels: 2, format: 'mp3',
  fileSize: 5000000, playCount: 10, createdAt: '', updatedAt: '', sourceData: undefined,
  isVideo: false, isLive: false, pluginEntryPath: undefined,
}))

vi.mock('../api/index.js', () => ({
  getSongsApi: () => ({ getSong: getSongSpy, updateSong: vi.fn(async () => {}), writeTags: vi.fn(async () => {}) }),
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
