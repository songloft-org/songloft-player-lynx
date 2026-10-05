import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import type { ReactNode } from '@lynx-js/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { JSPlugin } from '../../../models/jsplugin.js'

/**
 * Uninstalling asks first.
 *
 * It used to be a two-tap confirm on the 16px `×`, whose only armed-state feedback
 * was the glyph turning red — which read as "one tap deletes" and was reported as
 * having no confirmation at all. These pin the dialog: the first tap must not
 * delete anything, and the name of the plugin about to go must be on screen.
 */
const h = vi.hoisted(() => ({
  plugins: [] as unknown[],
  keepAlive: [] as string[],
  pending: { toggle: false, delete: false, update: false },
  toggle: vi.fn(),
  del: vi.fn(),
  updateAll: vi.fn(),
  setKeepAlive: vi.fn(),
  forceUpdate: vi.fn(),
  updatePluginAsync: vi.fn(async () => {}),
  updateAllAsync: vi.fn(async () => ({
    total: 2,
    updated: 1,
    failed: 1,
    skipped: 0,
    message: '',
    results: [
      { pluginId: 1, pluginName: 'LX Source', entryPath: 'lx', success: true, hasUpdate: true, currentVersion: '1.0', newVersion: '1.1', error: undefined },
      { pluginId: 2, pluginName: 'Speaker', entryPath: 'spk', success: false, hasUpdate: false, currentVersion: '0.9', newVersion: '', error: 'network' },
    ],
  })),
  setAutoUpdate: vi.fn(),
  cleanup: vi.fn(async () => 'cleaned 3 entries'),
  checkUpdate: vi.fn(async () => ({
    hasUpdate: true,
    currentVersion: '1.0.0',
    remoteVersion: '1.1.0',
    downloadUrl: '',
  })),
  refetch: vi.fn(),
  navigate: vi.fn(),
  openURL: vi.fn(),
  pickAndUpload: vi.fn(async () => 'ok'),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }))

vi.mock('../data/jsplugin-query.js', () => ({
  usePluginsQuery: () => ({
    data: { plugins: h.plugins },
    isLoading: false,
    isError: false,
    refetch: h.refetch,
  }),
  usePluginKeepAliveQuery: () => ({ data: h.keepAlive }),
  useGithubProxyQuery: () => ({ data: '' }),
  usePluginAutoUpdateQuery: () => ({ data: false, isLoading: false }),
  // PluginAvatar fetches icon markup through this; no icon in the fixtures, and
  // `enabled` would be false anyway — a stub returning nothing is enough.
  usePluginIconQuery: () => ({ data: undefined }),
}))

vi.mock('../api/index.js', () => ({
  // Only the pieces the page/dialogs actually call in these tests; the upload
  // URL is inert because pickAndUpload is itself mocked.
  getJSPluginApi: () => ({
    getUploadUrl: () => 'http://server/api/v1/jsplugins/upload',
    checkUpdate: h.checkUpdate,
    cleanupOrphanStorage: h.cleanup,
  }),
}))

vi.mock('../data/jsplugin-mutations.js', () => ({
  useTogglePluginMutation: () => ({ mutate: h.toggle, isPending: h.pending.toggle }),
  useDeletePluginMutation: () => ({ mutate: h.del, isPending: h.pending.delete }),
  useUpdateAllPluginsMutation: () => ({
    mutate: h.updateAll,
    mutateAsync: h.updateAllAsync,
    isPending: false,
  }),
  useSetPluginKeepAliveMutation: () => ({ mutate: h.setKeepAlive, isPending: false }),
  useSetPluginAutoUpdateMutation: () => ({ mutate: h.setAutoUpdate, isPending: false }),
  useUpdatePluginMutation: () => ({
    mutate: h.forceUpdate,
    mutateAsync: h.updatePluginAsync,
    isPending: h.pending.update,
  }),
}))

vi.mock('../../../native/native-platform.js', () => ({
  pickAndUploadFile: h.pickAndUpload,
  openURL: h.openURL,
}))

// The real Switch is a native gesture leaf; the mock keeps the checked→className
// mapping so the row's enable toggle stays tappable in this env.
vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)

