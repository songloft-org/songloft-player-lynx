import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import type { ReactNode } from '@lynx-js/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { installBackRouter } from '../../../__tests__/_render-mocks.js'

import type { RegistryPluginEntry } from '../../../models/jsplugin.js'

/**
 * The registry (plugin store) is a drill-in reached from the plugin manager.
 *
 * The navigation seam tests pin the back affordance (route vs pane swap); the
 * rest pin the Flutter-parity behaviour: the four action states (install /
 * update-to / REINSTALL chip / overwrite), the conflict confirmation dialog,
 * in-place row updates after a successful install, the source picker, and the
 * source management dialog.
 */
const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  registries: [] as Array<{ url: string; name?: string; token?: string; enabled?: boolean }>,
  refreshRegistry: vi.fn(async (_params: { page?: number } = {}) => ({
    plugins: [] as RegistryPluginEntry[],
    total: 0,
    page: 1,
    pageSize: 20,
    warnings: [] as string[],
  })),
  install: vi.fn(),
  installAsync: vi.fn(async () => ({})),
  updateRegistries: vi.fn(async (_registries: Array<{ url: string }>) => {}),
  /** Each tap on a mocked Input field shifts the next value into onInput. */
  inputScript: [] as string[],
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@lynx-js/lynx-ui-input', () => ({
  // A field that answers taps with the scripted onInput values — the shared
  // mock drops `value`/`onInput` entirely, which the manage dialog's form needs.
  Input: ({
    className,
    placeholder,
    onInput,
  }: {
    className?: string
    placeholder?: string
    onInput?: (v: string) => void
  }) => (
    <view
      className={className}
      data-testid={`input-${placeholder ?? ''}`}
      bindtap={() => {
        if (h.inputScript.length > 0) onInput?.(h.inputScript.shift()!)
      }}
    >
      <text>{placeholder}</text>
    </view>
  ),
}))

vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }))

// lynx-ui Dialog keeps its tree mounted while the panel animates out; the stub
// marks the hidden state the same way the manager page's tests do.
vi.mock('@lynx-js/lynx-ui-dialog', () => ({
  DialogRoot: ({ children, show }: { children: ReactNode; show: boolean }) =>
    <view data-testid='stub-dialogroot' data-dialoghidden={show ? 'false' : 'true'}>{children}</view>,
  DialogView: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogBackdrop: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogContent: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogClose: ({ children }: { children: ReactNode }) => <view>{children}</view>,
}))

vi.mock('../data/jsplugin-query.js', () => ({
  useGithubProxyQuery: () => ({ data: '' }),
  useRegistryIconQuery: () => ({ data: undefined }),
}))

vi.mock('../api/index.js', () => ({
  getJSPluginApi: () => ({
    refreshRegistry: h.refreshRegistry,
    getPluginRegistries: vi.fn(async () => h.registries),
    updatePluginRegistries: h.updateRegistries,
  }),
}))

vi.mock('../data/jsplugin-mutations.js', () => ({
  useInstallFromRegistryMutation: () => ({ mutate: h.install, mutateAsync: h.installAsync }),
}))

const { PluginRegistryPage } = await import('../pages/PluginRegistryPage.js')

function makeEntry(over: Partial<RegistryPluginEntry> = {}): RegistryPluginEntry {
  return {
    name: '洛雪音源',
    entryPath: 'lx',
    version: '1.0.0',
    description: undefined,
    author: 'LX Team',
    homepage: undefined,
    icon: undefined,
    downloadUrl: 'https://example.com/lx.zip',
    installed: false,
    installedVersion: undefined,
    hasUpdate: false,
    sourceUrl: undefined,
    sourceName: undefined,
    identity: undefined,
    conflict: false,
    conflictWith: undefined,
    ...over,
  } as RegistryPluginEntry
}

/** A default source list so the page boots into the listing, not the empty state. */
const DEFAULT_REGISTRIES = [{ url: 'https://official/registry.json', name: 'Official', enabled: true }]

beforeEach(() => {
  h.registries = [...DEFAULT_REGISTRIES]
  h.refreshRegistry.mockImplementation(async () => ({
    plugins: [makeEntry()],
    total: 1,
    page: 1,
    pageSize: 20,
    warnings: [],
  }))
})

afterEach(() => vi.clearAllMocks())

