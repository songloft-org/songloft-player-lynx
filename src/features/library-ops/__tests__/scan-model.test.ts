import { describe, expect, test } from 'vitest'

import {
  parseMetadataProgress,
  parseScanProgress,
  type ScanStatus,
} from '../../../models/library-ops.js'
import {
  AUTO_SCAN_INTERVALS,
  PLAYLIST_MODES,
  POLL_MS,
  autoScanIntervalLabelKey,
  coerceIntervalSeconds,
  coercePlaylistMode,
  coerceScanMode,
  coerceTitleSource,
  deriveScanView,
  dirDisplayName,
  metadataBarValue,
  metadataPollInterval,
  metadataResultStatusKey,
  metadataViewKind,
  playlistModeLabelKey,
  scanLines,
  scanPollInterval,
  shouldInvalidateOnComplete,
} from '../domain/scan-model.js'

/** Build a real `ScanProgress` through the parser so derived flags are genuine. */
function progress(status: ScanStatus, extra: Record<string, unknown> = {}) {
  return parseScanProgress({ status, ...extra })
}

describe('deriveScanView', () => {
  test('no progress yet is idle', () => {
    const view = deriveScanView(undefined, false)
    expect(view.kind).toBe('idle')
    expect(view.canCancel).toBe(false)
  })

  test('idle status is idle', () => {
    expect(deriveScanView(progress('idle'), false).kind).toBe('idle')
  })

  test.each([
    ['scanning', 'discovering', true, true],
    ['importing', 'importing', false, true],
    ['splitting_cue', 'splitting-cue', true, true],
    ['creating_playlists', 'creating-playlists', true, false],
    ['cancelling', 'importing', false, false],
  ] as const)(
    'status %s maps to running/%s (indeterminate=%s, canCancel=%s)',
    (status, phase, indeterminate, canCancel) => {
      const view = deriveScanView(progress(status), false)
      expect(view.kind).toBe('running')
      expect(view.phase).toBe(phase)
      expect(view.indeterminate).toBe(indeterminate)
      expect(view.canCancel).toBe(canCancel)
    },
  )

  test.each([
    ['completed', 'completed'],
    ['cancelled', 'cancelled'],
    ['failed', 'failed'],
  ] as const)('terminal status %s maps to %s', (status, kind) => {
    const view = deriveScanView(progress(status), false)
    expect(view.kind).toBe(kind)
    expect(view.canCancel).toBe(false)
  })

  test('the playlist-creation phase cannot be cancelled', () => {
    expect(deriveScanView(progress('creating_playlists'), false).canCancel).toBe(false)
    expect(deriveScanView(progress('importing'), false).canCancel).toBe(true)
  })

  test('importing carries the server percentage', () => {
    const view = deriveScanView(
      progress('importing', { scanned_files: 60, total_files: 240 }),
      false,
    )
    expect(view.percent).toBe(25)
    expect(view.indeterminate).toBe(false)
  })

  /**
   * Regression for the Flutter defect: a failed *start* was written into the
   * progress object as `status: 'error'`, while the UI tested for `'failed'`, so
   * no branch matched and the whole scan area rendered blank. Here the start
   * failure is a separate argument, so it can never fall between branches.
   */
  test('a start failure yields failed regardless of the server status', () => {
    for (const status of ['idle', 'scanning', 'importing', 'completed'] as const) {
      expect(deriveScanView(progress(status), true).kind).toBe('failed')
    }
    expect(deriveScanView(undefined, true).kind).toBe('failed')
  })

  /**
   * The progress endpoint reports the *last* run's terminal status forever, so
   * without a local acknowledgement the scan area is pinned to that summary — even
   * across a remount — and the idle controls (skip/reimport, target directories)
   * cannot be reached at all. "Scan again" sets this flag.
   */
  test('a dismissed terminal result yields idle, so the controls come back', () => {
    for (const status of ['completed', 'cancelled', 'failed'] as const) {
      expect(deriveScanView(progress(status), false, true).kind).toBe('idle')
    }
  })

  test('dismissal never masks a live scan', () => {
    // Someone else (another client, the auto-scanner) can start a run while the
    // flag is set; hiding that would leave the page silently lying.
    for (const status of ['scanning', 'importing', 'creating_playlists'] as const) {
      expect(deriveScanView(progress(status), false, true).kind).toBe('running')
    }
  })

  test('dismissal does not swallow a fresh start failure', () => {
    expect(deriveScanView(progress('completed'), true, true).kind).toBe('failed')
  })
})

