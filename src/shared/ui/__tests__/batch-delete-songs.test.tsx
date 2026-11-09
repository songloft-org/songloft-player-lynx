import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { SongsApi } from '../../../features/library/api/songs-api.js'
import { toast } from '../toast-store.js'

const h = vi.hoisted(() => ({ invalidateQueries: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => h }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('react-i18next', async () => (await import('../../../__tests__/_render-mocks.js')).mockReactI18next())
vi.mock('@lynx-js/lynx-ui-dialog', async () => (await import('../../../__tests__/_render-mocks.js')).mockLynxUiDialog())
vi.mock('../../../features/library/widgets/SongEditDialog.js', () => ({ SongEditDialog: () => null }))
vi.mock('../../../features/library/widgets/SongInfoDialog.js', () => ({ SongInfoDialog: () => null }))
vi.mock('../../../features/library/widgets/ManageTagsSheet.js', () => ({ ManageTagsSheet: () => null }))
vi.mock('../../../features/playlist/widgets/AddToPlaylistSheet.js', () => ({ AddToPlaylistSheet: () => null }))
vi.mock('../../../features/player/widgets/MiniPlayerVolumePanel.js', () => ({ MiniPlayerVolumePanel: () => null }))
vi.mock('../GlobalMenu.js', () => ({ GlobalMenu: ({ show, items, onSelect, onClose }: {
  show: boolean; items: Array<{ key: string }>; onSelect(key: string): void; onClose(): void
}) => show ? <view>{items.map(item => <view key={item.key} data-testid={`song-action-${item.key}`} bindtap={() => { onSelect(item.key); onClose() }} />)}</view> : null }))
vi.mock('../../../features/settings/widgets/SwitchRow.js', () => ({
  SwitchRow: (p: { checked: boolean; onChange(value: boolean): void; testId: string }) => (
    <view data-testid={p.testId} bindtap={() => p.onChange(!p.checked)}><text>{String(p.checked)}</text></view>
  ),
}))
// Keep the real store actions; this renderer needs an explicit rerender instead
// of Zustand's stock React subscription (see _render-mocks).
vi.mock('../song-row-overlays.js', async original => {
  const actual = await original<typeof import('../song-row-overlays.js')>()
  return { ...actual, useSongRowOverlays: Object.assign(
    (selector: (state: ReturnType<typeof actual.useSongRowOverlays.getState>) => unknown) => selector(actual.useSongRowOverlays.getState()),
    { getState: actual.useSongRowOverlays.getState },
  ) }
})
const { SongRowOverlays } = await import('../SongRowOverlays.js')
const { useSongRowOverlays } = await import('../song-row-overlays.js')

afterEach(() => { useSongRowOverlays.getState().cancelDelete(); useSongRowOverlays.getState().closeMenu(); vi.restoreAllMocks(); vi.clearAllMocks() })

test('playlist removal dispatches the row callback without deleting a library song', async () => {
  const song = { id: 11, type: 'local' } as import('../../../models/song.js').Song
  const onRemoveFromPlaylist = vi.fn()
  const remove = vi.spyOn(SongsApi.prototype, 'deleteSong')
  useSongRowOverlays.getState().openMenu({ song, row: { isWide: false, onRemoveFromPlaylist } })
  render(<SongRowOverlays />)
  const q = getQueriesForElement(elementTree.root!)
  await act(async () => { fireEvent.tap(q.getByTestId('song-action-removeFromPlaylist')) })
  expect(onRemoveFromPlaylist).toHaveBeenCalledExactlyOnceWith(song)
  expect(remove).not.toHaveBeenCalled()
  expect(useSongRowOverlays.getState().menuSong).toBeNull()
  expect(useSongRowOverlays.getState().deleteSong).toBeNull()
})

test('batch confirmation preserves files by default, invalidates lists and reports success only after deletion', async () => {
  const onDeleted = vi.fn()
  let resolve!: (count: number) => void
  const remove = vi.spyOn(SongsApi.prototype, 'batchDeleteSongs').mockReturnValue(new Promise(r => { resolve = r }))
  const view = render(<SongRowOverlays />)
  await act(async () => {
    useSongRowOverlays.getState().requestBatchDelete({ songIds: [1, 2, 41], mayHaveLocalFiles: true, onDeleted })
    view.rerender(<SongRowOverlays />)
  })
  const q = getQueriesForElement(elementTree.root!)
  expect(q.getByText('Delete 3 selected songs from the library? This cannot be undone.')).toBeInTheDocument()
  await act(async () => { fireEvent.tap(q.getByTestId('song-delete-confirm')) })
  expect(remove).toHaveBeenCalledExactlyOnceWith({ ids: [1, 2, 41], deleteFiles: false })
  expect(onDeleted).not.toHaveBeenCalled()
  await act(async () => { resolve(3) })
  expect(onDeleted).toHaveBeenCalledTimes(1)
  expect(h.invalidateQueries.mock.calls).toEqual([[{ queryKey: ['library'] }], [{ queryKey: ['playlist'] }]])
})

test('file deletion requires opt-in and a failed delete leaves the selection callback untouched', async () => {
  const onDeleted = vi.fn()
  const error = vi.spyOn(toast, 'error')
  const remove = vi.spyOn(SongsApi.prototype, 'batchDeleteSongs').mockRejectedValue(new Error('offline'))
  const view = render(<SongRowOverlays />)
  await act(async () => {
    useSongRowOverlays.getState().requestBatchDelete({ songIds: [1, 2], mayHaveLocalFiles: true, onDeleted })
    view.rerender(<SongRowOverlays />)
  })
  const q = getQueriesForElement(elementTree.root!)
  await act(async () => { fireEvent.tap(q.getByTestId('song-delete-dialog-related')) })
  await act(async () => { fireEvent.tap(q.getByTestId('song-delete-confirm')) })
  expect(remove).toHaveBeenCalledWith({ ids: [1, 2], deleteFiles: true })
  expect(onDeleted).not.toHaveBeenCalled()
  expect(h.invalidateQueries).not.toHaveBeenCalled()
  expect(error).toHaveBeenCalledWith('offline')
})

test('cancelling remote song deletion makes no API call and offers no file deletion option', async () => {
  const remove = vi.spyOn(SongsApi.prototype, 'batchDeleteSongs')
  const view = render(<SongRowOverlays />)
  await act(async () => {
    useSongRowOverlays.getState().requestBatchDelete({ songIds: [9], mayHaveLocalFiles: false })
    view.rerender(<SongRowOverlays />)
  })
  const q = getQueriesForElement(elementTree.root!)
  expect(q.queryByTestId('song-delete-dialog-related')).not.toBeInTheDocument()
  await act(async () => { fireEvent.tap(q.getByTestId('song-delete-cancel')) })
  expect(useSongRowOverlays.getState().batchDeleteSongs).toBeNull()
  expect(remove).not.toHaveBeenCalled()
})
