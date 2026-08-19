import type { ReactNode } from '@lynx-js/react'

import { useBackHandler } from '../nav/use-back-handler.js'
import { Icon, ICON_COLORS } from './Icon.js'
import type { IconName } from './icons.js'
import './ActionSheet.css'

/**
 * A bottom action sheet — the Lynx stand-in for Flutter's `PopupMenuButton` /
 * modal bottom sheet. Built as a fixed root + backdrop + bottom panel (the same
 * shape as `SongContextMenu`, which is hand-rolled rather than `lynx-ui-sheet`
 * for the reasons recorded in batch 50: imperative-ref sheets keep children
 * mounted and fire their queries on every mount).
 *
 * The backdrop closes on tap; the panel uses `catchtap` so taps inside it do
 * not bubble up and dismiss.
 */
export interface ActionSheetProps {
  open: boolean
  onClose: () => void
  /** Optional heading rendered above the items. */
  title?: string
  children: ReactNode
}

export function ActionSheet({ open, onClose, title, children }: ActionSheetProps) {
  // Before the early return: hooks cannot be skipped, and the component stays
  // mounted while closed (call sites render it unconditionally).
  useBackHandler(open, () => {
    onClose()
    return true
  })

  if (!open) return null
  return (
    <view className='action-sheet' bindtap={onClose}>
      <view className='action-sheet__backdrop' />
      <view className='action-sheet__panel' catchtap={() => {}}>
        {title
          ? (
            <view className='action-sheet__header'>
              <text className='action-sheet__title'>{title}</text>
            </view>
          )
          : null}
        <scroll-view className='action-sheet__body' scroll-y>
          {children}
        </scroll-view>
      </view>
    </view>
  )
}

export interface ActionSheetItemProps {
  icon?: IconName
  label: string
  onTap: () => void
  /** Marks the currently-selected row (e.g. the active sort). */
  active?: boolean
  danger?: boolean
}

export function ActionSheetItem({ icon, label, onTap, active, danger }: ActionSheetItemProps) {
  return (
    <view className='action-sheet__item' bindtap={onTap}>
      {icon
        ? (
          <Icon
            name={icon}
            size={18}
            color={danger ? ICON_COLORS.danger : active ? ICON_COLORS.primary : ICON_COLORS.content2}
          />
        )
        : null}
      <text
        className={
          danger
            ? 'action-sheet__item-text action-sheet__item-text--danger'
            : active
              ? 'action-sheet__item-text action-sheet__item-text--active'
              : 'action-sheet__item-text'
        }
      >
        {label}
      </text>
      {active ? <Icon name='check' size={16} color={ICON_COLORS.primary} /> : null}
    </view>
  )
}
