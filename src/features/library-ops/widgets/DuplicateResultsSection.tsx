import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { DuplicatesResult } from '../../../models/duplicate.js'

export interface DuplicateResultsSectionProps {
  duplicates: DuplicatesResult
  totalToDelete: number
  ignoredCount: number
  onCleanAll: () => void
  onRecheck: () => void
}

/**
 * Results summary header — group/song counts + "clean all" button + recheck.
 */
export function DuplicateResultsSection({
  duplicates,
  totalToDelete,
  ignoredCount,
  onCleanAll,
  onRecheck,
}: DuplicateResultsSectionProps) {
  const { t } = useTranslation()

  // No duplicates found
  if (duplicates.groups.length === 0) {
    return (
      <view className='fp-results fp-results--empty' data-testid='fp-no-results'>
        <Icon name='check-circle' size={48} color={ICON_COLORS.primary} />
        <text className='fp-results__empty-title'>
          {t('libops.dupNoneFound')}
        </text>
        <text className='fp-results__empty-hint'>
          {t('libops.dupNoneHint')}
        </text>
        <view className='fp-results__recheck' bindtap={onRecheck} data-testid='fp-recheck'>
          <Icon name='refresh' size={16} color={ICON_COLORS.primary} />
          <text className='fp-results__recheck-text'>
            {t('libops.dupRecheck')}
          </text>
        </view>
      </view>
    )
  }

  return (
    <view className='fp-results' data-testid='fp-results'>
      <view className='fp-results__summary'>
        <text className='fp-results__summary-text'>
          {t('libops.dupSummary', {
            groups: duplicates.totalGroups,
            songs: duplicates.totalDuplicates,
          })}
        </text>
        {ignoredCount > 0
          ? (
            <text className='fp-results__ignored'>
              {t('libops.dupIgnoredCount', { count: ignoredCount })}
            </text>
          )
          : null}
      </view>

      {totalToDelete > 0
        ? (
          <view
            className='fp-results__clean-all'
            bindtap={onCleanAll}
            data-testid='fp-clean-all'
          >
            <Icon name='x' size={16} color='#ffffff' />
            <text className='fp-results__clean-all-text'>
              {t('libops.dupCleanAll', { count: totalToDelete })}
            </text>
          </view>
        )
        : null}

      <view className='fp-results__recheck' bindtap={onRecheck} data-testid='fp-recheck'>
        <Icon name='refresh' size={16} color={ICON_COLORS.primary} />
        <text className='fp-results__recheck-text'>
          {t('libops.dupRecheck')}
        </text>
      </view>
    </view>
  )
}
