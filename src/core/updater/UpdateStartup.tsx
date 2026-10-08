import { useEffect } from '@lynx-js/react'
import { confirmUpdateStartup } from './native-updater.js'
import { startAutomaticUpdates } from './automatic-update.js'

/** Mounted only after auth/redirect splash has settled and the real route rendered. */
export function UpdateStartup() {
  useEffect(() => {
    const timer = setTimeout(() => {
      // Once per process. Route changes must not stop automatic downloads or create new timers.
      void confirmUpdateStartup().then(startAutomaticUpdates)
    }, 1500)
    return () => clearTimeout(timer)
  }, [])
  return null
}
