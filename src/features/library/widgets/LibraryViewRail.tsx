import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import {
  groupLibraryViewKeys,
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
 * view, with a divider between groups. Wide screens (>= tablet breakpoint)
 * use this instead of the horizontal pill strip.
 *
 * Deliberately header-less. It used to take a `showTitle` prop, used only by the
 * drill-in pages — but the rail is now owned by the route layout and persists
 * across navigation, so a header that appears on some routes would push every row
 * down as you navigate. The section is already named by the shell's nav rail.
 */
export function LibraryViewRail({ displayKeys, selected, onSelect }: LibraryViewRailProps) {
  const { t } = useTranslation()
  const buckets = groupLibraryViewKeys(displayKeys)

  return (
    <scroll-view className='library-rail' scroll-y>
      <view className='library-rail__col'>
        {buckets.map((bucket, i) => (
          <view key={bucket.group} className='library-rail__group'>
            {i > 0 ? <view className='library-rail__divider' /> : null}
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
                <view className={
                  key === selected
                    ? 'library-rail__icon library-rail__icon--active'
                    : 'library-rail__icon'
                }
                >
                  <Icon
                    name={LIBRARY_VIEW_ICON[key]}
                    size={18}
                    color={key === selected ? ICON_COLORS.primary : ICON_COLORS.content2}
                  />
                </view>
                <text className='library-rail__label'>{t(LIBRARY_VIEW_LABEL_KEY[key])}</text>
              </view>
            ))}
          </view>
        ))}
      </view>
    </scroll-view>
  )
}
