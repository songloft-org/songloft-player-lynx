import { create } from 'zustand'

import { appConfig } from '../core/config/app-config.js'

/**
 * Store convention for the project (establishes the pattern for feature batches):
 *
 * - one `create<T>()` per client-state slice, actions co-located with state;
 * - read with a **selector** in components — `useAppSessionStore(s => s.baseUrl)`
 *   — never the whole store, so re-renders stay narrow;
 * - the returned hook also exposes the vanilla API (`getState` / `setState` /
 *   `subscribe`) for non-React consumers and tests.
 *
 * This minimal `app/session` slice holds the current server base URL and a
 * username placeholder; real auth/session wiring lands in the auth batch.
 */
export interface AppSessionState {
  /** Current server identity base URL. */
  baseUrl: string
  /** Logged-in username, or null when signed out. */
  username: string | null
  setBaseUrl: (url: string) => void
  setUsername: (name: string | null) => void
  reset: () => void
}

export const useAppSessionStore = create<AppSessionState>((set) => ({
  baseUrl: appConfig.baseUrl,
  username: null,
  setBaseUrl: (baseUrl) => set({ baseUrl }),
  setUsername: (username) => set({ username }),
  reset: () => set({ baseUrl: appConfig.baseUrl, username: null }),
}))
