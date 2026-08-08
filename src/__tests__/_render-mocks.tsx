/**
 * Shared render-test mock factories.
 *
 * Two things in the login screen depend on runtime facilities that the ReactLynx
 * Vitest testing-library environment does not implement, and both crash the
 * shared snapshot tree if left real:
 *
 *  1. **lynx-ui native leaves** (`Input`, `Switch`). `Input`'s mount effect calls
 *     the native `NodesRef.invoke` (`setValue`) which the env stubs as
 *     `"not implemented"` → throws; `Switch` drives the native gesture runtime.
 *     Mocked here to plain `<view>/<text>` so the page's own structure is still
 *     exercised. The real components ship in build/dev/on-device (proven on
 *     device in batch 1) and `pnpm run build` still bundles them.
 *
 *  2. **the zustand auth store subscription** (`useAuthStore((s) => …)`). zustand
 *     subscribes through `useSyncExternalStore`, whose post-mount consistency
 *     pass forces a second synchronous commit while the initial dual-thread
 *     lifecycle events are still flushing. In the Vitest env that second
 *     `updateMainThread` patch reads `isListHolder` off a snapshot whose
 *     `__snapshot_def` is still `undefined` → the `Cannot read properties of
 *     undefined (reading 'isListHolder' / 'parentNode')` crash. On device the
 *     real runtime sequences these commits correctly. `makeAuthStoreMock`
 *     replaces only `useAuthStore` with a static, non-subscribing reader
 *     (`status: 'unknown'` so the route guard never redirects); every other
 *     store export is preserved via the caller's `vi.importActual`.
 *
 * Usage keeps the `vi.mock` calls in each test file (they must be hoisted) but
 * shares the factory bodies so the mock shapes cannot drift:
 *
 *   vi.mock('@lynx-js/lynx-ui-input', async () =>
 *     (await import('<path>/_render-mocks.js')).mockLynxUiInput())
 *   vi.mock('@lynx-js/lynx-ui-switch', async () =>
 *     (await import('<path>/_render-mocks.js')).mockLynxUiSwitch())
 *   vi.mock('<store path>', async () => {
 *     const actual = await vi.importActual('<store path>')
 *     return (await import('<path>/_render-mocks.js')).makeAuthStoreMock(actual)
 *   })
 */
import type { AuthState } from '../features/auth/store/index.js'

/** Mock module for `@lynx-js/lynx-ui-input` — `Input` as a plain view/text. */
export function mockLynxUiInput() {
  return {
    Input: ({
      className,
      placeholder,
    }: {
      className?: string
      placeholder?: string
    }) => (
      <view className={className}>
        <text>{placeholder}</text>
      </view>
    ),
  }
}

/** Mock module for `@lynx-js/lynx-ui-switch` — passthrough views. */
export function mockLynxUiSwitch() {
  const Passthrough = ({
    className,
    children,
  }: {
    className?: string
    children?: unknown
  }) => <view className={className}>{children as never}</view>
  return {
    Switch: Passthrough,
    SwitchTrack: Passthrough,
    SwitchThumb: ({ className }: { className?: string }) => (
      <view className={className} />
    ),
  }
}

/**
 * Static auth state used by the mocked store. `status: 'unknown'` mirrors the
 * production store before `checkAuth()` runs, so `evaluateAuthGuard` allows both
 * `/login` and `/` — matching the render tests' existing assumptions.
 */
const authState: AuthState = {
  status: 'unknown',
  isLoading: false,
  error: undefined,
  hydrate: async () => {},
  checkAuth: async () => {},
  login: async () => {},
  logout: async () => {},
  reset: () => {},
}

/** Non-subscribing stand-in for the zustand `useAuthStore` hook + store api. */
function useAuthStoreMock<T>(selector?: (s: AuthState) => T): T | AuthState {
  return selector ? selector(authState) : authState
}
useAuthStoreMock.getState = (): AuthState => authState
useAuthStoreMock.setState = (): void => {}
useAuthStoreMock.subscribe = (): (() => void) => () => {}

/**
 * Merge a static `useAuthStore` over the real store module. Callers pass the
 * result of `vi.importActual(<store path>)` so `evaluateAuthGuard`, the
 * `PREF_*` keys, factories, etc. stay real.
 */
export function makeAuthStoreMock<M extends object>(actual: M): M {
  return { ...actual, useAuthStore: useAuthStoreMock } as unknown as M
}
