import { useState } from '@lynx-js/react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Playlist } from '../../../models/playlist.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { MediaListItem } from '../../../shared/ui/MediaListItem.js'
import { PromptDialog } from '../../../shared/ui/PromptDialog.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { getPlaylistApi } from '../api/index.js'
import { usePlaylistsInfiniteQuery } from '../data/playlist-query.js'
import './AddToPlaylistSheet.css'

export interface AddToPlaylistSheetProps {
  /** The songs being added; empty closes the sheet. */
  songIds: number[]
  onClose: () => void
  /**
   * Called once the add succeeded, before `onClose`. How a batch caller (the
   * library's multi-select) learns it can drop its selection; the single-row
   * case has nothing to reset and omits it.
   */
  onAdded?: () => void
}

/**
 * Bottom sheet for putting songs into a playlist — the Lynx counterpart of the
 * Flutter build's `AddToPlaylistModal`, and a replacement for the cramped
 * second view the song context menu used to swap in.
 *
 * What it takes from that design: the header with the song count, "new playlist"
 * as the first row, playlists shown with cover + type, paging as you scroll, and
 * distinct outcomes for added / added-with-skips / failed. Built-in playlists
 * (Favorites) are listed, as they are there — adding to Favorites is a
 * legitimate destination.
 *
 * The only add-to-playlist surface in the app: the library's multi-select opens
 * this same sheet with the selected ids, rather than the bare name list it used
 * to inline (no cover, no type, no "new playlist", no paging).
 *
 * Mounted by `SongRowOverlays` in the root route, never inside a list: the rows
 * that open it live in virtualized `<list-item>`s that clip overlays (see
 * `song-row-overlays.ts`).
 */
