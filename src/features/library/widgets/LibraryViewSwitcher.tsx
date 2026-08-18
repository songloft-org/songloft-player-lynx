import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import {
  groupLibraryViewKeys,
  LIBRARY_VIEW_ICON,
  LIBRARY_VIEW_LABEL_KEY,
  type LibraryViewKey,
} from '../domain/library-views.js'
import './LibraryViewSwitcher.css'

export interface LibraryViewSwitcherProps {
  /** Keys to show, in display order (already resolved against the config). */
  displayKeys: LibraryViewKey[]
  selected?: LibraryViewKey
  onSelect: (key: LibraryViewKey) => void
}

/**
 * Narrow-layout view switcher: a horizontal pill strip, one pill per visible
 * view, with a hairline divider between groups. The inner row is
 * `width: max-content` so the horizontal `scroll-view` actually scrolls
 * (AGENTS §4 — without it the content visually never moves).
 */
export function LibraryViewSwitcher({ displayKeys, selected, onSelect }: LibraryViewSwitcherProps) {
  const { t } = useTranslation()
  const buckets = groupLibraryViewKeys(displayKeys)

  return (
    <scroll-view className='library-switcher' scroll-orientation='horizontal'>
      <view className='library-switcher__row'>
        {buckets.map((bucket, i) => (
          <view key={bucket.group} className='library-switcher__group'>
            {i > 0 ? <view className='library-switcher__divider' data-testid='library-view-divider' /> : null}
            {bucket.keys.map((key) => (
              <view
                key={key}
                data-testid={`library-view-pill-${key}`}
                className={
                  key === selected
                    ? 'library-switcher__pill library-switcher__pill--active'
                    : 'library-switcher__pill'
                }
                bindtap={() => onSelect(key)}
              >
                <Icon
                  name={LIBRARY_VIEW_ICON[key]}
                  size={15}
                  color={key === selected ? ICON_COLORS.primary : ICON_COLORS.content2}
                />
                <text className='library-switcher__pill-text'>{t(LIBRARY_VIEW_LABEL_KEY[key])}</text>
              </view>
            ))}
          </view>
        ))}
      </view>
    </scroll-view>
  )
}
