import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import {
  act,
  getQueriesForElement,
  render,
} from '@lynx-js/react/testing-library'
import { RouterProvider } from '@tanstack/react-router'

import { appConfig } from '../../../core/config/app-config.js'
import {
  createMemoryStorage,
  getSongloftStorage,
  setSongloftStorage,
} from '../../../core/storage/index.js'
import { createAppRouter } from '../../../router.js'
import { setMockAuthStatus } from '../../../__tests__/_render-mocks.js'
import { PREF_LAST_USERNAME, SECURE_LAST_PASSWORD } from '../store/index.js'

// The login screen depends on three facilities the ReactLynx Vitest env cannot
// run; all three are mocked to plain stand-ins here (shapes shared via
// `_render-mocks` so they cannot drift). See that file for the full rationale.
//
//  - lynx-ui `Input`: its mount effect calls native `NodesRef.invoke` → throws
//    "not implemented".
//  - lynx-ui `Switch`: drives the native gesture runtime.
//  - `useAuthStore` (zustand): subscribes via `useSyncExternalStore`, whose
//    post-mount consistency pass forces a second commit mid-lifecycle-flush and
//    trips the env's `isListHolder`/`parentNode` snapshot crash.
//
// The real components + store are used in build/dev/on-device.
vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
// Local stand-in for the shared `mockLynxUiInput`: this file additionally
// renders the controlled `value` as text tagged with the field `type`, so the
// remembered-password prefill (secure store → field) is observable and
// distinguishable from the username field — the shared stand-in drops `value`.
// (The username placeholder happens to also be "admin", so asserting on bare
// text cannot tell a prefilled password from that placeholder.)
vi.mock('@lynx-js/lynx-ui-input', () => ({
  Input: ({
    className,
    placeholder,
    value,
    type,
  }: {
    className?: string
    placeholder?: string
    value?: string
    type?: string
  }) => (
    <view className={className}>
      {placeholder ? <text>{placeholder}</text> : null}
      {value ? <text data-testid={`input-value-${type ?? 'text'}`}>{value}</text> : null}
    </view>
  ),
}))
vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)
// Batch 5: the router now eagerly imports the /player route → FullPlayerPage,
// which pulls in the lynx-ui gesture leaves (Slider/Sheet/Swiper) at module
// load. Rendering the login screen *through the router* therefore evaluates
// them; mock them (they corrupt the reconciler otherwise), same as Input/Switch.
vi.mock('@lynx-js/lynx-ui-slider', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSlider(),
)
vi.mock('@lynx-js/lynx-ui-swiper', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwiper(),
)
vi.mock('../store/index.js', async () => {
  const actual =
    await vi.importActual<typeof import('../store/index.js')>('../store/index.js')
  const { makeAuthStoreMock } = await import('../../../__tests__/_render-mocks.js')
  return makeAuthStoreMock(actual)
})
vi.mock('../../settings/store/server-store.js', () => ({
  useServerStore: (() => {
    function useServerStore<T>(selector?: (s: unknown) => T): T | unknown {
      return selector ? selector({}) : {}
    }
    useServerStore.getState = () => ({
      loadCredentialsForUrl: async () => null,
      rememberCredentials: async () => {},
    })
    useServerStore.setState = () => {}
    useServerStore.subscribe = () => () => {}
    return useServerStore
  })(),
}))
// The root route mounts the global `<ToastHost/>`, which subscribes to a zustand
// store (`useSyncExternalStore`) — the same crash class as the auth store above.
// Stand it in with a no-op; toast behaviour is covered by toast-store.test.ts.
vi.mock('../../../shared/ui/ToastHost.js', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockToastHost(),
)
// The root route also mounts `SongRowOverlays` (context menu + delete confirm):
// its zustand subscription is the same crash class, and the lynx-ui Dialog
// inside `ConfirmDialog` corrupts the reconciler like Input/Switch do.
// No-op here; behaviour is covered by song-list-row / song-row-overlays tests.
vi.mock('../../../shared/ui/SongRowOverlays.js', () => ({
  SongRowOverlays: () => null,
}))

/**
 * Login-page render smoke, reusing the batch-1 ReactLynx testing-library setup.
 * Rendered through the router at `/login` with auth pinned to
 * `unauthenticated`: since the splash gate, the root view holds the splash
 * while the status is `unknown` (the mock's default), so the login card only
 * mounts once auth has resolved to "no session".
 */

// Pin the storage singleton to the in-memory implementation: the ReactLynx
// vitest env exposes a partial `localStorage` stub (no `setItem`) that the
// capability probe would otherwise pick, and the remembered-password prefill
// below needs a real set/get round-trip (tests / DI contract of
// `setSongloftStorage`).
setSongloftStorage(createMemoryStorage())

