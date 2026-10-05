import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  createFetchTransport,
  HttpClient,
  HttpTimeoutError,
  REQUEST_TIMEOUT_HEADER,
  type TransportRequest,
} from '../core/network/http-client.js'
import { receiveTimeoutMs } from '../core/config/app-config.js'

/**
 * A server that accepts the connection and then never answers — firewall DROP, a
 * wedged backend, a black-hole proxy — used to hang the app forever: the
 * `receiveTimeoutMs` option was read into an `HttpClient` field and then never
 * used, and the transport passed no `signal`. The promise never settled, so the
 * spinner never stopped and there was no error to offer a retry against.
 */

/** A `fetch` that never answers, plus a hook to see whether it was aborted. */
function hangingFetch() {
  const seen: { signal?: { aborted?: boolean } } = {}
  const impl = vi.fn(
    (_url: string, init: { signal?: unknown }) =>
      new Promise<never>(() => {
        seen.signal = init.signal as { aborted?: boolean } | undefined
      }),
  )
  return { impl, seen }
}

const okResponse = {
  status: 200,
  headers: { forEach: (cb: (v: string, k: string) => void) => cb('application/json', 'content-type') },
  text: async () => '{"ok":true}',
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('createFetchTransport timeouts', () => {
  test('the deadline also covers a response body that stalls after headers', async () => {
    const transport = createFetchTransport(async () => ({
      ...okResponse,
      text: () => new Promise<string>(() => {}),
    }))
    const pending = transport({url: 'http://slow.example', method: 'GET', headers: {}, timeoutMs: 1_000})
    const caught = pending.catch(e => e)
    await vi.advanceTimersByTimeAsync(1_001)
    expect(await caught).toBeInstanceOf(HttpTimeoutError)
  })

  test.each(['Android', 'iOS', 'HarmonyOS'])('passes the deadline to the %s host without mutating headers', async platform => {
    vi.stubGlobal('SystemInfo', {platform})
    const impl = vi.fn(async (_url: string, _init: {headers: Record<string, string>}) => okResponse)
    const transport = createFetchTransport(impl)
    const headers = {Authorization: 'Bearer test'}
    await transport({url: 'http://api.example', method: 'POST', headers, timeoutMs: 240_000})
    expect(impl.mock.calls[0]![1].headers).toEqual({...headers, [REQUEST_TIMEOUT_HEADER]: '240000'})
    expect(headers).toEqual({Authorization: 'Bearer test'})
  })

  test('Web does not send the native control header', async () => {
    vi.stubGlobal('SystemInfo', {platform: 'web'})
    const impl = vi.fn(async (_url: string, _init: {headers: Record<string, string>}) => okResponse)
    await createFetchTransport(impl)({url: 'http://api.example', method: 'GET', headers: {}, timeoutMs: 240_000})
    expect(impl.mock.calls[0]![1].headers).not.toHaveProperty(REQUEST_TIMEOUT_HEADER)
  })
  test('a request that never answers rejects with HttpTimeoutError', async () => {
    const { impl } = hangingFetch()
    const transport = createFetchTransport(impl as never)
    const req: TransportRequest = {
      url: 'http://dead.example/api',
      method: 'GET',
      headers: {},
      timeoutMs: 5_000,
    }

    const pending = transport(req)
    const settled = vi.fn()
    void pending.catch(settled)

    await vi.advanceTimersByTimeAsync(4_999)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2)
    await expect(pending).rejects.toBeInstanceOf(HttpTimeoutError)
  })

  test('the timeout error names the deadline and the url', async () => {
    const { impl } = hangingFetch()
    const transport = createFetchTransport(impl as never)
    const pending = transport({
      url: 'http://dead.example/api/v1/songs',
      method: 'GET',
      headers: {},
      timeoutMs: 1_000,
    })
    const caught = pending.catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(1_001)
    const err = (await caught) as HttpTimeoutError

    expect(err.timeoutMs).toBe(1_000)
    expect(err.message).toContain('1000ms')
    expect(err.message).toContain('/api/v1/songs')
  })

  test('an abort signal is handed to fetch so a capable host frees the socket', async () => {
    const { impl, seen } = hangingFetch()
    const transport = createFetchTransport(impl as never)
    const pending = transport({
      url: 'http://dead.example/api',
      method: 'GET',
      headers: {},
      timeoutMs: 1_000,
    })
    const caught = pending.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(1_001)
    await caught

    // globalThis.AbortController exists under vitest, so a signal was passed…
    expect(seen.signal).toBeDefined()
    // …and firing the deadline aborted it.
    expect(seen.signal?.aborted).toBe(true)
  })

  test('a response that arrives in time is unaffected', async () => {
    const impl = vi.fn(async () => okResponse)
    const transport = createFetchTransport(impl as never)

    const res = await transport({
      url: 'http://ok.example/api',
      method: 'GET',
      headers: {},
      timeoutMs: 5_000,
    })

    expect(res.status).toBe(200)
    expect(res.body).toBe('{"ok":true}')
    expect(res.headers['content-type']).toBe('application/json')
  })

  test('no timeoutMs means no deadline (injected transports opt out)', async () => {
    const { impl } = hangingFetch()
    const transport = createFetchTransport(impl as never)
    const settled = vi.fn()
    void transport({ url: 'http://dead.example/api', method: 'GET', headers: {} }).then(
      settled,
      settled,
    )

    await vi.advanceTimersByTimeAsync(60_000)
    expect(settled).not.toHaveBeenCalled()
  })
})

describe('HttpClient wires its receive timeout through', () => {
  test('a per-request override survives auth replay and leaves the next request at its default', async () => {
    const calls: TransportRequest[] = []
    const client = new HttpClient({
      transport: async req => {
        calls.push(req)
        return {status: calls.length === 1 ? 401 : 200, headers: {}, body: '{}'}
      },
      interceptor: {onError: (_ctx, _res, resend) => resend({Authorization: 'Bearer refreshed'})},
      getBaseUrl: () => 'http://api.example',
    })
    await client.post('/update', {}, {receiveTimeoutMs: 240_000})
    await client.get('/ordinary')
    expect(calls.map(req => req.timeoutMs)).toEqual([240_000, 240_000, receiveTimeoutMs])
    expect(calls[1]!.headers.Authorization).toBe('Bearer refreshed')
  })
  test('the configured deadline reaches the transport', async () => {
    const calls: TransportRequest[] = []
    const client = new HttpClient({
      transport: async (req) => {
        calls.push(req)
        return { status: 200, headers: {}, body: '{}' }
      },
      getBaseUrl: () => 'http://api.example',
      getBasePath: () => '',
    })

    await client.get('/ping')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.timeoutMs).toBe(receiveTimeoutMs)
  })

  test('an explicit receiveTimeoutMs overrides the default', async () => {
    const calls: TransportRequest[] = []
    const client = new HttpClient({
      transport: async (req) => {
        calls.push(req)
        return { status: 200, headers: {}, body: '{}' }
      },
      getBaseUrl: () => 'http://api.example',
      getBasePath: () => '',
      receiveTimeoutMs: 1_234,
    })

    await client.get('/ping')

    expect(calls[0]!.timeoutMs).toBe(1_234)
  })
})
