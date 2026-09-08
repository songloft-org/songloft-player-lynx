import { useTranslation } from 'react-i18next'

import { activeAccentIconColor, Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import {
  groupLibraryViewKeys,
  LIBRARY_VIEW_GROUP_LABEL_KEY,
  LIBRARY_VIEW_ICON,
  LIBRARY_VIEW_LABEL_KEY,
  type LibraryViewKey,
} from '../domain/library-views.js'
import './LibraryViewRail.css'

export interface LibraryViewRailProps {
  displayKeys: LibraryViewKey[]
  selected?: LibraryViewKey
  onSelect: (key: LibraryViewKey) => void
}

/**
 * Wide-layout view switcher: a fixed-width left rail, one row per visible
 * view, grouped under text section headers. Wide screens (>= tablet breakpoint)
 * use this instead of the horizontal pill strip.
 *
 * Deliberately the SAME visual language as the shell's nav rail
 * (`ShellLayout.css`): sidebar material, row metrics (44px rows, `--radius-md`
 * selection rect, `--system-gray5` active fill), 24px bare icons with accent
 * tint on the active one, `--font-subhead` labels, and the shell's group-header
 * style. The two rails sit side by side on wide screens and must read as one
 * continuous iPadOS-style sidebar — two different selection idioms in adjacent
 * columns is what made the old rail look "不搭配".
 *
 * No page-title header. It used to take a `showTitle` prop, used only by the
 * drill-in pages — but the rail is now owned by the route layout and persists
 * across navigation, so a header that appears on some routes would push every
 * row down as you navigate. The section is already named by the shell's nav
 * rail; the group headers below name the rail's own sections.
 */
export function LibraryViewRail({ displayKeys, selected, onSelect }: LibraryViewRailProps) {
  const { t } = useTranslation()
  const buckets = groupLibraryViewKeys(displayKeys)

  return (
    <scroll-view className='library-rail' scroll-y>
      <view className='library-rail__col'>
        {buckets.map((bucket, i) => (
          <view key={bucket.group} className='library-rail__group'>
            <text
              className={
                i > 0
                  ? 'library-rail__group-header library-rail__group-header--subsequent'
                  : 'library-rail__group-header'
              }
              data-testid={`library-rail-group-${bucket.group}`}
            >
              {t(LIBRARY_VIEW_GROUP_LABEL_KEY[bucket.group])}
            </text>
            {bucket.keys.map((key) => (
              <view
                key={key}
                data-testid={`library-view-row-${key}`}
                className={
                  key === selected
                    ? 'library-rail__row library-rail__row--active'
                    : 'library-rail__row'
                }
                bindtap={() => onSelect(key)}
              >
                <Icon
                  name={LIBRARY_VIEW_ICON[key]}
                  size={24}
                  color={key === selected ? activeAccentIconColor() : ICON_COLORS.contentMuted}
                />
                <text className='library-rail__label'>{t(LIBRARY_VIEW_LABEL_KEY[key])}</text>
              </view>
            ))}
          </view>
        ))}
      </view>
    </scroll-view>
  )
}
