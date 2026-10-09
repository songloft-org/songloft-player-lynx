import { ConfigurationConstant, common, EnvironmentCallback, Configuration } from '@kit.AbilityKit'
import { i18n } from '@kit.LocalizationKit'
import { window } from '@kit.ArkUI'
import { LynxContext, LynxEnv } from '@lynx/lynx'
import { deviceInfo } from '@kit.BasicServicesKit'
import { accessibility } from '@kit.AccessibilityKit'

interface AppearanceProps {
  systemTheme: string
  systemLocale: string
  backdropSdkVersion: string
  backdropBlurSupported: boolean
  harmonyTabGlassSupported: boolean
  harmonyGlassSupported: boolean
  systemReduceMotion?: boolean
  safeAreaTop?: number
  safeAreaBottom?: number
  safeAreaLeft?: number
  safeAreaRight?: number
}

interface SafeAreaSnapshot {
  safeAreaTop: number
  safeAreaBottom: number
  safeAreaLeft: number
  safeAreaRight: number
}

export class SystemAppearance {
  private static lynxContext: LynxContext | null = null
  private static currentColorMode: string = 'light'
  private static currentLocale: string = 'en'
  private static mainWindow: window.Window | null = null
  private static lastTop: number = 0
  private static lastBottom: number = 0
  private static lastLeft: number = 0
  private static lastRight: number = 0
  private static motionListener: ((enabled: boolean) => void) | null = null
  private static currentReduceMotion: boolean = false
  private static appContext: common.ApplicationContext | null = null
  private static environmentCallbackId: number | null = null
  private static safeAreaListener: (() => void) | null = null

  static setWindow(win: window.Window): void {
    SystemAppearance.mainWindow = win
    SystemAppearance.snapshotSafeArea()
  }

