import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { IconName } from '../../../shared/ui/icons.js'
import type { RowIconTint } from './SettingsRow.js'
import './Settings.css'

export interface SwitchRowProps {
  icon?: IconName
  /** Per-function tile tint — see {@link SettingsRowProps.tint}. */
  tint?: RowIconTint
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
 * an icon name, and it takes no children. It reuses the same `.settings-row*`
 * rules, so it lines up pixel-wise with the plain rows beside it in a card —
 * which is why it lives next to `SettingsRow` rather than in `shared/ui`.
 *
 * **This is the only way to render a boolean.** DESIGN.md defines exactly one
 * state control (Switch), and the settings surface used to spell booleans three
 * different ways: a switch here, a bare trailing check in Settings → Playback, and
 * two hand-rolled boxed checks in Browse views / Tab config. A trailing check is
 * for picking one option *out of a group*; on/off is a switch.
 */
export function SwitchRow({
  icon,
  tint,
  title,
  subtitle,
  checked,
  onChange,
  disabled = false,
  testId,
}: SwitchRowProps) {
  const className = 'settings-row' + (disabled ? ' settings-row--disabled' : '')

  // Same tinted-tile model as SettingsRow: white glyph on a per-function tint.
  // A bare coloured glyph (no tint) is the pre-P1b fallback, kept so a missed
  // call site degrades rather than renders an untinted tile.
  const iconColor = tint ? '#ffffff' : ICON_COLORS.content2
  const iconClass = tint
    ? `settings-row__icon settings-row__icon--${tint}`
    : 'settings-row__icon'

  return (
    <view className={className} data-testid={testId}>
      {icon
        ? (
          <view className={iconClass}>
            <Icon name={icon} size={20} color={iconColor} />
          </view>
        )
        : null}
      {/* Same `__content` wrapper as SettingsRow — it carries the inset separator,
          so a row missing it would break the run of hairlines in a mixed card. */}
      <view className='settings-row__content'>
        <view className='settings-row__body'>
          <text className='settings-row__title'>{title}</text>
          {subtitle ? <text className='settings-row__subtitle'>{subtitle}</text> : null}
        </view>
        <view className='settings-row__trailing'>
          <AppSwitch checked={checked} disabled={disabled} onChange={onChange} />
        </view>
      </view>
    </view>
  )
}
