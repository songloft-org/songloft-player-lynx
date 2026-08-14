import { readNativeModules } from './native-modules.js'

export interface FloatingLyricModule {
  requestPermission(): Promise<boolean>
  show(): Promise<void>
  updateLyric(line: string): Promise<void>
  hide(): Promise<void>
  isShowing(): Promise<boolean>
}

/**
 * The native module is callback-based (Lynx convention). Methods take
 * (argsJson: String, callback: Callback). This adapter promisifies them.
 */
interface NativeFloatingLyric {
  requestPermission(args: string, callback: (result: string) => void): void
  show(args: string, callback: (result: string) => void): void
  updateLyric(args: string, callback: (result: string) => void): void
  hide(args: string, callback: (result: string) => void): void
  isShowing(args: string, callback: (result: string) => void): void
}

function createNativeAdapter(native: NativeFloatingLyric): FloatingLyricModule {
  return {
    requestPermission() {
      return new Promise((resolve) => {
        native.requestPermission('{}', (result) => {
          try {
            const obj: unknown = JSON.parse(result)
            resolve(
              (obj && typeof obj === 'object' && (obj as Record<string, unknown>).result === true)
                ? true
                : false,
            )
          } catch {
            resolve(false)
          }
        })
      })
    },
    show() {
      return new Promise((resolve) => {
        native.show('{}', () => resolve())
      })
    },
    updateLyric(line: string) {
      return new Promise((resolve) => {
        native.updateLyric(JSON.stringify({ line }), () => resolve())
      })
    },
    hide() {
      return new Promise((resolve) => {
        native.hide('{}', () => resolve())
      })
    },
    isShowing() {
      return new Promise((resolve) => {
        native.isShowing('{}', (result) => {
          try {
            const obj: unknown = JSON.parse(result)
            resolve(
              (obj && typeof obj === 'object' && (obj as Record<string, unknown>).result === true)
                ? true
                : false,
            )
          } catch {
            resolve(false)
          }
        })
      })
    },
  }
}

let cached: FloatingLyricModule | null = null

export function getFloatingLyricModule(): FloatingLyricModule {
  if (cached) return cached
  const nm = readNativeModules()
  if (nm?.SongloftFloatingLyric) {
    cached = createNativeAdapter(nm.SongloftFloatingLyric as unknown as NativeFloatingLyric)
    return cached
  }
  cached = {
    requestPermission: async () => false,
    show: async () => {},
    updateLyric: async () => {},
    hide: async () => {},
    isShowing: async () => false,
  }
  return cached
}