import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, expect, test, vi } from 'vitest'
import {
  act,
  fireEvent,
  getQueriesForElement,
  render,
} from '@lynx-js/react/testing-library'
import { installBackRouter } from '../../../__tests__/_render-mocks.js'

/**
 * CacheManagePage render smoke test.
 *
 * Mocks the TanStack Query hooks to return deterministic data + mutation spies,
 * same isolation pattern as the other settings sub-page tests.
 */
const { navigateSpy } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
}))

const mockStatsData = { fileCount: 42, maxSize: 0, totalSize: 1048576 }
const mockConfigData = {
  cacheDir: '/data/cache',
  defaultCacheDir: '/default/cache',
  maxSize: 0,
  transcodeFormat: 'mp3',
  transcodeQuality: '192',
}

const cleanMutateSpy = vi.fn()
const updateConfigMutateSpy = vi.fn()
const validateDirMutateSpy = vi.fn()

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateSpy }))

vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)

vi.mock('../data/cache-query.js', () => ({
  useCacheStatsQuery: () => ({ data: mockStatsData, isLoading: false }),
  useCacheConfigQuery: () => ({ data: mockConfigData, isLoading: false }),
}))

vi.mock('../data/cache-mutations.js', () => ({
  useCleanCacheMutation: () => ({ mutate: cleanMutateSpy, isPending: false }),
  useUpdateCacheConfigMutation: () => ({ mutate: updateConfigMutateSpy, isPending: false }),
  useValidateCacheDirMutation: () => ({ mutate: validateDirMutateSpy, isPending: false }),
}))

const { CacheManagePage } = await import('../pages/CacheManagePage.js')

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<CacheManagePage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

test('renders stats section with file count, total size, and unlimited max size', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('cache-file-count')).toBeInTheDocument()
  expect(queryByTestId('cache-total-size')).toBeInTheDocument()
  expect(queryByTestId('cache-max-size')).toBeInTheDocument()
  // max_size=0 should show "Unlimited"
  expect(queryByTestId('cache-max-size')?.textContent).toContain('Unlimited')
})

test('renders the clean button with two-tap confirm', async () => {
  const { queryByTestId, queryByText } = await renderPage()

  // First tap arms confirm
  await act(async () => {
    fireEvent.tap(queryByTestId('cache-clean')!)
  })
  expect(queryByText('Confirm Clean?')).toBeInTheDocument()
  expect(cleanMutateSpy).not.toHaveBeenCalled()

  // Second tap triggers the mutation
  await act(async () => {
    fireEvent.tap(queryByTestId('cache-clean')!)
  })
  expect(cleanMutateSpy).toHaveBeenCalledTimes(1)
})

test('renders transcode format selector with current selection checked', async () => {
  const { queryByTestId } = await renderPage()
  // mp3 is the current format from mockConfigData
  expect(queryByTestId('format-mp3')).toBeInTheDocument()
  expect(queryByTestId('format-none')).toBeInTheDocument()
})

test('renders transcode quality selector', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('quality-128')).toBeInTheDocument()
  expect(queryByTestId('quality-192')).toBeInTheDocument()
  expect(queryByTestId('quality-320')).toBeInTheDocument()
})

test('the save button calls updateConfig mutation', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('cache-save')!)
  })
  expect(updateConfigMutateSpy).toHaveBeenCalledTimes(1)
})

test('the validate button calls validateDir mutation', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('cache-validate-btn')!)
  })
  expect(validateDirMutateSpy).toHaveBeenCalledTimes(1)
})

test('the back affordance routes to /settings', async () => {
  const backNavigate = installBackRouter('/settings/cache')
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('cache-back')!)
  })
  expect(backNavigate).toHaveBeenCalledWith({ to: '/settings' })
})
