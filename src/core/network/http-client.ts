import {
  connectTimeoutMs,
  defaultJsonHeaders,
  receiveTimeoutMs,
} from '../config/app-config.js'
import { appConfig } from '../config/app-config.js'

/**
 * Transport-agnostic HTTP layer.
 *
 * The actual byte transport is a `Transport` function injected into the client.
 * The default wraps `globalThis.fetch` — resolved **lazily** at call time so
 * merely importing this module never throws in a realm where `fetch` is not yet
 * bound (Lynx). When no `fetch` is available it throws a clear "待接 Lynx fetch"
 * error. Interceptors (auth / refresh) run against this abstraction, so the full
 * request/refresh/replay flow is unit-testable with a fake transport.
 */
export interface TransportRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export interface TransportResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>

type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: unknown },
) => Promise<{
  status: number
  headers: { forEach?: (cb: (value: string, key: string) => void) => void }
  text: () => Promise<string>
}>

/**
 * Default transport over `globalThis.fetch` (or an injected `fetch`). Resolves
 * `fetch` on each call; throws a clear error when it is missing.
 */
export function createFetchTransport(fetchImpl?: FetchLike): Transport {
  return async (req) => {
    const f = fetchImpl ?? (globalThis as { fetch?: FetchLike }).fetch
    if (typeof f !== 'function') {
      throw new Error(
        '[http] no fetch available — 待接 Lynx fetch（注入 Transport 或提供 globalThis.fetch）',
      )
    }
    const res = await f(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    })
    const headers: Record<string, string> = {}
    res.headers?.forEach?.((value, key) => {
      headers[key] = value
    })
    return { status: res.status, headers, body: await res.text() }
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly detail?: string
  readonly data?: unknown
  constructor(status: number, message: string, detail?: string, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.data = data
  }
}

/** A request context interceptors can read/mutate before it is sent. */
export interface RequestContext {
  /** Path relative to the base URL, e.g. `/api/v1/songs`. */
  path: string
  method: string
  headers: Record<string, string>
}

export interface HttpInterceptor {
  /** Runs before send; mutate `ctx.headers` (e.g. inject Authorization). */
  onRequest?(ctx: RequestContext): Promise<void> | void
  /**
   * Runs when a response has a non-2xx status. May recover by replaying via
   * `resend(headers)` and returning the replacement response, or return
   * `null`/`undefined` to let the original error surface.
   */
  onError?(
    ctx: RequestContext,
    response: TransportResponse,
    resend: (headers: Record<string, string>) => Promise<TransportResponse>,
  ): Promise<TransportResponse | null | undefined>
}

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  query?: Record<string, string | number | boolean | null | undefined>
  /** JSON-serialized unless already a string. */
  body?: unknown
  /** Skip the interceptor entirely (public requests). */
  skipInterceptor?: boolean
  /** Parse the response body as JSON (default true). */
  parseJson?: boolean
}

export interface HttpResult<T> {
  status: number
  ok: boolean
  data: T
  headers: Record<string, string>
}

export interface HttpClientOptions {
  transport: Transport
  /** Base URL provider; defaults to live `appConfig.resolvedBaseUrl`. */
  getBaseUrl?: () => string
  /** Base path prefix; defaults to live `appConfig.basePath`. */
  getBasePath?: () => string
  defaultHeaders?: Record<string, string>
  interceptor?: HttpInterceptor | null
  connectTimeoutMs?: number
  receiveTimeoutMs?: number
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export class HttpClient {
  private readonly transport: Transport
  private readonly getBaseUrl: () => string
  private readonly getBasePath: () => string
  private readonly defaultHeaders: Record<string, string>
  private readonly interceptor: HttpInterceptor | null
  readonly connectTimeoutMs: number
  readonly receiveTimeoutMs: number

  constructor(options: HttpClientOptions) {
    this.transport = options.transport
    this.getBaseUrl = options.getBaseUrl ?? (() => appConfig.resolvedBaseUrl)
    this.getBasePath = options.getBasePath ?? (() => appConfig.basePath)
    this.defaultHeaders = { ...defaultJsonHeaders, ...options.defaultHeaders }
    this.interceptor = options.interceptor ?? null
    this.connectTimeoutMs = options.connectTimeoutMs ?? connectTimeoutMs
    this.receiveTimeoutMs = options.receiveTimeoutMs ?? receiveTimeoutMs
  }

  private buildUrl(path: string, query: RequestOptions['query']): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path + buildQuery(query)
    }
    return `${this.getBaseUrl()}${this.getBasePath()}${path}${buildQuery(query)}`
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<HttpResult<T>> {
    const method = (options.method ?? 'GET').toUpperCase()
    const headers: Record<string, string> = { ...this.defaultHeaders, ...options.headers }

    let bodyStr: string | undefined
    if (options.body != null) {
      bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    }

    const ctx: RequestContext = { path, method, headers }
    const useInterceptor = this.interceptor && !options.skipInterceptor

    if (useInterceptor) await this.interceptor!.onRequest?.(ctx)

    const url = this.buildUrl(path, options.query)
    const send = (h: Record<string, string>): Promise<TransportResponse> =>
      this.transport({ url, method, headers: h, body: bodyStr })

    let res = await send(ctx.headers)

    if (res.status === 401 && useInterceptor && this.interceptor!.onError) {
      const recovered = await this.interceptor!.onError(ctx, res, send)
      if (recovered) res = recovered
    }

    return this.finalize<T>(res, options)
  }

  private finalize<T>(res: TransportResponse, options: RequestOptions): HttpResult<T> {
    const ok = res.status >= 200 && res.status < 300
    const parseJson = options.parseJson ?? true
    let data: unknown = res.body
    if (parseJson && res.body) {
      try {
        data = JSON.parse(res.body)
      } catch {
        data = res.body
      }
    }
    if (!ok) {
      const errObj = (data ?? {}) as { error?: string; detail?: string }
      const message =
        typeof data === 'object' && data && 'error' in data && errObj.error
          ? errObj.error
          : `HTTP ${res.status}`
      throw new ApiError(res.status, message, errObj.detail, data)
    }
    return { status: res.status, ok, data: data as T, headers: res.headers }
  }

  get<T = unknown>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'GET' })
  }
  post<T = unknown>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'POST', body })
  }
  put<T = unknown>(path: string, body?: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.request<T>(path, { ...options, method: 'PUT', body })
  }
  delete<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' })
  }
}
