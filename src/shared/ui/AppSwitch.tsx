import { Switch, SwitchThumb, SwitchTrack } from '@lynx-js/lynx-ui-switch'

import './AppSwitch.css'

export interface AppSwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /**
   * Blocks the tap inside lynx-ui (`usePressTap` short-circuits) instead of
   * relying on the caller to pass no `onChange` — that variant still animated the
   * press, so it looked interactive while doing nothing.
   */
  disabled?: boolean
}

/**
 * The app's toggle — lynx-ui's compound `Switch` plus the single copy of its CSS.
 *
 * This wrapper exists for one reason: the compound API means the *visual state*
 * lives entirely in the consumer's stylesheet (lynx-ui only hands you the
 * `ui-checked` / `ui-active` classes), so every hand-assembled
 * `Switch > SwitchTrack > SwitchThumb` is a fresh chance to forget the checked
 * rule and ship a toggle that never appears to move. Batch 19 did exactly that.
 * Wrapping the tree together with `AppSwitch.css` makes the state styling
 * impossible to omit.
 */
export function AppSwitch({ checked, onChange, disabled = false }: AppSwitchProps) {
  return (
    <Switch
      className='app-switch'
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    >
      <SwitchTrack className='app-switch__track'>
        <SwitchThumb className='app-switch__thumb' />
      </SwitchTrack>
    </Switch>
  )
}