export function AddToPlaylistSheet({ songIds, onClose, onAdded }: AddToPlaylistSheetProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const query = usePlaylistsInfiniteQuery()
  const playlists = query.data?.pages.flatMap((p) => p.playlists) ?? []

  /*
   * Hooks stay unconditional (this component is rendered with no songs while
   * closed). A non-empty selection is what arms the back handler, so it is
   * false on mount — the ordering the back stack requires (see `back-stack.ts`).
   * The create dialog registers its own layer, so back peels that one first.
   */
  useBackHandler(songIds.length > 0, () => {
    onClose()
    return true
  })

  if (songIds.length === 0) return null

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['playlist'] })
  }

  const failed = (e: unknown, fallbackKey: string) =>
    toast.error(e instanceof Error && e.message ? e.message : t(fallbackKey))

  const addTo = (playlist: Playlist) => {
    if (submitting) return
    setSubmitting(true)
    void getPlaylistApi().addSongsToPlaylist(playlist.id, songIds)
      .then(({ added, skipped }) => {
        invalidate()
        toast.success(skipped > 0
          ? t('addToPlaylist.addedWithSkip', { added, name: playlist.name, skipped })
          : t('addToPlaylist.added', { added, name: playlist.name }))
        onAdded?.()
        onClose()
      })
      // Deliberately stays open on failure so the choice can be retried —
      // closing silently would be indistinguishable from success.
      .catch((e) => failed(e, 'addToPlaylist.addFailed'))
      .finally(() => setSubmitting(false))
  }

  const createAndAdd = (name: string) => {
    setCreating(false)
    setSubmitting(true)
    void getPlaylistApi().createPlaylist({ name })
      .then((created) =>
        getPlaylistApi().addSongsToPlaylist(created.id, songIds)
          .then(({ added, skipped }) => {
            invalidate()
            toast.success(skipped > 0
              ? t('addToPlaylist.createdWithSkip', { name, added, skipped })
              : t('addToPlaylist.created', { name, added }))
            onAdded?.()
            onClose()
          }))
      .catch((e) => failed(e, 'addToPlaylist.createFailed'))
      .finally(() => setSubmitting(false))
  }

  // One song when a row opened it, the whole selection when multi-select did.
  const countLabel = t(
    songIds.length === 1 ? 'common.songCountOne' : 'common.songCountOther',
    { count: songIds.length },
  )

  return (
    <>
      <view className='atp' data-testid='add-to-playlist-sheet'>
        {/*
          * Outside-tap close sits on the backdrop, not on this root with a
          * `catchtap` on the panel: the backdrop is a sibling of the panel, so a
          * tap inside the panel never reaches it in the first place. The
          * root-plus-catchtap shape relies on catchtap actually intercepting the
          * bubble, which is true on device but leaves "did this row close the
          * sheet?" untestable.
          */}
        <view className='atp__backdrop' bindtap={onClose} data-testid='atp-backdrop' />
        <view className='atp__panel'>
          <view className='atp__handle-wrap'>
            <view className='atp__handle' />
          </view>

          <view className='atp__header'>
            <text className='atp__title'>{t('songMenu.addToPlaylist')}</text>
            <text className='atp__count'>{countLabel}</text>
          </view>

          <view
            className='atp__create'
            bindtap={() => { if (!submitting) setCreating(true) }}
            data-testid='atp-create'
          >
            <view className='atp__create-icon'>
              <Icon name='plus' size={20} color={ICON_COLORS.primary} />
            </view>
            <text className='atp__create-text'>{t('addToPlaylist.newPlaylist')}</text>
          </view>

          {query.isPending
            ? <text className='atp__state'>{t('common.loading')}</text>
            : query.isError && playlists.length === 0
              ? (
                <view className='atp__state-block'>
                  <Icon name='x' size={32} color={ICON_COLORS.danger} />
                  <text className='atp__state'>{t('addToPlaylist.loadFailed')}</text>
                  <view className='atp__retry' bindtap={() => void query.refetch()} data-testid='atp-retry'>
                    <text className='atp__retry-text'>{t('common.retry')}</text>
                  </view>
                </view>
              )
              : playlists.length === 0
                ? <text className='atp__state' data-testid='atp-empty'>{t('addToPlaylist.empty')}</text>
                : (
                  <scroll-view
                    className='atp__list'
                    scroll-y
                    lower-threshold={200}
                    bindscrolltolower={() => {
                      if (query.hasNextPage && !query.isFetchingNextPage) {
                        void query.fetchNextPage()
                      }
                    }}
                  >
                    {playlists.map((p) => (
                      <MediaListItem
                        key={String(p.id)}
                        name={p.name}
                        subtitle={p.type === 'radio'
                          ? t('addToPlaylist.typeRadio')
                          : t('addToPlaylist.typePlaylist')}
                        coverUrl={p.coverUrl ? buildCoverUrl(p.coverUrl, p.updatedAt) : undefined}
                        onTap={() => addTo(p)}
                      />
                    ))}
                    {/*
                      * Footer, mirroring the Flutter sheet's three cases. "Failed"
                      * is `isError` *with* rows already loaded: a first-page
                      * failure is handled by the branch above, so reaching here in
                      * an error state means the next page is what failed.
                      */}
                    {query.isFetchingNextPage
                      ? <text className='atp__footer'>{t('common.loadingMore')}</text>
                      : query.isError
                        ? (
                          <view className='atp__footer-retry' bindtap={() => void query.fetchNextPage()}>
                            <text className='atp__footer'>{t('addToPlaylist.loadFailedTapRetry')}</text>
                          </view>
                        )
                        : query.hasNextPage
                          ? null
                          : <text className='atp__footer'>{t('addToPlaylist.loadedAll')}</text>}
                  </scroll-view>
                )}
        </view>
      </view>

      {/*
        * A sibling of the sheet, not a child: the sheet's root closes on tap, so
        * a dialog inside it would have every tap bubble up and dismiss the sheet
        * underneath it.
        */}
      <PromptDialog
        show={creating}
        title={t('addToPlaylist.newPlaylist')}
        label={t('addToPlaylist.nameLabel')}
        confirmLabel={t('addToPlaylist.create')}
        onConfirm={createAndAdd}
        onCancel={() => setCreating(false)}
        testId='atp-create-dialog'
        confirmTestId='atp-create-confirm'
        cancelTestId='atp-create-cancel'
      />
    </>
  )
}
