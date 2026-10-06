import { create } from 'zustand'

import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { getQueryClient } from '../../../lib/query/index.js'
import { useAppSessionStore } from '../../../store/index.js'
import { ServerProfileList, type ServerProfile } from '../../../models/server-profile.js'
import { normalizeServerUrl, PREF_SERVER_URL, PREF_LAST_USERNAME } from '../../auth/store/index.js'
import { setCachedAccessToken } from '../../../core/network/token-cache.js'
import { getSharedTokenStore } from '../../../core/network/api-client.js'
import { applyInsecureTls } from '../../../native/native-platform.js'

const PREF_SERVER_PROFILES = 'server_profiles'
const PREF_ACTIVE_PROFILE_ID = 'server_active_profile'

function tokenAccessKey(id: string) { return `token_access_${id}` }
function tokenRefreshKey(id: string) { return `token_refresh_${id}` }
/** Password for profile `id` lives in `secure` — never in prefs JSON. */
function passwordKey(id: string) { return `password_${id}` }

function generateId(): string {
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Credentials stored per-profile (username in prefs JSON, password in secure). */
export interface ProfileCredentials {
  username: string
  password: string
}

export interface ServerStoreState {
  profiles: ServerProfile[]
  activeProfileId: string | null
  hydrate: (options?: { probe?: boolean }) => Promise<void>
  addProfile: (params: {
    name: string
    url: string
    insecureTls?: boolean
    username?: string
    password?: string
  }) => Promise<ServerProfile>
  editProfile: (
    id: string,
    patch: {
      name?: string
      url?: string
      insecureTls?: boolean
      username?: string
      password?: string
    },
  ) => Promise<void>
  removeProfile: (id: string) => Promise<void>
  switchTo: (id: string) => Promise<{ hasToken: boolean }>
  /** Probe a server URL to see if it's reachable (returns true/false). */
  probeProfile: (url: string) => Promise<boolean>
  /**
   * Read the saved credentials for a profile. Returns `null` if no password
   * is stored. Used by the edit form to prefill the password field.
   */
  readCredentials: (id: string) => Promise<ProfileCredentials | null>
  /**
   * Find the credentials for the profile matching `url`. Works even before
   * `hydrate()` is called — reads persisted JSON directly. Used by the login
   * page to prefill from the profile the user is about to authenticate against.
   */
  loadCredentialsForUrl: (url: string) => Promise<ProfileCredentials | null>
  /**
   * Write credentials for the profile matching `url` (e.g. after a successful
   * login). Updates in-memory profiles if hydrated, persists regardless.
   * Mirrors the Flutter `updateCredentials` semantics.
   */
  rememberCredentials: (
    url: string,
    creds: { username: string; password: string },
  ) => Promise<void>
}

function persistProfiles(profiles: ServerProfile[], activeId: string | null) {
  const storage = getSongloftStorage()
  const raw = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url,
    insecure_tls: p.insecureTls,
    // username travels with the profile JSON; password lives in secure storage.
    ...(p.username != null && { username: p.username }),
    last_used: p.lastUsed,
  }))
  void storage.prefs.set(PREF_SERVER_PROFILES, JSON.stringify(raw)).catch(() => {})
  if (activeId) {
    void storage.prefs.set(PREF_ACTIVE_PROFILE_ID, activeId).catch(() => {})
  }
}

/**
 * Read the persisted profiles JSON directly from storage. Returns `null` when
 * nothing has been written yet. Used by `loadCredentialsForUrl` so the login
 * page can prefill from a profile even before the server list has been opened
 * (i.e. before `hydrate()` has run and populated the in-memory state).
 */
