import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { PopoverMenu } from '../../../shared/ui/PopoverMenu.js'
import type { PopoverMenuItem } from '../../../shared/ui/PopoverMenu.js'
import {
  LIBRARY_SORT_OPTIONS,
  type LibrarySortId,
} from '../domain/library-sort.js'
import './LibraryToolbar.css'

export interface LibraryToolbarProps {
  /** Current sort; lifted to the page so it persists + survives view switches. */
  sortId: LibrarySortId
  onSortChange: (id: LibrarySortId) => void
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
 */
export function LibraryToolbar({
  sortId,
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

  return (
    <view className='library-toolbar'>
      <view
        className={hasSongs ? 'library-toolbar__btn' : 'library-toolbar__btn library-toolbar__btn--disabled'}
        bindtap={() => { if (hasSongs) onPlayAll() }}
        data-testid='library-toolbar-play-all'
      >
        <Icon name='play' size={14} color={ICON_COLORS.content} />
        <text className='library-toolbar__btn-text'>{t('playlist.playAll')}</text>
      </view>

      <PopoverMenu
        show={sortOpen}
        onShowChange={setSortOpen}
        placement='bottom-start'
        contentClassName='popover-menu--wide'
        triggerClassName='library-toolbar__btn'
        trigger={
          <view data-testid='library-toolbar-sort'>
            <Icon name='sort' size={14} color={ICON_COLORS.content} />
            <text className='library-toolbar__btn-text'>{t(current!.labelKey)}</text>
          </view>
        }
        items={LIBRARY_SORT_OPTIONS.map((o): PopoverMenuItem => ({
          key: o.id,
          label: t(o.labelKey),
          selected: o.id === sortId,
        }))}
        onSelect={(key) => {
          onSortChange(key as LibrarySortId)
          setSortOpen(false)
        }}
      />

      <view className='library-toolbar__spacer' />

      <view className='library-toolbar__btn' bindtap={onAdd} data-testid='library-toolbar-add'>
        <Icon name='plus' size={14} color={ICON_COLORS.content} />
        <text className='library-toolbar__btn-text'>{t('addSongs.add')}</text>
      </view>

      <view
        className={selectMode ? 'library-toolbar__btn library-toolbar__btn--active' : 'library-toolbar__btn'}
        bindtap={onToggleSelect}
        data-testid='library-toolbar-select'
      >
        <Icon name={selectMode ? 'x' : 'check'} size={14} color={selectMode ? ICON_COLORS.primaryContent : ICON_COLORS.content} />
        <text className='library-toolbar__btn-text'>
          {selectMode ? t('library.cancelSelect') : t('library.select')}
        </text>
      </view>

    </view>
  )
}
