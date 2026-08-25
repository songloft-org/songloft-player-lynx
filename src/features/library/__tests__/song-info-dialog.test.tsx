import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'
import { clearBackHandlersForTests, dispatchBack } from '../../../shared/nav/back-stack.js'

/*
 * `SongInfoDialog` — the read-only half of the retired song detail page, now a
 * root-mounted dialog (ConfirmDialog's chrome; see the component doc).
 *
 * What is pinned here beyond the migrated page assertions (metadata rows,
 * technical formatters):
 *  - the store's song renders immediately, and the `getSong` refresh replaces
 *    it in place (zero loading state — that is the design);
 *  - the playback-source row's four states, mirroring the Flutter dialog's
 *    `_sourceLabel`;
 *  - the cache rows vanish where the platform has no cache module (Web);
 *  - back closes it, and the edit button hands the song to the caller.
 */
const { getSongSpy, writeTagsSpy, playbackSourceSpy, getCacheInfoSpy, caps } = vi.hoisted(() => ({
  getSongSpy: vi.fn(),
  writeTagsSpy: vi.fn(async () => {}),
  playbackSourceSpy: vi.fn(),
  getCacheInfoSpy: vi.fn(),
  caps: { songCache: true },
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-dialog', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiDialog(),
)
vi.mock('../api/index.js', () => ({
  getSongsApi: () => ({ getSong: getSongSpy, writeTags: writeTagsSpy }),
}))
vi.mock('../../player/store/index.js', () => ({
  playbackSourceKindOf: playbackSourceSpy,
}))
vi.mock('../../player/data/song-cache.js', () => ({
  getCacheInfo: getCacheInfoSpy,
}))
vi.mock('../../../native/platform-capabilities.js', () => ({
  getPlatformCapabilities: () => ({ songCache: caps.songCache }),
}))

const { SongInfoDialog } = await import('../widgets/SongInfoDialog.js')

function makeSong(overrides: Partial<Song> = {}): Song {
  return {
    id: 42,
    type: 'local',
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    year: 2024,
    genre: 'Pop',
    language: undefined,
    style: undefined,
    duration: 180,
    filePath: '/music/test.mp3',
    url: undefined,
    coverUrl: undefined,
    lyricUrl: undefined,
    lyricRemoteUrl: undefined,
    fileSize: 5000000,
    format: 'mp3',
    bitRate: 320,
    sampleRate: 44100,
    sourceUrl: undefined,
    sourceCoverUrl: undefined,
    isLive: false,
    isVideo: false,
    addedAt: '',
    updatedAt: '',
    ...overrides,
  }
}

beforeEach(() => {
  getSongSpy.mockReset()
  playbackSourceSpy.mockReset()
  // Default: "not the current song" — the source row then falls back to cache state.
  playbackSourceSpy.mockReturnValue(null)
  getCacheInfoSpy.mockReset()
  getCacheInfoSpy.mockResolvedValue({ cached: false, sizeBytes: 0 })
  caps.songCache = true
  clearBackHandlersForTests()
})

afterEach(() => {
  clearBackHandlersForTests()
  vi.clearAllMocks()
})

/*
 * `server` stands in for what `getSong` answers. The default echoes the
 * caller's copy — a refresh that returns the same song is the norm, and it
 * keeps the rendered data driven by the `song` prop the test passes (the
 * first version handed back a fresh local fixture unconditionally, which
 * silently overrode a remote `song` prop and broke the write-tags gating).
 */
async function renderDialog(
  song: Song | null = makeSong(),
  show = true,
  server: () => Promise<Song | null> = async () => song ?? makeSong(),
) {
  const onClose = vi.fn()
  const onEdit = vi.fn()
  getSongSpy.mockImplementation(server)
  render(<SongInfoDialog show={show} song={song} onClose={onClose} onEdit={onEdit} />)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10))
  })
  return { onClose, onEdit, ...getQueriesForElement(elementTree.root!) }
}

test('the store song renders immediately — no spinner while getSong is in flight', async () => {
  const { queryByText } = await renderDialog(makeSong(), true, () => new Promise(() => {}))

  expect(queryByText('Test Song')).toBeInTheDocument()
  expect(queryByText('Test Artist')).toBeInTheDocument()
})

