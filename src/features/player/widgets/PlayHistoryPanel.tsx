import { useState } from '@lynx-js/react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { Song } from '../../../models/song.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getSongsApi } from '../../library/api/index.js'
import { SongListRow } from '../../library/widgets/SongListRow.js'
import type { PlaybackContext } from '../domain/playback-context.js'
import { playedAtLabel } from '../domain/play-history-time.js'
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
 * Built on the hand-rolled `SongContextMenu` pattern (fixed root + backdrop +
 * bottom panel) instead of `lynx-ui-sheet`. That component keeps its children
 * mounted and is driven by an imperative ref, so a sheet living in those pages
 * would fire a history request on every visit; this one is only rendered while
 * open. It also keeps `CategorySongsPage` free of lynx-ui gesture leaves, which
 * that file explicitly avoids. The trade-off is no drag-to-dismiss.
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

  const historyQuery = usePlayHistoryQuery(context)
  const entries = historyQuery.data?.items ?? []

  /*
   * Peels the armed "clear history" state first, then closes the panel. Registered
   * unconditionally because the call sites only render this component while it is
   * open — the mount *is* the open state.
   */
  useBackHandler(true, () => {
    if (confirmClear) {
      setConfirmClear(false)
      return true
    }
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
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }
    setConfirmClear(false)
    void getSongsApi().clearPlayHistory(context).then(invalidate).catch(() => {})
  }

  const removeEntry = (songId: number) => {
    void getSongsApi().deletePlayHistoryEntry(context, songId).then(invalidate).catch(() => {})
  }

  const now = new Date()
  const timeLabels = {
    today: t('history.today'),
    yesterday: t('history.yesterday'),
    daysAgo: (days: number) => t('history.daysAgo', { count: days }),
  }

  return (
    <view className='play-history' bindtap={onClose} data-testid='play-history-panel'>
      <view className='play-history__backdrop' />
      <view className='play-history__panel' catchtap={() => {}}>
        <view className='play-history__header'>
          <text className='play-history__title'>{title}</text>
          <view className='play-history__close' bindtap={onClose} data-testid='play-history-close'>
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
                    <view key={String(entry.song.id)} className='play-history__entry'>
                      <view className='play-history__entry-row'>
                        <SongListRow song={entry.song} index={index} onTap={() => play(index)} />
                      </view>
                      <view className='play-history__entry-meta'>
                        <text className='play-history__entry-time'>
                          {playedAtLabel(entry.playedAt, timeLabels, now)}
                        </text>
                        <text className='play-history__entry-count'>{`×${entry.playCount}`}</text>
                        <view
                          className='play-history__entry-remove'
                          bindtap={() => removeEntry(entry.song.id)}
                          data-testid={`play-history-remove-${entry.song.id}`}
                        >
                          <Icon name='x' size={14} color={ICON_COLORS.contentMuted} />
                        </view>
                      </view>
                    </view>
                  ))}
                </scroll-view>
              )}

        {entries.length > 0
          ? (
            <view
              className={confirmClear
                ? 'play-history__clear play-history__clear--confirm'
                : 'play-history__clear'}
              bindtap={clearAll}
              data-testid='play-history-clear'
            >
              <text className='play-history__clear-text'>
                {confirmClear ? t('history.clearConfirm') : t('history.clear')}
              </text>
            </view>
          )
          : null}
      </view>
    </view>
  )
}
