import { useTranslation } from 'react-i18next'

import { RadioGroupRoot, Radio, RadioIndicator } from '@lynx-js/lynx-ui'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { DuplicateGroup, DuplicateSong } from '../../../models/duplicate.js'

export interface DuplicateGroupCardProps {
  groupIndex: number
  group: DuplicateGroup
  keepId: number
  recommendedId: number
  ignored: boolean
  onKeepChange: (songId: number) => void
  onToggleIgnore: () => void
  onDeleteUnselected: () => void
}

/**
 * A single duplicate group card with a radio selector for picking the version
 * to keep. Ported from Flutter's `_buildGroupCard`.
 */
export function DuplicateGroupCard({
  groupIndex,
  group,
  keepId,
  recommendedId,
  ignored,
  onKeepChange,
  onToggleIgnore,
  onDeleteUnselected,
}: DuplicateGroupCardProps) {
  const { t } = useTranslation()

  return (
    <view
      className={`fp-group${ignored ? ' fp-group--ignored' : ''}`}
      data-testid={`fp-group-${groupIndex}`}
    >
      {/* Header */}
      <view className='fp-group__header'>
        <text className='fp-group__title'>
          {t('libops.dupGroupTitle', { index: groupIndex + 1 })}
        </text>
        <view
          className='fp-group__ignore-btn'
          bindtap={onToggleIgnore}
          data-testid={`fp-group-ignore-${groupIndex}`}
        >
          <text className='fp-group__ignore-text'>
            {ignored
              ? t('libops.dupUnignore')
              : t('libops.dupIgnoreGroup')}
          </text>
        </view>
      </view>

      {/* Songs list with radio selection */}
      {!ignored
        ? (
          <view className='fp-group__songs'>
            <RadioGroupRoot
              value={String(keepId)}
              onValueChange={(v) => onKeepChange(Number(v))}
            >
              {group.songs.map((song) => (
                <SongTile
                  key={song.id}
                  song={song}
                  isKeep={song.id === keepId}
                  isRecommended={song.id === recommendedId}
                />
              ))}
            </RadioGroupRoot>

            {/* Delete unselected button */}
            <view
              className='fp-group__delete-btn'
              bindtap={onDeleteUnselected}
              data-testid={`fp-group-delete-${groupIndex}`}
            >
              <Icon name='x' size={16} color={ICON_COLORS.danger} />
              <text className='fp-group__delete-text'>
                {t('libops.dupDeleteUnselected')}
              </text>
            </view>
          </view>
        )
        : null}
    </view>
  )
}

/* ─────────────────────────── Song tile (internal) ────────────────────────── */

interface SongTileProps {
  song: DuplicateSong
  isKeep: boolean
  isRecommended: boolean
}

function SongTile({ song, isKeep, isRecommended }: SongTileProps) {
  const { t } = useTranslation()

  return (
    <Radio value={String(song.id)} className='fp-group__song-radio'>
      <view className='fp-group__song' data-testid={`fp-song-${song.id}`}>
        <RadioIndicator className='fp-group__radio-indicator' />
        <view className='fp-group__song-info'>
          <view className='fp-group__song-row'>
            <text className={`fp-group__song-title${isKeep ? ' fp-group__song-title--keep' : ''}`}>
              {song.title} - {song.artist}
            </text>
            {isRecommended
              ? (
                <view className='fp-group__badge'>
                  <text className='fp-group__badge-text'>
                    {t('libops.dupRecommended')}
                  </text>
                </view>
              )
              : null}
          </view>
          <text className='fp-group__song-path'>{song.filePath}</text>
          <text className='fp-group__song-meta'>
            {song.format.toUpperCase()} · {song.bitRate}kbps · {song.fileSizeDisplay}
          </text>
        </view>
      </view>
    </Radio>
  )
}


