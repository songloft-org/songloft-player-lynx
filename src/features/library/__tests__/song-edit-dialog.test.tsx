import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'
import type { SongArtist } from '../../../models/artist.js'
import { clearBackHandlersForTests } from '../../../shared/nav/back-stack.js'

/*
 * `SongEditDialog` — the edit form half of the retired song edit page, now a
 * centered card (ConfirmDialog's chrome; see the component doc).
 *
 * The form logic is unchanged from the page: a type-driven form (local → tags +
 * rename; remote/radio → update + lyric endpoint), a read-only endpoint card,
 * and per-field validation. What the dialog adds is the store-seeded form (no
 * getSong fetch) and closing on save. The lynx-ui `Input` is mocked with a
 * placeholder-keyed testid plus a tap script, so tests can drive `onInput`
 * without a keyboard.
 */
const { writeTagsSpy, updateSongSpy, updateLyricsSpy, copyToClipboardMock, invalidateSpy, inputTaps, getSongArtistsSpy, setSongArtistsSpy } = vi.hoisted(() => ({
  writeTagsSpy: vi.fn(async () => {}),
  updateSongSpy: vi.fn(async () => {}),
  updateLyricsSpy: vi.fn(async () => {}),
  copyToClipboardMock: vi.fn(),
  invalidateSpy: vi.fn(),
  inputTaps: { script: [] as Array<{ match: RegExp; value: string }> },
  getSongArtistsSpy: vi.fn(async (): Promise<SongArtist[]> => []),
  setSongArtistsSpy: vi.fn(async (): Promise<SongArtist[]> => []),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-dialog', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiDialog(),
)
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateSpy }),
}))
vi.mock('@lynx-js/lynx-ui-input', () => ({
  Input: ({
    className,
    placeholder,
    onInput,
  }: {
    className?: string
    placeholder?: string
    onInput?: (v: string) => void
  }) => (
    <view
      className={className}
      data-testid={`song-edit-field-${placeholder ?? ''}`}
      bindtap={() => {
        const i = inputTaps.script.findIndex((t) => t.match.test(placeholder ?? ''))
        if (i >= 0) {
          const [tap] = inputTaps.script.splice(i, 1)
          onInput?.(tap.value)
        }
      }}
    >
      <text>{placeholder}</text>
    </view>
  ),
}))
vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)
vi.mock('../../../native/native-platform.js', () => ({
  copyToClipboard: copyToClipboardMock,
}))
vi.mock('../api/index.js', () => ({
  getSongsApi: () => ({
    writeTags: writeTagsSpy,
    updateSong: updateSongSpy,
    updateLyrics: updateLyricsSpy,
    getSongArtists: getSongArtistsSpy,
    setSongArtists: setSongArtistsSpy,
  }),
}))

const { SongEditDialog } = await import('../widgets/SongEditDialog.js')

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

const localSong = makeSong()

const remoteSong = makeSong({
  type: 'remote',
  title: 'Remote Song',
  artist: 'Remote Artist',
  album: 'Remote Album',
  filePath: undefined,
  url: '/api/v1/songs/42/play',
  coverUrl: '/api/v1/covers/42.jpg',
  lyricUrl: '/api/v1/songs/42/lyric',
  sourceUrl: 'https://audio.example.com/song.mp3',
  sourceCoverUrl: 'https://img.example.com/cover.jpg',
  lyricRemoteUrl: 'https://lyric.example.com/old.lrc',
  duration: 200.4,
  isVideo: true,
})

const radioSong = makeSong({
  type: 'radio',
  title: 'Radio X',
  artist: 'DJ',
  album: undefined,
  filePath: undefined,
  url: '/api/v1/songs/42/play',
  sourceUrl: 'https://radio.example.com/stream',
  sourceCoverUrl: 'https://img.example.com/radio.jpg',
  duration: 0,
})

const pluginRemoteSong = makeSong({
  type: 'remote',
  title: 'Plugin Song',
  filePath: undefined,
  url: '/api/v1/songs/42/play',
  sourceUrl: undefined,
  duration: 0,
})

