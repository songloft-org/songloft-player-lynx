import { fileIo } from '@kit.CoreFileKit'
import { util, url } from '@kit.ArkTS'
import { common } from '@kit.AbilityKit'

/**
 * Process-wide client log file — the native-side sibling of the TS
 * `client-logger` (`src/core/logging/client-logger.ts`). Both write the same
 * `filesDir/logs/songloft_<yyyy-MM-dd>.log` file, so an exported log bundle
 * carries native diagnostics right next to the JS ones.
 *
 * Before this class existed the platform module's `logWrite` was a stub: the
 * JS sink probe saw a function, took the "native" path, and every log line
 * was silently dropped — an export's `frontend.log` was empty on HarmonyOS,
 * always. The same module's `logRead`/`shareFile` were stubs too, so the
 * diagnostics page could neither read back nor share what little it had.
 *
 * Line shapes:
 * - `writeRaw` appends verbatim — `SongloftPlatformModule.logWrite` (the TS
 *   path) lands here with lines already formatted (timestamp + redaction).
 * - `write` stamps `[HH:mm:ss.SSS] L/tag ` in the same shape the TS layer
 *   uses (`formatLogEntry`), so the file reads as one continuous timeline.
 *
 * ArkTS runs single-threaded (event loop), so no executor/queue is needed.
 * File lifecycle matches the Android/iOS implementations: per-day name,
 * 3-day sweep, 20 MB per-session cap.
 */
export class ClientFileLog {
  private static filesDir: string | null = null
  private static logPath: string | null = null
  private static sessionBytes: number = 0
  private static capReached: boolean = false
  private static readonly MAX_SESSION_BYTES: number = 20 * 1024 * 1024
  private static readonly MAX_AGE_DAYS: number = 3

  /** Idempotent; call from any holder of a context (the modules). */
  public static init(context: common.Context): void {
    if (ClientFileLog.filesDir !== null) {
      return
    }
    ClientFileLog.filesDir = context.filesDir
  }

  /** Append one already-formatted line (the TS `logWrite` path). */
  public static writeRaw(line: string): void {
    ClientFileLog.append(line)
  }

  /**
   * Append one line, stamped `[HH:mm:ss.SSS] L/tag ` to match the TS layer's
   * entry shape. Fire-and-forget; never throws into the caller.
   */
  public static write(level: string, tag: string, message: string): void {
    ClientFileLog.append(`[${ClientFileLog.timestamp()}] ${level}/${tag} ${message}`)
  }

  /** Read the current log file; callback receives (error, content-or-null). */
  public static read(callback: (error: string | null, content: string | null) => void): void {
    if (ClientFileLog.filesDir === null) {
      callback('not initialized', null)
      return
    }
    try {
      const file = ClientFileLog.ensureLogFile()
      if (file === null || !fileIo.accessSync(file)) {
        callback(null, null)
        return
      }
      const f = fileIo.openSync(file, fileIo.OpenMode.READ_ONLY)
      try {
        const stat = fileIo.statSync(f.fd)
        const buffer = new ArrayBuffer(stat.size)
        fileIo.readSync(f.fd, buffer)
        const text = util.TextDecoder.create('utf-8').decodeToString(new Uint8Array(buffer))
        callback(null, text)
      } finally {
        fileIo.closeSync(f.fd)
      }
    } catch (err) {
      callback(String(err), null)
    }
  }

  /** Log-safe text: null-aware, capped at 60 chars (lyric lines, titles). */
  public static truncText(value: string | null | undefined, max: number = 60): string {
    if (value === null || value === undefined || value === '') {
      return 'null'
    }
    return value.length <= max ? value : `${value.substring(0, max)}...`
  }

