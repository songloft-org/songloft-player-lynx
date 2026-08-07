import { beforeEach, describe, expect, test, vi } from 'vitest'

import { apiPrefix } from '../core/config/app-config.js'
import { createApiClient } from '../core/network/api-client.js'
import { ApiError, type Transport } from '../core/network/http-client.js'
import { TokenStore } from '../core/network/token-store.js'
import { createMemoryStorage } from '../core/storage/index.js'

const SONGS = `${apiPrefix}/songs`
const REFRESH = `${apiPrefix}/auth/refresh`
const LOGIN = `${apiPrefix}/auth/login`

function newTokens(access: string) {
  return JSON.stringify({
    access_token: access,
    refresh_token: 'refresh-next',
    expires_in: 3600,
    token_type: 'Bearer',
  })
}

/**
 * Programmable fake transport recording every call. Protected requests need
 * `Bearer new-access`; anything else 401s. `/auth/refresh` succeeds unless
 * `failRefresh` is set. `/auth/login` echoes whether an Authorization header
 * was attached.
 */
function makeTransport(opts: { failRefresh?: boolean } = {}) {
  const calls: { url: string; auth?: string }[] = []
  let refreshCount = 0
  let loginAuthSeen: string | undefined
  const transport: Transport = async (req) => {
    calls.push({ url: req.url, auth: req.headers['Authorization'] })
    if (req.url.includes(REFRESH)) {
      refreshCount++
      await Promise.resolve()
      if (opts.failRefresh) return { status: 401, headers: {}, body: JSON.stringify({ error: 'bad refresh' }) }
      return { status: 200, headers: {}, body: newTokens('new-access') }
    }
    if (req.url.includes(LOGIN)) {
      loginAuthSeen = req.headers['Authorization']
      return { status: 200, headers: {}, body: JSON.stringify({ ok: true }) }
    }
    // protected resource
    if (req.headers['Authorization'] === 'Bearer new-access') {
      return { status: 200, headers: {}, body: JSON.stringify({ ok: true }) }
    }
    return { status: 401, headers: {}, body: JSON.stringify({ error: 'unauthorized' }) }
  }
  return {
    transport,
    calls,
    get refreshCount() {
      return refreshCount
    },
    get loginAuthSeen() {
      return loginAuthSeen
    },
  }
}

async function seedTokens(tokens: TokenStore) {
  await tokens.saveTokens({
    accessToken: 'old-access',
    refreshToken: 'refresh-1',
    expiresIn: 3600,
    tokenType: 'Bearer',
  })
}

describe('AuthInterceptor', () => {
  let tokens: TokenStore

  beforeEach(() => {
    tokens = new TokenStore(createMemoryStorage().secure)
  })

  test('concurrent 401s trigger exactly one refresh and all replay with the new token', async () => {
    await seedTokens(tokens)
    const t = makeTransport()
    const { client } = createApiClient({ transport: t.transport, tokens })

    const results = await Promise.all([
      client.get(SONGS),
      client.get(SONGS),
      client.get(SONGS),
    ])

    // exactly one refresh call despite three concurrent 401s
    expect(t.refreshCount).toBe(1)
    // all three succeed after replay
    for (const r of results) expect(r.status).toBe(200)
    // every replay carried the new bearer
    const replays = t.calls.filter((c) => c.url.includes(SONGS) && c.auth === 'Bearer new-access')
    expect(replays.length).toBe(3)
    // token store updated to the refreshed access token
    expect(await tokens.getAccessToken()).toBe('new-access')
  })

  test('refresh failure clears tokens and calls onTokenExpired', async () => {
    await seedTokens(tokens)
    const t = makeTransport({ failRefresh: true })
    const onTokenExpired = vi.fn()
    const { client } = createApiClient({ transport: t.transport, tokens, onTokenExpired })

    await expect(client.get(SONGS)).rejects.toBeInstanceOf(ApiError)
    expect(onTokenExpired).toHaveBeenCalledTimes(1)
    expect(await tokens.getAccessToken()).toBeNull()
    expect(await tokens.getRefreshToken()).toBeNull()
  })

  test('public paths do not get an Authorization header', async () => {
    await seedTokens(tokens)
    const t = makeTransport()
    const { client } = createApiClient({ transport: t.transport, tokens })

    const res = await client.post(LOGIN, { username: 'admin', password: 'admin' })
    expect(res.status).toBe(200)
    expect(t.loginAuthSeen).toBeUndefined()
  })

  test('protected request injects the cached bearer', async () => {
    await tokens.saveTokens({
      accessToken: 'new-access',
      refreshToken: 'r',
      expiresIn: 3600,
      tokenType: 'Bearer',
    })
    const t = makeTransport()
    const { client } = createApiClient({ transport: t.transport, tokens })

    const res = await client.get(SONGS)
    expect(res.status).toBe(200)
    expect(t.refreshCount).toBe(0)
    expect(t.calls[0]!.auth).toBe('Bearer new-access')
  })
})