async function renderLogin() {
  setMockAuthStatus('unauthenticated')
  const appRouter = createAppRouter(['/login'])
  await act(async () => {
    await appRouter.load()
  })
  render(<RouterProvider router={appRouter as never} />)
  await act(async () => {
    await Promise.resolve()
  })
  return { appRouter, ...getQueriesForElement(elementTree.root!) }
}

afterEach(async () => {
  appConfig.reset()
  setMockAuthStatus('unknown')
  // Drop the remembered credentials so tests stay order-independent.
  const storage = getSongloftStorage()
  try {
    await storage.secure.remove(SECURE_LAST_PASSWORD)
    await storage.prefs.remove(PREF_LAST_USERNAME)
  } catch {
    /* ignore */
  }
})

test('renders the login page with title, labels, agreement and login button', async () => {
  const { appRouter, queryByText, queryByTestId } = await renderLogin()
  expect(appRouter.state.location.pathname).toBe('/login')
  expect(queryByText('Songloft')).toBeInTheDocument()
  expect(queryByText('Sign in to continue')).toBeInTheDocument()
  expect(queryByText('Username')).toBeInTheDocument()
  expect(queryByText('Password')).toBeInTheDocument()
  expect(queryByText('Log in')).toBeInTheDocument()
  expect(queryByTestId('agreement-checkbox')).toBeInTheDocument()
  expect(queryByText('Terms of Service & Privacy Policy')).toBeInTheDocument()
})

/**
 * The username dev default (`devCredentials.username`) still prefills to keep
 * device testing typing-free, but the PASSWORD is never seeded with a dev
 * default (that was the "password reset to admin" bug). So a fresh install
 * shows the username but leaves the password empty, and the login button stays
 * disabled until a password is typed.
 *
 * This also guards the flicker fix indirectly: the username prefill has to
 * arrive through the async chain, and if someone removes that tail the button
 * would be disabled for the wrong reason.
 */
test('fresh install prefills the username but leaves the password empty', async () => {
  const { queryAllByTestId, queryByTestId } = await renderLogin()
  // username prefilled (dev default) → a text-typed input carries "admin" as its
  // value. apiUrl is also a text input, hence queryAll + a value check.
  const textValues = queryAllByTestId('input-value-text')
  expect(textValues.some((el) => el.textContent === 'admin')).toBe(true)
  // password never seeded with a dev default → empty, so submit is disabled
  expect(queryByTestId('input-value-password')).not.toBeInTheDocument()
  expect(queryByTestId('login-button')?.className).toContain(
    'login__button--disabled',
  )
})

test('standalone mode shows the API URL field + insecure-TLS toggle', async () => {
  appConfig.deployMode = 'standalone'
  const { queryByText } = await renderLogin()
  expect(queryByText('API base URL')).toBeInTheDocument()
  expect(queryByText('Allow insecure TLS')).toBeInTheDocument()
})

/**
 * A successful login remembers the password (secure store, `auth-store`); the
 * login form prefills it, so after sign-out the field holds the real password
 * — the "password got reset after logout" complaint. This is the ONLY source
 * that ever fills the password field.
 *
 * The button remains disabled because the agreement checkbox defaults to
 * unchecked — credentials alone are not sufficient.
 */
test('prefills the remembered password from secure storage', async () => {
  await getSongloftStorage().secure.set(SECURE_LAST_PASSWORD, 'saved-secret')
  const { queryByText, queryByTestId } = await renderLogin()
  expect(queryByText('saved-secret')).toBeInTheDocument()
  const button = queryByTestId('login-button')
  expect(button?.className).toContain('login__button--disabled')
})

/**
 * A returning user with **no** remembered password (the upgrade case: the
 * password is only recorded from the first login after that feature shipped)
 * must get an EMPTY password field. Prefilling `admin` there is a wrong
 * password that looks exactly like "my password got reset", and submitting it
 * spends a failed login on a misleading "invalid credentials".
 */
test('a returning user with no remembered password gets an empty password field', async () => {
  await getSongloftStorage().prefs.set(PREF_LAST_USERNAME, 'alice')
  const { queryByText, queryByTestId } = await renderLogin()
  expect(queryByText('alice')).toBeInTheDocument()
  // the password field (type='password') must be empty — no dev default sitting
  // in it. Its value text is tagged by field type so the username placeholder
  // (also "admin") cannot be mistaken for a prefilled password.
  expect(queryByTestId('input-value-password')).not.toBeInTheDocument()
  // and with an empty password `canSubmit` is false
  expect(queryByTestId('login-button')?.className).toContain(
    'login__button--disabled',
  )
})
