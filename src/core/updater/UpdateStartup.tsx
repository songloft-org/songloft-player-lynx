import { useEffect } from '@lynx-js/react'
import { confirmUpdateStartup } from './native-updater.js'

/** Mounted only after auth/redirect splash has settled and the real route rendered. */
export function UpdateStartup() {
  useEffect(() => {
    const timer = setTimeout(() => { void confirmUpdateStartup() }, 1500)
    return () => clearTimeout(timer)
  }, [])
  return null
}
