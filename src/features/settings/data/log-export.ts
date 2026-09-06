/**
 * Log export — the Lynx port of Flutter's `LogExportService`
 * (`songloft-player/lib/features/settings/data/log_export_service.dart`).
 *
 * Two paths, same user-visible outcome:
 *
 * 1. **Native fast path** (`SongloftPlatform.shareLogArchive`). JS hands over
 *    three short strings — the backend log URL, an `Authorization` value and the
 *    archive name — and the host downloads, copies its own client log file,
 *    zips and presents the share sheet. Nothing large crosses the bridge.
 * 2. **JS path** (`shareFile`), for Web and for a hot-updated bundle on a shell
 *    that predates the method: fetch the backend log, read the client log, zip
 *    with `fflate`, base64 it, hand the payload over.
 *
 * Path 2 was the only implementation, and it is why this feature felt broken:
 * the two sides cap at 10 MiB (backend) + 20 MB (client log), and deflating
 * plus base64-encoding that much on the JS thread of an engine with no JIT put
 * a long visible pause in front of the share sheet — while the Flutter build,
 * which does the same work in AOT Dart and passes `share_plus` a file path,
 * felt instant (songloft-player-lynx#3). The same bytes also crossed the bridge
 * twice: client log out as a string, base64 archive back in.
 *
 * Semantics kept from the Flutter reference on **both** paths:
 * - a backend fetch failure does NOT block the export — a `backend-error.txt`
 *   explaining the failure goes into the archive instead;
 * - an empty side is simply omitted (`frontend.log` / `backend.log`);
 * - nothing to export at all → throw, the caller surfaces the error.
 */

import { strToU8, zipSync } from 'fflate'

import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { readClientLog } from '../../../core/logging/client-logger.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import { bytesToBase64 } from '../../../core/utils/base64.js'
import { shareFile, shareLogArchive } from '../../../native/native-platform.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { getSettingsApi } from '../api/index.js'

/** Which sides actually made it into the archive (drives the success text). */
export interface LogExportResult {
  hasBackend: boolean
  hasFrontend: boolean
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/** `yyyyMMdd-HHmmss`, same archive-name stamp as Flutter. */
function archiveStamp(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
    + `-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
}

/**
 * Build the log archive and present the OS share sheet.
 * Resolves once the sheet is presented; rejects when there is nothing to
 * export or the native share fails.
 */
export async function exportAndShareLogs(): Promise<LogExportResult> {
  const fileName = `songloft-logs-${archiveStamp(new Date())}.zip`
  if (getPlatformCapabilities().fastLogExport) {
    return shareLogArchive(backendLogUrl(), authHeaderValue(), fileName)
  }
  return exportAndShareLogsInJs(fileName)
}

/**
 * The absolute URL the host downloads the backend log from.
 *
 * `resolvedBaseUrl` (not `baseUrl`) because a Bundle-mode/redirected server has
 * its real address only there — the same value the degraded "open the log URL"
 * path in `DiagnosticsPage` uses.
 */
function backendLogUrl(): string {
  return `${appConfig.resolvedBaseUrl}${apiPrefix}/logs/export`
}

/**
 * `Authorization` value for that download, or '' when there is no token.
 *
 * A header rather than the `?access_token=` query param the degraded path uses:
 * the query form would land in the host's and the server's access logs, and
 * these logs are about to be attached to a public issue.
 *
 * Trade-off worth knowing: this bypasses the HTTP client's 401 refresh
 * interceptor, so an expired token yields `backend-error.txt: HTTP 401` in the
 * archive rather than a silently refreshed request. That degrades one side of
 * the export instead of failing it, which is the same bargain as being offline.
 */
function authHeaderValue(): string {
  const token = getCachedAccessToken()
  return token ? `Bearer ${token}` : ''
}

/**
 * Collect, zip and share entirely in JS. Web's only path (the host bridge turns
 * `shareFile` into a browser download there, and the client log lives in an
 * in-memory buffer that no native side can read), and the fallback for shells
 * without `shareLogArchive`.
 */
async function exportAndShareLogsInJs(fileName: string): Promise<LogExportResult> {
  const files: Record<string, Uint8Array> = {}
  let hasBackend = false
  let hasFrontend = false

  // Backend logs. A failure here must not block the export — write an error
  // note into the archive so the receiver can tell why backend.log is missing.
  try {
    const text = await getSettingsApi().exportLogs()
    if (text.length > 0) {
      files['backend.log'] = strToU8(text)
      hasBackend = true
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    files['backend-error.txt'] = strToU8(`Failed to fetch backend logs: ${message}\n`)
  }

  // Client logs. `readClientLog` already degrades to '' on any failure.
  const clientLog = await readClientLog()
  if (clientLog.length > 0) {
    files['frontend.log'] = strToU8(clientLog)
    hasFrontend = true
  }

  if (Object.keys(files).length === 0) {
    throw new Error('no logs to export')
  }

  // zipSync (not the async API): the sync path never tries to spawn a Worker —
  // which does not exist in this realm.
  const zipBytes = zipSync(files)
  await shareFile(bytesToBase64(zipBytes), fileName, 'application/zip')
  return { hasBackend, hasFrontend }
}
