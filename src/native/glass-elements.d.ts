import type { ViewProps } from '@lynx-js/types'

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    'songloft-tab-glass': ViewProps & { 'songloft-glass-light'?: number, 'ios-user-interface-style'?: 'light' | 'dark' }
    'songloft-capsule-glass': ViewProps & { 'songloft-glass-light'?: number, 'capture-target': string }
  }
}
