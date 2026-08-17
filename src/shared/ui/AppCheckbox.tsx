import { Icon, ICON_COLORS } from './Icon.js'
import './AppCheckbox.css'

export interface AppCheckboxProps {
  checked: boolean
  testId?: string
}

/**
 * A checkbox, for **multi-select** — ticking any number of items in a list
 * (directories to scan, songs to add to a playlist).
 *
 * The three roles the app distinguishes, one control each:
 * - on/off for a single thing → `SwitchRow` / `AppSwitch` (the only state control
 *   DESIGN.md defines);
 * - one option out of a group → a bare trailing `check` on `SettingsRow`;
 * - any number of items out of a list → this.
 *
 * Deliberately presentational: no `bindtap`. Every call site wraps it in a row (or
 * a dedicated hit area) that already handles the tap, and giving the box its own
 * handler would either fight that or shrink the touch target to 20px.
 */
export function AppCheckbox({ checked, testId }: AppCheckboxProps) {
  return (
    <view
      className={checked ? 'app-checkbox app-checkbox--on' : 'app-checkbox'}
      data-testid={testId}
    >
      {checked ? <Icon name='check' size={14} color={ICON_COLORS.primaryContent} /> : null}
    </view>
  )
}
