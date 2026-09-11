import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { resolveVideoSourceKind } from '../../core/network/video-source.js'
import { getSongsApi } from '../../features/library/api/index.js'
import { SongEditDialog } from '../../features/library/widgets/SongEditDialog.js'
import { SongInfoDialog } from '../../features/library/widgets/SongInfoDialog.js'
import { ManageTagsSheet } from '../../features/library/widgets/ManageTagsSheet.js'
import { AddToPlaylistSheet } from '../../features/playlist/widgets/AddToPlaylistSheet.js'
import { canWatchVideo, openCurrentSongVideo } from '../../features/player/data/video-open.js'
import { usePlayerStore } from '../../features/player/store/index.js'
import { getPlatformTarget } from '../../native/platform-target.js'
import type { Song } from '../../models/song.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { GlobalMenu } from './GlobalMenu.js'
import { buildSongMenuItems } from './song-menu-items.js'
import { toast } from './toast-store.js'
import { useSongRowOverlays } from './song-row-overlays.js'

/**
 * The song-row overlays, mounted once in the root route (inside
 * `ThemeProvider`, after `<Outlet/>` — see the comment in `router.tsx`), so
 * page content and other z-index: 100 panels paint below them.
 *
 * They must not hang off the app root as a `<RouterProvider>` sibling: on Web
 * that sits outside `.theme-root`, so no `var(--*)` resolves (see
 * `root-overlay-mount.test.ts`).
 *
 * Rows dispatch through the store (`song-row-overlays.ts`) — see the store docs
 * for why these overlays cannot live inside the virtualized lists, and why the
 * menu's anchor rect has to travel with the song.
 *
 * The menu and the sheet mount only while open; the dialogs stay mounted with
 * `show` toggling, which is what the back-stack's activation-order priority
 * expects (`show` starts false).
 */
export function SongRowOverlays() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const menuSong = useSongRowOverlays((s) => s.menuSong)
  const menuAnchor = useSongRowOverlays((s) => s.menuAnchor)
  const menuRow = useSongRowOverlays((s) => s.menuRow)
  const addToPlaylistSongIds = useSongRowOverlays((s) => s.addToPlaylistSongIds)
  const addToPlaylistOnAdded = useSongRowOverlays((s) => s.addToPlaylistOnAdded)
  const manageTagsSongIds = useSongRowOverlays((s) => s.manageTagsSongIds)
  const deleteSong = useSongRowOverlays((s) => s.deleteSong)
  const infoSong = useSongRowOverlays((s) => s.infoSong)
  const editSong = useSongRowOverlays((s) => s.editSong)
  const closeMenu = useSongRowOverlays((s) => s.closeMenu)
  const openInfo = useSongRowOverlays((s) => s.openInfo)
  const openAddToPlaylist = useSongRowOverlays((s) => s.openAddToPlaylist)
  const closeAddToPlaylist = useSongRowOverlays((s) => s.closeAddToPlaylist)
  const openManageTags = useSongRowOverlays((s) => s.openManageTags)
  const closeManageTags = useSongRowOverlays((s) => s.closeManageTags)
  const requestDelete = useSongRowOverlays((s) => s.requestDelete)
  const cancelDelete = useSongRowOverlays((s) => s.cancelDelete)
  const closeInfo = useSongRowOverlays((s) => s.closeInfo)
  const openEdit = useSongRowOverlays((s) => s.openEdit)
  const closeEdit = useSongRowOverlays((s) => s.closeEdit)

  /*
   * Five actions on a narrow row (the Flutter build's song-menu set plus "song
   * info"), pruned on a wide one — see `buildSongMenuItems` above. Play and edit
   * always stay: neither has a row-tail button, and on a narrow row the menu is
   * the info dialog's only entry (the detail page is otherwise reachable only
   * from the player menu and the wide-screen row icon). Info sits between play
   * and edit — read-only peek before any destructive "edit" muscle memory
   * lands.
   */
  const items = buildSongMenuItems(t, menuRow, { canWatchVideo: canWatchVideo(menuSong) })

  /**
   * Play this song and put its picture on screen, without the trip through the full
   * player that this action exists to replace.
   *
   * Play first, then open: the surface is lent to the engine that is already playing,
   * so there has to *be* a current song before there is a picture to attach. Attaching
   * is what fails with `'noTrack'` (the stream has no video track — a remote song
   * served from a `-vn` cache entry), and a server-side transcode that fails is
   * `'transcodeFailed'`; neither should be reported as the other.
   */
  const watchVideo = async (song: Song) => {
    /*
     * A container the host cannot demux is re-encoded server-side, and that request
     * answers only when the whole file is done. There is no player pending state on
     * screen here — the library is still up — so the wait is otherwise indistinguishable
     * from nothing having happened.
     */
    if (resolveVideoSourceKind(song, getPlatformTarget()) === 'hls') {
      toast.show(t('player.videoTranscoding'))
    }
    await usePlayerStore.getState().playSong(song)
    const outcome = await openCurrentSongVideo()
    if (outcome === 'transcodeFailed') toast.error(t('player.videoTranscodeFailed'))
    else if (outcome === 'noTrack') toast.error(t('player.videoNoTrack'))
  }

  const onSelect = (key: string) => {
    const song = menuSong
    if (!song) return
    switch (key) {
      case 'play':
        void usePlayerStore.getState().playSong(song)
        return
      case 'video':
        void watchVideo(song)
        return
      case 'info':
        openInfo(song)
        return
      case 'edit':
        openEdit(song)
        return
      case 'add':
        openAddToPlaylist({ songIds: [song.id] })
        return
      case 'manageTags':
        openManageTags([song.id])
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
        anchor={menuAnchor ?? undefined}
        testId='song-menu'
      />
      <AddToPlaylistSheet
        songIds={addToPlaylistSongIds}
        onAdded={addToPlaylistOnAdded ?? undefined}
        onClose={closeAddToPlaylist}
      />
      <ManageTagsSheet
        songIds={manageTagsSongIds}
        onClose={closeManageTags}
      />
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
      {/**
        * The info dialog's edit action switches this same store's slot (info
        * closes, edit opens — mutually exclusive by construction), so the
        * back-stack never sees both dialogs at once and back from edit closes
        * just the edit dialog.
        */}
      <SongInfoDialog
        show={infoSong != null}
        song={infoSong}
        onClose={closeInfo}
        onEdit={openEdit}
      />
      <SongEditDialog
        show={editSong != null}
        song={editSong}
        onClose={closeEdit}
      />
    </>
  )
}
