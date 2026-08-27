import { LynxModule, LynxMethod, LynxContext } from '@aspect/lynx'
import { common } from '@kit.AbilityKit'

/**
 * SongloftNavigation — back key interception.
 *
 * Three methods (all fire-and-forget, no Callback — same as Android/iOS):
 * - setConsumable(boolean): JS tells host whether next back press is consumed
 * - armExitToast(): arm the "press again to exit" toast
 * - disarmExitToast(): cancel the armed toast
 *
 * The reverse direction (host → JS) is via sendGlobalEvent('backPressed', [{}])
 * triggered from the page's onBackPress() handler.
 *
 * HarmonyOS differences from Android:
 * - No moveTaskToBack(true) equivalent; exit uses terminateSelf() but we prefer
 *   to just let the system handle it (user swipes up to go home)
 * - No hardware back button on most devices, but gesture back triggers onBackPress
 */
@LynxModule('SongloftNavigation')
export class SongloftNavigationModule {
  private static consumable: boolean = true
  private static exitArmed: boolean = false
  private static lynxContext: LynxContext | null = null
  private static context: common.UIAbilityContext | null = null

  constructor(context: common.UIAbilityContext, lynxContext: LynxContext) {
    SongloftNavigationModule.context = context
    SongloftNavigationModule.lynxContext = lynxContext
  }

  @LynxMethod
  setConsumable(consumable: boolean): void {
    SongloftNavigationModule.consumable = consumable
  }

  @LynxMethod
  armExitToast(): void {
    SongloftNavigationModule.exitArmed = true
  }

  @LynxMethod
  disarmExitToast(): void {
    SongloftNavigationModule.exitArmed = false
  }

  /**
   * Called from the page's onBackPress().
   * Returns true if the back press was consumed by JS, false to let system handle it.
   */
  static handleBackPress(): boolean {
    if (!SongloftNavigationModule.consumable) {
      // JS said "don't consume" — let system handle (app exit / page pop)
      return false
    }

    // Notify JS about the back press
    if (SongloftNavigationModule.lynxContext) {
      SongloftNavigationModule.lynxContext.sendGlobalEvent('backPressed', [{}])
    }
    return true
  }
}
