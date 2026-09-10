import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { SortableRoot, SortableItem, SortableItemArea } from '@lynx-js/lynx-ui-sortable'

import type { LibraryBrowseConfig, LibraryBrowseView, LibraryViewKey } from '../../../models/library-browse.js'
import { LIBRARY_VIEW_KEYS } from '../../../models/library-browse.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useUpdateLibraryBrowseMutation } from '../data/library-browse-query.js'
import {
  groupedFlatten,
  groupLibraryViewKeys,
  LIBRARY_VIEW_GROUP_LABEL_KEY,
  LIBRARY_VIEW_ICON,
  LIBRARY_VIEW_LABEL_KEY,
  moveGroup,
  setGroupOrder,
  type LibraryViewGroup,
} from '../domain/library-views.js'
import './LibraryViewEditor.css'

export interface LibraryViewEditorProps {
  initialConfig: LibraryBrowseConfig
  /** Discard the draft and leave edit mode. */
  onCancel: () => void
  /** Leave edit mode after the save has been dispatched (optimistic). */
  onSaved: () => void
}

/**
 * The in-library "customize views" editor — replaces the whole library body
 * (Flutter `_buildEditor`). Three groups, each with a header (whole-group move
 * up/down) and drag-to-reorder rows (icon + label + visibility switch). Saving
 * requires at least one visible view; the draft is flattened group-contiguous
 * before the optimistic PUT.
 *
 * Reorder uses one `SortableRoot` per group (default `as` = plain view, nested
 * in the page scroll-view). `scrollableBoundaryId` is deliberately NOT set —
 * the group-move buttons are the non-gesture fallback on any platform where
 * nested drag misbehaves (see the batch plan's risk note).
 */
export function LibraryViewEditor({ initialConfig, onCancel, onSaved }: LibraryViewEditorProps) {
  const { t } = useTranslation()
  const mutation = useUpdateLibraryBrowseMutation()
  const [draft, setDraft] = useState<LibraryBrowseView[]>(initialConfig.views)
  const [showMinOneError, setShowMinOneError] = useState(false)

  const buckets = groupLibraryViewKeys(draft.map((v) => v.key))
  const viewByKey = new Map(draft.map((v) => [v.key, v]))

  const toggleVisible = (key: string) => {
    setShowMinOneError(false)
    setDraft(prev => prev.map((v) => (v.key === key ? { ...v, visible: !v.visible } : v)))
  }

  const move = (group: LibraryViewGroup, delta: -1 | 1) => {
    setDraft(prev => moveGroup(prev, group, delta))
  }

  const reorder = (group: LibraryViewGroup, orderedKeys: string[]) => {
    setDraft(prev => setGroupOrder(prev, group, orderedKeys as LibraryViewKey[]))
  }

  const save = () => {
    if (!draft.some((v) => v.visible)) {
      setShowMinOneError(true)
      return
    }
    mutation.mutate({ views: groupedFlatten(draft) })
    onSaved()
  }

  const resetToDefault = () => {
    setShowMinOneError(false)
    setDraft(LIBRARY_VIEW_KEYS.map((key) => ({ key, visible: true })))
  }

  return (
    <view className='library-editor'>
      <view className='library-editor__topbar'>
        <view className='library-editor__cancel' bindtap={onCancel} data-testid='library-editor-cancel'>
          <Icon name='x' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='library-editor__title'>{t('library.customizeViews')}</text>
        <view className='library-editor__reset' bindtap={resetToDefault} data-testid='library-editor-reset'>
          <text className='library-editor__reset-text'>{t('library.resetToDefault')}</text>
        </view>
        <view className='library-editor__save' bindtap={save} data-testid='library-editor-save'>
          <text className='library-editor__save-text'>{t('library.save')}</text>
        </view>
      </view>

      {showMinOneError
        ? <text className='library-editor__error'>{t('library.viewsMinOne')}</text>
        : null}

      <scroll-view className='library-editor__scroll' scroll-y>
        <view className='library-editor__content'>
          {buckets.map((bucket, i) => {
            const rows = bucket.keys.map((k) => viewByKey.get(k)!).filter(Boolean)
            const isFirst = i === 0
            const isLast = i === buckets.length - 1
            return (
              <view key={bucket.group} className='library-editor__group'>
                <view className='library-editor__group-header'>
                  <text className='library-editor__group-label'>
                    {t(LIBRARY_VIEW_GROUP_LABEL_KEY[bucket.group])}
                  </text>
                  <view
                    className={isFirst ? 'library-editor__group-btn library-editor__group-btn--disabled' : 'library-editor__group-btn'}
                    bindtap={() => { if (!isFirst) move(bucket.group, -1) }}
                    data-testid={`library-editor-group-up-${bucket.group}`}
                  >
                    <Icon name='chevron-up' size={18} color={isFirst ? ICON_COLORS.contentMuted : ICON_COLORS.content2} />
                  </view>
                  <view
                    className={isLast ? 'library-editor__group-btn library-editor__group-btn--disabled' : 'library-editor__group-btn'}
                    bindtap={() => { if (!isLast) move(bucket.group, 1) }}
                    data-testid={`library-editor-group-down-${bucket.group}`}
                  >
                    <Icon name='chevron-down' size={18} color={isLast ? ICON_COLORS.contentMuted : ICON_COLORS.content2} />
                  </view>
                </view>

                <SortableRoot<LibraryBrowseView>
                  data={rows.map((v) => ({ getSortingKey: () => v.key, dataItem: v }))}
                  onSortEnd={(sorted) => reorder(bucket.group, sorted.map((d) => d.dataItem.key))}
                >
                  {(item) => (
                    <SortableItem
                      sortingKey={item.dataItem.key}
                      as='DraggableRoot'
                      className='library-editor__row'
                    >
                      <SortableItemArea>
                        <view className='library-editor__drag' data-testid={`library-editor-drag-${item.dataItem.key}`}>
                          <Icon name='menu' size={18} color={ICON_COLORS.content2} />
                        </view>
                      </SortableItemArea>
                      <Icon
                        name={LIBRARY_VIEW_ICON[item.dataItem.key]}
                        size={18}
                        color={ICON_COLORS.content2}
                      />
                      <text className='library-editor__row-label'>
                        {t(LIBRARY_VIEW_LABEL_KEY[item.dataItem.key])}
                      </text>
                      <view className='library-editor__row-switch' data-testid={`library-editor-switch-${item.dataItem.key}`}>
                        <AppSwitch
                          checked={item.dataItem.visible}
                          onChange={() => toggleVisible(item.dataItem.key)}
                        />
                      </view>
                    </SortableItem>
                  )}
                </SortableRoot>
              </view>
            )
          })}
        </view>
      </scroll-view>
    </view>
  )
}
