import type {
  MetadataProgress,
  ScanProgress,
  ScanStatus,
} from '../../../models/library-ops.js'

/**
 * Pure domain logic for the library-ops (scan) sub-page — batch 19.
 *
 * Everything here is a pure function returning **i18n keys, never copy**, so it
 * stays unit-testable without pulling in i18next (same convention as
 * `features/settings/domain/settings-model.ts`'s `playModeLabelKey`).
 */

/* ------------------------------------------------------------------ scan mode */

/** Whether an existing song is skipped or its metadata overwritten. */
export const SCAN_MODES = ['skip', 'reimport'] as const
export type ScanMode = (typeof SCAN_MODES)[number]

export function coerceScanMode(value: unknown): ScanMode {
  return value === 'reimport' ? 'reimport' : 'skip'
}

export function scanModeLabelKey(mode: ScanMode): string {
  return mode === 'reimport' ? 'libops.scanModeReimport' : 'libops.scanModeSkip'
}

export function scanModeDescKey(mode: ScanMode): string {
  return mode === 'reimport'
    ? 'libops.scanModeReimportDesc'
    : 'libops.scanModeSkipDesc'
}

/* -------------------------------------------------------- playlist creation mode */

/** `GET/PUT /settings/scan-playlist-mode`. */
export const PLAYLIST_MODES = ['directory', 'top_level', 'bubble_up'] as const
export type PlaylistMode = (typeof PLAYLIST_MODES)[number]

export const DEFAULT_PLAYLIST_MODE: PlaylistMode = 'directory'

export function coercePlaylistMode(value: unknown): PlaylistMode {
  return PLAYLIST_MODES.includes(value as PlaylistMode)
    ? (value as PlaylistMode)
    : DEFAULT_PLAYLIST_MODE
}

export function playlistModeLabelKey(mode: PlaylistMode): string {
  switch (mode) {
    case 'top_level':
      return 'libops.playlistModeTopLevel'
    case 'bubble_up':
      return 'libops.playlistModeBubbleUp'
    default:
      return 'libops.playlistModeDirectory'
  }
}

export function playlistModeDescKey(mode: PlaylistMode): string {
  switch (mode) {
    case 'top_level':
      return 'libops.playlistModeTopLevelDesc'
    case 'bubble_up':
      return 'libops.playlistModeBubbleUpDesc'
    default:
      return 'libops.playlistModeDirectoryDesc'
  }
}

/* ------------------------------------------------------------- title source */

/**
 * `tag` prefers embedded audio tags, `filename` uses the file name. Used by two
 * independent endpoints with **different defaults**:
 * `/settings/scan-title-source` defaults to `tag`, while
 * `/settings/remote-title-source` defaults to `filename` — hence the explicit
 * fallback parameter.
 */
export const TITLE_SOURCES = ['tag', 'filename'] as const
export type TitleSource = (typeof TITLE_SOURCES)[number]

export function coerceTitleSource(value: unknown, fallback: TitleSource): TitleSource {
  return TITLE_SOURCES.includes(value as TitleSource)
    ? (value as TitleSource)
    : fallback
}

/* --------------------------------------------------------- auto-scan interval */

/** Selectable auto-scan periods in seconds (mirrors the Flutter dropdown). */
export const AUTO_SCAN_INTERVALS = [600, 1800, 3600, 10800, 21600, 43200, 86400] as const
export type AutoScanInterval = (typeof AUTO_SCAN_INTERVALS)[number]

export const DEFAULT_AUTO_SCAN_INTERVAL = 3600

/**
 * Snap an arbitrary backend value onto a selectable option. Flutter fed the raw
 * value straight into a `DropdownButtonFormField`, which asserts when the value
 * is not among the items; snapping to the nearest option keeps an off-grid
 * server value (e.g. 900s set via the API) selectable instead of crashing.
 */
export function coerceIntervalSeconds(value: unknown): AutoScanInterval {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_AUTO_SCAN_INTERVAL
  if (AUTO_SCAN_INTERVALS.includes(n as AutoScanInterval)) return n as AutoScanInterval
  let nearest: AutoScanInterval = AUTO_SCAN_INTERVALS[0]
  for (const option of AUTO_SCAN_INTERVALS) {
    if (Math.abs(option - n) < Math.abs(nearest - n)) nearest = option
  }
  return nearest
}

export function autoScanIntervalLabelKey(seconds: AutoScanInterval): string {
  switch (seconds) {
    case 600:
      return 'libops.interval10Min'
    case 1800:
      return 'libops.interval30Min'
    case 10800:
      return 'libops.interval3Hour'
    case 21600:
      return 'libops.interval6Hour'
    case 43200:
      return 'libops.interval12Hour'
    case 86400:
      return 'libops.interval24Hour'
    default:
      return 'libops.interval1Hour'
  }
}