beforeEach(() => {
  writeTagsSpy.mockClear()
  updateSongSpy.mockClear()
  updateLyricsSpy.mockClear()
  copyToClipboardMock.mockClear()
  invalidateSpy.mockClear()
  inputTaps.script.length = 0
  getSongArtistsSpy.mockReset()
  getSongArtistsSpy.mockResolvedValue([])
  setSongArtistsSpy.mockClear()
  setSongArtistsSpy.mockResolvedValue([])
  clearBackHandlersForTests()
})

afterEach(() => clearBackHandlersForTests())

async function renderDialog(song: Song) {
  const onClose = vi.fn()
  render(<SongEditDialog show song={song} onClose={onClose} />)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10))
  })
  return { onClose, ...getQueriesForElement(elementTree.root!) }
}

describe('local songs', () => {
  test('shows the file info card and the rename switch, no network fields', async () => {
    const { queryByText } = await renderDialog(localSong)

    expect(queryByText('Edit local song')).toBeInTheDocument()
    expect(queryByText('File info (read-only)')).toBeInTheDocument()
    expect(queryByText('/music/test.mp3')).toBeInTheDocument()
    expect(queryByText('Rename file in sync')).toBeInTheDocument()
    expect(queryByText('Source audio URL *')).not.toBeInTheDocument()
    expect(queryByText('Source cover URL')).not.toBeInTheDocument()
    expect(queryByText('Video content')).not.toBeInTheDocument()
    expect(queryByText('Server endpoint (read-only)')).not.toBeInTheDocument()
  })

  test('save writes tags with the rename switch on by default', async () => {
    const { getByTestId, onClose } = await renderDialog(localSong)

    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(writeTagsSpy).toHaveBeenCalledWith(42, {
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      renameFile: true,
    })
    expect(updateSongSpy).not.toHaveBeenCalled()
    // A save ages every library/playlist cache and closes the dialog — the
    // page's route-back became a plain close.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['library'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['playlist'] })
    expect(onClose).toHaveBeenCalled()
  })

  test('toggling the switch sends renameFile: false', async () => {
    const { getByTestId } = await renderDialog(localSong)

    const row = getByTestId('song-edit-rename-row')
    fireEvent.tap(row.querySelector('.app-switch') as unknown as Element, {})
    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(writeTagsSpy).toHaveBeenCalledWith(42, {
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      renameFile: false,
    })
  })
})

describe('remote songs', () => {
  test('shows the endpoint card and every network field', async () => {
    const { queryByText } = await renderDialog(remoteSong)

    expect(queryByText('Edit remote song')).toBeInTheDocument()
    expect(queryByText('Server endpoint (read-only)')).toBeInTheDocument()
    expect(queryByText('/api/v1/songs/42/play')).toBeInTheDocument()
    expect(queryByText('Source audio URL *')).toBeInTheDocument()
    expect(queryByText('Source cover URL')).toBeInTheDocument()
    expect(queryByText('Duration (seconds)')).toBeInTheDocument()
    expect(queryByText('Remote lyric URL')).toBeInTheDocument()
    expect(queryByText('Video content')).toBeInTheDocument()
    expect(queryByText('Rename file in sync')).not.toBeInTheDocument()
  })

  test('a changed lyric URL goes through the lyrics endpoint', async () => {
    const { getByTestId } = await renderDialog(remoteSong)

    inputTaps.script.push({ match: /lyrics API/, value: 'https://lyric.example.com/new.lrc' })
    fireEvent.tap(getByTestId('song-edit-field-Please enter a lyrics API link'), {})
    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(updateSongSpy).toHaveBeenCalledWith(42, {
      title: 'Remote Song',
      artist: 'Remote Artist',
      album: 'Remote Album',
      url: 'https://audio.example.com/song.mp3',
      coverUrl: 'https://img.example.com/cover.jpg',
      duration: 200,
      isVideo: true,
    })
    expect(updateLyricsSpy).toHaveBeenCalledWith(42, {
      lyricSource: 'url',
      lyricRemoteUrl: 'https://lyric.example.com/new.lrc',
    })
    expect(writeTagsSpy).not.toHaveBeenCalled()
  })

  test('an unchanged lyric URL does not touch the lyrics endpoint', async () => {
    const { getByTestId } = await renderDialog(remoteSong)

    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(updateSongSpy).toHaveBeenCalled()
    expect(updateLyricsSpy).not.toHaveBeenCalled()
  })

  test('plugin-sourced songs hide the URL field (nothing editable to send back)', async () => {
    const { queryByText, getByTestId } = await renderDialog(pluginRemoteSong)

    expect(queryByText('Source audio URL *')).not.toBeInTheDocument()
    expect(queryByText('Source cover URL')).toBeInTheDocument()

    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(updateSongSpy).toHaveBeenCalledWith(42, expect.objectContaining({ url: undefined }))
  })
})

