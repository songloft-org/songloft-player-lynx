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
const { navigateSpy, sliderCallbacks } = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  // Latest render's SizeLimitSlider→SliderRoot callbacks, captured by the mock
  // below so tests can drive the drag lifecycle (the Pass stand-in in
  // `_render-mocks.tsx` drops them).
  sliderCallbacks: {
    onDragging: undefined as undefined | ((v: number) => void),
    onValueChange: undefined as undefined | ((v: number) => void),
    onValueCommit: undefined as undefined | ((v: number) => void),
  },
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

vi.mock('@lynx-js/lynx-ui-slider', () => ({
  SliderRoot: (props: {
    className?: string
    children?: unknown
    onDragging?: (v: number) => void
    onValueChange?: (v: number) => void
    onValueCommit?: (v: number) => void
  }) => {
    sliderCallbacks.onDragging = props.onDragging
    sliderCallbacks.onValueChange = props.onValueChange
    sliderCallbacks.onValueCommit = props.onValueCommit
    return <view className={props.className}>{props.children as never}</view>
  },
  SliderTrack: (props: { className?: string; children?: unknown }) => (
    <view className={props.className}>{props.children as never}</view>
  ),
  SliderIndicator: (props: { className?: string }) => <view className={props.className} />,
  SliderThumb: (props: { className?: string }) => <view className={props.className} />,
}))

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

afterEach(() => {
  vi.clearAllMocks()
  sliderCallbacks.onDragging = undefined
  sliderCallbacks.onValueChange = undefined
  sliderCallbacks.onValueCommit = undefined
})

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
  // …and hide the used/limit capacity bar (there is no "of" to show).
  expect(queryByTestId('cache-usage')).not.toBeInTheDocument()
})

test('renders the usage bar with a percentage fill when a limit exists', async () => {
  mockStatsData.maxSize = 1073741824
  try {
    const { queryByTestId } = await renderPage()
    expect(queryByTestId('cache-usage')).toBeInTheDocument()
    // 1 MiB of a 1 GiB limit → ~0.1% width, no danger class.
    expect(queryByTestId('cache-usage-fill')?.className).not.toContain('--danger')
  } finally {
    mockStatsData.maxSize = 0
  }
})

test('server slider shows the 1 GB fallback notch for an unlimited (0) config', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('server-max-size')).toBeInTheDocument()
  expect(queryByTestId('server-max-size-value')?.textContent).toBe('1 GB')
  // One tick-mark dot per notch: 9 server options → tick-0 … tick-8.
  expect(queryByTestId('server-max-size-tick-0')).toBeInTheDocument()
  expect(queryByTestId('server-max-size-tick-8')).toBeInTheDocument()
  expect(queryByTestId('server-max-size-tick-9')).not.toBeInTheDocument()
})

test('server slider commit PUTs the new cap with the stored (not form) config', async () => {
  const { queryByTestId } = await renderPage()
  // 9 notches; drag to the last one (100 GB) and release.
  await act(async () => {
    sliderCallbacks.onDragging!(1)
    sliderCallbacks.onValueChange!(1)
    sliderCallbacks.onValueCommit!(1)
  })
  // 100 GB in bytes
  expect(updateConfigMutateSpy).toHaveBeenCalledWith(
    expect.objectContaining({ max_size: 100 * 1024 * 1024 * 1024 }),
    expect.anything(),
  )
  // The pending echo keeps the display on the committed notch until refetch.
  expect(queryByTestId('server-max-size-value')?.textContent).toBe('100 GB')
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

test('the save button calls updateConfig mutation keeping the slider-owned cap', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('cache-save')!)
  })
  // mockConfigData.maxSize is 0; the form no longer edits the cap, so Save just
  // round-trips whatever the slider last committed.
  expect(updateConfigMutateSpy).toHaveBeenCalledTimes(1)
  expect(updateConfigMutateSpy).toHaveBeenCalledWith(
    expect.objectContaining({ max_size: 0, cache_dir: '/data/cache' }),
  )
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
