import { create } from 'zustand'

import { appConfig } from '../../../core/config/app-config.js'
import { ApiError } from '../../../core/network/http-client.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import { getSharedTokenStore, setSharedOnTokenExpired } from '../../../core/network/api-client.js'
import type { TokenStore } from '../../../core/network/token-store.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import type { SongloftStorage } from '../../../core/storage/types.js'
// Static, NOT `await import()`: a dynamic import becomes a separate lazy bundle
// that never ships in the app assets, so on a device the cache never got cleared
// on sign-out. `lib/query` only pulls in query-core + safe-timers, so importing
// it here is cycle-free.
import { getQueryClient } from '../../../lib/query/index.js'
import { applyInsecureTls } from '../../../native/native-platform.js'
import { usePlayerStore } from '../../player/store/index.js'
import { useAppSessionStore } from '../../../store/index.js'
import { AuthApi } from '../api/auth-api.js'
import type { AuthStatus } from './guard.js'

/** prefs key for the last server URL (standalone mode). */
export const PREF_SERVER_URL = 'server_url'
/** prefs key for the last username (username is not a secret). */
export const PREF_LAST_USERNAME = 'last_username'
/** prefs key for the insecure-TLS opt-in. */
export const PREF_INSECURE_TLS = 'insecure_tls'
/**
 * secure-store key for the last password, written on every successful login so
 * the login form can prefill it again after sign-out — the Flutter reference
 * does exactly this (`AppPreferences.setLastPassword`). Stored in the `secure`
 * namespace (Keystore / Keychain; plain same-origin storage on web), the same
 * tier as the tokens. `logout` deliberately keeps it: the remembered password
 * is device-local convenience, not session state.
 */
export const SECURE_LAST_PASSWORD = 'last_password'

export interface LoginArgs {
  username: string
  password: string
  /** standalone only: server base URL entered on the login page. */
  apiBaseUrl?: string
  /** standalone only: skip TLS cert validation (persisted; transport no-op). */
  insecureTls?: boolean
}

export interface AuthState {
  status: AuthStatus
  isLoading: boolean
  error?: string
  /** Read persisted server URL / insecure-TLS into `appConfig` (startup). */
  hydrate: () => Promise<void>
  /** Probe secure storage for tokens → authenticated / unauthenticated. */
  checkAuth: () => Promise<void>
  login: (args: LoginArgs) => Promise<void>
  logout: () => Promise<void>
  /** Test hook. */
  reset: () => void
}

/**
 * Injectable dependencies. Production uses the ambient `SongloftStorage`, a
 * `TokenStore` over its secure namespace, and `createPublicClient` for the
 * un-intercepted login/logout calls. Tests inject a memory storage + a fake
 * transport-backed public client for full isolation.
 */
export interface AuthStoreDeps {
  storage: SongloftStorage
  tokenStore: TokenStore
  /** Build a public (no-interceptor) client pointed at `baseUrl`. */
  createLoginClient: (baseUrl: string) => HttpClient
}

export function defaultAuthStoreDeps(): AuthStoreDeps {
  const storage = getSongloftStorage()
  return {
    storage,
    tokenStore: getSharedTokenStore(),
    createLoginClient: (baseUrl) =>
      createPublicClient({ getBaseUrl: () => baseUrl }),
  }
}

/** Normalize a user-entered server URL: trim + strip trailing slashes. */
export function normalizeServerUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.detail ?? e.message
  if (e instanceof Error) return e.message
  return String(e)
}

/** Best-effort pref write; native storage stub rejects until the JSB lands. */
async function tryPref(
  storage: SongloftStorage,
  key: string,
  value: string,
): Promise<void> {
  try {
    await storage.prefs.set(key, value)
  } catch {
    // ignore — persistence is best-effort; in-memory config still updated.
  }
}

async function tryReadPref(
  storage: SongloftStorage,
  key: string,
): Promise<string | null> {
  try {
    return await storage.prefs.get(key)
  } catch {
    return null
  }
}

/**
 * Build an auth store bound to the given dependencies. Returns a Zustand hook
 * whose vanilla API (`getState` / `setState` / `subscribe`) is what the router
 * `beforeLoad` guard and `src/index.tsx` read — no React required.
 */