// lynx-ui Dialog keeps its tree **mounted** while the panel animates out — `show`
// only toggles the animation, not the subtree. The stub reproduces that (marking
// the hidden state instead of unmounting), because unmounting would hide exactly
// the regression these tests pin: a dialog whose subject is cleared while it is
// still visible on screen.
vi.mock('@lynx-js/lynx-ui-dialog', () => ({
  DialogRoot: ({ children, show }: { children: ReactNode; show: boolean }) =>
    <view data-testid='stub-dialogroot' data-dialoghidden={show ? 'false' : 'true'}>{children}</view>,
  DialogView: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogBackdrop: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogContent: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogClose: ({ children }: { children: ReactNode }) => <view>{children}</view>,
}))

const { PluginManagerPage } = await import('../pages/PluginManagerPage.js')
const { useToastStore, toast } = await import('../../../shared/ui/toast-store.js')

function makePlugin(over: Partial<JSPlugin> = {}): JSPlugin {
  return {
    id: 7,
    name: 'downloader',
    displayName: '歌曲下载',
    version: '1.0.0',
    author: 'Songloft Team',
    entryPath: 'downloader',
    isActive: true,
    ...over,
  } as JSPlugin
}

beforeEach(() => {
  h.plugins = [makePlugin()]
  h.keepAlive = []
  h.pending = { toggle: false, delete: false, update: false }
})

afterEach(() => {
  vi.clearAllMocks()
  toast.clear()
})

async function renderPage() {
  // The page reads the query client directly (the upload success path
  // invalidates the nav-tab query), so it needs a real provider.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rendered = render(<PluginManagerPage />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  await act(async () => {
    await Promise.resolve()
  })
  return {
    ...getQueriesForElement(elementTree.root!),
    rerender: () => rendered.rerender(<PluginManagerPage />),
  }
}

test('tapping an installed plugin opens its page with a manager return target', async () => {
  const { getByText } = await renderPage()
  await act(async () => {
    fireEvent.tap(getByText('歌曲下载'))
  })
  expect(h.navigate).toHaveBeenCalledWith({
    to: '/plugin/$entryPath',
    params: { entryPath: 'downloader' },
    search: { from: 'manager' },
  })
  expect(h.openURL).not.toHaveBeenCalled()
})

test.each([
  { isActive: false },
  { isActive: false, isError: true },
  { entryPath: undefined },
  { entryPath: '' },
])('a plugin without an active entry does not navigate: %j', async (overrides) => {
  h.plugins = [makePlugin(overrides)]
  const { getByText } = await renderPage()
  await act(async () => {
    fireEvent.tap(getByText('歌曲下载'))
  })
  expect(h.navigate).not.toHaveBeenCalled()
})

test('the enable switch and row menu do not open the plugin', async () => {
  const { getByTestId } = await renderPage()
  await act(async () => {
    const row = getByTestId('plugin-item-7')
    fireEvent.tap(row.querySelector('.app-switch')!)
  })
  expect(h.toggle).toHaveBeenCalled()
  await openRowMenu(getByTestId)
  expect(h.navigate).not.toHaveBeenCalled()
})

test.each(['toggle', 'delete', 'update'] as const)(
  'the entry is blocked during %s and works again when the operation finishes', async (operation) => {
    h.pending[operation] = true
    const { getByText, rerender } = await renderPage()
    await act(async () => {
      fireEvent.tap(getByText('歌曲下载'))
    })
    expect(h.navigate).not.toHaveBeenCalled()

    h.pending[operation] = false
    await act(async () => {
      rerender()
    })
    await act(async () => {
      fireEvent.tap(getByText('歌曲下载'))
    })
    expect(h.navigate).toHaveBeenCalledTimes(1)
  },
)

/**
 * The topbar actions live behind the `⋯` overflow menu now (three labelled
 * pills once filled the row and squeezed the title onto two lines), so every
 * action test opens it first — the trigger glyph's own testid, taps bubble
 * from it to the trigger.
 */
async function openOverflow(getByTestId: (id: string) => Element) {
  await act(async () => {
    fireEvent.tap(getByTestId('icon-more'))
  })
}

/** The row's own `⋯` — keyed by plugin id so it cannot collide with the topbar's. */
async function openRowMenu(getByTestId: (id: string) => Element, id = 7) {
  await act(async () => {
    fireEvent.tap(getByTestId(`plugin-more-${id}`))
  })
}

/**
 * The dialog is mounted but hidden until something is being deleted. The
 * visibility marker lives on the stub's root wrapper, not on the inner panel.
 * Three dialogs (delete / update / force) now mount side by side, so the
 * marker is read off the root that owns THIS dialog's panel.
 */
