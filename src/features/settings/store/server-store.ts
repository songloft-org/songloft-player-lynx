import { create } from 'zustand'

import { appConfig } from '../../../core/config/app-config.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import { getQueryClient } from '../../../lib/query/index.js'
import { useAppSessionStore } from '../../../store/index.js'
import { ServerProfileList, type ServerProfile } from '../../../models/server-profile.js'
import { normalizeServerUrl, PREF_SERVER_URL } from '../../auth/store/index.js'
import { setCachedAccessToken } from '../../../core/network/token-cache.js'
import { getSharedTokenStore } from '../../../core/network/api-client.js'

const PREF_SERVER_PROFILES = 'server_profiles'
const PREF_ACTIVE_PROFILE_ID = 'server_active_profile'

function tokenAccessKey(id: string) { return `token_access_${id}` }
function tokenRefreshKey(id: string) { return `token_refresh_${id}` }

function generateId(): string {
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export interface ServerStoreState {
  profiles: ServerProfile[]
  activeProfileId: string | null
  hydrate: () => Promise<void>
  addProfile: (params: { name: string; url: string; insecureTls?: boolean }) => Promise<ServerProfile>
  editProfile: (id: string, patch: { name?: string; url?: string; insecureTls?: boolean }) => Promise<void>
  removeProfile: (id: string) => Promise<void>
  switchTo: (id: string) => Promise<{ hasToken: boolean }>
}

function persistProfiles(profiles: ServerProfile[], activeId: string | null) {
  const storage = getSongloftStorage()
  const raw = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    url: p.url,
    insecure_tls: p.insecureTls,
    last_used: p.lastUsed,
  }))
  void storage.prefs.set(PREF_SERVER_PROFILES, JSON.stringify(raw)).catch(() => {})
  if (activeId) {
    void storage.prefs.set(PREF_ACTIVE_PROFILE_ID, activeId).catch(() => {})
  }
}

export const useServerStore = create<ServerStoreState>((set, get) => ({
  profiles: [],
  activeProfileId: null,

  async hydrate() {
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
          set({ profiles: parsed.data, activeProfileId: activeId })
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
          lastUsed: Date.now(),
        }
        set({ profiles: [profile], activeProfileId: profile.id })
        persistProfiles([profile], profile.id)
      }
    } catch {
      // best-effort
    }
  },

  async addProfile({ name, url, insecureTls = false }) {
    const profile: ServerProfile = {
      id: generateId(),
      name,
      url: normalizeServerUrl(url),
      insecureTls,
      lastUsed: undefined,
    }
    const profiles = [...get().profiles, profile]
    set({ profiles })
    persistProfiles(profiles, get().activeProfileId)
    return profile
  },

  async editProfile(id, patch) {
    const profiles = get().profiles.map((p) => {
      if (p.id !== id) return p
      return {
        ...p,
        ...(patch.name != null && { name: patch.name }),
        ...(patch.url != null && { url: normalizeServerUrl(patch.url) }),
        ...(patch.insecureTls != null && { insecureTls: patch.insecureTls }),
      }
    })
    set({ profiles })
    persistProfiles(profiles, get().activeProfileId)
  },

  async removeProfile(id) {
    const profiles = get().profiles.filter((p) => p.id !== id)
    set({ profiles })
    persistProfiles(profiles, get().activeProfileId)
    // Clean up stored tokens for this profile
    const storage = getSongloftStorage()
    void storage.secure.remove(tokenAccessKey(id)).catch(() => {})
    void storage.secure.remove(tokenRefreshKey(id)).catch(() => {})
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
      } catch { /* best-effort */ }
    }

    // Load tokens for the target profile
    let hasToken = false
    try {
      const [access, refresh] = await Promise.all([
        storage.secure.get(tokenAccessKey(id)).catch(() => null),
        storage.secure.get(tokenRefreshKey(id)).catch(() => null),
      ])
      if (access) {
        await storage.secure.set('access_token', access)
        setCachedAccessToken(access)
        hasToken = true
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
    useAppSessionStore.getState().setBaseUrl(target.url)
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
}))
