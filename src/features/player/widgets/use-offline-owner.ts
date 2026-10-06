import { useEffect, useState } from '@lynx-js/react'
import { useAppSessionStore } from '../../../store/app-session.js'
import { currentOfflineOwner, offlineIdentity } from '../data/offline-identity.js'

export function useOfflineOwner() {
  const [value, setValue] = useState(currentOfflineOwner)
  useEffect(() => {
    const update = () => setValue(currentOfflineOwner())
    const stopIdentity = offlineIdentity.subscribe(update)
    const stopSession = useAppSessionStore.subscribe(update)
    update()
    return () => { stopIdentity(); stopSession() }
  }, [])
  return value
}