function dialogState(queryByTestId: (id: string) => Element | null) {
  const panel = queryByTestId('plugin-delete-dialog')
  const roots = Array.from(
    elementTree.root!.querySelectorAll('[data-testid="stub-dialogroot"]') as unknown as Element[],
  )
  const owner = roots.find((r) => r.querySelector('[data-testid="plugin-delete-dialog"]') != null)
  return {
    mounted: panel !== null,
    visible: owner?.getAttribute('data-dialoghidden') === 'false',
    text: panel?.textContent ?? '',
  }
}

test('tapping delete asks instead of deleting', async () => {
  const { queryByTestId, getByTestId } = await renderPage()
  expect(dialogState(queryByTestId).visible).toBe(false)

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-delete'))
  })

  expect(dialogState(queryByTestId).visible).toBe(true)
  expect(h.del).not.toHaveBeenCalled()
})

test('the dialog names the plugin it is about to remove', async () => {
  // Without the name, a mis-tap on a list of seven plugins is unrecoverable.
  const { getByTestId, queryByTestId } = await renderPage()
  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-delete'))
  })
  expect(dialogState(queryByTestId).text).toContain('歌曲下载')
})

test('the name survives the close animation', async () => {
  // The reported bug: cancelling cleared the subject while lynx-ui was still
  // animating the panel out, so the dialog lingered reading 「将删除「」…」. The
  // subject must outlive the close.
  const { getByTestId, queryByTestId } = await renderPage()

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-delete'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-cancel'))
  })

  const state = dialogState(queryByTestId)
  expect(state.visible).toBe(false)
  expect(state.text).toContain('歌曲下载')
  expect(state.text).not.toContain('「」')
})

test('confirming deletes, cancelling does not', async () => {
  const { getByTestId, queryByTestId } = await renderPage()

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-delete'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-cancel'))
  })
  expect(h.del).not.toHaveBeenCalled()
  expect(dialogState(queryByTestId).visible).toBe(false)

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-delete'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-confirm'))
  })
  expect(h.del).toHaveBeenCalledWith({ id: 7, keepData: false }, expect.anything())
})

test('checking keep-data spares the stored data', async () => {
  // The checkbox is the whole point of the delete dialog's extra row: a user
  // reinstalling a plugin wants its data to survive the uninstall.
  const { getByTestId } = await renderPage()

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-delete'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-keep-data'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-confirm'))
  })

  expect(h.del).toHaveBeenCalledWith({ id: 7, keepData: true }, expect.anything())
})

test('the keep-alive item adds the entryPath to the whitelist', async () => {
  // Only offered while the plugin is active (a stopped plugin has no page to
  // pin); selecting adds the entryPath to the backend's `plugins` list.
  const { getByTestId } = await renderPage()

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-keep-alive'))
  })
  expect(h.setKeepAlive).toHaveBeenCalledWith(['downloader'], expect.anything())
})

test('the keep-alive item removes an already-pinned entryPath', async () => {
  // The mirrored case: the whitelist already contains the entryPath, so the
  // same item must take it out again.
  h.keepAlive = ['downloader']
  const { getByTestId } = await renderPage()

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-keep-alive'))
  })
  expect(h.setKeepAlive).toHaveBeenCalledWith([], expect.anything())
})

test('the homepage item opens the URL externally', async () => {
  h.plugins = [makePlugin({ homepage: 'https://example.com/lx' })]
  const { getByTestId } = await renderPage()

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-homepage'))
  })

  expect(h.openURL).toHaveBeenCalledWith('https://example.com/lx')
})

test('the row switch drives the enable/disable mutation', async () => {
  // The toggle used to be a labelled text button; it is the shared AppSwitch
  // now, tapped through its `.app-switch` root like every other switch test.
  const { getByTestId } = await renderPage()

  const row = getByTestId('plugin-item-7')
  await act(async () => {
    fireEvent.tap(row.querySelector('.app-switch') as unknown as Element)
  })

  // Fixture plugin is active, so the first flip disables it. (The second mutate
  // argument is TanStack's per-call options — the onError toast hook.)
  expect(h.toggle).toHaveBeenCalledWith({ id: 7, enable: false }, expect.anything())
})

test('check-update opens the dialog, auto-checks and shows the jump', async () => {
  // Opening the dialog IS the check trigger (Flutter parity): no extra tap
  // between selecting the menu item and seeing v1 → v2.
  const { getByTestId } = await renderPage()

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-check-update'))
  })
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

  expect(h.checkUpdate).toHaveBeenCalledWith(7, {})
  const found = getByTestId('plugin-update-found')
  expect(found.textContent).toContain('1.0.0')
  expect(found.textContent).toContain('1.1.0')
})

