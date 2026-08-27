import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'

export class SongloftNavigationModule extends LynxModule {
  private static consumable: boolean = true
  private static lynxContext: LynxContext | null = null
  private static abilityContext: common.UIAbilityContext | null = null

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    SongloftNavigationModule.lynxContext = context
    SongloftNavigationModule.abilityContext = param as common.UIAbilityContext
  }

  public setBackConsumable(consumable: boolean): void {
    SongloftNavigationModule.consumable = consumable
  }

  public notifyBackHandled(seq: number): void {
    // Acknowledged by JS — no further action needed on HarmonyOS
  }

  public exitApp(): void {
    SongloftNavigationModule.abilityContext?.terminateSelf()
  }

  public armExitToast(): void {}

  public disarmExitToast(): void {}

  static handleBackPress(): boolean {
    if (!SongloftNavigationModule.consumable) {
      return false
    }

    if (SongloftNavigationModule.lynxContext) {
      const param: Record<string, Object> = {}
      SongloftNavigationModule.lynxContext.sendGlobalEvent('SongloftNavigation.backPressed', [param])
    }
    return true
  }
}
