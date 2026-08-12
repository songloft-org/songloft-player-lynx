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

// DEV default: the local test backend. `localhost` is the right default for
// BOTH emulator/simulator targets, so this must not be a LAN IP:
//   - iOS Simulator shares the host's network stack — its `localhost` IS the
//     host machine, nothing to set up.
//   - Android emulator: `adb reverse tcp:58091 tcp:58091` forwards the device's
//     localhost to the host (the workflow AGENTS.md §5 prescribes).
// A hard-coded LAN IP rots the moment the host's address changes, and it fails
// confusingly: the UI just shows "Could not load …" with no hint that the
// address is stale. That is exactly what a stale `30.211.129.24` cost batch 29
// at the start of its device pass. A real phone (not an emulator) still needs
// the host's LAN IP — enter it on the login page, which persists it to prefs
// and overrides this default.
const DEFAULT_BASE_URL = 'http://localhost:58091'

/**
 * DEV convenience: credentials prefilled into the login form so device testing
 * does not require typing on a phone keyboard. Same posture (and same cleanup
 * obligation) as `DEFAULT_BASE_URL` above — both are the dev-only defaults to
 * strip before shipping.
 *
 * ⚠️ **Consume these through the async prefill chain, never as a `useState`
 * initial value for the username.** A hard-coded initial value plus the
 * persisted-username read that follows it means the controlled lynx-ui `Input`
 * receives two different `value` props during startup, and each one costs a
 * native `setValue` round-trip (with a main-thread readonly lock/unlock). On
 * device, with several native storage reads already contending for the JSB
 * queue, that double write is what made the password field and login button
 * visibly flicker — see the batch-11 entry in PROGRESS. Keeping the default at
 * the tail of the existing async read keeps it at exactly one write.
 *
 * TODO: set both to '' before shipping.
 */
// Explicitly typed as `string` (not `as const`): a literal type here would make
// `useState(devCredentials.password)` infer `useState<'admin'>` and reject the
// user's own input in `setPassword`.
export const devCredentials: { username: string; password: string } = {
  username: 'admin',
  password: 'admin',
}

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
