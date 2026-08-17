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

// lynx-ui Dialog renders through a portal-ish tree; the stub keeps the controlled
// `show` semantics, which is all these assertions depend on.
vi.mock('@lynx-js/lynx-ui', () => ({
  DialogRoot: ({ children, show }: { children: ReactNode; show: boolean }) =>
    show ? <view>{children}</view> : null,
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

test('tapping delete asks instead of deleting', async () => {
  const { queryByTestId, getByTestId } = await renderPage()
  expect(queryByTestId('plugin-delete-dialog')).not.toBeInTheDocument()

  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-7'))
  })

  expect(queryByTestId('plugin-delete-dialog')).toBeInTheDocument()
  expect(h.del).not.toHaveBeenCalled()
})

test('the dialog names the plugin it is about to remove', async () => {
  // Without the name, a mis-tap on a list of seven plugins is unrecoverable.
  const { getByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-7'))
  })
  // Scoped to the dialog: the list row behind it carries the same name.
  expect(getByTestId('plugin-delete-dialog').textContent).toContain('歌曲下载')
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
  expect(queryByTestId('plugin-delete-dialog')).not.toBeInTheDocument()

  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-7'))
  })
  await act(async () => {
    fireEvent.tap(getByTestId('plugin-delete-confirm'))
  })
  expect(h.del).toHaveBeenCalledWith(7, expect.anything())
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
