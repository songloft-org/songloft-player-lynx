import '../../../shims/router-env.js'

import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

import { parseMetadataProgress, parseScanProgress } from '../../../models/library-ops.js'
import { initialTreeState, withRootLoaded } from '../domain/directory-tree.js'
import { POLL_MS } from '../domain/scan-model.js'
import { installBackRouter } from '../../../__tests__/_render-mocks.js'

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
  refetchMeta: vi.fn(),
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
  musicPathConfig: {
    excludeDirs: [] as string[],
    excludePaths: [] as string[],
    autoCreateExcludeDirs: [] as string[],
  },
  dirNames: [] as string[],
  updateExcludeConfig: vi.fn(),
  cleanInvalid: vi.fn(async () => ({ cleaned: 3 })),
}))

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

vi.mock('@lynx-js/lynx-ui-switch', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiSwitch(),
)

vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigateSpy }))

// The maintenance rows call this directly; without the mock, tapping "clean
// invalid songs" would issue a real request from the test run.
vi.mock('../../library/api/index.js', () => ({
  getSongsApi: () => ({ cleanInvalidSongs: h.cleanInvalid }),
}))

vi.mock('../../library/data/song-tags-query.js', () => ({
  useTagSyncToFile: () => ({ data: { value: false, readFailed: false } }),
  useSetTagSyncToFile: () => ({ mutate: vi.fn(), isPending: false }),
}))

const wrap = (value: unknown) => ({ data: { value, readFailed: h.settings.readFailed } })
const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, isPending: false })

vi.mock('../data/index.js', () => ({
  useScanProgressQuery: () => ({ data: h.scanData, refetch: h.refetch }),
  useMetadataProgressQuery: () => ({ data: h.metaData, refetch: h.refetchMeta }),
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
  useMusicPathSetting: () => wrap(h.musicPathConfig),
  useDirNames: () => wrap(h.dirNames),
  useUpdateExcludeConfig: () => mutation(h.updateExcludeConfig),
}))

const { LibraryOpsPage } = await import('../pages/LibraryOpsPage.js')
const { useToastStore, toast } = await import('../../../shared/ui/toast-store.js')

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

afterEach(() => {
  // The polling tests below install fake timers; restore for everyone else.
  vi.useRealTimers()
  vi.clearAllMocks()
  toast.clear()
})

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

/**
 * The exclude-dir manager has no per-row subtitle slot (it is a freeform tab
 * editor, not `SettingsRow`s), so a failed `musicPath` read is surfaced as a
 * standalone hint instead — same failure, same "say so instead of lying
 * silently" rule as the switches above, different rendering shape.
 */
test('a failed exclude-config read is surfaced instead of silently defaulting to empty lists', async () => {
  h.settings.readFailed = true
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('exclude-read-error')?.textContent).toContain('Failed to read config')
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

/* -------------------------------------------------------------------- polling */

/**
 * Batch 40: the progress polls moved off query-core's `refetchInterval` onto an
 * explicit `setInterval` in the page, because the former stops firing after the
 * first fetch on this Lynx build (see `data/scan-query.ts`).
 *
 * These tests exist because the old arrangement had **no** coverage and worked by
 * accident: the interval callback was gated on `focusManager.isFocused()`, which
 * returned `true` only because `globalThis.document` is undefined on Lynx. A
 * single `setFocused(false)` anywhere would have killed progress polling silently.
 * So assert the interval actually re-fetches, and actually stops when terminal.
 */
async function renderWithFakeTimers() {
  vi.useFakeTimers()
  const q = await renderPage()
  // The mount fetch is query-core's, not the interval's — ignore it.
  h.refetch.mockClear()
  h.refetchMeta.mockClear()
  return q
}

test('a live scan re-fetches progress on every poll tick', async () => {
  h.scanData = parseScanProgress({ status: 'importing', scanned_files: 10, total_files: 100 })
  await renderWithFakeTimers()

  await act(async () => {
    vi.advanceTimersByTime(POLL_MS)
  })
  expect(h.refetch).toHaveBeenCalledTimes(1)

  // The tick must keep repeating, not fire once — that was the exact defect.
  await act(async () => {
    vi.advanceTimersByTime(POLL_MS * 3)
  })
  expect(h.refetch).toHaveBeenCalledTimes(4)
})

test('a terminal scan stops polling', async () => {
  h.scanData = parseScanProgress({ status: 'completed', local_song_count: 5 })
  await renderWithFakeTimers()

  await act(async () => {
    vi.advanceTimersByTime(POLL_MS * 5)
  })
  expect(h.refetch).not.toHaveBeenCalled()
})

test('an idle scan does not poll until a run is started', async () => {
  h.scanData = parseScanProgress({ status: 'idle' })
  const { queryByTestId } = await renderWithFakeTimers()

  await act(async () => {
    vi.advanceTimersByTime(POLL_MS * 2)
  })
  expect(h.refetch).not.toHaveBeenCalled()

  // `onSuccess` sets the sticky `forced` flag, which is what arms the interval
  // while the backend still answers `idle`.
  h.startScan.mockImplementation((_params, opts) => opts?.onSuccess?.(undefined))
  await act(async () => {
    fireEvent.tap(queryByTestId('scan-start')!)
  })
  await act(async () => {
    vi.advanceTimersByTime(POLL_MS)
  })
  expect(h.refetch).toHaveBeenCalledTimes(1)
})

test('the metadata refresh polls on its own interval', async () => {
  h.metaData = parseMetadataProgress({ status: 'running', total: 10, processed: 4 })
  await renderWithFakeTimers()

  await act(async () => {
    vi.advanceTimersByTime(POLL_MS * 2)
  })
  expect(h.refetchMeta).toHaveBeenCalledTimes(2)
  // The scan is idle here, so its interval must stay disarmed.
  expect(h.refetch).not.toHaveBeenCalled()
})

/* ------------------------------------------------------------------- chrome */

test('the back affordance routes to /settings', async () => {
  const navigate = installBackRouter('/settings/library')
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('libops-back')!)
  })
  expect(navigate).toHaveBeenCalledWith({ to: '/settings' })
})

