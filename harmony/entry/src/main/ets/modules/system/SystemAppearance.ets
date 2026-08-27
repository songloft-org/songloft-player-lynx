import { ConfigurationConstant, common, EnvironmentCallback, Configuration } from '@kit.AbilityKit'
import { i18n } from '@kit.LocalizationKit'
import { LynxView } from '@lynx/lynx'

interface AppearanceProps {
  colorScheme: string
  locale: string
}

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

    const props: Record<string, string> = {
      colorScheme: SystemAppearance.currentColorMode,
      locale: SystemAppearance.currentLocale,
    }
    return props
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
          const updatedProps: Record<string, string> = {
            colorScheme: SystemAppearance.currentColorMode,
            locale: SystemAppearance.currentLocale,
          }
          SystemAppearance.lynxView.updateGlobalProps(updatedProps)
          const eventParam: AppearanceProps = {
            colorScheme: SystemAppearance.currentColorMode,
            locale: SystemAppearance.currentLocale,
          }
          SystemAppearance.lynxView.sendGlobalEvent('appearanceChanged', [eventParam])
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
