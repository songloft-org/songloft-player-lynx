import { useState } from '@lynx-js/react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { Song } from '../../../models/song.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { GlobalMenu } from '../../../shared/ui/GlobalMenu.js'
import type { MenuItemSpec } from '../../../shared/ui/MenuItem.js'
import type { AnchorMeasurement } from '../../../shared/ui/anchored-overlay.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { getSongsApi } from '../../library/api/index.js'
import { SongListRow } from '../../library/widgets/SongListRow.js'
import type { PlaybackContext } from '../domain/playback-context.js'
import { formatPlayedAt } from '../domain/play-history-time.js'
import { playHistoryQueryKeys, usePlayHistoryQuery } from '../data/play-history-query.js'
import { usePlayerStore } from '../store/index.js'
import './PlayHistoryPanel.css'

export interface PlayHistoryPanelProps {
  /** The context whose history to show. */
  context: PlaybackContext
  /** Panel heading, e.g. `“周杰伦” play history`. */
  title: string
  /**
   * Songs the opening page has already loaded, used to place a tapped entry in a
   * real queue. Only the pages the user has scrolled through — an entry can
   * legitimately be missing from it.
   */
  queue?: Song[]
  onClose: () => void
}

/**
 * Play history for one playback context — a playlist, or a facet dimension.
 *
 * A bottom panel rather than a page, matching the Flutter `PlayHistorySheet`
 * (`lib/features/player/presentation/widgets/play_history_sheet.dart`): history
 * only means something relative to where playback started, so it opens from the
 * playlist / facet page that supplies the context.
 *
 * Built on the hand-rolled `GlobalMenu` pattern (fixed root + backdrop +
 * bottom panel) instead of `lynx-ui-sheet`. That component keeps its children
 * mounted and is driven by an imperative ref, so a sheet living in those pages
 * would fire a history request on every visit; this one is only rendered while
 * open. It also keeps `CategorySongsPage` free of lynx-ui gesture leaves, which
 * that file explicitly avoids. The trade-off is no drag-to-dismiss.
 *
 * Entry rows mirror the Flutter sheet too: the played-at time rides in the row
 * subtitle (`SongRow`'s `subtitleSuffix` → "Artist · Album · 08-17 09:30") and
 * **no play count is shown** — the Flutter client has neither a count column
 * nor a relative-time chip on the right. Clearing mirrors it as well: a trash
 * button in the header opening a `ConfirmDialog` (plus success/error toasts),
 * not a two-tap button at the bottom — the shared dialog is the mandated shape
 * for anything that destroys data.
 *
 * Removing one entry lives in the row's `⋯` menu (the Flutter sheet's lone
 * `menuActions` item), which `SongListRow.onOpenMenu` redirects away from the
 * *global* song menu — its "delete song" removes the song from the library,
 * one tap away from what a user trying to prune history expects. The menu is
 * this panel's own `GlobalMenu`, carrying the row's measured `⋯` rect.
 *
 * Styling note: this file's CSS deliberately does **not** redefine `.song-row`.
 * Those rules already exist three times over (LibraryPage / CategorySongsPage /
 * PlaylistDetailPage) and every page is eagerly imported by the router, so they
 * are effectively global — and a fourth copy could flip which one wins for pages
 * this change never touched.
 */
