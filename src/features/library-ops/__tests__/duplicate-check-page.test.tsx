import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import type { ReactNode } from '@lynx-js/react'

import { parseFingerprintStatus, parseFingerprintProgress } from '../../../models/fingerprint.js'
import { parseDuplicatesResult } from '../../../models/duplicate.js'

/**
 * DuplicateCheckPage render smoke tests.
 *
 * All data hooks are mocked (same pattern as library-ops-page.test.tsx):
 * hooks wrap `useQuery`/`useMutation` which need a live `QueryClient` and go
 * through `useSyncExternalStore`, which crashes the ReactLynx snapshot tree.
 */
const h = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  statusData: undefined as unknown,
  progressData: undefined as unknown,
  duplicatesData: undefined as unknown,
  statusLoading: false,
  duplicatesLoading: false,
  startFingerprint: vi.fn(),
  cancelFingerprint: vi.fn(),
  batchDelete: vi.fn(),
  refetchStatus: vi.fn(),
  refetchDuplicates: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@lynx-js/lynx-ui', () => ({
  DialogRoot: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogView: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogBackdrop: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogContent: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  DialogClose: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  RadioGroupRoot: ({ children }: { children: ReactNode }) => <view>{children}</view>,
  Radio: ({ children, value }: { children: ReactNode; value: string }) => (
    <view data-value={value}>{children}</view>
  ),
  RadioIndicator: () => <view className='radio-indicator' />,
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigateSpy }))

const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, isPending: false })

vi.mock('../data/index.js', () => ({
  useFingerprintStatusQuery: () => ({
    data: h.statusData,
    isLoading: h.statusLoading,
    refetch: h.refetchStatus,
  }),
  useFingerprintProgressQuery: () => ({
    data: h.progressData,
  }),
  useStartFingerprintMutation: () => mutation(h.startFingerprint),
  useCancelFingerprintMutation: () => mutation(h.cancelFingerprint),
  useBatchDeleteMutation: () => mutation(h.batchDelete),
  useDuplicatesQuery: () => ({
    data: h.duplicatesData,
    isLoading: h.duplicatesLoading,
    refetch: h.refetchDuplicates,
  }),
  libopsQueryKeys: {
    fingerprintStatus: () => ['libops', 'fingerprint-status'],
    fingerprintProgress: () => ['libops', 'fingerprint-progress'],
    duplicates: () => ['libops', 'duplicates'],
  },
}))

const { DuplicateCheckPage } = await import('../pages/DuplicateCheckPage.js')

beforeEach(() => {
  h.statusData = parseFingerprintStatus({
    chromaprint_available: true,
    total: 100,
    computed: 80,
    missing: 20,
    failed: 0,
  })
  h.progressData = parseFingerprintProgress({ status: 'idle' })
  h.duplicatesData = undefined
  h.statusLoading = false
  h.duplicatesLoading = false
})

afterEach(() => vi.clearAllMocks())

async function renderPage(props: { onBack?: () => void } = {}) {
  render(<DuplicateCheckPage {...props} />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

/* ─── Status phase ────────────────────────────────────────────────────────── */

test('status phase shows fingerprint stats and primary action', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('fp-status')).toBeInTheDocument()
  expect(queryByTestId('fp-status-card')).toBeInTheDocument()
  expect(queryByTestId('fp-primary-action')).toBeInTheDocument()
  // Has "Compute and detect" because missing > 0
  expect(queryByTestId('fp-primary-action')?.textContent).toContain('Compute and detect')
})

test('status phase shows "Detect duplicates" when no missing songs', async () => {
  h.statusData = parseFingerprintStatus({
    chromaprint_available: true,
    total: 100,
    computed: 100,
    missing: 0,
    failed: 0,
  })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('fp-primary-action')?.textContent).toContain('Detect duplicates')
})

test('chromaprint warning shown when unavailable', async () => {
  h.statusData = parseFingerprintStatus({
    chromaprint_available: false,
    total: 100,
    computed: 0,
    missing: 100,
    failed: 0,
  })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('fp-chromaprint-warning')).toBeInTheDocument()
  expect(queryByTestId('fp-primary-action')?.className).toContain('--disabled')
})

