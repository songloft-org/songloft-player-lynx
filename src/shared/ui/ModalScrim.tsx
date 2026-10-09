import { useEffect, useState } from '@lynx-js/react'

import { useSurfaceAppearance } from '../theme/surface-appearance.js'

const owners: { id: object, priority: number }[] = []
const listeners = new Set<() => void>()
const refresh = () => listeners.forEach(listener => listener())
function topOwner(): object | undefined {
  return owners.reduce<(typeof owners)[number] | undefined>(
    (top, owner) => !top || owner.priority >= top.priority ? owner : top,
    undefined,
  )?.id
}

/** One dim at a time, with the same sheet/dialog priority as native z-index.
 * Inactive dialog presence and unmount release ownership; underlying sheets
 * keep their outside-tap geometry but stop darkening the page twice. */
export function ModalScrim({ active = true, priority = 100, ...props }: {
  active?: boolean
  priority?: number
  className: string
  bindtap?: () => void
  'data-testid'?: string
}) {
  const [id] = useState(() => ({}))
  const [, setVersion] = useState(0)
  const surface = useSurfaceAppearance()
  useEffect(() => {
    const update = () => setVersion(version => version + 1)
    listeners.add(update)
    if (active) owners.push({ id, priority })
    refresh()
    return () => {
      listeners.delete(update)
      const index = owners.findIndex(owner => owner.id === id)
      if (index !== -1) owners.splice(index, 1)
      refresh()
    }
  }, [active, priority, id])
  const dim = active && topOwner() === id
  const alpha = surface.increaseContrast ? 0.32 : surface.theme === 'light' ? 0.16 : 0.24
  return <view {...props} style={{
    backgroundColor: dim ? `rgba(0, 0, 0, ${alpha})` : 'transparent',
  }} />
}
