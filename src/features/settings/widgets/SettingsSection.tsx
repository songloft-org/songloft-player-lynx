import type { ReactNode } from '@lynx-js/react'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { IconName } from '../../../shared/ui/icons.js'
import './Settings.css'

export interface SettingsSectionProps {
  title: string
  icon?: IconName
  children?: ReactNode
}

/**
 * A titled group of {@link SettingsRow}s on a `paper` card — the Lynx analogue
 * of the Flutter `SectionCard`. Ported trimmed: header (icon + title) above a
 * bordered card containing the rows.
 */
export function SettingsSection({ title, icon, children }: SettingsSectionProps) {
  return (
    <view className='settings-section'>
      <view className='settings-section__header'>
        {icon
          ? (
            <view className='settings-section__icon'>
              <Icon name={icon} size={16} color={ICON_COLORS.contentMuted} />
            </view>
          )
          : null}
        <text className='settings-section__title'>{title}</text>
      </view>
      <view className='settings-section__card'>{children}</view>
    </view>
  )
}
