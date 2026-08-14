import type { AuthTokens } from '../../models/auth.js'
import type { SongloftSecure } from '../storage/types.js'
import { getSongloftStorage } from '../storage/index.js'
import { setCachedAccessToken } from './token-cache.js'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const EXPIRES_AT_KEY = 'token_expires_at'

/**
 * Token persistence + in-memory cache over `SongloftStorage.secure`, ported
 * from the Flutter `SecureStorageService`. The in-memory cache is preferred on
 * read (storage reads can be unreliable / async); the sync access-token mirror
 * (`token-cache`) feeds `UrlHelper`.
 *
 * Before P2-1, each feature built its own `TokenStore` (six total), and a
 * `liveStores` set + `invalidateTokenCaches()` loop was needed to flush all
 * caches when switching server profiles. Now the process has exactly one
 * `TokenStore` (via `getSharedApiBundle()`), so a simple `invalidateCache()`
 * on the shared instance suffices.
 */
export class TokenStore {
  private cachedAccess: string | null = null
  private cachedRefresh: string | null = null

  constructor(private readonly secure: SongloftSecure = getSongloftStorage().secure) {}

  /** Forget cached tokens; the next read re-reads storage. */
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
