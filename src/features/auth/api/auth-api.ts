import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import {
  parseAuthTokens,
  parseTokenInfo,
  type AuthTokens,
  type TokenInfo,
} from '../../../models/auth.js'

/**
 * Auth API service, ported from the Flutter `AuthApi`
 * (`features/auth/data/auth_api.dart`). It wraps a batch-2 `HttpClient` and
 * parses every response through the batch-2 zod models.
 *
 * The client is injected so the caller controls the interceptor policy:
 * - **login** is a public call — the auth store constructs `AuthApi` over a
 *   `createPublicClient()` instance (no `AuthInterceptor`).
 * - **token management** (`getTokens` / `getToken` / `revokeToken`) needs the
 *   authenticated client (batch 4/5 wiring).
 *
 * `refresh` is intentionally **omitted**: token refresh is already owned by
 * `AuthInterceptor` (batch 2, `POST /auth/refresh` via the api-client's
 * dedicated refresh client). Re-implementing it here would duplicate that flow.
 */
export interface LoginParams {
  username: string
  password: string
}

export interface TokenListPage {
  tokens: TokenInfo[]
  total: number
}

export class AuthApi {
  constructor(private readonly client: HttpClient) {}

  /** `POST /auth/login` → `AuthTokens`. Skips the interceptor (public call). */
  async login({ username, password }: LoginParams): Promise<AuthTokens> {
    const res = await this.client.post<unknown>(
      `${apiPrefix}/auth/login`,
      { username, password },
      { skipInterceptor: true },
    )
    return parseAuthTokens(res.data)
  }

  /**
   * `POST /auth/logout` — best-effort server-side revoke.
   *
   * The local sign-out clears the token cache first, so the interceptor can no
   * longer attach `Authorization`; the caller captures the access token before
   * clearing and passes it here so it is written directly onto the request,
   * bypassing the interceptor timing (mirrors the Flutter `AuthApi.logout`).
   */
  async logout(accessToken?: string): Promise<void> {
    const headers =
      accessToken && accessToken.length > 0
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined
    await this.client.post<unknown>(`${apiPrefix}/auth/logout`, undefined, {
      skipInterceptor: true,
      headers,
    })
  }

  /** `GET /auth/tokens?limit&offset` → list of `TokenInfo` + total. */
  async getTokens({ limit = 20, offset = 0 } = {}): Promise<TokenListPage> {
    const res = await this.client.get<unknown>(`${apiPrefix}/auth/tokens`, {
      query: { limit, offset },
    })
    const body = (res.data ?? {}) as { tokens?: unknown[]; total?: number }
    const list = Array.isArray(body.tokens) ? body.tokens : []
    const tokens = list.map((t) => parseTokenInfo(t))
    return { tokens, total: body.total ?? tokens.length }
  }

  /** `GET /auth/tokens/{id}` → `TokenInfo`. */
  async getToken(tokenId: string): Promise<TokenInfo> {
    const res = await this.client.get<unknown>(
      `${apiPrefix}/auth/tokens/${encodeURIComponent(tokenId)}`,
    )
    return parseTokenInfo(res.data)
  }

  /** `DELETE /auth/tokens/{id}` — revoke a single token. */
  async revokeToken(tokenId: string): Promise<void> {
    await this.client.delete<unknown>(
      `${apiPrefix}/auth/tokens/${encodeURIComponent(tokenId)}`,
    )
  }
}
