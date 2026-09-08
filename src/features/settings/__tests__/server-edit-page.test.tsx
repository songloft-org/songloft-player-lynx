import '../../../shims/router-env.js'
import '@testing-library/jest-dom'

import { afterEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { installBackRouter } from '../../../__tests__/_render-mocks.js'

import type { ServerProfile } from '../../../models/server-profile.js'
import type { ServerStoreState } from '../store/server-store.js'

/**
 * How the server form gets back to the server list, and where it reads "which
 * profile" from.
 *
 * Two entry shapes, one component:
 * - **route** (narrow screen) — the id comes from the `$id` param and back is a
 *   route navigation, resolved through `shared/nav/route-back.ts` so there is no
 *   second copy of the parent declaration;
 * - **pane** (wide screen) — there is no route, so the id arrives as a prop and
 *   back is an in-pane swap. Routing back would unmount the whole master–detail
 *   page and drop the settings list.
 *
 * Reverse-verified: dropping the `onBack` prop from `<SubPageShell>` makes the pane
 * test fail (the shell hides its arrow when embedded without an explicit `onBack`,
 * so `server-edit-back` is not in the tree at all).
 */

const PROFILE: ServerProfile = {
  id: 'srv_other',
  name: 'LAN',
  url: 'https://lan:8443',
  insecureTls: true,
  lastUsed: undefined,
}

const { navigateSpy, paramsRef } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  paramsRef: { current: {} as { id?: string } },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateSpy,
  useParams: () => paramsRef.current,
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
// Not the shared `mockLynxUiInput`: it renders only the placeholder, and the seeded
// `value` is exactly what the last test asserts.
vi.mock('@lynx-js/lynx-ui-input', () => ({
  Input: ({ className, value, placeholder }: {
    className?: string
    value?: string
    placeholder?: string
  }) => (
    <view className={className}><text>{value || placeholder}</text></view>
  ),
}))

vi.mock('../store/server-store.js', () => {
  const state = {
    profiles: [PROFILE],
    activeProfileId: 'srv_active',
  } as unknown as ServerStoreState

  function useServerStore<T>(selector?: (s: ServerStoreState) => T): T | ServerStoreState {
    return selector ? selector(state) : state
  }
  useServerStore.getState = (): ServerStoreState => state
  useServerStore.setState = (): void => {}
  useServerStore.subscribe = (): (() => void) => () => {}

  return { useServerStore }
})

const { ServerEditPage } = await import('../pages/ServerEditPage.js')
const { SubPageEmbedContext } = await import('../widgets/SubPageShell.js')
const { resetBackRouterForTests } = await import('../../../core/navigation/route-back-action.js')

afterEach(() => {
  paramsRef.current = {}
  resetBackRouterForTests()
  vi.clearAllMocks()
})

test('as a route, back returns to the server list', async () => {
  // Not `/settings`: the form is reached from the list, so returning to the settings
  // root would skip a level. Asserted through the real route-back policy, so a wrong
  // parent declaration fails here too.
  paramsRef.current = { id: PROFILE.id }
  const navigate = installBackRouter(`/settings/servers/edit/${PROFILE.id}`)
  render(<ServerEditPage />)
  const { getByTestId } = getQueriesForElement(elementTree.root!)

  await act(async () => { fireEvent.tap(getByTestId('server-edit-back')) })

  expect(navigate).toHaveBeenCalledWith({ to: '/settings/servers' })
})

test('inside the settings pane, back defers to onBack instead of routing', async () => {
  const onBack = vi.fn()
  // Installed so "did not route" is a real assertion: the shell's fallback goes
  // through `performRouteBack`, which navigates via the *back router* — not the
  // `useNavigate` spy. Without this, asserting on `navigateSpy` alone would pass
  // even if the arrow routed away and dropped the settings list.
  const navigate = installBackRouter('/settings/servers/add')
  render(
    <SubPageEmbedContext.Provider value={true}>
      <ServerEditPage editId={PROFILE.id} onBack={onBack} />
    </SubPageEmbedContext.Provider>,
  )
  const { getByTestId } = getQueriesForElement(elementTree.root!)

  await act(async () => { fireEvent.tap(getByTestId('server-edit-back')) })

  expect(onBack).toHaveBeenCalledTimes(1)
  expect(navigate).not.toHaveBeenCalled()
  expect(navigateSpy).not.toHaveBeenCalled()
})

test('the pane passes the profile as a prop, where there are no route params', () => {
  // `useParams` is empty in the pane (the router is still on `/settings`), so a
  // params-only read would show the "add" form under an "edit" title.
  paramsRef.current = {}
  const { container } = render(<ServerEditPage editId={PROFILE.id} onBack={vi.fn()} />)
  const text = (container as unknown as { textContent: string }).textContent ?? ''

  expect(text).toContain(PROFILE.name)
  expect(text).toContain(PROFILE.url)
})