async function readPersistedProfiles(): Promise<ServerProfile[] | null> {
  const storage = getSongloftStorage()
  try {
    const raw = await storage.prefs.get(PREF_SERVER_PROFILES)
    if (!raw) return null
    const parsed = ServerProfileList.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export const useServerStore = create<ServerStoreState>((set, get) => ({
  profiles: [],
  activeProfileId: null,

  async hydrate(options = {}) {
    const storage = getSongloftStorage()
    try {
      const [rawProfiles, activeId, legacyUrl] = await Promise.all([
        storage.prefs.get(PREF_SERVER_PROFILES).catch(() => null),
        storage.prefs.get(PREF_ACTIVE_PROFILE_ID).catch(() => null),
        storage.prefs.get(PREF_SERVER_URL).catch(() => null),
      ])

      if (rawProfiles) {
        const parsed = ServerProfileList.safeParse(JSON.parse(rawProfiles))
        if (parsed.success) {
          const profiles = parsed.data
          set({ profiles, activeProfileId: activeId })

          // Auto-probe: if the active profile is unreachable, try others.
          if (options.probe !== false && activeId && profiles.length > 1) {
            const active = profiles.find((p) => p.id === activeId)
            if (active) {
              const reachable = await get().probeProfile(active.url)
              if (!reachable) {
                // Try each other profile in parallel (capped at 2.5s total).
                const others = profiles.filter((p) => p.id !== activeId)
                const results = await Promise.all(
                  others.map(async (p) => ({
                    id: p.id,
                    reachable: await get().probeProfile(p.url),
                  })),
                )
                const firstReachable = results.find((r) => r.reachable)
                if (firstReachable) {
                  await get().switchTo(firstReachable.id)
                }
              }
            }
          }
          return
        }
      }

      // Legacy migration: no profiles yet, create one from existing server URL
      if (legacyUrl && legacyUrl.length > 0) {
        const profile: ServerProfile = {
          id: generateId(),
          name: 'Default',
          url: legacyUrl,
          insecureTls: appConfig.insecureTls,
          username: undefined,
          lastUsed: Date.now(),
        }
        set({ profiles: [profile], activeProfileId: profile.id })
        persistProfiles([profile], profile.id)
      }
    } catch {
      // best-effort
    }
  },

  async addProfile({ name, url, insecureTls = false, username, password }) {
    const trimmedName = username?.trim()
    const profile: ServerProfile = {
      id: generateId(),
      name,
      url: normalizeServerUrl(url),
      insecureTls,
      username: trimmedName && trimmedName.length > 0 ? trimmedName : undefined,
      lastUsed: undefined,
    }
    const profiles = [...get().profiles, profile]
    set({ profiles })
    persistProfiles(profiles, get().activeProfileId)
    // Password goes to secure storage, separate from the profile JSON.
    if (password && password.length > 0) {
      void getSongloftStorage().secure.set(passwordKey(profile.id), password).catch(() => {})
    }
    return profile
  },

  async editProfile(id, patch) {
    const storage = getSongloftStorage()
    const profiles = get().profiles.map((p) => {
      if (p.id !== id) return p
      return {
        ...p,
        ...(patch.name != null && { name: patch.name }),
        ...(patch.url != null && { url: normalizeServerUrl(patch.url) }),
        ...(patch.insecureTls != null && { insecureTls: patch.insecureTls }),
        ...(patch.username != null && {
          username: patch.username.trim().length > 0 ? patch.username.trim() : undefined,
        }),
      }
    })
    set({ profiles })
    persistProfiles(profiles, get().activeProfileId)
    // Password: empty string means "clear the stored password".
    if (patch.password !== undefined) {
      if (patch.password.length > 0) {
        void storage.secure.set(passwordKey(id), patch.password).catch(() => {})
      } else {
        void storage.secure.remove(passwordKey(id)).catch(() => {})
      }
    }
  },

  async removeProfile(id) {
    const profiles = get().profiles.filter((p) => p.id !== id)
    set({ profiles })
    persistProfiles(profiles, get().activeProfileId)
    // Clean up stored tokens AND password for this profile.
    const storage = getSongloftStorage()
    void storage.secure.remove(tokenAccessKey(id)).catch(() => {})
    void storage.secure.remove(tokenRefreshKey(id)).catch(() => {})
    void storage.secure.remove(passwordKey(id)).catch(() => {})
    void storage.prefs.remove(`server_session_username_${id}`).catch(() => {})
  },

  async switchTo(id) {
    const { profiles, activeProfileId } = get()
    const target = profiles.find((p) => p.id === id)
    if (!target) return { hasToken: false }

    const storage = getSongloftStorage()

    // Save current tokens under the outgoing profile
    if (activeProfileId) {
      try {
        const [access, refresh] = await Promise.all([
          storage.secure.get('access_token').catch(() => null),
          storage.secure.get('refresh_token').catch(() => null),
        ])
        if (access) await storage.secure.set(tokenAccessKey(activeProfileId), access).catch(() => {})
        if (refresh) await storage.secure.set(tokenRefreshKey(activeProfileId), refresh).catch(() => {})
        // Bind the authenticated actor to the saved token, independently of editable login-prefill fields.
        const owner = useAppSessionStore.getState().username
        const ownerKey = `server_session_username_${activeProfileId}`
        if (access && owner) await storage.prefs.set(ownerKey, owner)
        else await storage.prefs.remove(ownerKey)
      } catch { /* best-effort */ }
    }

    // Load tokens for the target profile
    let hasToken = false
    let username: string | null = null
    try {
      const [access, refresh] = await Promise.all([
        storage.secure.get(tokenAccessKey(id)).catch(() => null),
        storage.secure.get(tokenRefreshKey(id)).catch(() => null),
      ])
      if (access) {
        await storage.secure.set('access_token', access)
        setCachedAccessToken(access)
        hasToken = true
        username = await storage.prefs.get(`server_session_username_${id}`).catch(() => null)
      } else {
        await storage.secure.remove('access_token').catch(() => {})
        setCachedAccessToken(null)
      }
      if (refresh) {
        await storage.secure.set('refresh_token', refresh)
      } else {
        await storage.secure.remove('refresh_token').catch(() => {})
      }
    } catch { /* best-effort */ }

    // The writes above went straight to storage, behind the back of the
    // TokenStore's in-memory cache — and that cache short-circuits reads and
    // never re-reads storage. Without this the app would keep sending the previous
    // profile's access token to the new server: 401 → refresh with the old refresh
    // token → fail → logout, wiping the tokens this profile legitimately had.
    getSharedTokenStore().invalidateCache()

    // Update app config
    appConfig.baseUrl = target.url
    appConfig.resolvedBaseUrl = target.url
    appConfig.insecureTls = target.insecureTls
    // Profiles carry their own TLS setting, so switching has to re-push it:
    // going from a self-signed profile to a public one must re-tighten trust,
    // and the reverse must relax it — neither happens by writing `appConfig`.
    applyInsecureTls(target.insecureTls)
    useAppSessionStore.getState().setBaseUrl(target.url)
    useAppSessionStore.getState().setUsername(hasToken ? username : null)
    if (hasToken && username) void storage.prefs.set(PREF_LAST_USERNAME, username).catch(() => {})
    else void storage.prefs.remove(PREF_LAST_USERNAME).catch(() => {})
    void storage.prefs.set(PREF_SERVER_URL, target.url).catch(() => {})

    // Update profile last_used + active
    const updated = profiles.map((p) =>
      p.id === id ? { ...p, lastUsed: Date.now() } : p,
    )
    set({ profiles: updated, activeProfileId: id })
    persistProfiles(updated, id)

    // Clear stale data from previous server
    try { getQueryClient().clear() } catch { /* */ }

    return { hasToken }
  },

  async probeProfile(url: string) {
    try {
      const normalized = normalizeServerUrl(url)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2500)
      const resp = await fetch(`${normalized}/api/v1/health`, {
        signal: controller.signal,
      })
      clearTimeout(timer)
      return resp.ok
    } catch {
      return false
    }
  },

  async readCredentials(id) {
    const profile = get().profiles.find((p) => p.id === id)
    if (!profile || !profile.username) return null
    try {
      const password = await getSongloftStorage().secure.get(passwordKey(id))
      if (!password) return null
      return { username: profile.username, password }
    } catch {
      return null
    }
  },

  async loadCredentialsForUrl(url) {
    // Try in-memory first (already hydrated).
    const inMemory = get().profiles
    let matches = inMemory.length > 0 ? inMemory : null
    if (!matches) {
      // Not yet hydrated — read persisted JSON directly.
      matches = await readPersistedProfiles()
    }
    if (!matches) return null
    const normalized = normalizeServerUrl(url)
    const profile = matches.find((p) => p.url === normalized)
    if (!profile || !profile.username) return null
    try {
      const password = await getSongloftStorage().secure.get(passwordKey(profile.id))
      if (!password) return { username: profile.username, password: '' }
      return { username: profile.username, password }
    } catch {
      return { username: profile.username, password: '' }
    }
  },

  async rememberCredentials(url, { username, password }) {
    const storage = getSongloftStorage()
    const normalized = normalizeServerUrl(url)

    // Update in-memory profiles if hydrated.
    let updated: ServerProfile[] | null = null
    const inMemory = get().profiles
    if (inMemory.length > 0) {
      updated = inMemory.map((p) =>
        p.url === normalized
          ? { ...p, username: username.trim() || undefined }
          : p,
      )
      if (updated.some((p, i) => p !== inMemory[i])) {
        set({ profiles: updated })
        persistProfiles(updated, get().activeProfileId)
      }
    }

    // Always persist to the underlying JSON + secure storage so subsequent
    // reads (including pre-hydrate) see the new credentials.
    const profilesToPersist = updated ?? (await readPersistedProfiles()) ?? []
    const target = profilesToPersist.find((p) => p.url === normalized)
    if (target) {
      if (!updated) {
        // Not hydrated: update the persisted list directly without touching
        // in-memory state (the server list page hasn't been opened yet).
        const next = profilesToPersist.map((p) =>
          p.id === target.id ? { ...p, username: username.trim() || undefined } : p,
        )
        persistProfiles(next, get().activeProfileId)
      }
      if (password.length > 0) {
        await storage.secure.set(passwordKey(target.id), password).catch(() => {})
      } else {
        await storage.secure.remove(passwordKey(target.id)).catch(() => {})
      }
    }
  },
}))
