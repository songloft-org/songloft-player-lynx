import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import {
  DialogRoot,
  DialogView,
  DialogBackdrop,
  DialogContent,
} from '@lynx-js/lynx-ui-dialog'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Song } from '../../../models/song.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import {
  SONG_DIALOG_WIDTH_PX,
  dialogBodyMaxHeight,
  dialogCardMaxHeight,
  dialogCardWidth,
} from '../../../shared/ui/dialog-viewport.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { formatBytes } from '../../home/domain/stats-format.js'
import { getCacheInfo } from '../../player/data/song-cache.js'
import type { SongCacheStatus } from '../../player/data/song-cache.js'
import { playbackSourceKindOf } from '../../player/store/index.js'
import { getSongsApi } from '../api/index.js'
import { formatDuration } from '../data/format.js'
import { formatBitRate, formatSampleRate } from '../domain/song-tech-format.js'

import { BackdropBlur } from '../../../shared/ui/BackdropBlur.js'
import './SongInfoDialog.css'

export interface SongInfoDialogProps {
  show: boolean
  song: Song | null
  onClose: () => void
  /** Opens the edit dialog for the song this one is showing. */
  onEdit: (song: Song) => void
}

/**
 * Read-only song info as a dialog — the replacement for the song detail page,
 * which existed mostly to double as the player's "song info" entry (the
 * Flutter build never had a detail page; its info view was always this
 * dialog).
 *
 * Freshness: the store's song object renders immediately (zero loading state),
 * then a single `getSong` refresh lands in place behind it — that keeps the
 * page's fetch-on-entry semantics without a spinner. Row markup and the
 * `song-detail__row` classes migrate verbatim from the retired
 * `SongDetailPage.tsx` / `.css`.
 *
 * The modal chrome is `ConfirmDialog`'s five-piece structure with the shared
 * `.confirm-dialog__*` classes, so the fixed-layer z-index rule (200/201 on
 * both the wrapper and the fixed children — see ConfirmDialog.css) applies
 * here unchanged and the card paints over the full player and any
 * z-index:100 overlay it was opened from.
 */
