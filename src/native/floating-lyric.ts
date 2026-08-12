import { readNativeModules } from './native-modules.js'

export interface FloatingLyricModule {
  requestPermission(): Promise<boolean>
  show(): Promise<void>
  updateLyric(line: string): Promise<void>
  hide(): Promise<void>
  isShowing(): Promise<boolean>
}

let cached: FloatingLyricModule | null = null

export function getFloatingLyricModule(): FloatingLyricModule {
  if (cached) return cached
  const nm = readNativeModules()
  if (nm?.SongloftFloatingLyric) {
    cached = nm.SongloftFloatingLyric as FloatingLyricModule
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