describe('scanLines', () => {
  test('discovering shows the running file count once it is non-zero', () => {
    expect(scanLines(progress('scanning'))).toEqual([{ key: 'libops.discovering' }])
    expect(scanLines(progress('scanning', { discovered_files: 42 }))).toEqual([
      { key: 'libops.discoveringProgress', params: { count: 42 } },
    ])
  })

  test('cue splitting shows the source count and the current file on its own line', () => {
    expect(scanLines(progress('splitting_cue'))).toEqual([{ key: 'libops.splittingCue' }])
    const lines = scanLines(
      progress('splitting_cue', { cue_split_sources: 3, current_file: '/m/a.flac' }),
    )
    expect(lines).toEqual([
      { key: 'libops.splittingCueProgress', params: { count: 3 } },
      { key: 'libops.currentFile', params: { file: '/m/a.flac' } },
    ])
  })

  test('playlist creation is a single static line', () => {
    expect(scanLines(progress('creating_playlists'))).toEqual([
      { key: 'libops.creatingPlaylists' },
    ])
  })

  test('importing shows the file plus the five counters', () => {
    const lines = scanLines(
      progress('importing', {
        current_file: '/m/b.mp3',
        scanned_files: 10,
        total_files: 20,
        imported_files: 7,
        skipped_files: 2,
        failed_files: 1,
      }),
    )
    expect(lines[0]).toEqual({ key: 'libops.scanningFile', params: { file: '/m/b.mp3' } })
    expect(lines[1]).toEqual({
      key: 'libops.progressStats',
      params: { scanned: 10, total: 20, imported: 7, skipped: 2, failed: 1 },
    })
  })
})

describe('scanPollInterval', () => {
  test('polls while the server is working', () => {
    expect(scanPollInterval(progress('importing'), false, false)).toBe(POLL_MS)
    expect(scanPollInterval(progress('cancelling'), false, false)).toBe(POLL_MS)
  })

  test('stops on every terminal state', () => {
    for (const status of ['completed', 'cancelled', 'failed'] as const) {
      expect(scanPollInterval(progress(status), false, false)).toBe(false)
    }
  })

  test('an idle server is not polled unless a start was just requested', () => {
    expect(scanPollInterval(progress('idle'), false, false)).toBe(false)
    expect(scanPollInterval(progress('idle'), true, false)).toBe(POLL_MS)
  })

  /**
   * The backend can still answer `idle` on the first poll after accepting a
   * scan; without the sticky flag a data-derived interval would never start.
   */
  test('with no data yet, only a forced start begins polling', () => {
    expect(scanPollInterval(undefined, false, false)).toBe(false)
    expect(scanPollInterval(undefined, true, false)).toBe(POLL_MS)
  })

  test('pausing wins over everything (the cancel handshake)', () => {
    expect(scanPollInterval(progress('importing'), true, true)).toBe(false)
    expect(scanPollInterval(undefined, true, true)).toBe(false)
  })

  /**
   * `forced` outranks a terminal status on purpose. Right after a start, the
   * first `GET /scan/progress` can still carry the *previous* run's terminal
   * value (the worker hasn't flipped state yet); stopping there is exactly the
   * "refresh again does nothing" bug. Termination is the *caller's* job: it
   * clears `forced` once a terminal status arrives that is newer than the start
   * (`dataUpdatedAt >= startedAt`), mirroring `DuplicateCheckPage`.
   */
  test('forced keeps polling even over a (possibly stale) terminal state', () => {
    expect(scanPollInterval(progress('completed'), true, false)).toBe(POLL_MS)
    expect(scanPollInterval(progress('failed'), true, false)).toBe(POLL_MS)
  })

  test('without forced, a terminal state stops polling', () => {
    expect(scanPollInterval(progress('completed'), false, false)).toBe(false)
  })
})

describe('metadataPollInterval', () => {
  test('mirrors the scan contract', () => {
    expect(metadataPollInterval(parseMetadataProgress({ status: 'running' }), false, false))
      .toBe(POLL_MS)
    expect(metadataPollInterval(parseMetadataProgress({ status: 'cancelling' }), false, false))
      .toBe(POLL_MS)
    // forced outranks a (possibly stale) terminal `done` — same reasoning as the
    // scan case above; the caller clears `forced` on a fresh terminal state.
    expect(metadataPollInterval(parseMetadataProgress({ status: 'done' }), true, false))
      .toBe(POLL_MS)
    expect(metadataPollInterval(parseMetadataProgress({ status: 'done' }), false, false))
      .toBe(false)
    expect(metadataPollInterval(parseMetadataProgress({ status: 'idle' }), false, false))
      .toBe(false)
    expect(metadataPollInterval(undefined, true, false)).toBe(POLL_MS)
    expect(metadataPollInterval(parseMetadataProgress({ status: 'running' }), false, true))
      .toBe(false)
  })
})

describe('shouldInvalidateOnComplete', () => {
  test('fires on the rising edge only', () => {
    expect(shouldInvalidateOnComplete('importing', 'completed')).toBe(true)
    expect(shouldInvalidateOnComplete(undefined, 'completed')).toBe(true)
  })

  test('does not re-fire while the status stays completed', () => {
    expect(shouldInvalidateOnComplete('completed', 'completed')).toBe(false)
  })

  test('other terminal states do not invalidate', () => {
    expect(shouldInvalidateOnComplete('importing', 'failed')).toBe(false)
    expect(shouldInvalidateOnComplete('importing', 'cancelled')).toBe(false)
  })
})

