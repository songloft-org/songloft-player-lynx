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

import { readLynxGlobal } from '../../native/native-modules.js'

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

/** DEV default: the local test backend (see the rationale below). */
const DEV_BACKEND_URL = 'http://localhost:58091'

/**
 * The page origin as seen from the worker realm, or null off-web.
 *
 * In a web worker, `self.location.origin` still reports the page origin, which
 * IS the backend's own origin in an embedded deploy — so that deploy gets the
 * right default base URL with zero configuration. On Lynx native, `self` has
 * no `location` at all.
 */
function readWorkerOrigin(): string | null {
  try {
    const origin = (self as unknown as { location?: { origin?: string } }).location?.origin
    if (origin && origin !== 'null' && origin.startsWith('http')) return origin
  } catch {
    // self.location not available (Lynx native runtime)
  }
  return null
}

/**
 * `lynx.__globalProps` key the **web host page** populates with the deploy mode.
 * See `web/index.html` and `scripts/copy-bundle-web.mjs` — one bundle serves
 * both web deploys, so the page is the only party that knows which one it is.
 */
export const GLOBAL_PROP_DEPLOY_MODE = 'deployMode'

/** Read the host-tagged deploy mode; null when the host said nothing. */
function readHostDeployMode(): 'standalone' | 'embedded' | null {
  try {
    const raw = readLynxGlobal()?.__globalProps?.[GLOBAL_PROP_DEPLOY_MODE]
    if (raw === 'standalone' || raw === 'embedded') return raw
  } catch {
    // no Lynx global (unit tests) — callers fall through to probing
  }
  return null
}

/*
 * Standalone web deploys are tagged by the host page precisely because probing
 * cannot tell them from embedded ones: the worker realm has `self.location` in
 * BOTH, so "is this a browser?" says nothing about whether the API lives behind
 * the page origin. An untagged standalone (serve.mjs: a static server with no
 * backend and no /api proxy) therefore probes as embedded — which hides the
 * API-address field AND defaults the base URL to the static server's own
 * origin, leaving a fresh browser unable to log in at all.
 */
const HOST_DEPLOY_MODE = readHostDeployMode()
const ORIGIN_BASE_URL = readWorkerOrigin()

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
//
// On the Web platform the default is the page origin (the backend is
// same-origin there) for embedded deploys, and this dev backend for
// host-tagged standalone deploys — the static server's origin has no API
// behind it.
const DEFAULT_BASE_URL = HOST_DEPLOY_MODE === 'standalone'
  ? DEV_BACKEND_URL
  : (ORIGIN_BASE_URL ?? DEV_BACKEND_URL)

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
 * Note: set both to '' for embedded (bundled backend) builds.
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

/**
 * Resolve the default deploy mode for the current runtime.
 *
 * The host page's explicit tag (standalone web deploys) wins. Otherwise, on the
 * Web platform (detected via `self.location.origin`, which is available in the
 * worker realm and reports the page origin) the backend is presumed same-origin
 * — the API-address field and insecure-TLS toggle are hidden. On Lynx native,
 * the user may need to point at a different host, so the default is
 * `standalone` (server-address UI visible).
 */
function resolveDeployMode(): DeployMode {
  if (HOST_DEPLOY_MODE) return HOST_DEPLOY_MODE
  return ORIGIN_BASE_URL != null ? 'embedded' : 'standalone'
}

/**
 * Re-read the host's deploy-mode tag and apply it if it arrived late.
 *
 * The tag rides `lynx.__globalProps`, which the web host page sets on
 * `lynxviewready`; whether that lands before or after this module evaluates is
 * web-core's business, so `src/index.tsx` calls this once more before the first
 * render. Idempotent, and a no-op when the host said nothing (native hosts
 * never set the key).
 */
export function applyHostDeployMode(): void {
  const tagged = readHostDeployMode()
  if (tagged == null || tagged === appConfig.deployMode) return
  appConfig.deployMode = tagged
  // `readWorkerOrigin()` live rather than the module constant: same value by
  // definition (the page origin never changes), but it keeps the branch testable
  // — the constant is fixed at module load, before any test can stage a `self`.
  if (tagged === 'standalone' && appConfig.baseUrl === readWorkerOrigin()) {
    // The origin default here is the static server's own origin — no backend
    // lives behind it. Swap to the dev backend default; a persisted server URL
    // (applied later by the auth hydrate) still wins.
    appConfig.baseUrl = DEV_BACKEND_URL
  }
}

class AppConfigState {
  /** Identity base URL (what the user configured / the entry origin). */
  baseUrl: string = DEFAULT_BASE_URL

  /** Path prefix for embedded sub-path deploys; empty for standalone. */
  basePath: string = ''

  /** Deployment mode; drives which login-page controls are shown. */
  deployMode: DeployMode = resolveDeployMode()

  /**
   * User opt-in to skip TLS certificate validation (self-signed servers).
   *
   * Writing this field is **not** enough — the transport lives in the hosts, so
   * every write must be paired with `applyInsecureTls()`
   * (`native/native-platform.ts`), which forwards to
   * `SongloftPlatform.setInsecureTls`. Four sites do this today: the auth store's
   * `hydrate` + `login`, `applyServerSettings`, and the server-profile switch.
   * Two of them used to forget, leaving the hosts on a stale flag.
   *
   * On Web this is inert: the browser owns certificate trust and no page-level
   * API can relax it.
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
    this.deployMode = resolveDeployMode()
    this.insecureTls = false
    this._resolvedBaseUrlOverride = null
  }
}

export const appConfig = new AppConfigState()
export type { AppConfigState }
