import { describe, expect, test } from 'vitest'

import {
  parseAutoScanSetting,
  parseDirectoryList,
  parseEnabledFlag,
  parseMetadataProgress,
  parseScanProgress,
} from '../library-ops.js'

/**
 * The backend sends `null` for absent fields and occasionally stringified ints;
 * `.default()` does not cover `null`, so every field uses `.catch()` +
 * `z.coerce.number()`. A single throw here would blank the whole scan page on
 * device while local builds stayed green (AGENTS.md §2).
 */
describe('parseScanProgress tolerance', () => {
  test('an empty payload yields the idle zero state', () => {
    const p = parseScanProgress({})
    expect(p.status).toBe('idle')
    expect(p.totalFiles).toBe(0)
    expect(p.scannedFiles).toBe(0)
    expect(p.localSongCount).toBe(0)
    expect(p.percent).toBe(0)
    expect(p.isIdle).toBe(true)
    expect(p.isScanning).toBe(false)
  })

  test('a null-heavy payload does not throw and falls back per field', () => {
    const p = parseScanProgress({
      status: null,
      current_file: null,
      discovered_files: null,
      total_files: null,
      scanned_files: null,
      imported_files: null,
      skipped_files: null,
      failed_files: null,
      cue_split_sources: null,
      local_song_count: null,
    })
    expect(p.status).toBe('idle')
    expect(p.currentFile).toBeUndefined()
    expect(p.totalFiles).toBe(0)
    expect(p.percent).toBe(0)
  })

  test('stringified integers are coerced', () => {
    const p = parseScanProgress({ status: 'importing', scanned_files: '30', total_files: '120' })
    expect(p.scannedFiles).toBe(30)
    expect(p.totalFiles).toBe(120)
    expect(p.percent).toBe(25)
  })

  test('an unknown status collapses to idle so the phase machine stays total', () => {
    expect(parseScanProgress({ status: 'wat' }).status).toBe('idle')
    // 'error' is what the Flutter client wrote on a failed start; it is not a
    // real backend status and must not be mistaken for 'failed'.
    expect(parseScanProgress({ status: 'error' }).status).toBe('idle')
  })

  test('percent floors and clamps', () => {
    expect(parseScanProgress({ scanned_files: 1, total_files: 3 }).percent).toBe(33)
    expect(parseScanProgress({ scanned_files: 5, total_files: 0 }).percent).toBe(0)
    expect(parseScanProgress({ scanned_files: 200, total_files: 100 }).percent).toBe(100)
  })

  test('the backend failure reason is surfaced, and blank is treated as absent', () => {
    expect(parseScanProgress({ status: 'failed', error: 'ffmpeg missing' }).errorMessage)
      .toBe('ffmpeg missing')
    expect(parseScanProgress({ status: 'failed', error: '' }).errorMessage).toBeUndefined()
    expect(parseScanProgress({ status: 'failed', error: null }).errorMessage).toBeUndefined()
    expect(parseScanProgress({ status: 'failed' }).errorMessage).toBeUndefined()
  })

  test('isScanning covers cancelling, and terminal flags are exclusive', () => {
    expect(parseScanProgress({ status: 'cancelling' }).isScanning).toBe(true)
    expect(parseScanProgress({ status: 'creating_playlists' }).isScanning).toBe(true)
    expect(parseScanProgress({ status: 'completed' }).isTerminal).toBe(true)
    expect(parseScanProgress({ status: 'cancelled' }).isTerminal).toBe(true)
    expect(parseScanProgress({ status: 'failed' }).isTerminal).toBe(true)
    expect(parseScanProgress({ status: 'importing' }).isTerminal).toBe(false)
  })
})