describe('radio songs', () => {
  test('hides album, duration and lyric fields', async () => {
    const { queryByText } = await renderDialog(radioSong)

    expect(queryByText('Edit radio')).toBeInTheDocument()
    expect(queryByText('Album')).not.toBeInTheDocument()
    expect(queryByText('Duration (seconds)')).not.toBeInTheDocument()
    expect(queryByText('Remote lyric URL')).not.toBeInTheDocument()
    expect(queryByText('Source audio URL *')).toBeInTheDocument()
  })

  test('save updates the song and never the lyrics endpoint', async () => {
    const { getByTestId } = await renderDialog(radioSong)

    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(updateSongSpy).toHaveBeenCalledWith(42, {
      title: 'Radio X',
      artist: 'DJ',
      album: undefined,
      url: 'https://radio.example.com/stream',
      coverUrl: 'https://img.example.com/radio.jpg',
      duration: undefined,
      isVideo: false,
    })
    expect(updateLyricsSpy).not.toHaveBeenCalled()
  })
})

describe('multi-artist editing', () => {
  test('a duet preloaded from song_artists splits into rows and saves the joined display + structured set', async () => {
    // The display cache is "A & B" but the structured link carries the real
    // split; the async load must unwind the cache into two rows.
    getSongArtistsSpy.mockResolvedValueOnce([
      { artist: { id: 1, name: 'A' }, role: 'artist', position: 0 },
      { artist: { id: 2, name: 'B' }, role: 'artist', position: 1 },
      { artist: { id: 3, name: 'AB' }, role: 'album_artist', position: 0 },
    ])
    const { getByTestId, getAllByTestId } = await renderDialog(
      makeSong({ artist: 'A & B' }),
    )

    // Two lead-artist rows (album_artist filtered out), seeded by the load.
    expect(getAllByTestId('song-edit-field-Please enter an artist').length).toBe(2)

    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(writeTagsSpy).toHaveBeenCalledWith(42, expect.objectContaining({
      artist: 'A & B',
    }))
    expect(setSongArtistsSpy).toHaveBeenCalledWith(42, [
      { name: 'A', role: 'artist', position: 0 },
      { name: 'B', role: 'artist', position: 1 },
    ])
  })

  test('add artist row then save includes the new singer', async () => {
    const { getByTestId, getAllByTestId } = await renderDialog(localSong)

    expect(getAllByTestId('song-edit-field-Please enter an artist').length).toBe(1)
    fireEvent.tap(getByTestId('song-edit-artists-add'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(getAllByTestId('song-edit-field-Please enter an artist').length).toBe(2)

    // Type into the new (empty) row via the placeholder tap script — the last
    // artist input is the freshly added one; the mock Input fires onInput for
    // the first placeholder match, so push a second tap entry to reach it.
    inputTaps.script.push({ match: /enter an artist/, value: 'Partner' })
    fireEvent.tap(getAllByTestId('song-edit-field-Please enter an artist')[1]!, {})

    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(writeTagsSpy).toHaveBeenCalledWith(42, expect.objectContaining({
      artist: 'Test Artist & Partner',
    }))
    expect(setSongArtistsSpy).toHaveBeenCalledWith(42, [
      { name: 'Test Artist', role: 'artist', position: 0 },
      { name: 'Partner', role: 'artist', position: 1 },
    ])
  })

  test('a remote duet save sends updateSong with the joined artist and setSongArtists', async () => {
    getSongArtistsSpy.mockResolvedValueOnce([
      { artist: { id: 1, name: 'Singer A' }, role: 'artist', position: 0 },
      { artist: { id: 2, name: 'Singer B' }, role: 'artist', position: 1 },
    ])
    const { getByTestId } = await renderDialog(
      makeSong({ type: 'remote', title: 'Duet', artist: 'Singer A & Singer B', sourceUrl: 'https://a.example.com/x', duration: 0 }),
    )

    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(updateSongSpy).toHaveBeenCalledWith(42, expect.objectContaining({
      artist: 'Singer A & Singer B',
    }))
    expect(setSongArtistsSpy).toHaveBeenCalledWith(42, [
      { name: 'Singer A', role: 'artist', position: 0 },
      { name: 'Singer B', role: 'artist', position: 1 },
    ])
  })
})

describe('validation', () => {
  test('an empty title blocks the submit with an inline error', async () => {
    const { getByTestId, queryByText } = await renderDialog(
      makeSong({ title: '', artist: '', album: '' }),
    )

    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(queryByText('Please enter a title')).toBeInTheDocument()
    expect(writeTagsSpy).not.toHaveBeenCalled()
    expect(updateSongSpy).not.toHaveBeenCalled()
  })

  test('a URL without a scheme blocks the submit', async () => {
    const { getByTestId, queryByText } = await renderDialog(
      makeSong({ type: 'remote', title: 'X', sourceUrl: 'not-a-url', duration: 0 }),
    )

    fireEvent.tap(getByTestId('song-edit-save'), {})
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(queryByText('Please enter a valid URL')).toBeInTheDocument()
    expect(updateSongSpy).not.toHaveBeenCalled()
  })
})

describe('the read-only endpoint card', () => {
  test('copy hands the shown value to the platform clipboard', async () => {
    const { getAllByTestId } = await renderDialog(remoteSong)

    fireEvent.tap(getAllByTestId('song-edit-copy')[0]!, {})
    expect(copyToClipboardMock).toHaveBeenCalledWith('/api/v1/songs/42/play')
  })

  test('copy does not announce success before confirmation and shows failures', async () => {
    const { toast } = await import('../../../shared/ui/toast-store.js')
    const success = vi.spyOn(toast, 'success')
    const failure = vi.spyOn(toast, 'error')
    let finish!: () => void
    copyToClipboardMock.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const { getAllByTestId } = await renderDialog(remoteSong)
    fireEvent.tap(getAllByTestId('song-edit-copy')[0]!, {})
    fireEvent.tap(getAllByTestId('song-edit-copy')[0]!, {})
    expect(copyToClipboardMock).toHaveBeenCalledTimes(1)
    expect(success).not.toHaveBeenCalled()
    await act(async () => { finish(); await Promise.resolve() })
    expect(success).toHaveBeenCalledWith('Copied')
    copyToClipboardMock.mockRejectedValueOnce(new Error('denied'))
    await act(async () => { fireEvent.tap(getAllByTestId('song-edit-copy')[0]!, {}); await Promise.resolve() })
    expect(failure).toHaveBeenCalledWith(expect.stringContaining('Copy failed'))
    expect(success).toHaveBeenCalledTimes(1)
    success.mockRestore(); failure.mockRestore()
  })
})

/*
 * The dialog's one new failure mode: the page could not "fail to close" (it had
 * no close to do), but the dialog must stay open with the values intact when
 * the save rejects — otherwise the user's edits are gone behind a toast.
 */
test('a rejected save keeps the dialog open', async () => {
  updateSongSpy.mockRejectedValue(new Error('boom'))
  const { getByTestId, onClose } = await renderDialog(remoteSong)

  fireEvent.tap(getByTestId('song-edit-save'), {})
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10))
  })

  expect(updateSongSpy).toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

test('no card renders without a song (the mount point stays inert while closed)', async () => {
  const onClose = vi.fn()
  render(<SongEditDialog show={false} song={null} onClose={onClose} />)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10))
  })
  const { queryByTestId } = getQueriesForElement(elementTree.root!)

  expect(queryByTestId('song-edit-dialog')).not.toBeInTheDocument()
})
