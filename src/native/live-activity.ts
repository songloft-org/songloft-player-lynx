import { readNativeModules } from './native-modules.js'

export interface LiveActivityModule {
  start(title: string, artist: string): Promise<string>
  update(id: string, title: string, artist: string, isPlaying: boolean): Promise<void>
  end(id: string): Promise<void>
}

/**
 * The native module is callback-based (Lynx convention). Methods take
 * (argsJson: String, callback: (String) -> Void). This adapter promisifies them.
 */
interface NativeLiveActivity {
  start(args: string, callback: (result: string) => void): void
  update(args: string, callback: (result: string) => void): void
  end(args: string, callback: (result: string) => void): void
}

function createNativeAdapter(native: NativeLiveActivity): LiveActivityModule {
  return {
    start(title: string, artist: string) {
      return new Promise<string>((resolve) => {
        native.start(JSON.stringify({ title, artist }), (result) => {
          resolve(result || '')
        })
      })
    },
    update(id: string, title: string, artist: string, isPlaying: boolean) {
      return new Promise<void>((resolve) => {
        native.update(JSON.stringify({ id, title, artist, isPlaying }), () => resolve())
      })
    },
    end(id: string) {
      return new Promise<void>((resolve) => {
        native.end(JSON.stringify({ id }), () => resolve())
      })
    },
  }
}

let cached: LiveActivityModule | null = null

export function getLiveActivityModule(): LiveActivityModule {
  if (cached) return cached
  const nm = readNativeModules()
  if (nm?.SongloftLiveActivity) {
    cached = createNativeAdapter(nm.SongloftLiveActivity as unknown as NativeLiveActivity)
    return cached
  }
  cached = {
    start: async () => '',
    update: async () => {},
    end: async () => {},
  }
  return cached
}