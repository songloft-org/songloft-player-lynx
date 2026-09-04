import { Icon, ICON_COLORS, activeAccentIconColor } from '../../../shared/ui/Icon.js'
import type { IconName } from '../../../shared/ui/icons.js'
import './Settings.css'

/**
 * The per-function tint of a settings-row icon tile, drawn from Apple's
 * 12-tint palette (see `tokens.css`). The GLYPH is always white — the tile is
 * decorative, the row's title label carries the meaning — so this selects only
 * the tile's fill, not a glyph colour. `'red'` is implied by `danger` and does
 * not need to be passed separately.
 */
export type RowIconTint =
  | 'blue'
  | 'green'
  | 'orange'
  | 'yellow'
  | 'pink'
  | 'purple'
  | 'indigo'
  | 'teal'
  | 'gray'
  | 'red'

export interface SettingsRowProps {
  /** Leading icon name. */
  icon?: IconName
  /** Per-function tile tint (Apple's 12-tint palette). Required when `icon` is
   *  set and `danger` is not — an icon without a tint renders as a bare glyph,
   *  the pre-P1b shape, which is kept only as a fallback. */
  tint?: RowIconTint
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
  /** Render the title in the danger color AND the icon tile in the danger red
   *  (destructive actions like Log out / Clean). Implies `tint: 'red'`. */
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
  tint,
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

  // A danger row's tile is always the fill-optimised red; otherwise the caller
  // picks the tint by function. White glyph either way: the tile is decorative.
  // When no tint is set the icon falls back to the pre-P1b bare coloured glyph
  // (kept so a missed call site degrades rather than renders an untinted tile).
  const tileTint = danger ? 'red' : tint
  const iconColor = tileTint
    ? '#ffffff'
    : (danger ? ICON_COLORS.danger : selected ? ICON_COLORS.primary : ICON_COLORS.content2)
  const iconClass = tileTint
    ? `settings-row__icon settings-row__icon--${tileTint}`
    : 'settings-row__icon'

  return (
    <view
      className={className}
      data-testid={testId}
      bindtap={disabled ? undefined : onTap}
    >
      {icon
        ? (
          <view className={iconClass}>
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
