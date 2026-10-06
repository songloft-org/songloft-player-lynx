import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { getAudio } from '../../../native/index.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { BackdropBlur } from '../../../shared/ui/BackdropBlur.js'
import { useAudioTracks } from '../data/audio-tracks-query.js'
import { usePlayerStore } from '../store/player-store.js'
import { useDlnaStore } from '../store/dlna-store.js'
import './SheetShell.css'
import './AudioTrackSheet.css'

/** Root overlay: stays inside the theme/router and out of virtual lists. */
export function AudioTrackSheet() {
  const { t } = useTranslation()
  const show = usePlayerStore((s) => s.showAudioTrackSheet)
  const song = usePlayerStore((s) => s.currentSong)
  const selected = usePlayerStore((s) => s.audioTrack ?? null)
  const pending = usePlayerStore((s) => s.audioTrackPending)
  const switching = usePlayerStore((s) => s.isAudioTrackSwitching)
  const error = usePlayerStore((s) => s.audioTrackError)
  const casting = useDlnaStore((s) => s.activeDevice != null)
  const tracks = useAudioTracks(show && !casting ? song ?? null : null)
  const [version, setVersion] = useState<number | null>(null)
  const close = () => usePlayerStore.getState().closeAudioTrackSheet()
  useBackHandler(show, () => { close(); return true })

  useEffect(() => {
    if (!show) return
    let alive = true
    setVersion(null)
    void (getAudio().getSourceLoadVersion?.() ?? Promise.resolve(0))
      .then((value) => { if (alive) setVersion(value) })
      .catch(() => { if (alive) setVersion(0) })
    return () => { alive = false }
  }, [show])

  useEffect(() => {
    if (show) close()
  }, [song?.id, song?.type, casting])

  if (!show || !song || casting) return null
  const canSelect = version === 1 && (tracks.data?.length ?? 0) >= 2
  const select = (index: number | null) => {
    if (canSelect) void usePlayerStore.getState().setAudioTrack(index)
  }

  return (
    <view className='drawer__root' data-testid='audio-track-sheet'>
      <BackdropBlur />
      <view className='drawer__backdrop' bindtap={close} />
      <view className='drawer__panel audio-tracks__panel' catchtap={() => {}}>
        <view className='drawer__handle-wrap'><view className='drawer__handle' /></view>
        <view className='drawer__header'>
          <text className='drawer__title'>{t('player.audioTracks')}</text>
          <view className='audio-tracks__close' bindtap={close} data-testid='audio-track-close'
            accessibility-element={true} accessibility-label={t('common.close')}>
            <Icon name='x' size={20} color={ICON_COLORS.content} />
          </view>
        </view>
        <scroll-view className='drawer__list audio-tracks__body' scroll-y>
          {version === 0 ? <text className='audio-tracks__note'>{t('player.audioTrackUpgradeRequired')}</text> : null}
          {version === null || tracks.isPending ? <text className='audio-tracks__note'>{t('common.loading')}</text> : null}
          {tracks.isError ? (
            <view className='audio-tracks__row' bindtap={() => { void tracks.refetch() }} data-testid='audio-track-probe-retry'>
              <text className='audio-tracks__title'>{t('player.audioTracksRetry')}</text>
            </view>
          ) : null}
          {!tracks.isPending && !tracks.isError && (tracks.data?.length ?? 0) < 2
            ? <text className='audio-tracks__note'>{t('player.audioTracksUnavailable')}</text> : null}
          {canSelect ? (
            <view className={`audio-tracks__row${selected === null ? ' audio-tracks__row--selected' : ''}`}
              bindtap={() => select(null)} data-testid='audio-track-default'>
              <text className='audio-tracks__title'>{t('player.audioTrackAutomatic')}</text>
              <text className='audio-tracks__detail'>{pending === null ? t('player.audioTrackSwitching') : selected === null ? t('player.audioTrackCurrent') : ''}</text>
            </view>
          ) : null}
          {(tracks.data ?? []).map((track) => (
            <view key={track.index} className={`audio-tracks__row${selected === track.index ? ' audio-tracks__row--selected' : ''}`}
              bindtap={canSelect ? () => select(track.index) : undefined} data-testid={`audio-track-${track.index}`}
              accessibility-element={true} accessibility-label={track.title ?? t('player.audioTrackNumber', { number: track.index + 1 })}>
              <text className='audio-tracks__title'>{track.title ?? t('player.audioTrackNumber', { number: track.index + 1 })}</text>
              <text className='audio-tracks__detail'>{[
                track.language, track.codec, track.default ? t('player.audioTrackDefault') : null,
                selected === track.index ? t('player.audioTrackCurrent') : null,
                switching && pending === track.index ? t('player.audioTrackSwitching') : null,
              ].filter(Boolean).join(' · ')}</text>
            </view>
          ))}
          {error ? <text className='audio-tracks__note'>{t(error === 'source_load_unsupported' ? 'player.audioTrackUpgradeRequired' : 'player.audioTrackFailed')}</text> : null}
        </scroll-view>
      </view>
    </view>
  )
}
