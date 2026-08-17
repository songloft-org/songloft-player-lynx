/**
 * Client-side logger — the Lynx port of Flutter's `FileLogger`
 * (`songloft-player/lib/core/utils/file_logger*.dart`).
 *
 * - Native platforms: lines are appended to a per-day file
 *   (`<filesDir>/logs/songloft_<yyyy-MM-dd>.log`) by the `SongloftPlatform`
 *   native module, which also owns the 3-day cleanup and the 20 MB session cap
 *   (mirrors `file_logger_native.dart`).
 * - Web (and any host without the native module): an in-memory ring buffer
 *   capped at ~2 MB of characters, oldest lines dropped first — a verbatim port
 *   of `file_logger_stub.dart`.
 *
 * Timestamps and token redaction happen **here**, once, so the native file
 * appender and the Web buffer share identical line format and sanitization.
 * Native is deliberately a dumb "append a line / read the file" pipe.
 */

import { clientVersion } from '../config/constants.js'
import { appendClientLog, readClientLogFile } from '../../native/native-platform.js'
import { readSystemInfo } from '../../native/native-modules.js'

/** In-memory buffer cap (Web fallback), in characters — mirrors the Flutter stub. */
const MAX_BUFFER_CHARS = 2 * 1024 * 1024

/**
 * Sensitive-token redaction, kept byte-for-byte identical to the Flutter
 * implementations: `access_token=…` / `token=…` query-param values become `***`
 * so usable credentials never land in an exported log.
 */
const TOKEN_PATTERN = /((?:access_token|token)=)[^&\s]+/gi

export function redactTokens(line: string): string {
  return line.replace(TOKEN_PATTERN, '$1***')
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0')
}

/** `[HH:mm:ss.SSS] <redacted line>` — same entry shape as Flutter. */
export function formatLogEntry(date: Date, line: string): string {
  const ts = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${pad3(date.getMilliseconds())}`
  return `[${ts}] ${redactTokens(line)}`
}

const buffer: string[] = []
let bufferChars = 0
let nativeSink: boolean | null = null
let initialized = false
// Separate from `initialized` and deliberately NOT reset by the test hook:
// console wrappers must be installed at most once per realm — re-wrapping an
// already-wrapped console would duplicate every entry in the log.
let consoleCaptureInstalled = false

function writeLine(entry: string): void {
  // Probe lazily (and only once): native modules are present from app start,
  // but tests and plain-node imports must not pay for a missing bag.
  if (nativeSink === null) {
    nativeSink = appendClientLog(entry)
    if (nativeSink) return
  } else if (nativeSink) {
    appendClientLog(entry)
    return
  }
  // Web / no-native fallback: ring buffer, drop oldest past the cap.
  buffer.push(entry)
  bufferChars += entry.length + 1
  while (bufferChars > MAX_BUFFER_CHARS && buffer.length > 0) {
    const removed = buffer.shift()!
    bufferChars -= removed.length + 1
  }
}

/**
 * Wrap `console.*` so every existing/future console call is captured without
 * touching call sites. The original handlers still run (logcat / devtools
 * output is unchanged); the captured copy goes to the file/buffer directly —
 * never back through `console`, which would recurse.
 */
function installConsoleCapture(): void {
  if (consoleCaptureInstalled) return
  consoleCaptureInstalled = true
  const methods = ['log', 'info', 'warn', 'error'] as const
  for (const method of methods) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      original(...args)
      try {
        writeLine(formatLogEntry(new Date(), args.map(String).join(' ')))
      } catch {
        // Logging must never take down the code path being logged.
      }
    }
  }
}

/** The `SystemInfo.platform` string when the host provides one. */
function platformName(): string {
  const platform = readSystemInfo()?.['platform']
  return typeof platform === 'string' && platform.length > 0 ? platform : 'unknown'
}

/**
 * Start client logging for this session: installs the console capture and
 * writes the session header (Flutter writes the same banner in
 * `FileLogger.init`). Call once at startup; later calls are no-ops.
 */
export function initClientLogger(): void {
  if (initialized) return
  initialized = true
  installConsoleCapture()
  const now = new Date()
  const ts = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} `
    + `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
  writeLine(`========== Songloft v${clientVersion} | ${ts} | ${platformName()} ==========`)
}

/**
 * The client log content for export: the native file on device, the in-memory
 * buffer on Web. Empty string when nothing has been captured. Never throws —
 * log export treats a failure here as "no frontend logs" (Flutter parity).
 */
export async function readClientLog(): Promise<string> {
  if (nativeSink) {
    try {
      return (await readClientLogFile()) ?? ''
    } catch {
      return ''
    }
  }
  return buffer.length > 0 ? `${buffer.join('\n')}\n` : ''
}

/** Test hook: reset module state (buffer, native probe, init flag). */
export function resetClientLoggerForTests(): void {
  buffer.length = 0
  bufferChars = 0
  nativeSink = null
  initialized = false
}
