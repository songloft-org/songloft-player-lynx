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

  public getItem(area: string, key: string, callback: (value: string | null) => void): void {
    const actualKey = area === 'secure' ? SECURE_PREFIX + key : key
    try {
      const value = this.prefs?.getSync(actualKey, '') as string
      callback(value || null)
    } catch (e) {
      callback(null)
    }
  }

  public removeItem(area: string, key: string): void {
    const actualKey = area === 'secure' ? SECURE_PREFIX + key : key
    this.prefs?.deleteSync(actualKey)
    this.prefs?.flush()
  }

  public getKeys(area: string, callback: (keys: string[]) => void): void {
    try {
      const allKeys = this.prefs?.getAllSync() as Record<string, preferences.ValueType> | undefined
      if (!allKeys) {
        callback([])
        return
      }
      const prefix = area === 'secure' ? SECURE_PREFIX : ''
      const result: string[] = []
      for (const key of Object.keys(allKeys)) {
        if (area === 'secure') {
          if (key.startsWith(SECURE_PREFIX)) {
            result.push(key.substring(SECURE_PREFIX.length))
          }
        } else {
          if (!key.startsWith(SECURE_PREFIX)) {
            result.push(key)
          }
        }
      }
      callback(result)
    } catch (e) {
      callback([])
    }
  }

  public getPath(name: string, callback: (path: string) => void): void {
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
    callback(path)
  }
}
