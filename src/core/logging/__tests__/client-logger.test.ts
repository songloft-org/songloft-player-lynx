import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  formatLogEntry,
  initClientLogger,
  readClientLog,
  redactTokens,
  resetClientLoggerForTests,
} from '../client-logger.js'

/**
 * The Lynx port of Flutter's `FileLogger`. The two behaviors that matter for
 * privacy and for export correctness are pinned here:
 * - credentials never reach the log (token redaction, kept byte-for-byte
 *   identical to the Flutter regex), and
 * - on a host without the native module (Web / unit-test realm) lines land in
 *   the in-memory ring buffer and come back out through `readClientLog`.
 */

const g = globalThis as Record<string, unknown>

beforeEach(() => {
  resetClientLoggerForTests()
  delete g.NativeModules
  delete g.SystemInfo
})

afterEach(() => {
  delete g.NativeModules
  delete g.SystemInfo
})

describe('redactTokens', () => {
  test('masks access_token and token query values', () => {
    expect(redactTokens('GET /logs/export?access_token=abc123&x=1'))
      .toBe('GET /logs/export?access_token=***&x=1')
    expect(redactTokens('url?token=s3cret')).toBe('url?token=***')
  })

  test('is case-insensitive like the Flutter reference', () => {
    expect(redactTokens('ACCESS_TOKEN=AbC&Token=xyz')).toBe('ACCESS_TOKEN=***&Token=***')
  })

  test('leaves unrelated text and bare words untouched', () => {
    expect(redactTokens('no secrets here')).toBe('no secrets here')
    // "token" not followed by '=' is not a query param.
    expect(redactTokens('the token bucket')).toBe('the token bucket')
  })
})

describe('formatLogEntry', () => {
  test('prefixes a zero-padded [HH:mm:ss.SSS] timestamp and redacts', () => {
    const date = new Date(2026, 0, 2, 3, 4, 5, 6) // local time, ms = 6
    expect(formatLogEntry(date, 'hello token=abc'))
      .toBe('[03:04:05.006] hello token=***')
  })
})

describe('in-memory fallback (no native module)', () => {
  test('init writes a session header and console lines are captured', async () => {
    initClientLogger()
    console.log('captured line')
    const log = await readClientLog()
    expect(log).toContain('========== Songloft v')
    expect(log).toContain('captured line')
  })

  test('captured lines are redacted', async () => {
    initClientLogger()
    console.warn('login url?access_token=topsecret')
    const log = await readClientLog()
    expect(log).toContain('access_token=***')
    expect(log).not.toContain('topsecret')
  })

  test('readClientLog is empty before anything is written', async () => {
    expect(await readClientLog()).toBe('')
  })
})

describe('native sink', () => {
  test('lines go to logWrite and reads come from logRead', async () => {
    const logWrite = vi.fn()
    const logRead = vi.fn((cb: (e: string | null, c: string | null) => void) => {
      cb(null, 'native file content')
    })
    g.NativeModules = {
      SongloftPlatform: { openURL: () => {}, logWrite, logRead },
    }
    initClientLogger()
    console.log('to the file token=abc')
    // The header + our line were both appended natively, not buffered.
    expect(logWrite).toHaveBeenCalled()
    const lastCall = logWrite.mock.calls[logWrite.mock.calls.length - 1][0] as string
    expect(lastCall).toContain('to the file token=***')
    expect(await readClientLog()).toBe('native file content')
  })
})
