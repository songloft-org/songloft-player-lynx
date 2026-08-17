import type { ReactNode } from '@lynx-js/react'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { IconName } from '../../../shared/ui/icons.js'
import './Settings.css'

export interface SettingsSectionProps {
  title?: string
  subtitle?: string
  icon?: IconName
  children?: ReactNode
}

/**
 * A titled group of {@link SettingsRow}s on a `paper` card — the Lynx analogue
 * of the Flutter `SectionCard`. Ported trimmed: header (icon + title + optional
 * subtitle) above a bordered card containing the rows.
 */
export function SettingsSection({ title, subtitle, icon, children }: SettingsSectionProps) {
  return (
    <view className='settings-section'>
      {title
        ? (
          <view className='settings-section__header'>
            {icon
              ? (
                <view className='settings-section__icon'>
                  <Icon name={icon} size={16} color={ICON_COLORS.contentMuted} />
                </view>
              )
              : null}
            <view className='settings-section__header-text'>
              <text className='settings-section__title'>{title}</text>
              {subtitle
                ? <text className='settings-section__subtitle'>{subtitle}</text>
                : null}
            </view>
          </view>
        )
        : null}
      <view className='settings-section__card'>{children}</view>
    </view>
  )
}
