import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { getSongsApi } from '../../features/library/api/index.js'
import { AddToPlaylistSheet } from '../../features/playlist/widgets/AddToPlaylistSheet.js'
import { usePlayerStore } from '../../features/player/store/index.js'
import { useNavigateToSongDetail } from '../nav/navigate-to-song-detail.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { GlobalMenu } from './GlobalMenu.js'
import type { MenuItemSpec } from './MenuItem.js'
import { toast } from './toast-store.js'
import { useSongRowOverlays } from './song-row-overlays.js'

/**
 * The song-row overlays, mounted once in the root route (inside
 * `ThemeProvider`, after `<Outlet/>` — see the comment in `router.tsx`), so
 * page content and other z-index: 100 panels paint below them.
 *
 * They must not hang off the app root as a `<RouterProvider>` sibling: on Web
 * that sits outside `.theme-root` (no `var(--*)` resolves) and outside the
 * Router context (`useNavigateToSongDetail` needs it).
 *
 * Rows dispatch through the store (`song-row-overlays.ts`) — see the store docs
 * for why these overlays cannot live inside the virtualized lists.
 *
 * The menu and the sheet mount only while open; the confirm dialog stays
 * mounted with `show` toggling, which is what the back-stack's
 * activation-order priority expects (`show` starts false).
 */
export function SongRowOverlays() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const goToSongDetail = useNavigateToSongDetail()

  const menuSong = useSongRowOverlays((s) => s.menuSong)
  const addToPlaylistSong = useSongRowOverlays((s) => s.addToPlaylistSong)
  const deleteSong = useSongRowOverlays((s) => s.deleteSong)
  const closeMenu = useSongRowOverlays((s) => s.closeMenu)
  const openAddToPlaylist = useSongRowOverlays((s) => s.openAddToPlaylist)
  const closeAddToPlaylist = useSongRowOverlays((s) => s.closeAddToPlaylist)
  const requestDelete = useSongRowOverlays((s) => s.requestDelete)
  const cancelDelete = useSongRowOverlays((s) => s.cancelDelete)

  /*
   * The four actions the Flutter build's song menu offers, in its order. The
   * per-row buttons cover the rest: favorite and detail are already on the row,
   * and the queue actions belong to the player's own overflow menu.
   */
  const items: MenuItemSpec[] = [
    { key: 'play', label: t('songMenu.play'), icon: 'play' },
    { key: 'edit', label: t('songMenu.edit'), icon: 'brush' },
    { key: 'add', label: t('songMenu.addToPlaylist'), icon: 'music' },
    { key: 'delete', label: t('songMenu.deleteSong'), icon: 'x', danger: true },
  ]

  const onSelect = (key: string) => {
    const song = menuSong
    if (!song) return
    switch (key) {
      case 'play':
        void usePlayerStore.getState().playSong(song)
        return
      case 'edit':
        // No standalone song-edit page: the form is on the detail page, and
        // `edit` opens it directly (see `songDetailRoute`).
        goToSongDetail(song.id, { edit: true })
        return
      case 'add':
        openAddToPlaylist(song)
        return
      case 'delete':
        requestDelete(song)
        return
    }
  }

  const confirmDelete = () => {
    const song = deleteSong
    cancelDelete()
    if (!song) return
    void getSongsApi().deleteSong(song.id)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['songs'] })
      })
      /*
       * Without this the failure path is completely mute: the dialog closes on
       * confirm regardless, so a rejected delete looks exactly like a delete
       * that worked but left the row behind. Browser verification hit it against
       * a backend 500 and could not tell the two apart.
       */
      .catch((e) => toast.error(String(e instanceof Error ? e.message : e)))
  }

  return (
    <>
      <GlobalMenu
        show={menuSong != null}
        onClose={closeMenu}
        items={items}
        onSelect={onSelect}
        title={menuSong?.title}
        subtitle={menuSong?.artist || undefined}
        testId='song-menu'
      />
      <AddToPlaylistSheet song={addToPlaylistSong} onClose={closeAddToPlaylist} />
      <ConfirmDialog
        show={deleteSong != null}
        title={t('songMenu.deleteSong')}
        message={t('songMenu.deleteMessage')}
        confirmLabel={t('songMenu.deleteSong')}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        testId='song-delete-dialog'
        confirmTestId='song-delete-confirm'
        cancelTestId='song-delete-cancel'
      />
    </>
  )
}
