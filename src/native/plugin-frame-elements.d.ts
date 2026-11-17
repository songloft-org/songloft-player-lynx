import type { ViewProps } from '@lynx-js/types'

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    'songloft-plugin-frame': ViewProps & {
      src: string
      'global-props': Record<string, unknown>
    }
  }
}
