import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'

export class SongloftVideoModule extends LynxModule {
  private abilityContext: common.UIAbilityContext

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.abilityContext = param as common.UIAbilityContext
  }

  public open(args: string, callback: (result: string) => void): void {
    callback(JSON.stringify({ result: false }))
  }

  public close(args: string, callback: (result: string) => void): void {
    callback(JSON.stringify({}))
  }

  public isOpen(args: string, callback: (result: string) => void): void {
    callback(JSON.stringify({ result: false }))
  }
}
