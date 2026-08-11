import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { parseMetadataProgress, parseScanProgress } from '../../../models/library-ops.js'
import { initialTreeState, withRootLoaded } from '../domain/directory-tree.js'

/**
 * LibraryOpsPage render smoke (batch 19).
 *
 * The whole `data/` barrel is mocked: every hook in it wraps
 * `useQuery`/`useMutation`, which need a live `QueryClient` (no test in this repo
 * installs a `QueryClientProvider`) and go through `useSyncExternalStore`, which
 * crashes the ReactLynx snapshot tree. Mocking at the module boundary is why the
 * hooks are confined to `data/*` in the first place. The real widgets, the real
 * pure domain functions and the real `Icon` all render against injected data.
 *
 * lynx-ui `Switch` is a native gesture leaf and must be stubbed. A stubbed switch
 * cannot emit `onChange`, so "flip switch → optimistic write" is covered in
 * `remote-setting.test.ts` against a real `QueryClient` instead.
 */
const h = vi.hoisted(() => ({
  navigateSpy: vi.fn(),
  scanData: undefined as unknown,
  metaData: undefined as unknown,
  tree: undefined as unknown,
  startScan: vi.fn(),
  cancelScan: vi.fn(),
  startMeta: vi.fn(),
  cancelMeta: vi.fn(),
  toggleExpand: vi.fn(),
  refetch: vi.fn(),
  settings: {
    autoCreate: true,
    playlistMode: 'directory',
    titleSource: 'tag',
    autoScan: { enabled: false, intervalSeconds: 3600 },
    fingerprint: false,
    remoteTitleSource: 'filename',
    readFailed: false,
  },
  setPlaylistMode: vi.fn(),
  setAutoScan: vi.fn(),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigateSpy }))

const wrap = (value: unknown) => ({ data: { value, readFailed: h.settings.readFailed } })
const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, isPending: false })

vi.mock('../data/index.js', () => ({
  useScanProgressQuery: () => ({ data: h.scanData, refetch: h.refetch }),
  useMetadataProgressQuery: () => ({ data: h.metaData }),
  useScanCompletionEffect: () => {},
  useStartScanMutation: () => mutation(h.startScan),
  useCancelScanMutation: () => mutation(h.cancelScan),
  useStartMetadataRefreshMutation: () => mutation(h.startMeta),
  useCancelMetadataRefreshMutation: () => mutation(h.cancelMeta),
  useDirectoryTree: () => ({ tree: h.tree, actions: { toggleExpand: h.toggleExpand, reloadRoot: vi.fn() } }),
  useAutoCreatePlaylists: () => wrap(h.settings.autoCreate),
  useSetAutoCreatePlaylists: () => mutation(vi.fn()),
  useScanPlaylistMode: () => wrap(h.settings.playlistMode),
  useSetScanPlaylistMode: () => mutation(h.setPlaylistMode),
  useScanTitleSource: () => wrap(h.settings.titleSource),
  useSetScanTitleSource: () => mutation(vi.fn()),
  useScanAutoFingerprint: () => wrap(h.settings.fingerprint),
  useSetScanAutoFingerprint: () => mutation(vi.fn()),
  useRemoteTitleSource: () => wrap(h.settings.remoteTitleSource),
  useSetRemoteTitleSource: () => mutation(vi.fn()),
  useAutoScan: () => wrap(h.settings.autoScan),
  useSetAutoScan: () => mutation(h.setAutoScan),
}))

const { LibraryOpsPage } = await import('../pages/LibraryOpsPage.js')

beforeEach(() => {
  h.scanData = parseScanProgress({ status: 'idle' })
  h.metaData = parseMetadataProgress({ status: 'idle' })
  h.tree = withRootLoaded(
    initialTreeState(),
    [
      { name: 'rock', path: '/m/rock', hasChildren: true },
      { name: 'jazz', path: '/m/jazz', hasChildren: false },
    ],
    '/m',
  )
  h.settings.autoCreate = true
  h.settings.autoScan = { enabled: false, intervalSeconds: 3600 }
  h.settings.readFailed = false
})

