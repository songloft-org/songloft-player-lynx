import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'

export class SongloftNavigationModule extends LynxModule {
  private static consumable: boolean = true
  private static lynxContext: LynxContext | null = null

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    SongloftNavigationModule.lynxContext = context
  }

  public setConsumable(consumable: boolean): void {
    SongloftNavigationModule.consumable = consumable
  }

  public armExitToast(): void {}

  public disarmExitToast(): void {}

  static handleBackPress(): boolean {
    if (!SongloftNavigationModule.consumable) {
      return false
    }

    if (SongloftNavigationModule.lynxContext) {
      const param: Record<string, string> = {}
      SongloftNavigationModule.lynxContext.sendGlobalEvent('backPressed', [param])
    }
    return true
  }
}
