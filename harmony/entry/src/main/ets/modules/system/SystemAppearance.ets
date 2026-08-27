import { ConfigurationConstant, common, EnvironmentCallback, Configuration } from '@kit.AbilityKit'
import { i18n } from '@kit.LocalizationKit'
import { LynxView } from '@aspect/lynx'

/**
 * SystemAppearance — injects dark/light mode and locale via LynxView globalProps.
 *
 * Two channels (mirroring Android/iOS):
 * 1. LynxLoadMeta.setGlobalProps — initial values (first frame correct)
 * 2. sendGlobalEvent — push changes when system settings change
 *
 * HarmonyOS delivers appearance/locale changes via Configuration callbacks
 * (unlike Android's configChanges, no Activity restart needed).
 */
export class SystemAppearance {
  private static lynxView: LynxView | null = null
  private static currentColorMode: string = 'light'
  private static currentLocale: string = 'en'

  static getInitialProps(context: common.UIAbilityContext): Record<string, string> {
    const colorMode = context.config?.colorMode
    SystemAppearance.currentColorMode =
      colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK ? 'dark' : 'light'

    const locale = i18n.System.getSystemLanguage()
    SystemAppearance.currentLocale = locale.startsWith('zh') ? 'zh' : 'en'

    return {
      colorScheme: SystemAppearance.currentColorMode,
      locale: SystemAppearance.currentLocale,
    }
  }

  static attach(lynxView: LynxView, context: common.UIAbilityContext): void {
    SystemAppearance.lynxView = lynxView

    const envCallback: EnvironmentCallback = {
      onConfigurationUpdated(config: Configuration): void {
        let changed = false

        const newColorMode =
          config.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK ? 'dark' : 'light'
        if (newColorMode !== SystemAppearance.currentColorMode) {
          SystemAppearance.currentColorMode = newColorMode
          changed = true
        }

        const newLocale = i18n.System.getSystemLanguage()
        const normalizedLocale = newLocale.startsWith('zh') ? 'zh' : 'en'
        if (normalizedLocale !== SystemAppearance.currentLocale) {
          SystemAppearance.currentLocale = normalizedLocale
          changed = true
        }

        if (changed && SystemAppearance.lynxView) {
          SystemAppearance.lynxView.updateGlobalProps({
            colorScheme: SystemAppearance.currentColorMode,
            locale: SystemAppearance.currentLocale,
          })
          // sendGlobalEvent second param must be an array (iron rule from AGENTS.md)
          SystemAppearance.lynxView.sendGlobalEvent('appearanceChanged', [{
            colorScheme: SystemAppearance.currentColorMode,
            locale: SystemAppearance.currentLocale,
          }])
        }
      },
      onMemoryLevel(): void {},
    }

    const appContext = context.getApplicationContext()
    appContext.on('environment', envCallback)
  }

  static detach(): void {
    SystemAppearance.lynxView = null
  }
}
