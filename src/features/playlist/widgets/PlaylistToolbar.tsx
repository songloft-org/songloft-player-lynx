import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import './PlaylistToolbar.css'

export interface PlaylistSortOption {
  /** Sort key sent to the backend (`position` / `title` / …). */
  key: string
  /** Pre-translated label shown in the menu and on the trigger. */
  label: string
}

export interface PlaylistToolbarProps {
  /** Current sort key — drives the trigger label and the selected checkmark. */
  currentSort: string
  /** Current sort direction — drives the arrow icon on the selected item. */
  currentOrder: string
  sortOptions: ReadonlyArray<PlaylistSortOption>
  onSelectSort: (key: string) => void
  onPlayAll: () => void
  selectMode: boolean
  onToggleSelect: () => void
  /** Disables play-all / select when there is nothing to act on. */
  hasSongs: boolean
}

/**
 * The playlist-detail toolbar — the counterpart of the flat-songs
 * `LibraryToolbar`: play-all on the left, sort (as a popover instead of a chip
 * row) and multi-select on the right. Same compact chip styling.
 *
 * Not a reuse of `LibraryToolbar` itself: the two sorts have different data
 * models (a single persisted `LibrarySortId` there vs. `sortBy`+`sortOrder`
 * written through the backend sort mutation here), and the library toolbar
 * carries an add-songs button this page does not want.
 */
export function PlaylistToolbar({
  currentSort,
  currentOrder,
  sortOptions,
  onSelectSort,
  onPlayAll,
  selectMode,
  onToggleSelect,
  hasSongs,
}: PlaylistToolbarProps) {
  const { t } = useTranslation()
  const [sortOpen, setSortOpen] = useState(false)

  const current = sortOptions.find((o) => o.key === currentSort)

  return (
    <view className='playlist-toolbar' data-testid='playlist-toolbar'>
      <view
        className={hasSongs
          ? 'playlist-toolbar__btn'
          : 'playlist-toolbar__btn playlist-toolbar__btn--disabled'}
        bindtap={() => { if (hasSongs) onPlayAll() }}
        data-testid='playlist-toolbar-play-all'
      >
        <Icon name='play' size={14} color={ICON_COLORS.content} />
        <text className='playlist-toolbar__btn-text'>{t('playlist.playAll')}</text>
      </view>

      <view className='playlist-toolbar__spacer' />

      <PopoverMenu
        show={sortOpen}
        onShowChange={setSortOpen}
        placement='bottom-end'
        contentClassName='popover-menu--wide'
        triggerClassName='playlist-toolbar__btn'
        trigger={
          /*
           * A fragment, NOT a wrapping `<view>`: the row layout lives on
           * `triggerClassName` (which `PopoverSurface` puts on the trigger's own view), so an
           * extra `<view>` here becomes an unstyled child — and an unstyled view is
           * Lynx *linear* layout, whose default direction is `column`. Same trap as
           * `LibraryToolbar`'s sort trigger.
           */
          <>
            <Icon name='sort' size={14} color={ICON_COLORS.content} />
            <text className='playlist-toolbar__btn-text' data-testid='playlist-toolbar-sort'>
              {current?.label ?? sortOptions[0]?.label ?? ''}
            </text>
          </>
        }
        items={sortOptions.map((o): PopoverMenuItem => ({
          key: o.key,
          label: o.label,
          selected: o.key === currentSort,
          selectedIcon: currentOrder === 'asc' ? 'arrow-up' : 'arrow-down',
        }))}
        onSelect={(key) => {
          onSelectSort(key)
          setSortOpen(false)
        }}
      />

      <view
        className={selectMode
          ? 'playlist-toolbar__btn playlist-toolbar__btn--active'
          : 'playlist-toolbar__btn'}
        bindtap={onToggleSelect}
        data-testid='playlist-toolbar-select'
      >
        <Icon
          name={selectMode ? 'x' : 'check'}
          size={14}
          color={selectMode ? ICON_COLORS.primaryContent : ICON_COLORS.content}
        />
        <text className='playlist-toolbar__btn-text'>
          {selectMode ? t('library.cancelSelect') : t('library.select')}
        </text>
      </view>
    </view>
  )
}
