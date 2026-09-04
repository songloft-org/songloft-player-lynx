import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
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
  /** Render the title in the danger color (destructive actions like Log out). */
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
  const className = 'settings-row'
    + (selected ? ' settings-row--active' : '')
    + (disabled ? ' settings-row--disabled' : '')

  const iconColor = danger
    ? ICON_COLORS.danger
    : selected
      ? ICON_COLORS.primary
      : ICON_COLORS.content2

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
                ? <Icon name={trailingIcon} size={18} color={ICON_COLORS.contentMuted} />
                : null}
            </view>
          )
          : null}
      </view>
    </view>
  )
}