export function SongInfoDialog({ show, song, onClose, onEdit }: SongInfoDialogProps) {
  const { t } = useTranslation()
  const songCacheCapable = getPlatformCapabilities().songCache

  const [serverSong, setServerSong] = useState<Song | null>(null)
  const [cacheInfo, setCacheInfo] = useState<SongCacheStatus | null>(null)
  const songId = song?.id ?? 0

  /*
   * Back closes the dialog — registered here rather than at the call site for
   * the same leverage ConfirmDialog gets. `show` starts false at the mount
   * point, per the back-stack's activation-order rule.
   */
  useBackHandler(show, () => {
    onClose()
    return true
  })

  /*
   * One refresh per open: the getSong copy overrides the row's (possibly
   * stale) object once it lands, and the cache probe rides along in the same
   * effect. Both reset when the dialog closes or the song changes, so
   * re-opening starts from the caller's data again.
   */
  useEffect(() => {
    if (!show || !songId) {
      setServerSong(null)
      setCacheInfo(null)
      return
    }
    let alive = true
    void getSongsApi().getSong(songId)
      .then((s) => { if (alive) setServerSong(s) })
      .catch(() => {})
    if (songCacheCapable) {
      getCacheInfo(songId)
        .then((info) => { if (alive) setCacheInfo(info) })
        .catch(() => { if (alive) setCacheInfo(null) })
    }
    return () => { alive = false }
  }, [show, songId, songCacheCapable])

  const data = serverSong ?? song
  const cover = data?.coverUrl ? buildCoverUrl(data.coverUrl, data.updatedAt) : ''

  /*
   * Playback source, mirroring the Flutter dialog's `_sourceLabel`: the
   * current song reports cache/stream from what was actually loaded; any other
   * song falls back to its cache state (cached → local, else "not playing").
   * Read per render — deliberately non-reactive; the dialog is short-lived
   * and re-opening picks the fresh value up.
   */
  const sourceKind = songId ? playbackSourceKindOf(songId) : null
  const sourceLabel =
    sourceKind === 'cache'
      ? t('songDetail.sourceLocal')
      : sourceKind === 'stream'
        ? t('songDetail.sourceRemote')
        : cacheInfo?.cached
          ? t('songDetail.sourceLocal')
          : t('songDetail.sourceUnknown')

  return (
    <DialogRoot show={show} onShowChange={(open) => { if (!open) onClose() }}>
      <DialogView className='confirm-dialog__view'>
        <DialogBackdrop
          className='confirm-dialog__backdrop'
          transition
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
          clickToClose
        >
          {/* Real backdrop blur, behind the dim so the page is blurred and then
              darkened. Same five-piece chrome as `ConfirmDialog`, whose stylesheet
              this dialog reuses — so it needs the blur for the same reason. */}
          <BackdropBlur />
          <view className='confirm-dialog__backdrop-inner' />
        </DialogBackdrop>
        <DialogContent
          className='confirm-dialog__content'
          transition
          dialogContentProps={{ bindtap: onClose }}
        >
          {data == null ? null : (
            <view
              className='song-info-dialog'
              data-testid='song-info-dialog'
              /*
               * Inline clamps (device): the stylesheet's calc/vh is the Web
               * half — on the native engines the viewport-relative units
               * proved unreliable under the fixed dialog layer, so the measured
               * px values come in here instead (fixed width, capped height).
               * See `dialog-viewport.ts`.
               */
              style={{
                maxHeight: dialogCardMaxHeight(),
                width: dialogCardWidth(SONG_DIALOG_WIDTH_PX),
              }}
              catchtap={() => {}}
            >
              <view className='song-info-dialog__header'>
                {cover
                  ? <image className='song-info-dialog__cover' mode='aspectFill' src={cover} />
                  : (
                    <view className='song-info-dialog__cover song-info-dialog__cover--empty'>
                      <Icon name='music' size={22} color={ICON_COLORS.contentMuted} />
                    </view>
                  )}
                <text className='song-info-dialog__name' text-maxline='2'>
                  {data.title}
                </text>
              </view>

              {/*
               * The DIRECT body clamp is what keeps the header on screen —
               * the card-level max-height alone proved insufficient on device
               * (the body's flex-shrink does not propagate on the native
               * engines). See `dialog-viewport.ts`.
               */}
              <scroll-view
                className='song-info-dialog__body'
                scroll-y
                style={{ maxHeight: dialogBodyMaxHeight() }}
              >
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.artistField')}</text>
                  <text className='song-detail__row-value'>{data.artist || '—'}</text>
                </view>
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.albumField')}</text>
                  <text className='song-detail__row-value'>{data.album || '—'}</text>
                </view>
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.type')}</text>
                  <text className='song-detail__row-value'>{data.type}{data.isVideo ? ' ▶' : ''}</text>
                </view>
                {data.genre ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.genre')}</text>
                    <text className='song-detail__row-value'>{data.genre}</text>
                  </view>
                ) : null}
                {data.year ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.year')}</text>
                    <text className='song-detail__row-value'>{String(data.year)}</text>
                  </view>
                ) : null}
                {data.duration > 0 ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.duration')}</text>
                    <text className='song-detail__row-value'>{formatDuration(data.duration)}</text>
                  </view>
                ) : null}
                {data.format ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.format')}</text>
                    <text className='song-detail__row-value'>{data.format.toUpperCase()}</text>
                  </view>
                ) : null}
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.bitRate')}</text>
                  <text className='song-detail__row-value'>{formatBitRate(data.bitRate) ?? '—'}</text>
                </view>
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.sampleRate')}</text>
                  <text className='song-detail__row-value'>{formatSampleRate(data.sampleRate) ?? '—'}</text>
                </view>
                {data.fileSize > 0 ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.fileSize')}</text>
                    <text className='song-detail__row-value'>{formatBytes(data.fileSize)}</text>
                  </view>
                ) : null}
                <view className='song-detail__row'>
                  <text className='song-detail__row-label'>{t('songDetail.playbackSource')}</text>
                  <text className='song-detail__row-value'>{sourceLabel}</text>
                </view>
                {/*
                  On-device cache status. Hidden where the native cache module
                  is absent (Web) — same gate the detail page used.
                */}
                {songCacheCapable ? (
                  <view className='song-detail__row'>
                    <text className='song-detail__row-label'>{t('songDetail.localCache')}</text>
                    <text className='song-detail__row-value'>
                      {cacheInfo?.cached
                        ? `${t('songDetail.localCache')} · ${formatBytes(cacheInfo.sizeBytes ?? 0)}`
                        : t('songDetail.notCached')}
                    </text>
                  </view>
                ) : null}
                {songCacheCapable && cacheInfo?.cached ? (
                  <view className='song-detail__cache-note'>
                    <text className='song-detail__cache-note-text'>{t('songDetail.cacheQualityNote')}</text>
                  </view>
                ) : null}
                {/*
                  Local songs only — writing tags to the file is the one action
                  the detail page offered beyond editing.
                */}
                {data.type === 'local' ? (
                  <view className='song-detail__tags-section'>
                    <view
                      className='song-detail__save-btn'
                      data-testid='song-info-write-tags'
                      bindtap={() => {
                        void getSongsApi().writeTags(data.id)
                          .then(() => toast.success(t('songDetail.tagsWritten')))
                          .catch(() => toast.error(t('songDetail.tagsFailed')))
                      }}
                    >
                      <text className='song-detail__save-btn-text'>{t('songDetail.writeTags')}</text>
                    </view>
                  </view>
                ) : null}
              </scroll-view>

              <view className='confirm-dialog__actions'>
                {/* No DialogClose — it wraps the child in a lynx-ui Button whose
                 * defaults made the buttons unequal in height; see ConfirmDialog. */}
                <view
                  className='confirm-dialog__btn confirm-dialog__btn--cancel'
                  bindtap={onClose}
                  data-testid='song-info-close'
                >
                  <text className='confirm-dialog__btn-text'>{t('common.close')}</text>
                </view>
                <view
                  className='confirm-dialog__btn confirm-dialog__btn--submit'
                  bindtap={() => onEdit(data)}
                  data-testid='song-info-edit'
                >
                  <text className='confirm-dialog__btn-text confirm-dialog__btn-text--submit'>
                    {t('songDetail.edit')}
                  </text>
                </view>
              </view>
            </view>
          )}
        </DialogContent>
      </DialogView>
    </DialogRoot>
  )
}
