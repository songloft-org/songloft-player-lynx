import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import type { ReactNode } from '@lynx-js/react'
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
  toggle: vi.fn(),
  del: vi.fn(),
  updateAll: vi.fn(),
  refetch: vi.fn(),
  navigate: vi.fn(),
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
}))

vi.mock('../data/jsplugin-mutations.js', () => ({
  useTogglePluginMutation: () => ({ mutate: h.toggle, isPending: false }),
  useDeletePluginMutation: () => ({ mutate: h.del, isPending: false }),
  useUpdateAllPluginsMutation: () => ({ mutate: h.updateAll, isPending: false }),
}))

vi.mock('../../../native/native-platform.js', () => ({
  pickAndUploadFile: h.pickAndUpload,
}))

// lynx-ui Dialog keeps its tree **mounted** while the panel animates out — `show`
// only toggles the animation, not the subtree. The stub reproduces that (marking
// the hidden state instead of unmounting), because unmounting would hide exactly
// the regression these tests pin: a dialog whose subject is cleared while it is
// still visible on screen.
vi.mock('@lynx-js/lynx-ui', () => ({
  DialogRoot: ({ children, show }: { children: ReactNode; show: boolean }) =>
    <view data-testid='stub-dialogroot' data-dialoghidden={show ? 'false' : 'true'}>{children}</view>,
  DialogView: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogBackdrop: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogContent: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogClose: ({ children }: { children: ReactNode }) => <view>{children}</view>,
}))

const { PluginManagerPage } = await import('../pages/PluginManagerPage.js')

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
})

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<PluginManagerPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

/**
 * The dialog is mounted but hidden until something is being deleted. The
 * visibility marker lives on the stub's root wrapper, not on the inner panel.
 */
function dialogState(queryByTestId: (id: string) => Element | null) {
  const root = queryByTestId('stub-dialogroot')
  const panel = queryByTestId('plugin-delete-dialog')
  return {
    mounted: panel !== null,
    visible: root?.getAttribute('data-dialoghidden') === 'false',
    text: panel?.textContent ?? '',
  }
}

test('tapping delete asks instead of deleting', async () => {
  const { queryByTestId, getByTestId } = await renderPage()
  expect(dialogState(queryByTestId).visible).toBe(false)

  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-7'))
  })

  expect(dialogState(queryByTestId).visible).toBe(true)
  expect(h.del).not.toHaveBeenCalled()
})

test('the dialog names the plugin it is about to remove', async () => {
  // Without the name, a mis-tap on a list of seven plugins is unrecoverable.
  const { getByTestId, queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-7'))
  })
  expect(dialogState(queryByTestId).text).toContain('歌曲下载')
})

test('the name survives the close animation', async () => {
  // The reported bug: cancelling cleared the subject while lynx-ui was still
  // animating the panel out, so the dialog lingered reading 「将删除「」…」. The
  // subject must outlive the close.
  const { getByTestId, queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-7'))
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

  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-7'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-cancel'))
  })
  expect(h.del).not.toHaveBeenCalled()
  expect(dialogState(queryByTestId).visible).toBe(false)

  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-7'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-confirm'))
  })
  expect(h.del).toHaveBeenCalledWith(7)
})

test('a failed install surfaces the reason instead of doing nothing', async () => {
  // The empty `catch` this replaces is why a guaranteed 401 looked like a dead
  // button.
  h.pickAndUpload.mockRejectedValueOnce(new Error('HTTP 401'))
  const { getByTestId, queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('plugins-upload'))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

  const banner = queryByTestId('plugins-install-error')
  expect(banner).toBeInTheDocument()
  expect(banner?.textContent).toContain('HTTP 401')
})

test('cancelling the file picker is not an error', async () => {
  h.pickAndUpload.mockRejectedValueOnce(new Error('cancelled'))
  const { getByTestId, queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('plugins-upload'))
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })

  expect(queryByTestId('plugins-install-error')).not.toBeInTheDocument()
})

test('the store button routes when the page is standalone', async () => {
  // Single-column (or a direct /settings/plugins visit) has no settings pane to
  // stay inside, so the store is a normal route.
  const { getByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(getByTestId('plugins-store')!)
  })

  expect(h.navigate).toHaveBeenCalledWith({ to: '/settings/plugins/registry' })
})

test('the store button defers to onOpenStore inside the settings pane', async () => {
  // In the wide master–detail layout the page sits in the right pane; routing
  // would unmount SettingsPage and drop the settings list, so the pane swap wins.
  const onOpenStore = vi.fn()
  render(<PluginManagerPage onOpenStore={onOpenStore} />)
  await act(async () => {
    await Promise.resolve()
  })
  const { getByTestId } = getQueriesForElement(elementTree.root!)

  await act(async () => {
    fireEvent.tap(getByTestId('plugins-store')!)
  })

  expect(onOpenStore).toHaveBeenCalledTimes(1)
  expect(h.navigate).not.toHaveBeenCalled()
})
