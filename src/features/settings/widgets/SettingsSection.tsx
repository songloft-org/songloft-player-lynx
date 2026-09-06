import type { ReactNode } from '@lynx-js/react'

import './Settings.css'

export interface SettingsSectionProps {
  title?: string
  subtitle?: string
  children?: ReactNode
}

/**
 * A titled group of {@link SettingsRow}s on a card — the Lynx analogue of the
 * Flutter `SectionCard`: header (title + optional subtitle) above a card
 * containing the rows.
 *
 * The header carried a muted 16px glyph beside the title until the settings
 * surface moved off the Settings.app look. The title now does the work on its
 * own — headline size, bold, primary label — and a small grey icon in front of
 * it read as decoration at that weight.
 */
export function SettingsSection({ title, subtitle, children }: SettingsSectionProps) {
  return (
    <view className='settings-section'>
      {title
        ? (
          <view className='settings-section__header'>
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
