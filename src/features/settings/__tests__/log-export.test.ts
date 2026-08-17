import { afterEach, describe, expect, test, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'

/**
 * The export service is a thin orchestrator over three collaborators — the
 * settings API (backend logs), the client logger (frontend logs) and the
 * native share sheet — so the tests mock all three and pin the orchestration
 * semantics inherited from Flutter's `LogExportService`:
 * - a backend failure must not block the export (an explanatory
 *   `backend-error.txt` goes into the archive instead);
 * - an empty side is omitted;
 * - nothing at all → throw;
 * - the archive is a valid zip named `songloft-logs-<stamp>.zip`.
 */
const { exportLogsSpy, readClientLogSpy, shareFileSpy } = vi.hoisted(() => ({
  exportLogsSpy: vi.fn(async () => 'backend line one\n'),
  readClientLogSpy: vi.fn(async () => 'frontend line one\n'),
  shareFileSpy: vi.fn(async (_base64: string, _fileName: string, _mimeType: string) => {}),
}))

vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({ exportLogs: exportLogsSpy }),
}))

vi.mock('../../../core/logging/client-logger.js', () => ({
  readClientLog: readClientLogSpy,
}))

vi.mock('../../../native/native-platform.js', () => ({
  shareFile: shareFileSpy,
}))

const { exportAndShareLogs } = await import('../data/log-export.js')

afterEach(() => {
  vi.clearAllMocks()
  exportLogsSpy.mockResolvedValue('backend line one\n')
  readClientLogSpy.mockResolvedValue('frontend line one\n')
})

/** Decode the base64 the service handed to the share sheet and unzip it. */
function decodeSharedZip(): Record<string, string> {
  expect(shareFileSpy).toHaveBeenCalledTimes(1)
  const [base64, fileName, mimeType] = shareFileSpy.mock.calls[0]
  expect(fileName).toMatch(/^songloft-logs-\d{8}-\d{6}\.zip$/)
  expect(mimeType).toBe('application/zip')
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'))
  const entries = unzipSync(bytes)
  const out: Record<string, string> = {}
  for (const [name, data] of Object.entries(entries)) {
    out[name] = strFromU8(data)
  }
  return out
}

describe('exportAndShareLogs', () => {
  test('bundles backend and frontend logs into a valid zip', async () => {
    const result = await exportAndShareLogs()
    expect(result).toEqual({ hasBackend: true, hasFrontend: true })
    const files = decodeSharedZip()
    expect(files['backend.log']).toBe('backend line one\n')
    expect(files['frontend.log']).toBe('frontend line one\n')
  })

  test('a backend failure writes backend-error.txt instead of aborting', async () => {
    exportLogsSpy.mockRejectedValueOnce(new Error('offline'))
    const result = await exportAndShareLogs()
    expect(result).toEqual({ hasBackend: false, hasFrontend: true })
    const files = decodeSharedZip()
    expect(files['backend.log']).toBeUndefined()
    expect(files['backend-error.txt']).toContain('offline')
    expect(files['frontend.log']).toBe('frontend line one\n')
  })

  test('an empty frontend log is omitted', async () => {
    readClientLogSpy.mockResolvedValueOnce('')
    const result = await exportAndShareLogs()
    expect(result).toEqual({ hasBackend: true, hasFrontend: false })
    const files = decodeSharedZip()
    expect(files['frontend.log']).toBeUndefined()
    expect(files['backend.log']).toBe('backend line one\n')
  })

  test('throws when there is nothing to export', async () => {
    exportLogsSpy.mockResolvedValueOnce('')
    readClientLogSpy.mockResolvedValueOnce('')
    await expect(exportAndShareLogs()).rejects.toThrow('no logs to export')
    expect(shareFileSpy).not.toHaveBeenCalled()
  })

  test('a share failure propagates to the caller', async () => {
    shareFileSpy.mockRejectedValueOnce(new Error('share unavailable'))
    await expect(exportAndShareLogs()).rejects.toThrow('share unavailable')
  })
})