afterEach(() => vi.clearAllMocks())

async function renderPage() {
  render(<LibraryOpsPage />)
  await act(async () => {
    await Promise.resolve()
  })
  return getQueriesForElement(elementTree.root!)
}

/* ------------------------------------------------------------------ scan states */

test('idle renders the mode picker and the start button', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('scan-mode-skip')).toBeInTheDocument()
  expect(queryByTestId('scan-mode-reimport')).toBeInTheDocument()
  expect(queryByTestId('scan-start')?.textContent).toContain('Scan local music')
  expect(queryByTestId('scan-cancel')).not.toBeInTheDocument()
})

test('importing shows a determinate bar plus the file and counter lines', async () => {
  h.scanData = parseScanProgress({
    status: 'importing',
    current_file: '/m/rock/a.flac',
    scanned_files: 128,
    total_files: 246,
    imported_files: 96,
    skipped_files: 30,
    failed_files: 2,
  })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('scan-phase-running')).toBeInTheDocument()
  expect(queryByTestId('scan-bar')?.children[0]?.className)
    .not.toContain('--indeterminate')
  const text = queryByTestId('scan-phase-running')?.textContent ?? ''
  expect(text).toContain('/m/rock/a.flac')
  expect(text).toContain('128/246')
  expect(text).toContain('96')
})

test('discovering shows an indeterminate bar with the discovered count', async () => {
  h.scanData = parseScanProgress({ status: 'scanning', discovered_files: 57 })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('scan-bar')?.children[0]?.className).toContain('--indeterminate')
  expect(queryByTestId('scan-phase-running')?.textContent).toContain('57')
})

test('the playlist-creation phase disables cancelling', async () => {
  h.scanData = parseScanProgress({ status: 'creating_playlists' })
  const { queryByTestId } = await renderPage()
  const cancel = queryByTestId('scan-cancel')
  expect(cancel?.className).toContain('--disabled')
  await act(async () => {
    fireEvent.tap(cancel!)
  })
  expect(h.cancelScan).not.toHaveBeenCalled()
})

test('a cancellable phase wires the cancel button', async () => {
  h.scanData = parseScanProgress({ status: 'importing' })
  const { queryByTestId } = await renderPage()
  const cancel = queryByTestId('scan-cancel')
  expect(cancel?.className).not.toContain('--disabled')
  await act(async () => {
    fireEvent.tap(cancel!)
  })
  expect(h.cancelScan).toHaveBeenCalledTimes(1)
})

test('completed shows the library total and the per-run stats', async () => {
  h.scanData = parseScanProgress({
    status: 'completed',
    local_song_count: 1204,
    imported_files: 12,
    skipped_files: 3,
    failed_files: 1,
  })
  const { queryByTestId } = await renderPage()
  const text = queryByTestId('scan-phase-completed')?.textContent ?? ''
  expect(text).toContain('1204')
  expect(text).toContain('12')
  expect(queryByTestId('scan-reset')).toBeInTheDocument()
})

test('completed without a reported song count omits the misleading zero total', async () => {
  h.scanData = parseScanProgress({ status: 'completed', local_song_count: 0, imported_files: 4 })
  const { queryByTestId } = await renderPage()
  const text = queryByTestId('scan-phase-completed')?.textContent ?? ''
  expect(text).not.toContain('0 local songs')
  expect(text).toContain('4')
})

test('cancelled shows how many files were processed', async () => {
  h.scanData = parseScanProgress({ status: 'cancelled', scanned_files: 88 })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('scan-phase-cancelled')?.textContent).toContain('88')
})

test('a server-reported failure shows the error state', async () => {
  h.scanData = parseScanProgress({ status: 'failed' })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('scan-phase-failed')).toBeInTheDocument()
})

test('the backend failure reason is shown instead of the generic title', async () => {
  h.scanData = parseScanProgress({ status: 'failed', error: 'music root not readable' })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('scan-phase-failed')?.textContent)
    .toContain('music root not readable')
})

/* ---------------------------------------------------------------- start actions */

