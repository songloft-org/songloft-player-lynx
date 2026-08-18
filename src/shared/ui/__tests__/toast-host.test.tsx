import '@testing-library/jest-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { getQueriesForElement, render } from '@lynx-js/react/testing-library'

import type { ToastItem } from '../toast-store.js'

/**
 * Render coverage for `ToastHost`'s markup contract (pill + tone class + icon +
 * text). The zustand store is stood in with a non-subscribing reader — a real
 * `useToastStore` subscription (`useSyncExternalStore`) crashes the ReactLynx
 * Vitest snapshot tree (see `_render-mocks`); store behaviour itself is covered
 * by `toast-store.test.ts`.
 */
const holder = vi.hoisted(() => ({ toast: null as ToastItem | null }))

vi.mock('../toast-store.js', () => ({
  useToastStore: (selector: (s: { toast: ToastItem | null }) => unknown) =>
    selector({ toast: holder.toast }),
  toast: { success: vi.fn(), error: vi.fn(), show: vi.fn(), clear: vi.fn() },
}))

const { ToastHost } = await import('../ToastHost.js')

beforeEach(() => {
  holder.toast = null
})

test('renders nothing when there is no toast', () => {
  render(<ToastHost />)
  const { queryByTestId } = getQueriesForElement(elementTree.root!)
  expect(queryByTestId('toast')).toBeNull()
})

test('a success toast renders the pill with a check-circle icon', () => {
  holder.toast = { id: 1, text: 'Saved', tone: 'success' }
  render(<ToastHost />)
  const { queryByTestId, queryByText } = getQueriesForElement(elementTree.root!)
  expect(queryByTestId('toast')).toBeInTheDocument()
  expect(queryByText('Saved')).toBeInTheDocument()
  expect(queryByTestId('icon-check-circle')).toBeInTheDocument()
  expect(queryByTestId('icon-warning')).toBeNull()
})

test('an error toast adds the error modifier and a warning icon', () => {
  holder.toast = { id: 2, text: 'Something failed', tone: 'error' }
  render(<ToastHost />)
  const { queryByTestId, queryByText } = getQueriesForElement(elementTree.root!)
  const pill = queryByTestId('toast')
  expect(pill).toBeInTheDocument()
  expect(pill?.className).toContain('toast--error')
  expect(queryByText('Something failed')).toBeInTheDocument()
  expect(queryByTestId('icon-warning')).toBeInTheDocument()
  expect(queryByTestId('icon-check-circle')).toBeNull()
})