/* --------------------------------------------------------- scan view state machine */

export type ScanViewKind = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed'

/** Sub-state of `running`; picks the copy and the progress-bar shape. */
export type ScanPhase =
  | 'discovering'
  | 'importing'
  | 'splitting-cue'
  | 'creating-playlists'

export interface ScanView {
  kind: ScanViewKind
  /** Only set when `kind === 'running'`. */
  phase?: ScanPhase
  /** 0-100 integer; meaningful only when `indeterminate` is false. */
  percent: number
  /** True while the server reports work with no countable total. */
  indeterminate: boolean
  /** False during playlist creation (the backend cannot cancel that phase). */
  canCancel: boolean
}

const IDLE_VIEW: ScanView = {
  kind: 'idle',
  percent: 0,
  indeterminate: false,
  canCancel: false,
}

/**
 * Single source of truth for what the scan area renders.
 *
 * `startError` is a **separate argument on purpose**. The Flutter reference
 * folded a failed `startScan` into the progress object as `status: 'error'`,
 * but its `isError` getter tests `status == 'failed'` — so `'error'` matched no
 * branch and the whole scan area rendered blank. Keeping the local failure out
 * of the server-owned status makes that class of mismatch impossible.
 *
 * `dismissed` is the local "I have read this result" flag behind the *Scan again*
 * button, and it exists because the server has no notion of acknowledgement: the
 * progress endpoint keeps reporting the **last** run's terminal status forever, so
 * without an override the scan area is stuck on that summary — even across a
 * remount — and the idle state, which is where the skip/reimport choice and the
 * directory picker live, is unreachable. It masks only a *terminal* status, never a
 * live one, so a scan started from elsewhere still surfaces.
 */
export function deriveScanView(
  progress: ScanProgress | undefined,
  startError: boolean,
  dismissed = false,
): ScanView {
  if (startError) {
    return { kind: 'failed', percent: 0, indeterminate: false, canCancel: false }
  }
  if (!progress) return IDLE_VIEW
  if (dismissed && progress.isTerminal) return IDLE_VIEW
  if (progress.isFailed) {
    return { kind: 'failed', percent: 0, indeterminate: false, canCancel: false }
  }
  if (progress.isCancelled) {
    return { kind: 'cancelled', percent: 0, indeterminate: false, canCancel: false }
  }
  if (progress.isCompleted) {
    return { kind: 'completed', percent: 100, indeterminate: false, canCancel: false }
  }
  if (!progress.isScanning) return IDLE_VIEW

  switch (progress.status) {
    case 'scanning':
      // Discovery walks the filesystem; no total is known yet.
      return {
        kind: 'running',
        phase: 'discovering',
        percent: 0,
        indeterminate: true,
        canCancel: true,
      }
    case 'splitting_cue':
      return {
        kind: 'running',
        phase: 'splitting-cue',
        percent: 0,
        indeterminate: true,
        canCancel: true,
      }
    case 'creating_playlists':
      return {
        kind: 'running',
        phase: 'creating-playlists',
        percent: 0,
        indeterminate: true,
        canCancel: false,
      }
    case 'cancelling':
      // Keep showing import stats, but the cancel affordance is already spent.
      return {
        kind: 'running',
        phase: 'importing',
        percent: progress.percent,
        indeterminate: false,
        canCancel: false,
      }
    default:
      return {
        kind: 'running',
        phase: 'importing',
        percent: progress.percent,
        indeterminate: false,
        canCancel: true,
      }
  }
}

/* --------------------------------------------------------------- progress copy */

/** An i18n key plus its interpolation params — resolved by the widget, not here. */
export interface ProgressLine {
  key: string
  params?: Record<string, string | number>
}

/**
 * The 1-2 lines of copy for a running scan. Returns keys + params rather than
 * finished strings so the phase branching stays unit-testable without i18next.
 */
