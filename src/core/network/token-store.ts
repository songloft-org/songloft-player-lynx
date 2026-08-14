import type { AuthTokens } from '../../models/auth.js'
import type { SongloftSecure } from '../storage/types.js'
import { getSongloftStorage } from '../storage/index.js'
import { setCachedAccessToken } from './token-cache.js'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const EXPIRES_AT_KEY = 'token_expires_at'

/**
 * Every live `TokenStore`, so an external write to the underlying secure storage
 * can invalidate their caches.
 *
 * This exists because each feature builds its own api bundle and therefore its
 * own `TokenStore` (six of them today). It becomes unnecessary once the shared
 * process-wide bundle lands — see `docs/plans/2026-08-14-audit-fix-plan.md` P2-1.
 * Instances are module singletons that live for the whole process, so holding
 * strong references here leaks nothing in production.
 */
const liveStores = new Set<TokenStore>()

/**
 * Drop every in-memory token cache, forcing the next read to hit storage.
 *
 * Call this after writing the active tokens behind the stores' backs — switching
 * server profiles does exactly that. Without it, `getAccessToken()` keeps
 * returning the previous profile's token forever (it short-circuits on the cache
 * and never re-reads storage), so requests go to server B carrying server A's
 * token: 401 → refresh with A's refresh token against B → fail → logout, which
 * also wipes the tokens B legitimately had.
 */
export function invalidateTokenCaches(): void {
  for (const store of liveStores) store.invalidateCache()
}

/**
 * Token persistence + in-memory cache over `SongloftStorage.secure`, ported
 * from the Flutter `SecureStorageService`. The in-memory cache is preferred on
 * read (storage reads can be unreliable / async); the sync access-token mirror
 * (`token-cache`) feeds `UrlHelper`.
 */
export class TokenStore {
  private cachedAccess: string | null = null
  private cachedRefresh: string | null = null

  constructor(private readonly secure: SongloftSecure = getSongloftStorage().secure) {
    liveStores.add(this)
  }

  /** Forget cached tokens; the next read re-reads storage. See {@link invalidateTokenCaches}. */
  invalidateCache(): void {
    this.cachedAccess = null
    this.cachedRefresh = null
  }

  async getAccessToken(): Promise<string | null> {
    if (this.cachedAccess) return this.cachedAccess
    const token = await this.secure.get(ACCESS_TOKEN_KEY)
    this.cachedAccess = token
    setCachedAccessToken(token)
    return token
  }

  async getRefreshToken(): Promise<string | null> {
    if (this.cachedRefresh) return this.cachedRefresh
    const token = await this.secure.get(REFRESH_TOKEN_KEY)
    this.cachedRefresh = token
    return token
  }

  async saveTokens(tokens: AuthTokens): Promise<void> {
    this.cachedAccess = tokens.accessToken
    this.cachedRefresh = tokens.refreshToken
    setCachedAccessToken(tokens.accessToken)
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    await Promise.all([
      this.secure.set(ACCESS_TOKEN_KEY, tokens.accessToken),
      this.secure.set(REFRESH_TOKEN_KEY, tokens.refreshToken),
      this.secure.set(EXPIRES_AT_KEY, expiresAt),
    ])
  }

  async clearTokens(): Promise<void> {
    this.cachedAccess = null
    this.cachedRefresh = null
    setCachedAccessToken(null)
    await Promise.all([
      this.secure.remove(ACCESS_TOKEN_KEY),
      this.secure.remove(REFRESH_TOKEN_KEY),
      this.secure.remove(EXPIRES_AT_KEY),
    ])
  }

  async hasTokens(): Promise<boolean> {
    const token = await this.getAccessToken()
    return token != null && token.length > 0
  }

  async getTokenExpiresAt(): Promise<Date | null> {
    const raw = await this.secure.get(EXPIRES_AT_KEY)
    if (!raw) return null
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
}
