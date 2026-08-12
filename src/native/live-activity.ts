import { readNativeModules } from './native-modules.js'

export interface LiveActivityModule {
  start(title: string, artist: string): Promise<string>
  update(id: string, title: string, artist: string, isPlaying: boolean): Promise<void>
  end(id: string): Promise<void>
}

let cached: LiveActivityModule | null = null

export function getLiveActivityModule(): LiveActivityModule {
  if (cached) return cached
  const nm = readNativeModules()
  if (nm?.SongloftLiveActivity) {
    cached = nm.SongloftLiveActivity as LiveActivityModule
    return cached
  }
  cached = {
    start: async () => '',
    update: async () => {},
    end: async () => {},
  }
  return cached
}