test('a write failure raises a toast', async () => {
  // Was a dismissible inline banner; now the global toast (rendered by
  // `ToastHost`), so assert on the stored toast. Auto-dismiss is covered by
  // toast-store.test.ts.
  h.startMeta.mockImplementation((_v, opts) => opts?.onError?.(new Error('nope')))
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('meta-start')!)
  })
  const shown = useToastStore.getState().toast
  expect(shown).not.toBeNull()
  expect(shown?.tone).toBe('error')
  expect(shown?.text).toContain('Save failed')
})

/* ----------------------------------------------------------------- maintenance */

test('the maintenance entries render as rows inside a section', async () => {
  // They used to be hand-rolled bare cards: no horizontal margin (so 32px wider
  // than every section above), 12px of vertical padding instead of 16px, and a
  // border each so the pair showed a doubled hairline. Going through
  // SettingsSection/SettingsRow is what keeps them aligned with the page.
  const { queryByTestId, queryByText } = await renderPage()
  expect(queryByText('Maintenance')).toBeInTheDocument()
  expect(queryByTestId('libops-duplicates')).toBeInTheDocument()
  expect(queryByTestId('libops-clean-invalid')).toBeInTheDocument()
})

test('the duplicate-detection row opens the duplicates page', async () => {
  const { queryByTestId } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('libops-duplicates')!)
  })
  expect(h.navigateSpy).toHaveBeenCalledWith({ to: '/settings/duplicates' })
})

test('cleaning invalid songs reports the count on the row itself', async () => {
  // The count used to land in a loose line of text under the card; as the row's
  // subtitle it reads as belonging to the action that produced it.
  const { queryByTestId, queryByText } = await renderPage()
  await act(async () => {
    fireEvent.tap(queryByTestId('libops-clean-invalid')!)
    // `.then().finally()` on the API promise needs a few microtask turns before
    // the result state is committed.
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
  expect(h.cleanInvalid).toHaveBeenCalledTimes(1)
  expect(queryByText('Cleaned 3 invalid songs')).toBeInTheDocument()
})

test('"scan again" restores the controls instead of silently re-scanning', async () => {
  // It used to fire a scan on the spot, which skipped the skip/reimport choice and
  // the directory picker entirely — and since the server keeps reporting the last
  // run as completed, those controls were unreachable by any other route, so
  // "reimport" could not be selected at all.
  h.scanData = parseScanProgress({ status: 'completed', local_song_count: 3, skipped_files: 3 })
  const { queryByTestId } = await renderPage()
  expect(queryByTestId('scan-mode-reimport')).not.toBeInTheDocument()

  await act(async () => {
    fireEvent.tap(queryByTestId('scan-reset')!)
  })

  expect(h.startScan).not.toHaveBeenCalled()
  expect(queryByTestId('scan-mode-skip')).toBeInTheDocument()
  expect(queryByTestId('scan-mode-reimport')).toBeInTheDocument()
  expect(queryByTestId('scan-target-dirs')).toBeInTheDocument()
  expect(queryByTestId('scan-start')).toBeInTheDocument()
})

test('the restored controls can start a reimport', async () => {
  h.scanData = parseScanProgress({ status: 'completed', local_song_count: 3 })
  const { queryByTestId } = await renderPage()

  await act(async () => {
    fireEvent.tap(queryByTestId('scan-reset')!)
  })
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
