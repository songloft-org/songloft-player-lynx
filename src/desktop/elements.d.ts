import type { ViewProps } from '@lynx-js/types'

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    'songloft-mpv-probe': ViewProps
    'songloft-desktop-video': ViewProps
    'songloft-desktop-plugin-frame': ViewProps & {
      src: string
      'frame-id': string
      'global-props-json': string
      visible: boolean
    }
  }
}
