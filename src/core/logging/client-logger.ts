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
 * Record one line under a short subsystem tag: `[HH:mm:ss.SSS] I/nav route=…`.
 *
 * Deliberately **not** routed through `console`: the console wrapper exists to
 * catch calls this codebase does not make, and pushing our own lines through it
 * would put every log line in the devtools output too. This writes straight to
 * the sink.
 *
 * Why these exist at all: the console capture was the *only* source of client
 * log content, and the app makes almost no `console` calls — so an exported
 * `frontend.log` held nothing but the session banner, on every platform. That is
 * what made "export logs" useless for diagnosing anything.
 */
function log(level: 'I' | 'W' | 'E', tag: string, message: string): void {
  try {
    writeLine(formatLogEntry(new Date(), `${level}/${tag} ${message}`))
  } catch {
    // Logging must never take down the code path being logged.
  }
}

export function logInfo(tag: string, message: string): void {
  log('I', tag, message)
}

export function logWarn(tag: string, message: string): void {
  log('W', tag, message)
}

export function logError(tag: string, message: string): void {
  log('E', tag, message)
}

/** `Error` → `name: message` + first frames; anything else → String(). */
function describeThrown(value: unknown): string {
  if (value instanceof Error) {
    const stack = value.stack ? ` | ${value.stack.split('\n').slice(0, 4).join(' ⏎ ')}` : ''
    return `${value.name}: ${value.message}${stack}`
  }
  // A rejection carrying `undefined` is the shape web-core's worker produces, and
  // "undefined" is itself the useful signal — do not swallow it.
  return `non-error thrown: ${String(value)}`
}

/**
 * Capture crashes that never reach a `catch`.
 *
 * `error` / `unhandledrejection` are the two events every realm this runs in
 * agrees on *when it has an event target at all*: a Web Worker does (this is
 * where the app's own code lives on Web), while PrimJS on device may not — hence
 * the capability probe rather than an assumption. Without this, an unhandled
 * rejection was invisible everywhere except a devtools console nobody has open
 * on a phone.
 */
function installCrashCapture(): void {
  const target = globalThis as unknown as {
    addEventListener?: (type: string, cb: (e: unknown) => void) => void
  }
  if (typeof target.addEventListener !== 'function') return
  try {
    target.addEventListener('error', (e: unknown) => {
      const ev = e as { message?: string; filename?: string; lineno?: number; error?: unknown }
      const where = ev?.filename ? ` @${ev.filename}:${ev.lineno ?? 0}` : ''
      log('E', 'crash', `uncaught ${ev?.error ? describeThrown(ev.error) : ev?.message ?? 'unknown'}${where}`)
    })
    target.addEventListener('unhandledrejection', (e: unknown) => {
      const ev = e as { reason?: unknown }
      log('E', 'crash', `unhandled rejection ${describeThrown(ev?.reason)}`)
    })
  } catch {
    // A realm that rejects these event names is simply not covered.
  }
}

/**
 * Start client logging for this session: installs the console + crash capture
 * and writes the session header (Flutter writes the same banner in
 * `FileLogger.init`). Call once at startup; later calls are no-ops.
 */
export function initClientLogger(): void {
  if (initialized) return
  initialized = true
  installConsoleCapture()
  installCrashCapture()
  const now = new Date()
  const ts = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} `
    + `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`
  writeLine(`========== Songloft v${clientVersion} | ${ts} | ${platformName()} ==========`)
}

/**
 * The client log content for export: the native file on device, the in-memory
 * buffer on Web. Empty string when nothing has been captured. Never throws —
 * log export treats a failure here as "no frontend logs" (Flutter parity).
 *
 * On Web the main thread keeps its own capture (see the inline script in
 * `web/index.html`) because the app runs in a Worker and cannot see what
 * web-core does to the DOM. Those lines are appended under their own heading
 * rather than merged by timestamp: the two realms stamp independently, and
 * interleaving them on equal timestamps would imply an ordering the data does
 * not support.
 */
export async function readClientLog(): Promise<string> {
  if (nativeSink) {
    try {
      return (await readClientLogFile()) ?? ''
    } catch {
      return ''
    }
  }
  const own = buffer.length > 0 ? `${buffer.join('\n')}\n` : ''
  const main = await readMainThreadLog()
  if (!main) return own
  return `${own}\n===== main thread (web-core / DOM) =====\n${main}`
}

/**
 * Read the main-thread capture the Web host stashed in IndexedDB. Returns '' on
 * any failure or on platforms that have no such host — this is diagnostics, and
 * must never be the reason an export fails.
 */
async function readMainThreadLog(): Promise<string> {
  try {
    const factory = (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (!factory) return ''
    const db = await new Promise<IDBDatabase | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 2000)
      const req = factory.open('songloft', 1)
      const done = (v: IDBDatabase | null) => { clearTimeout(timer); resolve(v) }
      req.onsuccess = () => done(req.result)
      req.onerror = () => done(null)
      req.onblocked = () => done(null)
    })
    if (!db || !db.objectStoreNames.contains('kv')) return ''
    const raw = await new Promise<unknown>((resolve) => {
      const req = db.transaction('kv', 'readonly').objectStore('kv').get('prefs.__mainlog')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    })
    if (typeof raw !== 'string') return ''
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return ''
    return parsed.filter((l): l is string => typeof l === 'string').join('\n') + '\n'
  } catch {
    return ''
  }
}

/** Test hook: reset module state (buffer, native probe, init flag). */
export function resetClientLoggerForTests(): void {
  buffer.length = 0
  bufferChars = 0
  nativeSink = null
  initialized = false
}
