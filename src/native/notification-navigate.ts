import { readLynxGlobal } from './native-modules.js'
import { router } from '../router.js'

const EVENT_NAVIGATE_TO_PLAYER = 'SongloftNavigation.navigateToPlayer'
const PROP_NAVIGATE_TO_PLAYER = 'navigateToPlayer'

let listenerInstalled = false

function navigateToPlayer(): void {
  void router.navigate({ to: '/player' })
}

export function installNotificationNavigateListener(): void {
  if (listenerInstalled) return
  const l = readLynxGlobal()
  if (!l || typeof l.getJSModule !== 'function') return
  try {
    const emitter = l.getJSModule('GlobalEventEmitter')
    if (!emitter || typeof emitter.addListener !== 'function') return
    emitter.addListener(EVENT_NAVIGATE_TO_PLAYER, navigateToPlayer)
    listenerInstalled = true
  } catch {
    // No usable emitter (non-Lynx host / tests).
  }
}

export function navigateFromNotificationIfNeeded(): void {
  const l = readLynxGlobal()
  if (!l) return
  try {
    if (l.__globalProps?.[PROP_NAVIGATE_TO_PLAYER] === true) {
      navigateToPlayer()
    }
  } catch {
    // globalProps not available.
  }
}