test('failed hint is shown when failed > 0', async () => {
  h.statusData = parseFingerprintStatus({
    chromaprint_available: true,
    total: 100,
    computed: 90,
    missing: 5,
    failed: 5,
  })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('fp-failed-hint')).toBeInTheDocument()
  expect(queryByTestId('fp-retry-failed')).toBeInTheDocument()
  expect(queryByTestId('fp-recompute-all')).toBeInTheDocument()
})

test('tapping start calls the mutation', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('fp-primary-action')!)
  })
  expect(h.startFingerprint).toHaveBeenCalledTimes(1)
})

/* ─── Computing phase ─────────────────────────────────────────────────────── */

test('computing phase shows progress and cancel', async () => {
  // Simulate auto-detect of running computation
  h.progressData = parseFingerprintProgress({ status: 'running', computed: 30, total: 100, failed: 1 })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('fp-computing')).toBeInTheDocument()
  expect(queryByTestId('fp-computing')?.textContent).toContain('30/100')
  expect(queryByTestId('fp-computing')?.textContent).toContain('Failed')
  expect(queryByTestId('fp-cancel')).toBeInTheDocument()
})

test('cancel button calls the mutation', async () => {
  h.progressData = parseFingerprintProgress({ status: 'running', computed: 10, total: 100 })
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('fp-cancel')!)
  })
  expect(h.cancelFingerprint).toHaveBeenCalledTimes(1)
})

/* ─── Results phase ───────────────────────────────────────────────────────── */

test('no duplicates renders empty state', async () => {
  // Start with status phase where missing=0 so "Detect duplicates" shows
  h.statusData = parseFingerprintStatus({
    chromaprint_available: true, total: 100, computed: 100, missing: 0, failed: 0,
  })
  h.duplicatesData = parseDuplicatesResult({ groups: [], total_groups: 0, total_duplicates: 0 })
  const { queryByTestId } = await renderPage()
  // Tap "Detect duplicates" to enter results phase
  await act(async () => {
    fireEvent.tap(queryByTestId('fp-primary-action')!)
  })
  await act(async () => { await Promise.resolve() })
  expect(queryByTestId('fp-no-results')).toBeInTheDocument()
})

test('results phase shows groups', async () => {
  h.statusData = parseFingerprintStatus({
    chromaprint_available: true, total: 100, computed: 100, missing: 0, failed: 0,
  })
  h.duplicatesData = parseDuplicatesResult({
    groups: [
      {
        fingerprint: 'fp1',
        songs: [
          { id: 1, title: 'Song A', artist: 'Artist', format: 'flac', bit_rate: 320, file_size: 30000, file_path: '/a.flac' },
          { id: 2, title: 'Song A', artist: 'Artist', format: 'mp3', bit_rate: 192, file_size: 8000, file_path: '/a.mp3' },
        ],
      },
    ],
    total_groups: 1,
    total_duplicates: 2,
  })
  const { queryByTestId } = await renderPage()
  // Tap "Detect duplicates" to enter results phase
  await act(async () => {
    fireEvent.tap(queryByTestId('fp-primary-action')!)
  })
  await act(async () => { await Promise.resolve() })
  expect(queryByTestId('fp-results')).toBeInTheDocument()
  expect(queryByTestId('fp-group-0')).toBeInTheDocument()
  expect(queryByTestId('fp-clean-all')).toBeInTheDocument()
})

/* ─── Navigation ──────────────────────────────────────────────────────────── */

test('back button returns to the library page it was opened from', async () => {
  // Not `/settings`: this page is only reachable through Music Library, so going
  // straight to the settings root skipped a level on the way back out.
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('dup-check-back')!)
  })
  expect(h.navigateSpy).toHaveBeenCalledWith({ to: '/settings/library' })
})

test('back defers to onBack inside the settings pane', async () => {
  const onBack = vi.fn()
  const { queryByTestId } = await renderPage({ onBack })
  await act(async () => {
    fireEvent.tap(queryByTestId('dup-check-back')!)
  })
  expect(onBack).toHaveBeenCalledTimes(1)
  expect(h.navigateSpy).not.toHaveBeenCalled()
})

/* ─── Error handling ──────────────────────────────────────────────────────── */

test('loading spinner shown when status is loading', async () => {
  h.statusData = undefined
  h.statusLoading = true
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('dup-check-loading')).toBeInTheDocument()
})