async function renderPage(props: { onBack?: () => void } = {}) {
  render(<PluginRegistryPage {...props} />)
  // Flush the registries load, the first listing fetch it triggers, and the
  // row render that follows — three chained async layers of state updates.
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders the store header and fetches on mount', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('registry-back')).toBeInTheDocument()
  expect(h.refreshRegistry).toHaveBeenCalledWith(
    expect.objectContaining({ allSources: true, page: 1 }),
  )
})

test('the back button routes when the page is standalone', async () => {
  const navigate = installBackRouter('/settings/plugins/registry')
  const { getByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('registry-back')!)
  })

  expect(navigate).toHaveBeenCalledWith({ to: '/settings/plugins' })
})

test('the back button defers to onBack inside the settings pane', async () => {
  const onBack = vi.fn()
  const { getByTestId } = await renderPage({ onBack })

  await act(async () => {
    fireEvent.tap(getByTestId('registry-back')!)
  })

  expect(onBack).toHaveBeenCalledTimes(1)
  expect(h.navigate).not.toHaveBeenCalled()
})

test('installed & current shows the version chip, and tapping it reinstalls', async () => {
  // The feature the port was missing: Flutter turns "installed, no update"
  // into a v{version} chip that re-downloads on tap. A badge with no action
  // is the regression this pins out.
  h.refreshRegistry.mockResolvedValueOnce({
    plugins: [makeEntry({ installed: true, installedVersion: '0.9.0' })],
    total: 1,
    page: 1,
    pageSize: 20,
    warnings: [],
  })
  const { getByTestId } = await renderPage()

  const chip = getByTestId('registry-reinstall-lx')
  expect(chip.textContent).toContain('0.9.0')

  await act(async () => {
    fireEvent.tap(chip)
  })

  expect(h.install).toHaveBeenCalledWith(
    expect.objectContaining({ downloadUrl: 'https://example.com/lx.zip', overwrite: false }),
    expect.anything(),
  )
})

test('installed with a remote update offers 更新至 v{version}', async () => {
  h.refreshRegistry.mockResolvedValueOnce({
    plugins: [makeEntry({ installed: true, installedVersion: '1.0.0', hasUpdate: true })],
    total: 1,
    page: 1,
    pageSize: 20,
    warnings: [],
  })
  const { getByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('registry-update-lx'))
  })

  expect(h.install).toHaveBeenCalledWith(
    expect.objectContaining({ downloadUrl: 'https://example.com/lx.zip' }),
    expect.anything(),
  )
})

test('a conflict asks for confirmation, then installs with overwrite', async () => {
  h.refreshRegistry.mockResolvedValueOnce({
    plugins: [makeEntry({ conflict: true, conflictWith: '智能音箱 v1.0' })],
    total: 1,
    page: 1,
    pageSize: 20,
    warnings: [],
  })
  const { getByTestId, queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('registry-install-lx'))
  })
  // Asks first, and names the plugin being replaced.
  expect(h.install).not.toHaveBeenCalled()
  const dialog = queryByTestId('registry-conflict-dialog')
  expect(dialog?.textContent).toContain('智能音箱 v1.0')

  await act(async () => {
    fireEvent.tap(getByTestId('registry-conflict-confirm'))
  })

  expect(h.install).toHaveBeenCalledWith(
    expect.objectContaining({ overwrite: true }),
    expect.anything(),
  )
})

