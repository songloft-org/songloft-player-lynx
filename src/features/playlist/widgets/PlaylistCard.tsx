import { useTranslation } from 'react-i18next'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import type { Playlist } from '../../../models/playlist.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useTapAnchor } from '../../../shared/ui/anchored-overlay.js'
import type { AnchorMeasurement } from '../../../shared/ui/anchored-overlay.js'

/**
 * A single playlist grid card, ported (trimmed) from the Flutter `PlaylistCard`
 * (grid `BrowseCard`): cover (or a music-note placeholder) + name + song count,
 * plus a `⋯` that dispatches the card's actions upward. Styled entirely via
 * LUNA tokens.
 */
export interface PlaylistCardProps {
  playlist: Playlist
  onTap?: (playlist: Playlist) => void
  onPlayAll?: (playlist: Playlist) => void
  /**
   * Open the card's action menu. The rect is this card's `⋯` box, measured here
   * because only the card can address it — the menu itself is mounted at the
   * page level, outside the scrolling grid (see `PlaylistsView`). Null when the
   * host could not measure, which docks the menu instead.
   */
  onMore?: (playlist: Playlist, anchor: AnchorMeasurement | null) => void
  isPlaying?: boolean
}

export function PlaylistCard({
  playlist,
  onTap,
  onPlayAll,
  onMore,
  isPlaying,
}: PlaylistCardProps) {
  const { t } = useTranslation()
  const { anchorId, measure } = useTapAnchor()
  const cover = playlist.coverUrl ? buildCoverUrl(playlist.coverUrl, playlist.updatedAt) : ''
  const count = t(
    playlist.songCount === 1 ? 'common.songCountOne' : 'common.songCountOther',
    { count: playlist.songCount },
  )

  return (
    <view
      className={'playlist-card' + (isPlaying ? ' playlist-card--playing' : '')}
      bindtap={() => onTap?.(playlist)}
    >
      <view className='playlist-card__cover-wrap'>
        {cover
          // `mode` is Lynx's fitting control (there is no `object-fit` CSS property
          // on `<image>`). Without it the default `scaleToFill` stretches covers to
          // the box — visible as squashed art now that the home strip uses a square.
          // `aspectFill` == Flutter's `BoxFit.cover`, which the reference card used.
          ? <image className='playlist-card__cover' mode='aspectFill' src={cover} />
          : (
            <view className='playlist-card__cover playlist-card__cover--empty'>
              <Icon name='music' size={28} color={ICON_COLORS.contentMuted} />
            </view>
          )}
        {playlist.isBuiltIn
          ? (
            <view className='playlist-card__badge' data-testid={`playlist-card-builtin-${playlist.id}`}>
              <Icon name='heart-filled' size={12} color={ICON_COLORS.primaryContent} />
            </view>
          )
          : null}
        {isPlaying
          ? (
            <view className='playlist-card__eq-bars'>
              <view className='playlist-card__eq-bar playlist-card__eq-bar--1' />
              <view className='playlist-card__eq-bar playlist-card__eq-bar--2' />
              <view className='playlist-card__eq-bar playlist-card__eq-bar--3' />
              <view className='playlist-card__eq-bar playlist-card__eq-bar--4' />
            </view>
          )
          : null}
        {onPlayAll
          ? (
            <view
              className='playlist-card__play-hit'
              catchtap={() => { onPlayAll(playlist) }}
              accessibility-element={true}
              accessibility-label={t('common.playAll')}
            >
              <view className='playlist-card__play-btn'>
                <Icon name='play' size={14} color={ICON_COLORS.primaryContent} />
              </view>
            </view>
          )
          : null}
        {/*
          * Bottom-left: the other three corners are taken (built-in badge and the
          * select checkbox top-right, play-all bottom-right).
          *
          * `catchtap`, not `bindtap` — the whole card is tappable, and a bubbling
          * tap here would open the menu *and* navigate into the playlist. The test
          * env does not implement that interception, so this is browser/device-only
          * behaviour; see the note in `playlists-view.test.tsx`.
          */}
        {onMore
          ? (
            <view
              id={anchorId}
              className='playlist-card__more-hit'
              catchtap={() => { measure((rect) => onMore(playlist, rect)) }}
              accessibility-element={true}
              accessibility-label={t('common.more')}
              data-testid={`playlist-card-more-${playlist.id}`}
            >
              <view className='playlist-card__more-btn'>
                <Icon name='more' size={16} color={ICON_COLORS.content} />
              </view>
            </view>
          )
          : null}
      </view>
      <text className='playlist-card__name'>{playlist.name || t('common.untitled')}</text>
      {/*
        * Pinned and "network" are both chips in the same meta row, so unlike the
        * list mode's single `badge` slot they can coexist. The network chip marks
        * network only, never local: local is what nearly every playlist is, so a
        * "local" chip on every card would be noise — what needs calling out is
        * the few network ones mixed in (songloft-org/songloft#445). Radio
        * playlists are excluded: they already read as radio and hold `radio`
        * songs, not `remote` ones.
        */}
      {playlist.isPinned || (playlist.type !== 'radio' && playlist.hasRemoteSongs)
        ? (
          <view className='playlist-card__meta'>
            {playlist.isPinned
              ? (
                <text className='playlist-card__chip' data-testid={`playlist-card-pinned-${playlist.id}`}>
                  {t('playlist.labelPinned')}
                </text>
              )
              : null}
            {playlist.type !== 'radio' && playlist.hasRemoteSongs
              ? (
                <text className='playlist-card__chip' data-testid={`playlist-card-remote-${playlist.id}`}>
                  {t('playlist.labelRemote')}
                </text>
              )
              : null}
            <text className='playlist-card__count'>{count}</text>
          </view>
        )
        : <text className='playlist-card__count'>{count}</text>}
    </view>
  )
}