export function scanLines(progress: ScanProgress): ProgressLine[] {
  switch (progress.status) {
    case 'scanning':
      return progress.discoveredFiles > 0
        ? [{ key: 'libops.discoveringProgress', params: { count: progress.discoveredFiles } }]
        : [{ key: 'libops.discovering' }]
    case 'splitting_cue': {
      const lines: ProgressLine[] = [
        progress.cueSplitSources > 0
          ? {
            key: 'libops.splittingCueProgress',
            params: { count: progress.cueSplitSources },
          }
          : { key: 'libops.splittingCue' },
      ]
      if (progress.currentFile) {
        lines.push({ key: 'libops.currentFile', params: { file: progress.currentFile } })
      }
      return lines
    }
    case 'creating_playlists':
      return [{ key: 'libops.creatingPlaylists' }]
    default:
      return [
        {
          key: 'libops.scanningFile',
          params: { file: progress.currentFile ?? '' },
        },
        {
          key: 'libops.progressStats',
          params: {
            scanned: progress.scannedFiles,
            total: progress.totalFiles,
            imported: progress.importedFiles,
            skipped: progress.skippedFiles,
            failed: progress.failedFiles,
          },
        },
      ]
  }
}

/* ------------------------------------------------------------------- polling */

export const POLL_MS = 2000

/**
 * Poll period for the scan progress query, or `false` to stop.
 *
 * `forced` means **"a run was just started and we have not yet seen fresh
 * evidence of its outcome"**. It exists for a real race: the backend worker may
 * not have started when the first `GET /scan/progress` lands, so the response
 * still describes the *previous* run — often a terminal `completed`/`done`. A
 * purely data-derived interval would then never start polling at all.
 *
 * **`forced` therefore outranks a terminal status.** It used to be checked
 * *after* it, which short-circuited the very race it was added for: tapping
 * "refresh again" right after a finished run left the page showing the previous
 * result with no progress bar, while the job ran to completion in the background
 * (only leaving and re-entering the page recovered). Termination is not at risk
 * because the caller clears `forced` as soon as a terminal status arrives that is
 * newer than the start (`dataUpdatedAt >= startedAt`), mirroring
 * `DuplicateCheckPage`'s `computingSinceRef` guard.
 *
 * `paused` is the cancel handshake (stop polling *before* sending cancel), and
 * outranks everything.
 */
export function scanPollInterval(
  progress: ScanProgress | undefined,
  forced: boolean,
  paused: boolean,
): number | false {
  if (paused) return false
  if (forced) return POLL_MS
  if (!progress) return false
  if (progress.isTerminal) return false
  return progress.isScanning ? POLL_MS : false
}

/** Same contract for the metadata-refresh poll — see {@link scanPollInterval}. */
export function metadataPollInterval(
  progress: MetadataProgress | undefined,
  forced: boolean,
  paused: boolean,
): number | false {
  if (paused) return false
  if (forced) return POLL_MS
  if (!progress) return false
  if (progress.isDone) return false
  return progress.isRunning ? POLL_MS : false
}

/**
 * Rising edge of "scan just completed" — the trigger to invalidate the song,
 * facet and playlist caches. Guards against re-firing while the status stays
 * `completed` across polls.
 */
export function shouldInvalidateOnComplete(
  prev: ScanStatus | undefined,
  next: ScanStatus,
): boolean {
  return next === 'completed' && prev !== 'completed'
}

/* ------------------------------------------------------- metadata refresh view */

export type MetadataViewKind = 'idle' | 'running' | 'done'

/**
 * Which of the three metadata rows to render.
 *
 * Ports Flutter's `isDone && total > 0` gate: a finished run that processed
 * nothing (`total === 0`) falls back to `idle` rather than showing an empty
 * "0 succeeded" result — that happens on a fresh server with no remote songs.
 */
export function metadataViewKind(progress: MetadataProgress | undefined): MetadataViewKind {
  if (!progress) return 'idle'
  if (progress.isRunning) return 'running'
  if (progress.isDone && progress.total > 0) return 'done'
  return 'idle'
}

/**
 * Progress bar value for the metadata row: `null` (indeterminate) while the
 * server has not reported a total yet — that is the "preparing" window.
 */
export function metadataBarValue(progress: MetadataProgress): number | null {
  return progress.total > 0 ? progress.percent : null
}

export function metadataResultStatusKey(progress: MetadataProgress): string {
  switch (progress.status) {
    case 'cancelled':
      return 'libops.metaStatusCancelled'
    case 'failed':
      return 'libops.metaStatusFailed'
    default:
      return 'libops.metaStatusDone'
  }
}

/* ------------------------------------------------------------------ path helper */

/**
 * Last segment of a directory path, for the selected-directory chips. Handles
 * both `/` and `\` separators and trailing slashes; the filesystem root renders
 * as `/` rather than an empty chip.
 */
export function dirDisplayName(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  if (trimmed.length === 0) return '/'
  let cut = -1
  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const ch = trimmed[i]
    if (ch === '/' || ch === '\\') {
      cut = i
      break
    }
  }
  const name = cut >= 0 ? trimmed.slice(cut + 1) : trimmed
  return name.length > 0 ? name : '/'
}
