/**
 * Log export — the Lynx port of Flutter's `LogExportService`
 * (`songloft-player/lib/features/settings/data/log_export_service.dart`).
 *
 * Collects the backend's sanitized logs (`GET /api/v1/logs/export`) and the
 * client log (native file on device, in-memory buffer on Web), zips them with
 * `fflate` and hands the archive to the OS share sheet through the
 * `SongloftPlatform.shareFile` native method.
 *
 * Semantics kept from the Flutter reference:
 * - a backend fetch failure does NOT block the export — a `backend-error.txt`
 *   explaining the failure goes into the archive instead;
 * - an empty side is simply omitted (`frontend.log` / `backend.log`);
 * - nothing to export at all → throw, the caller surfaces the error.
 */

import { strToU8, zipSync } from 'fflate'

import { readClientLog } from '../../../core/logging/client-logger.js'
import { bytesToBase64 } from '../../../core/utils/base64.js'
import { shareFile } from '../../../native/native-platform.js'
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

  // zipSync (not the async API): the archive is small, and the sync path never
  // tries to spawn a Worker — which does not exist in this realm.
  const zipBytes = zipSync(files)
  const fileName = `songloft-logs-${archiveStamp(new Date())}.zip`
  await shareFile(bytesToBase64(zipBytes), fileName, 'application/zip')
  return { hasBackend, hasFrontend }
}