export function PlayHistoryPanel({
  context,
  title,
  queue,
  onClose,
}: PlayHistoryPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmClear, setConfirmClear] = useState(false)
  /* The entry whose ⋯ menu is open; null while closed. */
  const [menuEntry, setMenuEntry] = useState<{
    song: Song
    anchor: AnchorMeasurement | null
  } | null>(null)

  const historyQuery = usePlayHistoryQuery(context)
  const entries = historyQuery.data?.items ?? []

  /*
   * Back closes the panel. Registered unconditionally because the call sites
   * only render this component while it is open — the mount *is* the open
   * state. The clear dialog registers its own handler above this one while it
   * is shown (the stack is activation-ordered), so back cancels the dialog
   * first and only a second back reaches here.
   */
  useBackHandler(true, () => {
    onClose()
    return true
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: playHistoryQueryKeys.forContext(context) })
  }

  /**
   * Play a history entry, continuing into the rest of the context.
   *
   * The entry carries its own `Song`, so playback can start with no extra
   * request. When the song is not in the loaded pages it is appended rather than
   * played alone — a one-song queue would leave "next" dead. Its position in that
   * queue is then not the context's real ordering; the Flutter client instead
   * back-fills the full order from `/songs/ids`, which is not ported here.
   */
  const play = (entryIndex: number) => {
    const entry = entries[entryIndex]
    if (!entry) return
    const loaded = queue ?? []
    const at = loaded.findIndex((s) => s.id === entry.song.id)
    if (at >= 0) {
      void usePlayerStore.getState().playPlaylist(loaded, at, context)
    } else {
      void usePlayerStore.getState().playPlaylist([...loaded, entry.song], loaded.length, context)
    }
    onClose()
  }

  const clearAll = () => {
    setConfirmClear(false)
    void getSongsApi().clearPlayHistory(context)
      .then(() => {
        invalidate()
        toast.success(t('history.cleared'))
      })
      .catch(() => toast.error(t('history.operationFailed')))
  }

  const removeEntry = (songId: number) => {
    void getSongsApi().deletePlayHistoryEntry(context, songId)
      .then(invalidate)
      .catch(() => toast.error(t('history.operationFailed')))
  }

  /* The row menu — same single destructive item as the Flutter sheet's
   * `menuActions`, and the only removal entry point now that the row's inline
   * `×` button is gone. */
  const menuItems: MenuItemSpec[] = [
    { key: 'delete-entry', label: t('history.deleteEntry'), icon: 'trash', danger: true },
  ]

  const onMenuSelect = (key: string) => {
    if (key !== 'delete-entry' || !menuEntry) return
    removeEntry(menuEntry.song.id)
  }

  return (
    <>
      <view className='play-history' data-testid='play-history-panel'>
        {/*
         * Outside-tap close lives on the backdrop (the panel's sibling), not on
         * this root: with it on the root, every tap inside the panel rides up
         * through the DOM and only the panel's `catchtap` keeps it from closing
         * the panel — true on device, but invisible to render tests (the DOM
         * event bubbles regardless). Same rule as `PopoverMenu`'s backdrop.
         */}
        <view className='play-history__backdrop' bindtap={onClose} data-testid='play-history-backdrop' />
        <view className='play-history__panel'>
          <view className='play-history__header'>
            <text className='play-history__title'>{title}</text>
            {/*
             * Shown only with entries, like the Flutter header's conditional
             * delete icon. `history.clear` doubles as the dialog's title and
             * confirm label.
             */}
            {entries.length > 0
              ? (
                <view
                  className='play-history__header-btn'
                  bindtap={() => setConfirmClear(true)}
                  data-testid='play-history-clear'
                >
                  <Icon name='trash' size={18} color={ICON_COLORS.content2} />
                </view>
              )
              : null}
            <view className='play-history__header-btn' bindtap={onClose} data-testid='play-history-close'>
              <Icon name='x' size={18} color={ICON_COLORS.content2} />
            </view>
          </view>

          {historyQuery.isLoading
            ? (
              <view className='play-history__state'>
                <text className='play-history__state-text'>{t('common.loading')}</text>
              </view>
            )
            : historyQuery.isError
              ? (
                <view className='play-history__state'>
                  <text className='play-history__state-text'>{t('history.loadFailed')}</text>
                  <view
                    className='play-history__retry'
                    bindtap={() => void historyQuery.refetch()}
                    data-testid='play-history-retry'
                  >
                    <text className='play-history__retry-text'>{t('common.retry')}</text>
                  </view>
                </view>
              )
              : entries.length === 0
                ? (
                  <view className='play-history__state'>
                    <text className='play-history__state-text'>{t('history.empty')}</text>
                    <text className='play-history__state-hint'>{t('history.emptyHint')}</text>
                  </view>
                )
                : (
                  <scroll-view className='play-history__list' scroll-y>
                    {entries.map((entry, index) => (
                      <SongListRow
                        key={String(entry.song.id)}
                        song={entry.song}
                        index={index}
                        subtitleSuffix={formatPlayedAt(entry.playedAt)}
                        onOpenMenu={(song, anchor) => setMenuEntry({ song, anchor })}
                        onTap={() => play(index)}
                      />
                    ))}
                  </scroll-view>
                )}
        </view>
      </view>
      {/*
       * Sibling of the panel root, not a descendant: the backdrop's `bindtap`
       * closes the panel on outside taps, and a tap inside the dialog (its
       * scrim's outside-tap cancel included) would bubble into it otherwise —
       * canceling the dialog would close the panel underneath. The dialog's own
       * fixed layers carry z-index 200/201 (see `ConfirmDialog.css`), above this
       * panel's z-index 100.
       */}
      <ConfirmDialog
        show={confirmClear}
        title={t('history.clear')}
        message={t('history.clearConfirm')}
        confirmLabel={t('history.clear')}
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
        testId='play-history-clear-dialog'
        confirmTestId='play-history-clear-confirm'
        cancelTestId='play-history-clear-cancel'
      />
      {/*
       * The row menu, same sibling spot: its own backdrop catches outside taps
       * and it registers its own back handler while shown, so both close it
       * before either reaches the panel below. Being a root-level `z-index: 100`
       * sibling rendered after the panel, it paints above it.
       */}
      <GlobalMenu
        show={menuEntry != null}
        onClose={() => setMenuEntry(null)}
        items={menuItems}
        onSelect={onMenuSelect}
        anchor={menuEntry?.anchor ?? undefined}
        testId='play-history-menu'
      />
    </>
  )
}