test('update-now drives the mutation from the dialog', async () => {
  const { getByTestId } = await renderPage()

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-check-update'))
  })
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-update-now'))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

  expect(h.updatePluginAsync).toHaveBeenCalledWith({ id: 7 })
})

test.each(['recheck', 'reopen'])('a late check cannot replace the result after %s', async action => {
  const oldAnswer = await h.checkUpdate()
  let finishOld!: () => void
  h.checkUpdate.mockImplementationOnce(() => new Promise(resolve => {
    finishOld = () => resolve(oldAnswer)
  }))
  h.checkUpdate.mockResolvedValueOnce({...oldAnswer, remoteVersion: '2.0.0'})
  const {getByTestId} = await renderPage()
  await openRowMenu(getByTestId)
  await act(async () => { fireEvent.tap(getByTestId('menu-item-check-update')) })
  if (action === 'reopen') {
    await act(async () => { fireEvent.tap(getByTestId('plugin-update-close')) })
    await openRowMenu(getByTestId)
    await act(async () => { fireEvent.tap(getByTestId('menu-item-check-update')) })
  } else {
    await act(async () => { fireEvent.tap(getByTestId('plugin-update-recheck')) })
  }
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
  expect(h.checkUpdate).toHaveBeenCalledTimes(3)
  expect(getByTestId('plugin-update-found').textContent).toContain('2.0.0')
  await act(async () => { finishOld() })
  expect(getByTestId('plugin-update-found').textContent).toContain('2.0.0')
  expect(getByTestId('plugin-update-found').textContent).not.toContain('1.1.0')
})

test('the single update dialog waits past the old 20-second and 120-second deadlines', async () => {
  const answer = await h.checkUpdate()
  let finish!: () => void
  let finishUpdate!: () => void
  h.checkUpdate.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(answer) }))
  h.updatePluginAsync.mockImplementationOnce(() => new Promise(resolve => { finishUpdate = () => resolve() }))
  const {getByTestId, queryByTestId} = await renderPage()
  await openRowMenu(getByTestId)
  vi.useFakeTimers()
  try {
    await act(async () => { fireEvent.tap(getByTestId('menu-item-check-update')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(30_001) })
    expect(queryByTestId('plugin-update-error')).toBeNull()
    await act(async () => { finish() })
    expect(getByTestId('plugin-update-found').textContent).toContain('1.1.0')
    await act(async () => { fireEvent.tap(getByTestId('plugin-update-now')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(180_001) })
    expect(queryByTestId('plugin-update-error')).toBeNull()
    expect(queryByTestId('plugin-update-close')).toBeNull()
    await act(async () => { finishUpdate() })
    expect(useToastStore.getState().toast?.tone).toBe('success')
  } finally {
    vi.useRealTimers()
  }
})

test('force update asks first, then reinstalls with force', async () => {
  // Force skips the version check entirely — the confirmation is what stands
  // between a misc tap and a pointless re-download.
  const { getByTestId, queryByTestId } = await renderPage()

  await openRowMenu(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-force-update'))
  })
  expect(queryByTestId('plugin-force-dialog')?.textContent).toContain('歌曲下载')
  expect(h.forceUpdate).not.toHaveBeenCalled()

  await act(async () => {
    fireEvent.tap(getByTestId('plugin-force-confirm'))
  })
  expect(h.forceUpdate).toHaveBeenCalledWith({ id: 7, force: true }, expect.anything())
})

test('a failed install surfaces the reason instead of doing nothing', async () => {
  // The empty `catch` this replaces is why a guaranteed 401 looked like a dead
  // button. The message now lands in the global toast store (rendered by
  // `ToastHost`), so we assert on the stored toast.
  h.pickAndUpload.mockRejectedValueOnce(new Error('HTTP 401'))
  const { getByTestId } = await renderPage()

  await openOverflow(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-install'))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

  const shown = useToastStore.getState().toast
  expect(shown).not.toBeNull()
  expect(shown?.tone).toBe('error')
  expect(shown?.text).toContain('HTTP 401')
})

test('cancelling the file picker is not an error', async () => {
  h.pickAndUpload.mockRejectedValueOnce(new Error('cancelled'))
  const { getByTestId } = await renderPage()

  await openOverflow(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-install'))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

  expect(useToastStore.getState().toast).toBeNull()
})

test('the store entry routes when the page is standalone', async () => {
  // Single-column (or a direct /settings/plugins visit) has no settings pane to
  // stay inside, so the store is a normal route.
  const { getByTestId } = await renderPage()

  await openOverflow(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-store'))
  })

  expect(h.navigate).toHaveBeenCalledWith({ to: '/settings/plugins/registry' })
})

test('the store entry defers to onOpenStore inside the settings pane', async () => {
  // In the wide master–detail layout the page sits in the right pane; routing
  // would unmount SettingsPage and drop the settings list, so the pane swap wins.
  const onOpenStore = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<PluginManagerPage onOpenStore={onOpenStore} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  await act(async () => {
    await Promise.resolve()
  })
  const { getByTestId } = getQueriesForElement(elementTree.root!)

  await openOverflow(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-store'))
  })

  expect(onOpenStore).toHaveBeenCalledTimes(1)
  expect(h.navigate).not.toHaveBeenCalled()
})

