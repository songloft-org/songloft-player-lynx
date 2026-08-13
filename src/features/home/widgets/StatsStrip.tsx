import { useTranslation } from 'react-i18next'

import type { LibraryStats } from '../../../models/library-stats.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { formatBytes, splitDuration } from '../domain/stats-format.js'

/**
 * Bottom library-summary panel, fed by `GET /songs/stats`.
 *
 * Three tiers: the headline song total with the library's total playing time
 * beside it, then the per-kind split, then the catalogue dimensions. Total file
 * size only appears when it is non-zero — an all-remote library reports 0 bytes,
 * and "0 B" is noise rather than information.
 */
export function StatsStrip({ stats }: { stats: LibraryStats }) {
  const { t } = useTranslation()
  const { hours, minutes } = splitDuration(stats.totalDuration)
  const duration = hours > 0
    ? t('home.statDurationHm', { hours, minutes })
    : t('home.statDurationM', { minutes })

  return (
    <view className='home-stats' data-testid='home-stats'>
      <view className='home-stats__headline'>
        <view className='home-stats__headline-main'>
          <text className='home-stats__headline-value'>{String(stats.totalSongs)}</text>
          <text className='home-stats__headline-label'>{t('home.statSongs')}</text>
        </view>
        <view className='home-stats__headline-aside'>
          <Icon name='music' size={16} color={ICON_COLORS.content2} />
          <text className='home-stats__headline-duration'>{duration}</text>
        </view>
      </view>

      <view className='home-stats__row'>
        <StatCell label={t('home.statLocal')} value={stats.localSongs} />
        <StatCell label={t('home.statRemote')} value={stats.remoteSongs} />
        <StatCell label={t('home.statRadios')} value={stats.radioSongs} />
      </view>

      <view className='home-stats__row'>
        <StatCell label={t('home.statArtists')} value={stats.artistCount} />
        <StatCell label={t('home.statAlbums')} value={stats.albumCount} />
        <StatCell label={t('home.statGenres')} value={stats.genreCount} />
      </view>

      {stats.totalFileSize > 0
        ? (
          <view className='home-stats__footer'>
            <text className='home-stats__footer-text'>
              {t('home.statSize', { size: formatBytes(stats.totalFileSize) })}
            </text>
          </view>
        )
        : null}
    </view>
  )
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <view className='home-stats__cell'>
      <text className='home-stats__cell-value'>{String(value)}</text>
      <text className='home-stats__cell-label'>{label}</text>
    </view>
  )
}