  /**
   * Log-safe URL: host + last path segment, never the query — the playback URL
   * carries `?access_token=…`, and native `ClientFileLog.write` does not run
   * the TS layer's token redaction (that only covers the `logWrite` path).
   */
  public static truncUrl(rawUrl: string | null | undefined): string {
    if (rawUrl === null || rawUrl === undefined || rawUrl === '') {
      return 'null'
    }
    const noQuery = rawUrl.split('?')[0]
    const last = noQuery.split('/').pop() ?? ''
    let host = ''
    try {
      const parsed: url.URL = url.URL.parseURL(rawUrl)
      host = parsed.host
    } catch (err) {
      // Not a parseable absolute URL — the last path segment alone is fine.
    }
    return ClientFileLog.truncText(host !== '' ? `${host}/${last}` : last)
  }

  private static append(line: string): void {
    if (ClientFileLog.capReached || ClientFileLog.filesDir === null) {
      return
    }
    try {
      const file = ClientFileLog.ensureLogFile()
      if (file === null) {
        return
      }
      const text = line + '\n'
      // `text.length` counts UTF-16 units, not bytes — CJK lines undercount.
      // The cap is a soft brake on runaway growth, not a quota, so close
      // enough is the point.
      if (ClientFileLog.sessionBytes + text.length > ClientFileLog.MAX_SESSION_BYTES) {
        ClientFileLog.capReached = true
        ClientFileLog.appendDirect(file,
          `[ClientFileLog] session log cap reached ` +
          `(${ClientFileLog.MAX_SESSION_BYTES / (1024 * 1024)}MB); further lines go to hilog only\n`)
        return
      }
      ClientFileLog.appendDirect(file, text)
      ClientFileLog.sessionBytes += text.length
    } catch (err) {
      // Logging must never crash the code path being logged.
    }
  }

  private static appendDirect(file: string, text: string): void {
    const f = fileIo.openSync(file,
      fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.CREATE | fileIo.OpenMode.APPEND)
    try {
      fileIo.writeSync(f.fd, text)
    } finally {
      fileIo.closeSync(f.fd)
    }
  }

  /** Lazily create today's log file and sweep files older than 3 days. */
  private static ensureLogFile(): string | null {
    if (ClientFileLog.logPath !== null) {
      return ClientFileLog.logPath
    }
    const dir = `${ClientFileLog.filesDir}/logs`
    if (!fileIo.accessSync(dir)) {
      fileIo.mkdirSync(dir)
    }
    ClientFileLog.cleanOldLogs(dir)
    ClientFileLog.logPath = `${dir}/songloft_${ClientFileLog.today()}.log`
    return ClientFileLog.logPath
  }

  private static cleanOldLogs(dir: string): void {
    try {
      const cutoff = Date.now() - ClientFileLog.MAX_AGE_DAYS * 24 * 60 * 60 * 1000
      const names: string[] = fileIo.listFileSync(dir)
      for (const name of names) {
        // Same file-name shape as Flutter's `_logNamePattern`, so cleanup only
        // ever touches files this feature wrote.
        const match = new RegExp('^songloft_(\\d{4}-\\d{2}-\\d{2})(?:_[A-Za-z0-9]+)?\\.log$').exec(name)
        if (match === null) {
          continue
        }
        const parsed = Date.parse(`${match[1]}T00:00:00`)
        if (!Number.isNaN(parsed) && parsed < cutoff) {
          fileIo.unlinkSync(`${dir}/${name}`)
        }
      }
    } catch (err) {
      // Cleanup is best-effort; never block logging on it.
    }
  }

  private static today(): string {
    const now = new Date()
    return `${now.getFullYear()}-${ClientFileLog.pad2(now.getMonth() + 1)}-${ClientFileLog.pad2(now.getDate())}`
  }

  private static timestamp(): string {
    const now = new Date()
    return `${ClientFileLog.pad2(now.getHours())}:${ClientFileLog.pad2(now.getMinutes())}:` +
      `${ClientFileLog.pad2(now.getSeconds())}.${ClientFileLog.pad3(now.getMilliseconds())}`
  }

  private static pad2(n: number): string {
    return n < 10 ? `0${n}` : `${n}`
  }

  private static pad3(n: number): string {
    return n < 10 ? `00${n}` : (n < 100 ? `0${n}` : `${n}`)
  }
}
