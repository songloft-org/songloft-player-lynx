import {
  QueryClient,
  focusManager,
  onlineManager,
  type QueryClientConfig,
} from '@tanstack/query-core'

/**
 * TanStack Query, made safe for the Lynx no-DOM runtime.
 *
 * Investigation (query-core 5.101.x, the version bundled here): both
 * `focusManager` and `onlineManager` only touch `window` behind
 * `typeof window !== "undefined"` guards and read `globalThis.document?.…` via
 * optional chaining — so import, `new QueryClient()`, running a query and
 * invalidating never dereference a bare `window`/`document`/`self`/`navigator`.
 * Timers go through `timeoutManager`'s injectable provider (default wraps the
 * ambient `setTimeout`, which Lynx BTS provides). No pnpm patch is required.
 *
 * We still install explicit no-op managers so intent is defensive and obvious:
 * - `focusManager` never subscribes to a (non-existent) visibility source;
 * - `onlineManager` is pinned online (Lynx has no `online`/`offline` events),
 *   so queries are never paused waiting for a network-status signal.
 *
 * Additionally, query-core's `query.js` constructs `new AbortController()`
 * **unconditionally** per fetch (for query cancellation). `AbortController` is a
 * WHATWG API, not part of ECMAScript, and may be absent on the Lynx engine — an
 * unguarded `ReferenceError` that would crash every query. We install a minimal
 * `globalThis.AbortController` polyfill only when one is missing (real Lynx that
 * ships it is left untouched).
 *
 * `configureQueryGlobals()` is idempotent and must run before the first query.
 */
let configured = false

export function configureQueryGlobals(): void {
  if (configured) return
  configured = true
  ensureAbortController()
  // No visibility source on Lynx: install a setup that registers no listener
  // and returns a no-op cleanup.
  focusManager.setEventListener(() => () => {})
  // Pin online and register no online/offline listener.
  onlineManager.setOnline(true)
  onlineManager.setEventListener(() => () => {})
}

/** Minimal `AbortController`/`AbortSignal` polyfill for engines without it. */
function ensureAbortController(): void {
  const g = globalThis as { AbortController?: unknown }
  if (typeof g.AbortController !== 'undefined') return

  class PolyfillAbortSignal {
    aborted = false
    reason: unknown = undefined
    private listeners = new Set<(ev: unknown) => void>()
    addEventListener(_type: string, cb: (ev: unknown) => void): void {
      this.listeners.add(cb)
    }
    removeEventListener(_type: string, cb: (ev: unknown) => void): void {
      this.listeners.delete(cb)
    }
    throwIfAborted(): void {
      if (this.aborted) throw this.reason
    }
    _abort(reason: unknown): void {
      if (this.aborted) return
      this.aborted = true
      this.reason = reason
      for (const cb of this.listeners) cb({ type: 'abort' })
    }
  }

  class PolyfillAbortController {
    readonly signal = new PolyfillAbortSignal()
    abort(reason?: unknown): void {
      this.signal._abort(reason)
    }
  }

  g.AbortController = PolyfillAbortController
  const gs = globalThis as { AbortSignal?: unknown }
  if (typeof gs.AbortSignal === 'undefined') gs.AbortSignal = PolyfillAbortSignal
}

/** Sensible defaults for a self-hosted music server client. */
export const defaultQueryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      // The server is a LAN / self-hosted backend; avoid noisy refetches.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
}

export function createQueryClient(config: QueryClientConfig = defaultQueryClientConfig): QueryClient {
  configureQueryGlobals()
  return new QueryClient(config)
}

let singleton: QueryClient | null = null

/** Process-wide QueryClient singleton (created on first access). */
export function getQueryClient(): QueryClient {
  if (!singleton) singleton = createQueryClient()
  return singleton
}
