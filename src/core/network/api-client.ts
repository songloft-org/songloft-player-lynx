import { apiPrefix } from '../config/app-config.js'
import { getSongloftStorage } from '../storage/index.js'
import { safeParseAuthTokens, type AuthTokens } from '../../models/auth.js'
import { AuthInterceptor } from './auth-interceptor.js'
import {
  ApiError,
  HttpClient,
  createFetchTransport,
  type Transport,
} from './http-client.js'
import { TokenStore } from './token-store.js'

export interface ClientBaseOptions {
  /** Byte transport; defaults to `globalThis.fetch` (lazily resolved). */
  transport?: Transport
  getBaseUrl?: () => string
  getBasePath?: () => string
  defaultHeaders?: Record<string, string>
}

/**
 * A client with no auth interceptor — for login and other public calls
 * (Flutter `createPublicDio`).
 */
export function createPublicClient(options: ClientBaseOptions = {}): HttpClient {
  return new HttpClient({
    transport: options.transport ?? createFetchTransport(),
    getBaseUrl: options.getBaseUrl,
    getBasePath: options.getBasePath,
    defaultHeaders: options.defaultHeaders,
    interceptor: null,
  })
}

export interface ApiClientOptions extends ClientBaseOptions {
  /** Token store; defaults to one backed by the ambient `SongloftStorage`. */
  tokens?: TokenStore
  onTokenExpired?: () => void | Promise<void>
}

export interface ApiClientBundle {
  client: HttpClient
  tokens: TokenStore
  interceptor: AuthInterceptor
}

/**
 * Build the authenticated client + its token store + interceptor. The refresh
 * call goes through a separate public client so it never recurses through the
 * auth interceptor.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClientBundle {
  const transport = options.transport ?? createFetchTransport()
  const tokens = options.tokens ?? new TokenStore(getSongloftStorage().secure)

  const refreshClient = new HttpClient({
    transport,
    getBaseUrl: options.getBaseUrl,
    getBasePath: options.getBasePath,
    defaultHeaders: options.defaultHeaders,
    interceptor: null,
  })

  const interceptor = new AuthInterceptor({
    tokens,
    onTokenExpired: options.onTokenExpired,
    refresh: async (refreshToken): Promise<AuthTokens | null> => {
      const res = await refreshClient.post<unknown>(
        `${apiPrefix}/auth/refresh`,
        { refresh_token: refreshToken },
      )
      const parsed = safeParseAuthTokens(res.data)
      return parsed.success ? parsed.data : null
    },
  })

  const client = new HttpClient({
    transport,
    getBaseUrl: options.getBaseUrl,
    getBasePath: options.getBasePath,
    defaultHeaders: options.defaultHeaders,
    interceptor,
  })

  return { client, tokens, interceptor }
}

export { ApiError }
