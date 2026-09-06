import { Icon, ICON_COLORS, activeAccentIconColor } from '../../../shared/ui/Icon.js'
import type { IconName } from '../../../shared/ui/icons.js'
import './Settings.css'

export interface SettingsRowProps {
  /** Leading icon name. */
  icon?: IconName
  title: string
  subtitle?: string
  /** Right-aligned value text (e.g. current selection). */
  trailingText?: string
  /** Right-aligned icon (e.g. a `chevron-right` affordance or a `check`). */
  trailingIcon?: IconName
  /** Tap handler; when set the row is interactive. */
  onTap?: () => void
  /** Dim + ignore taps (deferred/coming-later rows). */
  disabled?: boolean
  /** Render the title and the icon in the danger color (destructive actions like
   *  Log out / Clean). */
  danger?: boolean
  /** Highlight the row (e.g. the selected play-mode option). */
  selected?: boolean
  /** testid for render assertions. */
  testId?: string
}

/**
 * A single settings row — the Lynx analogue of Flutter's `ListTile` /
 * `SwitchListTile`. Leading icon + title/subtitle + optional trailing value and
 * chevron. Tappable rows use a plain `bindtap` (no gesture leaf) so they are
 * safe to render in the Vitest snapshot tree.
 */
export function SettingsRow({
  icon,
  title,
  subtitle,
  trailingText,
  trailingIcon,
  onTap,
  disabled = false,
  danger = false,
  selected = false,
  testId,
}: SettingsRowProps) {
  // iOS checkmark-list selection shows ONLY the trailing check — no row fill —
  // so a `selected` row that carries a `check` is a picker option and must not
  // take the `--active` highlight. The highlight stays for navigation selection
  // (the settings master list, which uses a chevron), where iOS does paint the
  // chosen row.
  const checkPickerSelected = selected && trailingIcon === 'check'
  const className = 'settings-row'
    + (selected && !checkPickerSelected ? ' settings-row--active' : '')
    + (disabled ? ' settings-row--disabled' : '')

  const iconColor = danger ? ICON_COLORS.danger : selected ? ICON_COLORS.primary : ICON_COLORS.content2

  return (
    <view
      className={className}
      data-testid={testId}
      bindtap={disabled ? undefined : onTap}
    >
      {icon
        ? (
          <view className='settings-row__icon'>
            <Icon name={icon} size={20} color={iconColor} />
          </view>
        )
        : null}
      {/* `__content` is what carries the separator, so it must wrap everything to
          the right of the icon — see the derivation in Settings.css. Keep this in
          step with SwitchRow, which reuses the same rules. */}
      <view className='settings-row__content'>
        <view className='settings-row__body'>
          <text
            className={danger
              ? 'settings-row__title settings-row__title--danger'
              : 'settings-row__title'}
          >
            {title}
          </text>
          {subtitle ? <text className='settings-row__subtitle'>{subtitle}</text> : null}
        </view>
        {(trailingText || trailingIcon)
          ? (
            <view className='settings-row__trailing'>
              {trailingText
                ? <text className='settings-row__trailing-text'>{trailingText}</text>
                : null}
              {trailingIcon
                ? (
                  <Icon
                    name={trailingIcon}
                    size={18}
                    /* The selection check takes the accent, as iOS paints its
                       tick in the tint color; other trailing glyphs (chevron)
                       stay muted. `<svg content>` is outside the CSS cascade,
                       so the accent hex is resolved at render time. */
                    color={trailingIcon === 'check' ? activeAccentIconColor() : ICON_COLORS.contentMuted}
                  />
                )
                : null}
            </view>
          )
          : null}
      </view>
    </view>
  )
}