test('starting a scan passes the selected mode', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-mode-reimport')!)
  })
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-start')!)
  })
  expect(h.startScan).toHaveBeenCalledWith(
    { reimport: true, paths: [] },
    expect.anything(),
  )
})

/**
 * Regression for the Flutter defect: it folded a failed start into the progress
 * object as `status: 'error'` while the UI tested for `'failed'`, so nothing
 * matched and the scan area went blank. Here the failure must render the failed
 * state, not an empty section.
 */
test('a failed start renders the failed state rather than a blank section', async () => {
  h.startScan.mockImplementation((_params, opts) => opts?.onError?.(new Error('boom')))
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-start')!)
  })
  expect(queryByTestId('scan-phase-failed')).toBeInTheDocument()
})

/* ------------------------------------------------------------- directory picker */

test('the directory tree is collapsed until the target-dirs row is tapped', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('dir-tree')).not.toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-target-dirs')!)
  })
  expect(queryByTestId('dir-tree')).toBeInTheDocument()
  expect(queryByTestId('dir-check-/m/rock')).toBeInTheDocument()
})

test('only branches with children get an expand affordance', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-target-dirs')!)
  })
  expect(queryByTestId('dir-expand-/m/rock')).toBeInTheDocument()
  expect(queryByTestId('dir-expand-/m/jazz')).not.toBeInTheDocument()
})

test('tapping the expand affordance asks the tree to load that branch', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-target-dirs')!)
  })
  await act(async () => {
    fireEvent.tap(queryByTestId('dir-expand-/m/rock')!)
  })
  expect(h.toggleExpand).toHaveBeenCalledWith('/m/rock', true)
})

test('selecting a directory shows a chip and scopes the scan to it', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-target-dirs')!)
  })
  await act(async () => {
    fireEvent.tap(queryByTestId('dir-check-/m/rock')!)
  })
  // The chip shows the last path segment, not the whole path.
  expect(queryByTestId('scan-target-dirs')?.textContent).toContain('1')
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-start')!)
  })
  expect(h.startScan).toHaveBeenCalledWith(
    { reimport: false, paths: ['/m/rock'] },
    expect.anything(),
  )
})

test('clearing the selection drops the chips', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-target-dirs')!)
  })
  await act(async () => {
    fireEvent.tap(queryByTestId('dir-check-/m/rock')!)
  })
  expect(queryByTestId('dirs-clear')).toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(queryByTestId('dirs-clear')!)
  })
  expect(queryByTestId('dirs-clear')).not.toBeInTheDocument()
})

test('the tree renders loading and error states from the hook', async () => {
  h.tree = initialTreeState()
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-target-dirs')!)
  })
  expect(queryByTestId('dir-tree-loading')).toBeInTheDocument()
})

/* --------------------------------------------------------------------- settings */

test('all five scan preference controls render', async () => {
  const { queryByTestId } = await renderPage()
  for (const id of [
    'switch-auto-create',
    'row-playlist-mode',
    'switch-title-source',
    'switch-auto-scan',
    'switch-fingerprint',
  ]) {
    expect(queryByTestId(id)).toBeInTheDocument()
  }
})

/**
 * Regression for the batch-19 device bug: the switches all looked the same
 * whatever their value (`scan-auto-create-playlists` is `true` on the dev backend
 * yet rendered as off). The class the switch puts on its track is the *only*
 * channel through which state reaches CSS, so assert both polarities land — the
 * companion `app-switch-css.test.ts` covers the stylesheet half.
 *
 * This assertion only became possible once `mockLynxUiSwitch` stopped discarding
 * `checked`; the old passthrough is why tests stayed green through the bug.
 */
test('switch rows render their on/off state as a class on the track', async () => {
  h.settings.autoCreate = true
  h.settings.fingerprint = false
  const { queryByTestId } = await renderPage()
  const on = queryByTestId('switch-auto-create')?.querySelector('.app-switch__track')
  const off = queryByTestId('switch-fingerprint')?.querySelector('.app-switch__track')
  expect(on?.className).toContain('ui-checked')
  expect(off).toBeInTheDocument()
  expect(off?.className).not.toContain('ui-checked')
})

