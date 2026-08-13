export type PlayerAction = 'play' | 'pause' | 'next' | 'prev' | 'stop'

export type AudioState =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'error'

export interface PlayerStateSnapshot {
  state: AudioState
  positionMs: number
  durationMs: number
  index: number
  songTitle: string
  speed: number
  playMode: string
  errorMessage?: string
}

export interface E2EElement {
  tap(): Promise<void>
  longPress(): Promise<void>
  swipe(direction: 'left' | 'right' | 'up' | 'down'): Promise<void>
  getText(): Promise<string>
  isVisible(): Promise<boolean>
  getAttribute(name: string): Promise<string | null>
}

export interface WaitOptions {
  timeout?: number
  interval?: number
}

export interface E2EDriver {
  // ── Lifecycle ──
  launch(): Promise<void>
  teardown(): Promise<void>

  // ── Navigation ──
  login(user: string, pass: string): Promise<void>
  navigate(path: string): Promise<void>

  // ── Element Interaction ──
  query(testId: string): Promise<E2EElement>
  queryAll(testId: string): Promise<E2EElement[]>
  tapPlayer(action: PlayerAction): Promise<void>

  // ── State Reading ──
  getPlayerState(): Promise<PlayerStateSnapshot>
  getStorageItem(area: 'prefs' | 'secure', key: string): Promise<string | null>
  evaluateJS<T = unknown>(expression: string): Promise<T>

  // ── System Simulation (optional — platform-dependent) ──
  setSystemTheme?(theme: 'light' | 'dark'): Promise<void>
  setSystemLocale?(locale: string): Promise<void>
  simulateNetworkCondition?(condition: 'offline' | 'slow' | 'normal'): Promise<void>
  openURL?(url: string): Promise<void>
  clearAppData?(): Promise<void>

  // ── Utilities ──
  waitFor(predicate: () => Promise<boolean>, opts?: WaitOptions): Promise<void>
  sleep(ms: number): Promise<void>
  screenshot(name: string): Promise<string>
}