test('a successful install updates the row in place', async () => {
  // markInstalled: the tapped entry flips to installed; a same-entryPath
  // neighbour from another author flips to conflict (#339).
  h.refreshRegistry.mockResolvedValueOnce({
    plugins: [
      makeEntry({ identity: 'lx-team' }),
      makeEntry({ name: '假洛雪', identity: 'someone-else' }),
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    warnings: [],
  })
  const { getByTestId, queryByTestId, getAllByTestId } = await renderPage()

  h.install.mockImplementationOnce((_params: unknown, opts: {
    onSuccess: (r: unknown) => void
    onSettled: () => void
  }) => {
    opts.onSuccess({ total: 1, success: 1, failed: 0, message: 'ok', results: [] })
    opts.onSettled()
  })
  // Both rows share the entryPath, so the install testid appears twice — tap
  // the first (the entry whose identity will match).
  await act(async () => {
    fireEvent.tap(getAllByTestId('registry-install-lx')[0]!)
  })

  // No refetch: the row itself became the reinstall chip.
  expect(h.refreshRegistry).toHaveBeenCalledTimes(1)
  expect(queryByTestId('registry-reinstall-lx')).toBeInTheDocument()
})

test('picking a source refetches with that url and token', async () => {
  h.registries = [
    ...DEFAULT_REGISTRIES,
    { url: 'https://private/registry.json', name: 'Private', token: 'sekrit', enabled: true },
  ]
  const { getByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('registry-source-btn'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-https://private/registry.json'))
  })

  expect(h.refreshRegistry).toHaveBeenLastCalledWith(
    expect.objectContaining({
      allSources: false,
      registryUrl: 'https://private/registry.json',
      token: 'sekrit',
    }),
  )
})

test('the refresh button forces, loading more does not', async () => {
  // Two pages worth of entries so there is a next page to load. The mock
  // echoes the requested page so the append accumulates realistically.
  h.refreshRegistry.mockImplementation(async (params: { page?: number } = {}) => ({
    plugins: [makeEntry({ entryPath: `lx-p${params.page ?? 1}` })],
    total: 30,
    page: params.page ?? 1,
    pageSize: 20,
    warnings: [],
  }))
  const { getByTestId } = await renderPage()
  expect(h.refreshRegistry).toHaveBeenCalledTimes(1)

  await act(async () => {
    fireEvent.tap(getByTestId('registry-force-refresh'))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
  // Force-refresh reloads from page 1 with force.
  expect(h.refreshRegistry).toHaveBeenLastCalledWith(
    expect.objectContaining({ force: true, page: 1 }),
  )

  await act(async () => {
    // `fireEvent.scrolltolower` rejects `scroll-view` (a registered custom
    // element, not `HTMLUnknownElement`), so dispatch the same DOM event the
    // renderer listens for directly on the node — the path `fireEvent` would
    // take past its own `getElement` guard.
    getByTestId('registry-scroll').dispatchEvent(
      new Event('bindEvent:scrolltolower', { bubbles: true }),
    )
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
  // Scrolling to the bottom loads the next page — advances page, not forced.
  expect(h.refreshRegistry).toHaveBeenLastCalledWith(
    expect.objectContaining({ page: 2 }),
  )
  expect(h.refreshRegistry).toHaveBeenLastCalledWith(
    expect.not.objectContaining({ force: true }),
  )
})

test('warnings from a partial fetch surface as a banner with details', async () => {
  h.refreshRegistry.mockResolvedValueOnce({
    plugins: [makeEntry()],
    total: 1,
    page: 1,
    pageSize: 20,
    warnings: ['source A unreachable', 'source B returned garbage'],
  })
  const { getByTestId, queryByTestId } = await renderPage()

  const banner = getByTestId('registry-warnings')
  expect(banner.textContent).toContain('2')

  await act(async () => {
    fireEvent.tap(banner)
  })
  const dialog = queryByTestId('registry-warnings-dialog')
  expect(dialog?.textContent).toContain('source A unreachable')
})

test('the manage dialog adds a source and saves the list', async () => {
  const { getByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('registry-manage-btn'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('registry-manage-add'))
  })

  // The form's URL field is first in the tab order; tapping it feeds the
  // scripted value into onInput.
  h.inputScript = ['https://new/registry.json']
  await act(async () => {
    fireEvent.tap(getByTestId('input-https://example.com/registry.json'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('registry-manage-form-save'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('registry-manage-save'))
  })

  expect(h.updateRegistries).toHaveBeenCalledTimes(1)
  const saved = h.updateRegistries.mock.calls[0]![0] as Array<{ url: string }>
  expect(saved.some((r) => r.url === 'https://new/registry.json')).toBe(true)
})

test('no sources configured shows the empty state with its add button', async () => {
  h.registries = []
  const { getByTestId, queryByTestId } = await renderPage()

  expect(queryByTestId('registry-no-sources')).toBeInTheDocument()
  expect(queryByTestId('registry-empty')).not.toBeInTheDocument()

  await act(async () => {
    fireEvent.tap(getByTestId('registry-add-source'))
  })
  expect(queryByTestId('registry-manage-dialog')).toBeInTheDocument()
})