describe('parseMetadataProgress', () => {
  test('defaults on an empty payload', () => {
    const m = parseMetadataProgress({})
    expect(m.status).toBe('idle')
    expect(m.total).toBe(0)
    expect(m.completedCount).toBe(0)
    expect(m.percent).toBe(0)
  })

  test('percent is a 0-100 integer, not the 0..1 double the Flutter model used', () => {
    const m = parseMetadataProgress({ status: 'running', total: 8, processed: 3, failed: 1 })
    expect(m.completedCount).toBe(4)
    expect(m.percent).toBe(50)
    expect(Number.isInteger(m.percent)).toBe(true)
  })

  test('running covers cancelling; done covers cancelled and failed', () => {
    expect(parseMetadataProgress({ status: 'cancelling' }).isRunning).toBe(true)
    expect(parseMetadataProgress({ status: 'cancelled' }).isDone).toBe(true)
    expect(parseMetadataProgress({ status: 'failed' }).isDone).toBe(true)
    expect(parseMetadataProgress({ status: 'done' }).isDone).toBe(true)
    expect(parseMetadataProgress({ status: 'running' }).isDone).toBe(false)
  })
})

describe('parseAutoScanSetting', () => {
  test('empty payload defaults to disabled at one hour', () => {
    expect(parseAutoScanSetting({})).toEqual({ enabled: false, intervalSeconds: 3600 })
  })

  test('a null interval falls back rather than becoming 0', () => {
    expect(parseAutoScanSetting({ enabled: true, interval_seconds: null }))
      .toEqual({ enabled: true, intervalSeconds: 3600 })
  })

  test('a non-positive interval falls back', () => {
    expect(parseAutoScanSetting({ interval_seconds: 0 }).intervalSeconds).toBe(3600)
  })
})

describe('parseEnabledFlag', () => {
  test('real booleans pass through', () => {
    expect(parseEnabledFlag({ enabled: true }, false)).toBe(true)
    expect(parseEnabledFlag({ enabled: false }, true)).toBe(false)
  })

  test('the per-endpoint fallback is used when the key is missing or null', () => {
    expect(parseEnabledFlag({}, true)).toBe(true)
    expect(parseEnabledFlag({ enabled: null }, true)).toBe(true)
    expect(parseEnabledFlag({}, false)).toBe(false)
  })

  test('the string "false" is false — z.coerce.boolean() would have made it true', () => {
    expect(parseEnabledFlag({ enabled: 'false' }, true)).toBe(false)
    expect(parseEnabledFlag({ enabled: '0' }, true)).toBe(false)
    expect(parseEnabledFlag({ enabled: 'true' }, false)).toBe(true)
    expect(parseEnabledFlag({ enabled: 1 }, false)).toBe(true)
    expect(parseEnabledFlag({ enabled: 0 }, true)).toBe(false)
  })
})

describe('parseDirectoryList', () => {
  test('maps snake_case and defaults has_children', () => {
    const list = parseDirectoryList({
      root: '/music',
      directories: [
        { name: 'rock', path: '/music/rock', has_children: true },
        { name: 'jazz', path: '/music/jazz' },
      ],
    })
    expect(list.root).toBe('/music')
    expect(list.directories).toEqual([
      { name: 'rock', path: '/music/rock', hasChildren: true },
      { name: 'jazz', path: '/music/jazz', hasChildren: false },
    ])
  })

  test('missing directories/root do not throw', () => {
    expect(parseDirectoryList({})).toEqual({ directories: [], root: '' })
    expect(parseDirectoryList({ directories: null, root: null }))
      .toEqual({ directories: [], root: '' })
  })

  /**
   * The real response, captured from a live backend (batch 19b). Swagger declares
   * this endpoint's 200 as `additionalProperties: true`, so until now the
   * `{directories, root}` shape was only an assumption inherited from the Flutter
   * client — it is confirmed, with two details worth pinning:
   *  - an empty directory yields `"directories": null`, **not** `[]` (the exact
   *    `null` case AGENTS.md §2 warns about; survives only via `.catch([])`);
   *  - `root` echoes `music_path` verbatim, so it can be a *relative* path.
   */
  test('the live-backend empty listing (`directories: null`) parses to an empty tree', () => {
    expect(parseDirectoryList({ directories: null, root: 'music' }))
      .toEqual({ directories: [], root: 'music' })
  })

  test('entries without a usable path are dropped (Flutter threw on these)', () => {
    const list = parseDirectoryList({
      directories: [{ name: 'ok', path: '/a' }, { name: 'broken' }, {}],
    })
    expect(list.directories).toEqual([{ name: 'ok', path: '/a', hasChildren: false }])
  })
})
