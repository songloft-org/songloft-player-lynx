import { useEffect, useState } from '@lynx-js/react'
import { readLynxGlobal } from '../native/native-modules.js'
import { desktopVideoState } from './video.js'
import { createProbeDrawer } from './probe-draw.js'

/** A surface for the application's existing player; never loads a media URL. */
export function DesktopVideoSurface() {
  const [state, setState] = useState(desktopVideoState.getState())
  useEffect(() => desktopVideoState.subscribe((next) => setState(next)), [])
  useEffect(() => {
    if (!state.open) return
    const drawer = createProbeDrawer(
      () => readLynxGlobal()?.createSelectorQuery(),
      (error) => console.error('[desktop-video]', error),
      '#desktop-video',
    )
    const timer = setInterval(() => drawer.draw(), 33)
    return () => {
      clearInterval(timer)
      drawer.dispose()
    }
  }, [state.open])
  if (!state.open || state.rect.width <= 0 || state.rect.height <= 0)
    return null
  return (
    <songloft-desktop-video
      id="desktop-video"
      style={{
        position: 'absolute',
        left: state.rect.x,
        top: state.rect.y,
        width: state.rect.width,
        height: state.rect.height,
      }}
    />
  )
}