describe('metadata view helpers', () => {
  test('no progress is idle', () => {
    expect(metadataViewKind(undefined)).toBe('idle')
  })

  test('running covers cancelling', () => {
    expect(metadataViewKind(parseMetadataProgress({ status: 'running' }))).toBe('running')
    expect(metadataViewKind(parseMetadataProgress({ status: 'cancelling' }))).toBe('running')
  })

  /** Ports Flutter's `isDone && total > 0` gate — a fresh server has no remote songs. */
  test('a finished run that processed nothing falls back to idle', () => {
    expect(metadataViewKind(parseMetadataProgress({ status: 'done', total: 0 }))).toBe('idle')
    expect(metadataViewKind(parseMetadataProgress({ status: 'done', total: 5 }))).toBe('done')
  })

  test('the bar is indeterminate until a total is known', () => {
    expect(metadataBarValue(parseMetadataProgress({ status: 'running', total: 0 }))).toBeNull()
    expect(
      metadataBarValue(parseMetadataProgress({ status: 'running', total: 4, processed: 1 })),
    ).toBe(25)
  })

  test('result status keys cover the three finished states', () => {
    expect(metadataResultStatusKey(parseMetadataProgress({ status: 'done' })))
      .toBe('libops.metaStatusDone')
    expect(metadataResultStatusKey(parseMetadataProgress({ status: 'cancelled' })))
      .toBe('libops.metaStatusCancelled')
    expect(metadataResultStatusKey(parseMetadataProgress({ status: 'failed' })))
      .toBe('libops.metaStatusFailed')
  })
})

describe('option coercion', () => {
  test('scan mode falls back to skip', () => {
    expect(coerceScanMode('reimport')).toBe('reimport')
    expect(coerceScanMode('skip')).toBe('skip')
    expect(coerceScanMode('nope')).toBe('skip')
    expect(coerceScanMode(undefined)).toBe('skip')
  })

  test('playlist mode falls back to directory', () => {
    for (const mode of PLAYLIST_MODES) expect(coercePlaylistMode(mode)).toBe(mode)
    expect(coercePlaylistMode('nope')).toBe('directory')
    expect(coercePlaylistMode(null)).toBe('directory')
  })

  /**
   * The two `title_source` endpoints have **different** defaults —
   * `/settings/scan-title-source` is `tag`, `/settings/remote-title-source` is
   * `filename` — hence the explicit fallback argument.
   */
  test('title source honours the caller-supplied fallback', () => {
    expect(coerceTitleSource('filename', 'tag')).toBe('filename')
    expect(coerceTitleSource('nope', 'tag')).toBe('tag')
    expect(coerceTitleSource('nope', 'filename')).toBe('filename')
    expect(coerceTitleSource(undefined, 'filename')).toBe('filename')
  })

  test('interval options are the seven Flutter offered, in order', () => {
    expect([...AUTO_SCAN_INTERVALS]).toEqual([600, 1800, 3600, 10800, 21600, 43200, 86400])
  })

  test('an off-grid interval snaps to the nearest option instead of crashing a picker', () => {
    expect(coerceIntervalSeconds(3600)).toBe(3600)
    expect(coerceIntervalSeconds(900)).toBe(600)
    expect(coerceIntervalSeconds(2000)).toBe(1800)
    expect(coerceIntervalSeconds(99999)).toBe(86400)
  })

  test('a missing or non-positive interval falls back to one hour', () => {
    expect(coerceIntervalSeconds(undefined)).toBe(3600)
    expect(coerceIntervalSeconds(0)).toBe(3600)
    expect(coerceIntervalSeconds(-5)).toBe(3600)
    expect(coerceIntervalSeconds('nope')).toBe(3600)
  })

  test('every interval and playlist mode has a distinct label key', () => {
    const intervalKeys = AUTO_SCAN_INTERVALS.map(autoScanIntervalLabelKey)
    expect(new Set(intervalKeys).size).toBe(AUTO_SCAN_INTERVALS.length)
    const modeKeys = PLAYLIST_MODES.map(playlistModeLabelKey)
    expect(new Set(modeKeys).size).toBe(PLAYLIST_MODES.length)
  })
})

describe('dirDisplayName', () => {
  test('takes the last posix segment', () => {
    expect(dirDisplayName('/music/rock/60s')).toBe('60s')
    expect(dirDisplayName('/music')).toBe('music')
  })

  test('handles windows separators', () => {
    expect(dirDisplayName('C:\\music\\rock')).toBe('rock')
  })

  test('ignores trailing separators', () => {
    expect(dirDisplayName('/music/rock/')).toBe('rock')
    expect(dirDisplayName('/music/rock//')).toBe('rock')
  })

  test('the filesystem root renders as a slash, never an empty chip', () => {
    expect(dirDisplayName('/')).toBe('/')
    expect(dirDisplayName('')).toBe('/')
  })

  test('a bare name with no separator is returned as-is', () => {
    expect(dirDisplayName('rock')).toBe('rock')
  })
})
