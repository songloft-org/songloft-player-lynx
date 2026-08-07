import type { AuthTokens } from '../../models/auth.js'
import { apiPrefix } from '../config/app-config.js'
import type {
  HttpInterceptor,
  RequestContext,
  TransportResponse,
} from './http-client.js'
import type { TokenStore } from './token-store.js'

/**
 * Refreshes tokens for one refresh-token; throws / returns null on failure.
 * Injected so the refresh call can go through a dedicated public client.
 */
export type RefreshFn = (refreshToken: string) => Promise<AuthTokens | null>

export interface AuthInterceptorOptions {
  tokens: TokenStore
  refresh: RefreshFn
  /** Called after tokens are cleared because the session is unrecoverable. */
  onTokenExpired?: () => void | Promise<void>
  /** Override the default public-path list (paths that skip auth). */
  publicPaths?: string[]
}

/**
 * Auth interceptor equivalent to the Flutter `AuthInterceptor`:
 * - injects `Authorization: Bearer <accessToken>` on non-public requests;
 * - on 401, performs a **single-flight** token refresh (concurrent 401s share
 *   one `POST /auth/refresh`), then replays the original request with the new
 *   token;
 * - a 401 on the refresh path, or any refresh failure, clears tokens and fires
 *   `onTokenExpired`.
 */
export class AuthInterceptor implements HttpInterceptor {
  private readonly tokens: TokenStore
  private readonly refresh: RefreshFn
  private readonly onTokenExpired?: () => void | Promise<void>
  private readonly publicPaths: string[]
  private refreshing: Promise<boolean> | null = null

  constructor(options: AuthInterceptorOptions) {
    this.tokens = options.tokens
    this.refresh = options.refresh
    this.onTokenExpired = options.onTokenExpired
    this.publicPaths =
      options.publicPaths ??
      [
        `${apiPrefix}/auth/login`,
        `${apiPrefix}/auth/refresh`,
        `${apiPrefix}/version`,
        `${apiPrefix}/health`,
      ]
  }

  private isPublicPath(path: string): boolean {
    return this.publicPaths.some((p) => path.includes(p))
  }

  async onRequest(ctx: RequestContext): Promise<void> {
    if (this.isPublicPath(ctx.path)) return
    const token = await this.tokens.getAccessToken()
    if (token) ctx.headers['Authorization'] = `Bearer ${token}`
  }

  async onError(
    ctx: RequestContext,
    _response: TransportResponse,
    resend: (headers: Record<string, string>) => Promise<TransportResponse>,
  ): Promise<TransportResponse | null> {
    // A 401 from the refresh endpoint itself is unrecoverable.
    if (ctx.path.includes(`${apiPrefix}/auth/refresh`)) {
      await this.expire()
      return null
    }
    const refreshed = await this.refreshSingleFlight()
    if (!refreshed) return null
    const token = await this.tokens.getAccessToken()
    if (token) ctx.headers['Authorization'] = `Bearer ${token}`
    return resend(ctx.headers)
  }

  /** Ensures concurrent 401s trigger exactly one refresh (Completer semantics). */
  private refreshSingleFlight(): Promise<boolean> {
    if (this.refreshing) return this.refreshing
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = await this.tokens.getRefreshToken()
    if (!refreshToken) {
      await this.expire()
      return false
    }
    try {
      const tokens = await this.refresh(refreshToken)
      if (!tokens) {
        await this.expire()
        return false
      }
      await this.tokens.saveTokens(tokens)
      return true
    } catch {
      await this.expire()
      return false
    }
  }

  private async expire(): Promise<void> {
    await this.tokens.clearTokens()
    await this.onTokenExpired?.()
  }
}