test('update-all opens the batch dialog, which runs and reports', async () => {
  // The topbar item no longer fires a silent mutation: the dialog owns the run
  // (no close affordance while updating) and the per-plugin results.
  const { getByTestId } = await renderPage()

  await openOverflow(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-update-all'))
  })
  expect(getByTestId('plugin-batch-dialog')).toBeTruthy()

  await act(async () => {
    fireEvent.tap(getByTestId('plugin-batch-start'))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

  expect(h.updateAllAsync).toHaveBeenCalledWith({})
  const stats = getByTestId('plugin-batch-stats')
  expect(stats.textContent).toContain('1')
  const rows = getByTestId('plugin-batch-rows')
  expect(rows.textContent).toContain('LX Source')
  expect(rows.textContent).toContain('network')
})

test('a batch still running after six minutes waits for the API result', async () => {
  const answer = await h.updateAllAsync()
  let finish!: () => void
  h.updateAllAsync.mockImplementationOnce(() => new Promise(resolve => {
    finish = () => resolve(answer)
  }))
  const {getByTestId, queryByTestId} = await renderPage()
  await openOverflow(getByTestId)
  await act(async () => { fireEvent.tap(getByTestId('menu-item-update-all')) })
  vi.useFakeTimers()
  try {
    await act(async () => { fireEvent.tap(getByTestId('plugin-batch-start')) })
    await act(async () => { await vi.advanceTimersByTimeAsync(360_001) })
    expect(queryByTestId('plugin-batch-error')).toBeNull()
    expect(queryByTestId('plugin-batch-close')).toBeNull()
    await act(async () => {
      finish()
      for (let i = 0; i < 5; i++) await Promise.resolve()
    })
    expect(getByTestId('plugin-batch-stats')).toBeTruthy()
  } finally {
    vi.useRealTimers()
  }
})

test('cleanup asks first, then reports the server message', async () => {
  const { getByTestId } = await renderPage()

  await openOverflow(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-cleanup'))
  })
  expect(h.cleanup).not.toHaveBeenCalled()

  await act(async () => {
    fireEvent.tap(getByTestId('plugin-cleanup-confirm'))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
  expect(h.cleanup).toHaveBeenCalledTimes(1)
  const shown = useToastStore.getState().toast
  expect(shown?.tone).toBe('success')
  expect(shown?.text).toContain('cleaned 3 entries')
})

test('a partial upload failure lists the failing files', async () => {
  // The uploader hands back the endpoint's JSON; one good zip and one bad one
  // must name the bad one, not just say "failed".
  h.pickAndUpload.mockResolvedValueOnce(JSON.stringify({
    total: 2,
    success: 1,
    failed: 1,
    message: '',
    results: [
      { file_name: 'good.zip', success: true, error: null },
      { file_name: 'bad.zip', success: false, error: 'invalid manifest' },
    ],
  }))
  const { getByTestId } = await renderPage()

  await openOverflow(getByTestId)
  await act(async () => {
    fireEvent.tap(getByTestId('menu-item-install'))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

  const panel = getByTestId('plugin-upload-result')
  expect(panel.textContent).toContain('bad.zip')
  expect(panel.textContent).toContain('invalid manifest')
  expect(panel.querySelectorAll('.confirm-dialog__btn')).toHaveLength(1)
  expect(panel.querySelector('.confirm-dialog__btn--confirm')).toBeNull()
})

test('the auto-update switch writes the setting', async () => {
  const { getByTestId } = await renderPage()

  const row = getByTestId('plugin-auto-update')
  await act(async () => {
    fireEvent.tap(row.querySelector('.app-switch') as unknown as Element)
  })

  expect(h.setAutoUpdate).toHaveBeenCalledWith(true, expect.anything())
})
