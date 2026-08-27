import { preferences } from '@kit.ArkData'
import { huks } from '@kit.UniversalKeystoreKit'
import { util } from '@kit.ArkTS'
import { LynxModule, LynxMethod, LynxCallback } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'

const PREFS_NAME = 'songloft_prefs'
const SECURE_PREFIX = 'secure_'

@LynxModule('SongloftStorage')
export class SongloftStorageModule {
  private context: common.UIAbilityContext | null = null
  private prefs: preferences.Preferences | null = null

  constructor(context: common.UIAbilityContext) {
    this.context = context
    this.initPrefs()
  }

  private async initPrefs(): Promise<void> {
    if (this.context) {
      this.prefs = await preferences.getPreferences(this.context, PREFS_NAME)
    }
  }

  @LynxMethod
  getString(namespace: string, key: string, callback: LynxCallback): void {
    if (namespace === 'secure') {
      this.getSecure(key, callback)
      return
    }
    this.getPrefsValue(key, callback)
  }

  @LynxMethod
  setString(namespace: string, key: string, value: string): void {
    if (namespace === 'secure') {
      this.setSecure(key, value)
      return
    }
    this.setPrefsValue(key, value)
  }

  @LynxMethod
  remove(namespace: string, key: string): void {
    if (namespace === 'secure') {
      this.removeSecure(key)
      return
    }
    this.removePrefsValue(key)
  }

  @LynxMethod
  clear(namespace: string): void {
    if (namespace === 'secure') {
      return
    }
    this.prefs?.clearSync()
    this.prefs?.flush()
  }

  private async getPrefsValue(key: string, callback: LynxCallback): Promise<void> {
    try {
      const value = await this.prefs?.get(key, '') as string
      callback(JSON.stringify({ value: value || null }))
    } catch {
      callback(JSON.stringify({ value: null }))
    }
  }

  private setPrefsValue(key: string, value: string): void {
    this.prefs?.putSync(key, value)
    this.prefs?.flush()
  }

  private removePrefsValue(key: string): void {
    this.prefs?.deleteSync(key)
    this.prefs?.flush()
  }

  private async getSecure(key: string, callback: LynxCallback): Promise<void> {
    try {
      const alias = SECURE_PREFIX + key
      const value = await this.prefs?.get(alias, '') as string
      callback(JSON.stringify({ value: value || null }))
    } catch {
      callback(JSON.stringify({ value: null }))
    }
  }

  private setSecure(key: string, value: string): void {
    const alias = SECURE_PREFIX + key
    this.prefs?.putSync(alias, value)
    this.prefs?.flush()
  }

  private removeSecure(key: string): void {
    const alias = SECURE_PREFIX + key
    this.prefs?.deleteSync(alias)
    this.prefs?.flush()
  }
}
