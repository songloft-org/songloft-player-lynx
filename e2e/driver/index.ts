import type { E2EDriver } from './types.js'

export type { E2EDriver, E2EElement, PlayerStateSnapshot, PlayerAction, WaitOptions } from './types.js'
export { stepScreenshot, resetStepCounter } from './step-screenshot.js'

export async function createDriver(): Promise<E2EDriver> {
  const platform = process.env.E2E_PLATFORM ?? 'android'

  switch (platform) {
    case 'android': {
      const { AndroidDriver } = await import('./android.driver.js')
      return new AndroidDriver()
    }
    case 'ios': {
      const { IOSDriver } = await import('./ios.driver.js')
      return new IOSDriver()
    }
    default:
      throw new Error(
        `Unknown E2E_PLATFORM: "${platform}". Set E2E_PLATFORM=android or E2E_PLATFORM=ios`,
      )
  }
}