  private static snapshotSafeArea(): void {
    if (!SystemAppearance.mainWindow) {
      return
    }
    const sysArea = SystemAppearance.mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM)
    const navArea = SystemAppearance.mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR)
    SystemAppearance.lastTop = px2vp(sysArea.topRect.height)
    SystemAppearance.lastBottom = px2vp(navArea.bottomRect.height)
    SystemAppearance.lastLeft = px2vp(sysArea.leftRect.width)
    SystemAppearance.lastRight = px2vp(navArea.rightRect.width)
  }

  private static safeAreaPayload(): SafeAreaSnapshot {
    return {
      safeAreaTop: SystemAppearance.lastTop,
      safeAreaBottom: SystemAppearance.lastBottom,
      safeAreaLeft: SystemAppearance.lastLeft,
      safeAreaRight: SystemAppearance.lastRight,
    }
  }

  static getInitialProps(context: common.UIAbilityContext): AppearanceProps {
    const colorMode = context.config?.colorMode
    SystemAppearance.currentColorMode =
      colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK ? 'dark' : 'light'

    const locale = i18n.System.getSystemLanguage()
    SystemAppearance.currentLocale = locale.startsWith('zh') ? 'zh' : 'en'

    const props: AppearanceProps = {
      systemTheme: SystemAppearance.currentColorMode,
      systemLocale: SystemAppearance.currentLocale,
      backdropSdkVersion: LynxEnv.getLynxVersion(),
      backdropBlurSupported: deviceInfo.sdkApiVersion >= 15,
      harmonyTabGlassSupported: deviceInfo.sdkApiVersion >= 20,
      harmonyGlassSupported: deviceInfo.sdkApiVersion >= 20,
    }
    if (deviceInfo.sdkApiVersion >= 23) {
      try {
        SystemAppearance.currentReduceMotion = accessibility.isAnimationReduceEnabledSync()
        props.systemReduceMotion = SystemAppearance.currentReduceMotion
      } catch (_) { /* Unsupported system capability stays unknown. */ }
    }
    if (SystemAppearance.mainWindow) {
      const insets = SystemAppearance.safeAreaPayload()
      props.safeAreaTop = insets.safeAreaTop
      props.safeAreaBottom = insets.safeAreaBottom
      props.safeAreaLeft = insets.safeAreaLeft
      props.safeAreaRight = insets.safeAreaRight
    }
    return props
  }

  static attach(lynxContext: LynxContext, context: common.UIAbilityContext): void {
    SystemAppearance.detach()
    SystemAppearance.lynxContext = lynxContext
    if (deviceInfo.sdkApiVersion >= 23) {
      const listener = (enabled: boolean): void => {
        SystemAppearance.currentReduceMotion = enabled
        SystemAppearance.pushAppearance()
      }
      try {
        accessibility.onAnimationReduceStateChange(listener)
        SystemAppearance.motionListener = listener
      } catch (_) { /* No animation-reduction service on this device. */ }
    }

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

        if (changed && SystemAppearance.lynxContext) {
          SystemAppearance.pushAppearance()
        }
      },
      onMemoryLevel(): void {},
    }

    const appContext = context.getApplicationContext()
    SystemAppearance.environmentCallbackId = appContext.on('environment', envCallback)
    SystemAppearance.appContext = appContext

    if (SystemAppearance.mainWindow) {
      const listener = (): void => {
        SystemAppearance.pushSafeArea()
      }
      SystemAppearance.mainWindow.on('avoidAreaChange', listener)
      SystemAppearance.safeAreaListener = listener
    }
  }

  private static pushAppearance(): void {
    const props: AppearanceProps = {
      systemTheme: SystemAppearance.currentColorMode,
      systemLocale: SystemAppearance.currentLocale,
      backdropSdkVersion: LynxEnv.getLynxVersion(),
      backdropBlurSupported: deviceInfo.sdkApiVersion >= 15,
      harmonyTabGlassSupported: deviceInfo.sdkApiVersion >= 20,
      harmonyGlassSupported: deviceInfo.sdkApiVersion >= 20,
    }
    if (SystemAppearance.motionListener) {
      props.systemReduceMotion = SystemAppearance.currentReduceMotion
    }
    SystemAppearance.lynxContext?.sendGlobalEvent('SongloftSystem.appearanceChanged', [props])
  }

  private static pushSafeArea(): void {
    if (!SystemAppearance.mainWindow || !SystemAppearance.lynxContext) {
      return
    }
    const prevTop = SystemAppearance.lastTop
    const prevBottom = SystemAppearance.lastBottom
    const prevLeft = SystemAppearance.lastLeft
    const prevRight = SystemAppearance.lastRight
    SystemAppearance.snapshotSafeArea()
    if (SystemAppearance.lastTop === prevTop &&
        SystemAppearance.lastBottom === prevBottom &&
        SystemAppearance.lastLeft === prevLeft &&
        SystemAppearance.lastRight === prevRight) {
      return
    }
    SystemAppearance.lynxContext.sendGlobalEvent('SongloftSystem.safeAreaChanged',
      [SystemAppearance.safeAreaPayload()])
  }

  static detach(): void {
    if (SystemAppearance.appContext && SystemAppearance.environmentCallbackId !== null) {
      void SystemAppearance.appContext.off('environment', SystemAppearance.environmentCallbackId)
        .catch(() => { console.warn('[SystemAppearance] environment listener cleanup failed') })
    }
    SystemAppearance.appContext = null
    SystemAppearance.environmentCallbackId = null
    if (SystemAppearance.mainWindow && SystemAppearance.safeAreaListener) {
      SystemAppearance.mainWindow.off('avoidAreaChange', SystemAppearance.safeAreaListener)
    }
    SystemAppearance.safeAreaListener = null
    if (SystemAppearance.motionListener) {
      try {
        accessibility.offAnimationReduceStateChange(SystemAppearance.motionListener)
      } catch (_) { console.warn('[SystemAppearance] motion listener cleanup failed') }
      SystemAppearance.motionListener = null
    }
    SystemAppearance.lynxContext = null
  }
}
