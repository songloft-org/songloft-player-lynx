import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'

/**
 * The export service is a thin orchestrator, and it now has **two** paths that
 * must stay behaviourally interchangeable:
 *
 * - the native fast path (`shareLogArchive`), where the host downloads, copies,
 *   zips and shares — JS hands over three short strings and nothing else;
 * - the JS path (`shareFile`), for Web and shells without that method.
 *
 * The fast path exists because the JS one had to deflate + base64 up to 30 MB
 * (10 MiB backend + 20 MB client log) on the JS thread of an engine with no JIT,
 * which is what put a long pause in front of the share sheet
 * (songloft-player-lynx#3). So the tests pin *both* that the fast path is taken
 * when available and that it does none of that work, plus the orchestration
 * semantics inherited from Flutter's `LogExportService` on the JS path:
 * - a backend failure must not block the export (an explanatory
 *   `backend-error.txt` goes into the archive instead);
 * - an empty side is omitted;
 * - nothing at all → throw;
 * - the archive is a valid zip named `songloft-logs-<stamp>.zip`.
 */
const {
  exportLogsSpy,
  readClientLogSpy,
  shareFileSpy,
  shareLogArchiveSpy,
  capabilitiesSpy,
  tokenRef,
} = vi.hoisted(() => ({
  tokenRef: { value: 'test-token' as string | null },
  exportLogsSpy: vi.fn(async () => 'backend line one\n'),
  readClientLogSpy: vi.fn(async () => 'frontend line one\n'),
  shareFileSpy: vi.fn(async (_base64: string, _fileName: string, _mimeType: string) => {}),
  shareLogArchiveSpy: vi.fn(async (_url: string, _authHeader: string, _fileName: string) => ({
    hasBackend: true,
    hasFrontend: true,
  })),
  capabilitiesSpy: vi.fn(() => ({ fastLogExport: false })),
}))

vi.mock('../api/index.js', () => ({
  getSettingsApi: () => ({ exportLogs: exportLogsSpy }),
}))

vi.mock('../../../core/logging/client-logger.js', () => ({
  readClientLog: readClientLogSpy,
}))

vi.mock('../../../native/native-platform.js', () => ({
  shareFile: shareFileSpy,
  shareLogArchive: shareLogArchiveSpy,
}))

vi.mock('../../../native/platform-capabilities.js', () => ({
  getPlatformCapabilities: capabilitiesSpy,
}))

vi.mock('../../../core/network/token-cache.js', () => ({
  getCachedAccessToken: () => tokenRef.value,
}))

const { appConfig } = await import('../../../core/config/app-config.js')
const { exportAndShareLogs } = await import('../data/log-export.js')

beforeEach(() => {
  appConfig.baseUrl = 'https://songloft.example'
  tokenRef.value = 'test-token'
})

afterEach(() => {
  vi.clearAllMocks()
  exportLogsSpy.mockResolvedValue('backend line one\n')
  readClientLogSpy.mockResolvedValue('frontend line one\n')
  shareLogArchiveSpy.mockResolvedValue({ hasBackend: true, hasFrontend: true })
  capabilitiesSpy.mockReturnValue({ fastLogExport: false })
  appConfig.reset()
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

describe('exportAndShareLogs on the native fast path', () => {
  beforeEach(() => {
    capabilitiesSpy.mockReturnValue({ fastLogExport: true })
  })

  test('hands the host a URL, a bearer header and the archive name', async () => {
    const result = await exportAndShareLogs()
    expect(result).toEqual({ hasBackend: true, hasFrontend: true })
    expect(shareLogArchiveSpy).toHaveBeenCalledTimes(1)
    const [url, authHeader, fileName] = shareLogArchiveSpy.mock.calls[0]
    expect(url).toBe('https://songloft.example/api/v1/logs/export')
    // A header, not `?access_token=` — the query form lands in access logs, and
    // these logs are about to be attached to a public issue.
    expect(authHeader).toBe('Bearer test-token')
    expect(url).not.toContain('access_token')
    expect(fileName).toMatch(/^songloft-logs-\d{8}-\d{6}\.zip$/)
  })

  test('uses resolvedBaseUrl, so a redirected/bundle server still works', async () => {
    appConfig.resolvedBaseUrl = 'http://192.168.1.9:58091'
    await exportAndShareLogs()
    expect(shareLogArchiveSpy.mock.calls[0][0]).toBe('http://192.168.1.9:58091/api/v1/logs/export')
  })

  test('does none of the work that made the export slow', async () => {
    await exportAndShareLogs()
    // The whole point: no backend fetch through JS, no client log read into a JS
    // string, no zip, no base64, no bridge payload.
    expect(exportLogsSpy).not.toHaveBeenCalled()
    expect(readClientLogSpy).not.toHaveBeenCalled()
    expect(shareFileSpy).not.toHaveBeenCalled()
  })

  test('reports the sides the host actually archived', async () => {
    shareLogArchiveSpy.mockResolvedValueOnce({ hasBackend: false, hasFrontend: true })
    await expect(exportAndShareLogs()).resolves.toEqual({
      hasBackend: false,
      hasFrontend: true,
    })
  })

  test('a host-side failure propagates to the caller', async () => {
    shareLogArchiveSpy.mockRejectedValueOnce(new Error('no logs to export'))
    await expect(exportAndShareLogs()).rejects.toThrow('no logs to export')
  })

  test('sends an empty header rather than "Bearer null" when signed out', async () => {
    tokenRef.value = null
    await exportAndShareLogs()
    expect(shareLogArchiveSpy.mock.calls[0][1]).toBe('')
  })
})

describe('exportAndShareLogs on the JS path', () => {
  test('bundles backend and frontend logs into a valid zip', async () => {
    const result = await exportAndShareLogs()
    expect(result).toEqual({ hasBackend: true, hasFrontend: true })
    const files = decodeSharedZip()
    expect(files['backend.log']).toBe('backend line one\n')
    expect(files['frontend.log']).toBe('frontend line one\n')
  })

  test('never reaches for the native archive method', async () => {
    await exportAndShareLogs()
    expect(shareLogArchiveSpy).not.toHaveBeenCalled()
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
