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

// DEV default: point at the local test backend on the LAN so a phone on the
// same network can reach it. TODO: revert to 'http://localhost:58091' (or make
// it build-mode driven) before shipping.
const DEFAULT_BASE_URL = 'http://30.211.128.187:58091'

/**
 * Deployment mode, ported from the Flutter `AppConfig.deployMode`:
 * - `standalone` — front/back split; the login page shows the API-address field
 *   and the insecure-TLS toggle.
 * - `embedded`   — bundled with a same-origin backend; those controls are hidden.
 *
 * On Lynx there is no compile-time `--dart-define`, so this is a runtime field
 * defaulting to `standalone` (the dev/default posture). A future embedded build
 * can flip it during bootstrap.
 */
export type DeployMode = 'standalone' | 'embedded'

class AppConfigState {
  /** Identity base URL (what the user configured / the entry origin). */
  baseUrl: string = DEFAULT_BASE_URL

  /** Path prefix for embedded sub-path deploys; empty for standalone. */
  basePath: string = ''

  /** Deployment mode; drives which login-page controls are shown. */
  deployMode: DeployMode = 'standalone'

  /**
   * User opt-in to skip TLS certificate validation (self-signed servers).
   *
   * ⚠️ Currently persisted + surfaced only. The actual TLS relaxation is a
   * native/Web security-model concern (the Lynx `fetch` binding is undefined),
   * so toggling this is a **no-op at the transport layer** for now. See PROGRESS.
   */
  insecureTls: boolean = false

  private _resolvedBaseUrlOverride: string | null = null

  /** `true` when bundled with a same-origin backend (hides API-address UI). */
  get isEmbedded(): boolean {
    return this.deployMode === 'embedded'
  }

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
    this.deployMode = 'standalone'
    this.insecureTls = false
    this._resolvedBaseUrlOverride = null
  }
}

export const appConfig = new AppConfigState()
export type { AppConfigState }
