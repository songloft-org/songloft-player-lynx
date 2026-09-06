import { afterEach, describe, expect, test, vi } from 'vitest'

import { shareLogArchive } from '../native-platform.js'

/**
 * The `shareLogArchive` facade's job is to turn one hand-rolled bridge callback
 * into a Promise, and both of its arguments arrive from **three** hosts that
 * build them by hand from a caught exception. So the two ways that can go wrong
 * are pinned here:
 *
 * - a **blank** error string. `if (error)` would read it as success and show the
 *   success toast for a failed export, because `''` is falsy — and a caught
 *   exception is legitimately allowed to carry a blank message.
 * - a **missing or malformed** result payload on success. The archive is already
 *   shared by then, so this must not become a rejection; it degrades to the
 *   conservative answer, which makes the toast claim less rather than more.
 */

const g = globalThis as Record<string, unknown>

/** A host whose `shareLogArchive` answers with the given callback arguments. */
function withHost(...args: [string | null, string | null]): {
  calls: Array<[string, string, string]>
} {
  const calls: Array<[string, string, string]> = []
  g.NativeModules = {
    SongloftPlatform: {
      openURL: () => {},
      shareLogArchive: (
        url: string,
        authHeader: string,
        fileName: string,
        callback: (error: string | null, resultJson: string | null) => void,
      ) => {
        calls.push([url, authHeader, fileName])
        callback(...args)
      },
    },
  }
  return { calls }
}

afterEach(() => {
  delete g.NativeModules
})

test('passes the three strings through verbatim', async () => {
  const host = withHost(null, '{"hasBackend":true,"hasFrontend":true}')
  await shareLogArchive('https://s/api/v1/logs/export', 'Bearer t', 'a.zip')
  expect(host.calls).toEqual([['https://s/api/v1/logs/export', 'Bearer t', 'a.zip']])
})

test('rejects when the method is absent, rather than calling it', async () => {
  g.NativeModules = { SongloftPlatform: { openURL: () => {} } }
  await expect(shareLogArchive('u', '', 'a.zip')).rejects.toThrow('not available')
})

describe('error reporting', () => {
  test('a host error message becomes the rejection', async () => {
    withHost('no logs to export', null)
    await expect(shareLogArchive('u', '', 'a.zip')).rejects.toThrow('no logs to export')
  })

  test('a blank error string still rejects, with a sentinel message', async () => {
    // `Throwable.message` / `Error.message` may be blank; `if (error)` would
    // have resolved here and reported a successful export.
    withHost('', null)
    await expect(shareLogArchive('u', '', 'a.zip')).rejects.toThrow('log_archive_failed')
  })
})

describe('result payload', () => {
  test('reports exactly what the host claims', async () => {
    withHost(null, '{"hasBackend":false,"hasFrontend":true}')
    await expect(shareLogArchive('u', '', 'a.zip')).resolves.toEqual({
      hasBackend: false,
      hasFrontend: true,
    })
  })

  test('a missing payload resolves conservatively instead of rejecting', async () => {
    withHost(null, null)
    await expect(shareLogArchive('u', '', 'a.zip')).resolves.toEqual({
      hasBackend: false,
      hasFrontend: false,
    })
  })

  test('malformed JSON resolves conservatively instead of throwing', async () => {
    withHost(null, '{oops')
    await expect(shareLogArchive('u', '', 'a.zip')).resolves.toEqual({
      hasBackend: false,
      hasFrontend: false,
    })
  })

  test('non-boolean payload values are not coerced into true', async () => {
    withHost(null, '{"hasBackend":"yes","hasFrontend":1}')
    await expect(shareLogArchive('u', '', 'a.zip')).resolves.toEqual({
      hasBackend: false,
      hasFrontend: false,
    })
  })
})
