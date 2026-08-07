/**
 * Runtime app configuration, ported from the Flutter `AppConfig`.
 *
 * On the Lynx client the desktop/STUN two-layer base-url split is collapsed:
 * `resolvedBaseUrl` defaults to `baseUrl` (no 302 redirect resolution). The
 * setter is kept so a future embedded/redirect flow can override it, but the
 * default path never needs it.
 *
 * This is a mutable singleton (like the Flutter static class) so non-reactive
 * consumers (e.g. `UrlHelper`) can read the current base synchronously. Reactive
 * client state (current server identity, etc.) lives in the Zustand store.
 */

/** API path prefix, e.g. `/api/v1`. */
export const apiPrefix = '/api/v1'

/** Connect timeout (ms). */
export const connectTimeoutMs = 10_000

/** Receive/response timeout (ms). */
export const receiveTimeoutMs = 15_000

/** Default JSON headers applied to every request. */
export const defaultJsonHeaders: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

const DEFAULT_BASE_URL = 'http://localhost:58091'

class AppConfigState {
  /** Identity base URL (what the user configured / the entry origin). */
  baseUrl: string = DEFAULT_BASE_URL

  /** Path prefix for embedded sub-path deploys; empty for standalone. */
  basePath: string = ''

  private _resolvedBaseUrlOverride: string | null = null

  /**
   * The base URL network requests actually hit. Falls back to `baseUrl`; on
   * Lynx the two are collapsed unless something explicitly overrides it.
   */
  get resolvedBaseUrl(): string {
    return this._resolvedBaseUrlOverride ?? this.baseUrl
  }
  set resolvedBaseUrl(value: string) {
    this._resolvedBaseUrlOverride = value
  }

  get apiBaseUrl(): string {
    return `${this.baseUrl}${apiPrefix}`
  }

  /** Reset to defaults (test hook). */
  reset(): void {
    this.baseUrl = DEFAULT_BASE_URL
    this.basePath = ''
    this._resolvedBaseUrlOverride = null
  }
}

export const appConfig = new AppConfigState()
export type { AppConfigState }