test('the getSong refresh replaces the caller copy in place', async () => {
  const { queryByText } = await renderDialog(
    makeSong(),
    true,
    async () => makeSong({ title: 'Server Song', album: 'Server Album' }),
  )

  expect(getSongSpy).toHaveBeenCalledWith(42)
  expect(queryByText('Server Song')).toBeInTheDocument()
  expect(queryByText('Test Song')).not.toBeInTheDocument()
})

test('a failed refresh is silent — the caller copy stays on screen', async () => {
  const { queryByText } = await renderDialog(makeSong(), true, async () => {
    throw new Error('boom')
  })

  expect(queryByText('Test Song')).toBeInTheDocument()
})

test('renders the metadata rows', async () => {
  const { queryByText } = await renderDialog()

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
  const { queryByText } = await renderDialog()

  expect(queryByText('03:00')).toBeInTheDocument()
  expect(queryByText('MP3')).toBeInTheDocument()
  expect(queryByText('320 kbps')).toBeInTheDocument()
  expect(queryByText('44.1 kHz')).toBeInTheDocument()
  expect(queryByText('4.8 MB')).toBeInTheDocument()
})

/*
 * Four states, mirroring the Flutter dialog's `_sourceLabel`: the current song
 * reports what was actually loaded (cache/stream); anything else falls back to
 * its cache state; and with no cache info either, the row says "not playing".
 */
describe('the playback source row', () => {
  test('the current song loaded from the stream reports Streaming', async () => {
    playbackSourceSpy.mockReturnValue('stream')
    const { queryByText } = await renderDialog()
    expect(queryByText('Streaming')).toBeInTheDocument()
  })

  test('the current song loaded from cache reports Local cache', async () => {
    playbackSourceSpy.mockReturnValue('cache')
    const { queryByText } = await renderDialog()
    expect(queryByText('Local cache')).toBeInTheDocument()
  })

  test('a cached song that is not playing reports Local cache', async () => {
    getCacheInfoSpy.mockResolvedValue({ cached: true, sizeBytes: 5000000 })
    const { queryByText } = await renderDialog()
    expect(queryByText('Local cache')).toBeInTheDocument()
  })

  test('an uncached song that is not playing reports Not playing', async () => {
    const { queryByText } = await renderDialog()
    expect(queryByText('Not playing')).toBeInTheDocument()
  })
})

describe('the on-device cache rows', () => {
  test('a cached song shows the cache row with its size and the quality note', async () => {
    getCacheInfoSpy.mockResolvedValue({ cached: true, sizeBytes: 5000000 })
    const { queryByText } = await renderDialog()

    expect(queryByText('On-device cache · 4.8 MB')).toBeInTheDocument()
    expect(queryByText(/Cache quality follows/)).toBeInTheDocument()
  })

  test('where the platform has no cache module the rows and the probe are gone', async () => {
    caps.songCache = false
    const { queryByText } = await renderDialog()

    expect(queryByText('Not cached')).not.toBeInTheDocument()
    expect(getCacheInfoSpy).not.toHaveBeenCalled()
  })
})

describe('write tags', () => {
  test('offered for local songs and calls the API when tapped', async () => {
    const { getByTestId } = await renderDialog(makeSong())

    fireEvent.tap(getByTestId('song-info-write-tags'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(writeTagsSpy).toHaveBeenCalledWith(42)
  })

  test('not offered for remote songs', async () => {
    const { queryByTestId } = await renderDialog(makeSong({ type: 'remote', filePath: undefined }))
    expect(queryByTestId('song-info-write-tags')).not.toBeInTheDocument()
  })
})

test('the edit button hands the shown song to the caller', async () => {
  const { getByTestId, onEdit } = await renderDialog()

  fireEvent.tap(getByTestId('song-info-edit'), {})
  expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }))
})

test('the close button reports without editing', async () => {
  const { getByTestId, onClose, onEdit } = await renderDialog()

  fireEvent.tap(getByTestId('song-info-close'), {})
  expect(onClose).toHaveBeenCalled()
  expect(onEdit).not.toHaveBeenCalled()
})

test('back closes the dialog', async () => {
  await renderDialog()

  await act(async () => {
    expect(dispatchBack()).toBe(true)
  })
})

test('no card renders without a song (the mount point stays inert while closed)', async () => {
  const { queryByTestId } = await renderDialog(null)
  expect(queryByTestId('song-info-dialog')).not.toBeInTheDocument()
})
