import { preferences } from '@kit.ArkData'
import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'

const PREFS_NAME = 'songloft_prefs'
const SECURE_PREFIX = 'secure_'

export class SongloftStorageModule extends LynxModule {
  private abilityContext: common.UIAbilityContext
  private prefs: preferences.Preferences | null = null

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.abilityContext = param as common.UIAbilityContext
    this.initPrefs()
  }

  private async initPrefs(): Promise<void> {
    this.prefs = await preferences.getPreferences(this.abilityContext, PREFS_NAME)
  }

  public setItem(area: string, key: string, value: string): void {
    if (area === 'secure') {
      const alias = SECURE_PREFIX + key
      this.prefs?.putSync(alias, value)
    } else {
      this.prefs?.putSync(key, value)
    }
    this.prefs?.flush()
  }

  public getItem(area: string, key: string, callback: (result: string) => void): void {
    const actualKey = area === 'secure' ? SECURE_PREFIX + key : key
    try {
      const value = this.prefs?.getSync(actualKey, '') as string
      callback(JSON.stringify({ value: value || null }))
    } catch (e) {
      callback(JSON.stringify({ value: null }))
    }
  }

  public removeItem(area: string, key: string): void {
    const actualKey = area === 'secure' ? SECURE_PREFIX + key : key
    this.prefs?.deleteSync(actualKey)
    this.prefs?.flush()
  }

  public getKeys(area: string, callback: (result: string) => void): void {
    callback(JSON.stringify({ keys: [] }))
  }

  public getPath(name: string, callback: (result: string) => void): void {
    let path: string
    switch (name) {
      case 'cache':
        path = this.abilityContext.cacheDir
        break
      case 'documents':
        path = this.abilityContext.filesDir
        break
      default:
        path = this.abilityContext.filesDir
    }
    callback(JSON.stringify({ path: path }))
  }
}
