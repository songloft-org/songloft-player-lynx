import { AbilityStage } from '@kit.AbilityKit'
import { ImageKnife } from '@ohos/imageknifepro'

export default class LynxAbilityStage extends AbilityStage {
  onCreate(): void {
    ImageKnife.getInstance().initFileCache(this.context)
  }
}
