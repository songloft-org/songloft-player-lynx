import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import {
  LIBRARY_SORT_OPTIONS,
  LIBRARY_SORT_GROUPS,
  defaultLibrarySortOrder,
  type LibrarySortId,
  type SortOrder,
} from '../domain/library-sort.js'
import './LibraryToolbar.css'

export interface LibraryToolbarProps {
  /** Current sort; lifted to the page so it persists + survives view switches. */
  sortId: LibrarySortId
  /** Current sort direction. */
  sortOrder: SortOrder
  onSortChange: (id: LibrarySortId, order: SortOrder) => void
  onPlayAll: () => void
  onAdd: () => void
  selectMode: boolean
  onToggleSelect: () => void
  /** Disables play-all / select when there is nothing to act on. */
  hasSongs: boolean
}

/**
 * The flat-songs toolbar — batch C's replacement for the old three-chip sort
 * bar. Sort is now a seven-option bottom sheet (every field inside the backend
 * `songOrderWhitelist`), and the choice is lifted to the page so it persists
 * (prefs) and survives switching views.
 *
 * Visual hierarchy (HIG): "play all" is the primary action → accent-filled
 * pill. Sort / Add / Select are secondary → `--tertiary-system-fill` pills.
 */
export function LibraryToolbar({
  sortId,
  sortOrder,
  onSortChange,
  onPlayAll,
  onAdd,
  selectMode,
  onToggleSelect,
  hasSongs,
}: LibraryToolbarProps) {
  const { t } = useTranslation()
  const [sortOpen, setSortOpen] = useState(false)

  const current = LIBRARY_SORT_OPTIONS.find((o) => o.id === sortId) ?? LIBRARY_SORT_OPTIONS[0]!

  // Build sort menu items grouped into time / text / other sections.
  const sortItems: PopoverMenuItem[] = []
  for (const group of LIBRARY_SORT_GROUPS) {
    // Section header — a non-interactive label row.
    sortItems.push({
      key: `__sort_group_${group.labelKey}`,
      label: t(group.labelKey),
      kind: 'header',
    })
    for (const id of group.ids) {
      const o = LIBRARY_SORT_OPTIONS.find((o) => o.id === id)
      if (!o) continue
      sortItems.push({
        key: o.id,
        label: t(o.labelKey),
        selected: o.id === sortId,
        selectedIcon: sortOrder === 'asc' ? 'arrow-up' : 'arrow-down',
      })
    }
  }

  return (
    <view className='library-toolbar'>
      {/* Play all — primary action */}
      <view
        className={hasSongs ? 'library-toolbar__btn library-toolbar__btn--primary' : 'library-toolbar__btn library-toolbar__btn--primary library-toolbar__btn--disabled'}
        bindtap={() => { if (hasSongs) onPlayAll() }}
        data-testid='library-toolbar-play-all'
      >
        <Icon name='play' size={14} color={ICON_COLORS.primaryContent} />
        <text className='library-toolbar__btn-text-primary'>{t('playlist.playAll')}</text>
      </view>

      {/* Sort — popover with grouped items + chevron-down hint */}
      <PopoverMenu
        show={sortOpen}
        onShowChange={setSortOpen}
        placement='bottom-start'
        contentClassName='popover-menu--wide'
        triggerClassName='library-toolbar__btn'
        trigger={
          <>
            <Icon name='sort' size={14} color={ICON_COLORS.content} />
            <text className='library-toolbar__btn-text' data-testid='library-toolbar-sort'>
              {t(current!.labelKey)}
            </text>
            <Icon name='chevron-down' size={10} color={ICON_COLORS.contentMuted} />
          </>
        }
        items={sortItems}
        onSelect={(key) => {
          // Skip group header items.
          if (typeof key === 'string' && key.startsWith('__sort_group_')) return
          const id = key as LibrarySortId
          const order: SortOrder = id === sortId
            ? (sortOrder === 'asc' ? 'desc' : 'asc')
            : defaultLibrarySortOrder(id)
          onSortChange(id, order)
          setSortOpen(false)
        }}
      />

      <view className='library-toolbar__spacer' />

      <view className='library-toolbar__btn' bindtap={onAdd} data-testid='library-toolbar-add'>
        <Icon name='plus' size={14} color={ICON_COLORS.content} />
        <text className='library-toolbar__btn-text'>{t('addSongs.add')}</text>
      </view>

      {/* Select — active state toggles visual distinction between normal and select mode */}
      <view
        className={selectMode ? 'library-toolbar__btn library-toolbar__btn--active' : 'library-toolbar__btn'}
        bindtap={onToggleSelect}
        data-testid='library-toolbar-select'
      >
        <Icon name={selectMode ? 'x' : 'check'} size={14} color={selectMode ? ICON_COLORS.primaryContent : ICON_COLORS.content} />
        <text className={selectMode ? 'library-toolbar__btn-text-active' : 'library-toolbar__btn-text'}>
          {selectMode ? t('library.cancelSelect') : t('library.select')}
        </text>
      </view>
    </view>
  )
}
