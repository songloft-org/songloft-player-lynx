import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { IconName } from '../../../shared/ui/icons.js'
import type { HomeStats } from '../data/home-select.js'

/**
 * Bottom stats strip, ported from the Flutter home `StatsStrip`: three compact
 * figures (playlists / radios / total) on a primary-tinted panel. Counts come
 * from the backend `total` of each section (see `homeStats`), so they reflect
 * the whole library rather than the truncated section previews.
 */
export function StatsStrip({ stats }: { stats: HomeStats }) {
  return (
    <view className='home-stats'>
      <StatChip icon='library' label='Playlists' value={stats.normal} />
      <view className='home-stats__divider' />
      <StatChip icon='music' label='Radios' value={stats.radio} />
      <view className='home-stats__divider' />
      <StatChip icon='home' label='Total' value={stats.total} />
    </view>
  )
}

function StatChip({ icon, label, value }: { icon: IconName; label: string; value: number }) {
  return (
    <view className='home-stats__chip'>
      <view className='home-stats__chip-icon'>
        <Icon name={icon} size={18} color={ICON_COLORS.primaryContent} />
      </view>
      <view className='home-stats__chip-meta'>
        <text className='home-stats__chip-value'>{String(value)}</text>
        <text className='home-stats__chip-label'>{label}</text>
      </view>
    </view>
  )
}
