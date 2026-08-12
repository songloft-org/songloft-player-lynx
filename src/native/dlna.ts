import { readNativeModules } from './native-modules.js'

export interface DlnaDevice {
  id: string
  name: string
  location: string
}

export interface DlnaModule {
  startDiscovery(): Promise<void>
  stopDiscovery(): Promise<void>
  getDevices(): Promise<DlnaDevice[]>
  cast(deviceId: string, url: string, title: string): Promise<void>
  control(action: 'play' | 'pause' | 'stop' | 'seek', value?: number): Promise<void>
}

let cached: DlnaModule | null = null

export function getDlnaModule(): DlnaModule {
  if (cached) return cached
  const nm = readNativeModules()
  if (nm?.SongloftDlna) {
    cached = nm.SongloftDlna as DlnaModule
    return cached
  }
  cached = {
    startDiscovery: async () => {},
    stopDiscovery: async () => {},
    getDevices: async () => [],
    cast: async () => {},
    control: async () => {},
  }
  return cached
}
