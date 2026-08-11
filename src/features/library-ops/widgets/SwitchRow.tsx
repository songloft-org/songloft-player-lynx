import { Switch, SwitchThumb, SwitchTrack } from '@lynx-js/lynx-ui-switch'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { IconName } from '../../../shared/ui/icons.js'

export interface SwitchRowProps {
  icon?: IconName
  title: string
  subtitle?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  testId?: string
}

/**
 * A settings row with a trailing toggle — the Lynx analogue of Flutter's
 * `SwitchListTile`.
 *
 * `SettingsRow` cannot host this: its trailing slot only accepts a string plus
 * an icon name, and it takes no children. The row reuses the shared
 * `.settings-row*` classes (Lynx CSS is global scope) so it lines up pixel-wise
 * with the plain rows next to it in the same card.
 */
export function SwitchRow({
  icon,
  title,
  subtitle,
  checked,
  onChange,
  disabled = false,
  testId,
}: SwitchRowProps) {
  const className = 'settings-row' + (disabled ? ' settings-row--disabled' : '')

  return (
    <view className={className} data-testid={testId}>
      {icon
        ? (
          <view className='settings-row__icon'>
            <Icon name={icon} size={20} color={ICON_COLORS.content2} />
          </view>
        )
        : null}
      <view className='settings-row__body'>
        <text className='settings-row__title'>{title}</text>
        {subtitle ? <text className='settings-row__subtitle'>{subtitle}</text> : null}
      </view>
      <view className='settings-row__trailing'>
        <Switch
          className='libops__switch'
          checked={checked}
          onChange={disabled ? undefined : onChange}
        >
          <SwitchTrack className='libops__switch-track'>
            <SwitchThumb className='libops__switch-thumb' />
          </SwitchTrack>
        </Switch>
      </view>
    </view>
  )
}