export function createAuthStore(deps: AuthStoreDeps = defaultAuthStoreDeps()) {
  const { storage, tokenStore, createLoginClient } = deps

  return create<AuthState>((set, get) => ({
    status: 'unknown',
    isLoading: false,
    error: undefined,

    hydrate: async () => {
      const [serverUrl, insecure] = await Promise.all([
        tryReadPref(storage, PREF_SERVER_URL),
        tryReadPref(storage, PREF_INSECURE_TLS),
      ])
      if (serverUrl && serverUrl.length > 0) {
        appConfig.baseUrl = serverUrl
        appConfig.resolvedBaseUrl = serverUrl
        useAppSessionStore.getState().setBaseUrl(serverUrl)
      }
      if (insecure != null) {
        appConfig.insecureTls = insecure === 'true'
        applyInsecureTls(appConfig.insecureTls)
      }
    },

    checkAuth: async () => {
      try {
        const has = await tokenStore.hasTokens()
        set({
          status: has ? 'authenticated' : 'unauthenticated',
          isLoading: false,
        })
      } catch (e) {
        set({ status: 'unauthenticated', isLoading: false, error: messageOf(e) })
      }
    },

    login: async ({ username, password, apiBaseUrl, insecureTls }) => {
      set({ isLoading: true, error: undefined })
      try {
        // standalone: record + normalize the entered server URL. On Lynx the
        // identity base and the resolved base are collapsed (no 302 resolution).
        if (!appConfig.isEmbedded && apiBaseUrl && apiBaseUrl.length > 0) {
          const normalized = normalizeServerUrl(apiBaseUrl)
          appConfig.baseUrl = normalized
          appConfig.resolvedBaseUrl = normalized
          await tryPref(storage, PREF_SERVER_URL, normalized)
          useAppSessionStore.getState().setBaseUrl(normalized)
        }
        if (insecureTls != null) {
          appConfig.insecureTls = insecureTls
          await tryPref(storage, PREF_INSECURE_TLS, String(insecureTls))
          applyInsecureTls(insecureTls)
        }

        const client = createLoginClient(appConfig.resolvedBaseUrl)
        const tokens = await new AuthApi(client).login({ username, password })

        // Persist tokens to secure storage (also feeds the in-memory + sync
        // token cache via TokenStore.saveTokens).
        await tokenStore.saveTokens(tokens)
        // Remember the last username (not a secret → prefs) and password
        // (secret → secure store) so the login form prefills the real
        // credentials after sign-out, mirroring the Flutter auth provider.
        await tryPref(storage, PREF_LAST_USERNAME, username)
        try {
          await storage.secure.set(SECURE_LAST_PASSWORD, password)
        } catch {
          // ignore — forgetting the password only costs one retype next time.
        }
        useAppSessionStore.getState().setUsername(username)

        set({ status: 'authenticated', isLoading: false, error: undefined })
      } catch (e) {
        set({
          status: 'unauthenticated',
          isLoading: false,
          error: messageOf(e),
        })
      }
    },

    logout: async () => {
      // Capture the token before clearing, for the server-side revoke below.
      let accessToken: string | null = null
      try {
        accessToken = await tokenStore.getAccessToken()
      } catch {
        accessToken = null
      }

      // Clear local state FIRST so sign-out is immediate and offline-safe.
      try {
        await tokenStore.clearTokens()
      } catch {
        // ignore — even if persistence clear fails, we still sign out locally.
      }
      // Stop playback and clear the player: the queue belongs to the
      // signed-out account, and an untouched player would keep streaming the
      // next track with the just-revoked token (auto-advance runs outside any
      // route guard). The reset also tears down the sleep timer and the
      // play-retry timer.
      try {
        usePlayerStore.getState().reset()
      } catch {
        // player store not initialized yet (early startup) — nothing to stop
      }
      useAppSessionStore.getState().setUsername(null)
      set({ status: 'unauthenticated', isLoading: false, error: undefined })

      try {
        getQueryClient().clear()
      } catch {
        // query client may not be initialized yet
      }

      // Best-effort server revoke; failure never blocks the local sign-out.
      try {
        const client = createLoginClient(appConfig.resolvedBaseUrl)
        await new AuthApi(client).logout(accessToken ?? undefined)
      } catch {
        // ignore
      }
    },

    reset: () => set({ status: 'unknown', isLoading: false, error: undefined }),
  }))
}

/** Process-wide auth store (production dependencies). */
export const useAuthStore = createAuthStore()

// Wire the shared auth interceptor's session-expired callback to the auth
// store's logout. This was previously done per-feature (six copies); now it
// fires once for the process-wide singleton (P2-1).
setSharedOnTokenExpired(() => {
  void useAuthStore.getState().logout()
})
