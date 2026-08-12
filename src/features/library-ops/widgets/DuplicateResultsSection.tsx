import { useCallback } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { DuplicatesResult } from '../../../models/duplicate.js'

function useLocalT() {
  const { i18n } = useTranslation()
  return useCallback(
    (en: string, zh: string): string => (i18n.language === 'zh' ? zh : en),
    [i18n.language],
  )
}

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
  const lt = useLocalT()

  // No duplicates found
  if (duplicates.groups.length === 0) {
    return (
      <view className='fp-results fp-results--empty' data-testid='fp-no-results'>
        <Icon name='check-circle' size={48} color={ICON_COLORS.primary} />
        <text className='fp-results__empty-title'>
          {lt('No duplicate songs found', '未发现重复歌曲')}
        </text>
        <text className='fp-results__empty-hint'>
          {lt('Your music library is clean!', '音乐库很干净！')}
        </text>
        <view className='fp-results__recheck' bindtap={onRecheck} data-testid='fp-recheck'>
          <Icon name='refresh' size={16} color={ICON_COLORS.primary} />
          <text className='fp-results__recheck-text'>
            {lt('Recheck', '重新检测')}
          </text>
        </view>
      </view>
    )
  }

  return (
    <view className='fp-results' data-testid='fp-results'>
      <view className='fp-results__summary'>
        <text className='fp-results__summary-text'>
          {lt(
            `Found ${duplicates.totalGroups} duplicate groups (${duplicates.totalDuplicates} songs total)`,
            `发现 ${duplicates.totalGroups} 组重复（共 ${duplicates.totalDuplicates} 首歌曲）`,
          )}
        </text>
        {ignoredCount > 0
          ? (
            <text className='fp-results__ignored'>
              {lt(`${ignoredCount} groups ignored`, `已忽略 ${ignoredCount} 组`)}
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
              {lt(
                `Clean all duplicates (delete ${totalToDelete})`,
                `清理全部重复（删除 ${totalToDelete} 首）`,
              )}
            </text>
          </view>
        )
        : null}

      <view className='fp-results__recheck' bindtap={onRecheck} data-testid='fp-recheck'>
        <Icon name='refresh' size={16} color={ICON_COLORS.primary} />
        <text className='fp-results__recheck-text'>
          {lt('Recheck', '重新检测')}
        </text>
      </view>
    </view>
  )
}
