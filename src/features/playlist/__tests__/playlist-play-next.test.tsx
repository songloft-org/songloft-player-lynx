import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { Song } from '../../../models/song.js'
import { LibraryViewportProvider } from '../../library/pages/library-viewport.js'
import { PlaylistDetailSongRow } from '../widgets/PlaylistDetailSongRow.js'

const player = vi.hoisted(() => ({ playSongNext: vi.fn(async (_song: Song) => {}), playSong: vi.fn() }))
vi.mock('../../player/store/index.js', () => ({ usePlayerStore: Object.assign(
  (selector: (state: typeof player) => unknown) => selector(player),
  { getState: () => player },
) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))
vi.mock('react-i18next', async () => (await import('../../../__tests__/_render-mocks.js')).mockReactI18next())
vi.mock('../../library/data/favorites.js', async () => (await import('../../../__tests__/_render-mocks.js')).mockFavorites().module)
vi.mock('../../library/widgets/SongEditDialog.js', () => ({ SongEditDialog: () => null }))
vi.mock('../../library/widgets/SongInfoDialog.js', () => ({ SongInfoDialog: () => null }))
vi.mock('../../library/widgets/ManageTagsSheet.js', () => ({ ManageTagsSheet: () => null }))
vi.mock('../widgets/AddToPlaylistSheet.js', () => ({ AddToPlaylistSheet: () => null }))
vi.mock('../../player/widgets/MiniPlayerVolumePanel.js', () => ({ MiniPlayerVolumePanel: () => null }))
vi.mock('../../../shared/ui/DeleteConfirmDialog.js', () => ({ DeleteConfirmDialog: () => null }))
// The root overlay and menu builder remain real. Only the anchored surface is
// replaced; browser checks exercise its measurement and actual rendering.
vi.mock('../../../shared/ui/GlobalMenu.js', () => ({ GlobalMenu: ({ show, items, onSelect, onClose }: {
  show: boolean; items: Array<{ key: string; label: string }>; onSelect(key: string): void; onClose(): void
}) => show ? <view>{items.map(item => <view key={item.key} data-testid={`song-action-${item.key}`}
  bindtap={() => { onSelect(item.key); onClose() }}><text>{item.label}</text></view>)}</view> : null }))
// Preserve real overlay actions and state, with explicit rerenders for this
// renderer instead of Zustand's stock React subscription.
vi.mock('../../../shared/ui/song-row-overlays.js', async original => {
  const actual = await original<typeof import('../../../shared/ui/song-row-overlays.js')>()
  return { ...actual, useSongRowOverlays: Object.assign(
    (selector: (state: ReturnType<typeof actual.useSongRowOverlays.getState>) => unknown) => selector(actual.useSongRowOverlays.getState()),
    { getState: actual.useSongRowOverlays.getState },
  ) }
})
const { SongRowOverlays } = await import('../../../shared/ui/SongRowOverlays.js')
const { useSongRowOverlays } = await import('../../../shared/ui/song-row-overlays.js')

afterEach(() => { useSongRowOverlays.getState().closeMenu(); vi.clearAllMocks() })

for (const isBuiltIn of [false, true]) {
  for (const isWide of [false, true]) {
    test(`${isBuiltIn ? 'favorites' : 'playlist'} ${isWide ? 'wide' : 'narrow'} menu schedules the selected song`, async () => {
      const song = { id: 17, type: 'local', title: 'Playlist pick', duration: 180 } as Song
      const onTap = vi.fn()
      const onRemove = vi.fn()
      const tree = () => <LibraryViewportProvider value={{ isWide, isSongListWide: isWide }}>
        <PlaylistDetailSongRow song={song} index={0} selectMode={false} selected={false}
          isBuiltIn={isBuiltIn} onTap={onTap} onRemove={onRemove} />
        <SongRowOverlays />
      </LibraryViewportProvider>
      const view = render(tree())
      await act(async () => { await Promise.resolve() })
      const q = getQueriesForElement(elementTree.root!)
      const more = q.getByTestId('song-row-more') as unknown as {
        eventMap: Record<string, (event: { stopPropagation(): void }) => void>
      }
      await act(async () => { more.eventMap['catchEvent:tap']!({ stopPropagation() {} }) })
      await act(async () => { view.rerender(tree()) })
      expect(q.getByText('Play next')).toBeInTheDocument()
      await act(async () => { fireEvent.tap(q.getByTestId('song-action-playNext')) })
      expect(player.playSongNext).toHaveBeenCalledExactlyOnceWith(song)
      expect(player.playSong).not.toHaveBeenCalled()
      expect(onTap).not.toHaveBeenCalled()
      expect(onRemove).not.toHaveBeenCalled()
      expect(useSongRowOverlays.getState().menuSong).toBeNull()
    })
  }
}