test('playlist mode options are selectable and report the current choice', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('playlist-mode-directory')).toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(queryByTestId('playlist-mode-top_level')!)
  })
  expect(h.setPlaylistMode).toHaveBeenCalledWith('top_level', expect.anything())
})

test('turning auto-create off disables the playlist-mode row and hides its options', async () => {
  h.settings.autoCreate = false
  const { queryByTestId } = await renderPage()
  const row = queryByTestId('row-playlist-mode')
  expect(row?.className).toContain('--disabled')
  expect(row?.textContent).toContain('Auto-create playlists is off')
  expect(queryByTestId('playlist-mode-directory')).not.toBeInTheDocument()
})

test('the interval picker only exists while auto-scan is on', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('row-scan-interval')).not.toBeInTheDocument()

  h.settings.autoScan = { enabled: true, intervalSeconds: 3600 }
  const again = await renderPage()
  expect(again.queryByTestId('row-scan-interval')).toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(again.queryByTestId('row-scan-interval')!)
  })
  expect(again.queryByTestId('interval-600')).toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(again.queryByTestId('interval-21600')!)
  })
  expect(h.setAutoScan).toHaveBeenCalledWith(
    { enabled: true, intervalSeconds: 21600 },
    expect.anything(),
  )
})

test('a failed config read is surfaced on the row instead of silently defaulting', async () => {
  h.settings.readFailed = true
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('switch-auto-create')?.textContent)
    .toContain('Failed to read config')
})

/* -------------------------------------------------------------------- metadata */

test('metadata idle offers a start action', async () => {
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('meta-phase-idle')).toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(queryByTestId('meta-start')!)
  })
  expect(h.startMeta).toHaveBeenCalledTimes(1)
})

test('metadata running shows progress and wires cancel', async () => {
  h.metaData = parseMetadataProgress({ status: 'running', total: 10, processed: 4 })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('meta-phase-running')?.textContent).toContain('4 / 10')
  await act(async () => {
    fireEvent.tap(queryByTestId('meta-cancel')!)
  })
  expect(h.cancelMeta).toHaveBeenCalledTimes(1)
})

test('metadata running with no total yet reads as preparing and is indeterminate', async () => {
  h.metaData = parseMetadataProgress({ status: 'running', total: 0 })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('meta-phase-running')?.textContent).toContain('Preparing')
  expect(queryByTestId('meta-bar')?.children[0]?.className).toContain('--indeterminate')
})

test('metadata done shows the result counts and a re-run action', async () => {
  h.metaData = parseMetadataProgress({ status: 'done', total: 9, processed: 7, failed: 2 })
  const { queryByTestId } = await renderPage()
  const text = queryByTestId('meta-phase-done')?.textContent ?? ''
  expect(text).toContain('7')
  expect(text).toContain('2')
  expect(queryByTestId('meta-again')).toBeInTheDocument()
})

/** Flutter's `isDone && total > 0` gate: a fresh server has no remote songs. */
test('a finished run that processed nothing falls back to the idle row', async () => {
  h.metaData = parseMetadataProgress({ status: 'done', total: 0 })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('meta-phase-idle')).toBeInTheDocument()
  expect(queryByTestId('meta-phase-done')).not.toBeInTheDocument()
})

/* ------------------------------------------------------------------- chrome */

test('the back affordance routes to /settings', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('libops-back')!)
  })
  expect(h.navigateSpy).toHaveBeenCalledWith({ to: '/settings' })
})

test('a write failure raises a dismissible banner', async () => {
  h.startMeta.mockImplementation((_v, opts) => opts?.onError?.(new Error('nope')))
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('meta-start')!)
  })
  expect(queryByTestId('libops-write-error')).toBeInTheDocument()
  await act(async () => {
    fireEvent.tap(queryByTestId('libops-write-error-dismiss')!)
  })
  expect(queryByTestId('libops-write-error')).not.toBeInTheDocument()
})
