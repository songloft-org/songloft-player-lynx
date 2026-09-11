import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { FolderInfo } from '../../../models/folder.js'

export interface FolderCardProps {
  folder: FolderInfo
  onTap?: (folder: FolderInfo) => void
  onPlayAll?: (folder: FolderInfo) => void
}

export function FolderCard({ folder, onTap, onPlayAll }: FolderCardProps) {
  const { t } = useTranslation()

  return (
    <view className='facet-card' bindtap={() => onTap?.(folder)}>
      <view className='facet-card__cover-wrap'>
        <view className='facet-card__cover facet-card__cover--empty folder-card__icon-wrap'>
          <Icon name='folder-open' size={40} color={ICON_COLORS.contentMuted} />
        </view>
        {onPlayAll
          ? (
            <view
              className='facet-card__play-hit'
              catchtap={() => { onPlayAll(folder) }}
              accessibility-element={true}
              accessibility-label={t('common.playAll')}
            >
              <view className='facet-card__play-btn'>
                <Icon name='play' size={14} color={ICON_COLORS.primaryContent} />
              </view>
            </view>
          )
          : null}
      </view>
      <text className='facet-card__value'>{folder.name || t('common.unknown')}</text>
      <text className='facet-card__count'>
        {t(folder.songCount === 1 ? 'common.songCountOne' : 'common.songCountOther', {
          count: folder.songCount,
        })}
      </text>
    </view>
  )
}
