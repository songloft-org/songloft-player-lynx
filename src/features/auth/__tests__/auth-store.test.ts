import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import { TokenStore } from '../../../core/network/token-store.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import {
  createMemoryStorage,
  type SongloftStorage,
} from '../../../core/storage/index.js'
import { useAppSessionStore } from '../../../store/index.js'
import {
  createAuthStore,
  PREF_LAST_USERNAME,
  PREF_SERVER_URL,
  type AuthStoreDeps,
} from '../store/auth-store.js'

const LOGIN = `${apiPrefix}/auth/login`
const LOGOUT = `${apiPrefix}/auth/logout`

function tokensJson(access = 'access-1') {
  return JSON.stringify({
    access_token: access,
    refresh_token: 'refresh-1',
    expires_in: 3600,
    token_type: 'Bearer',
  })
}

/**
 * Fake transport recording every call. `/auth/login` succeeds (returns tokens)
 * unless `badLogin`; `/auth/logout` succeeds unless `failLogout` (then it
 * rejects, to prove local sign-out is unaffected).
 */
function makeTransport(opts: { badLogin?: boolean; failLogout?: boolean } = {}) {
  const calls: { url: string; auth?: string; body?: string }[] = []
  const transport: Transport = async (req) => {
    calls.push({ url: req.url, auth: req.headers['Authorization'], body: req.body })
    if (req.url.includes(LOGIN)) {
      if (opts.badLogin) {
        return { status: 401, headers: {}, body: JSON.stringify({ error: 'invalid credentials' }) }
      }
      return { status: 200, headers: {}, body: tokensJson() }
    }
    if (req.url.includes(LOGOUT)) {
      if (opts.failLogout) throw new Error('network down')
      return { status: 200, headers: {}, body: '' }
    }
    return { status: 404, headers: {}, body: '' }
  }
  return { transport, calls }
}

function makeDeps(
  storage: SongloftStorage,
  transport: Transport,
): AuthStoreDeps {
  return {
    storage,
    tokenStore: new TokenStore(storage.secure),
    createLoginClient: (baseUrl) =>
      createPublicClient({ transport, getBaseUrl: () => baseUrl }),
  }
}

describe('auth store', () => {
  let storage: SongloftStorage

  beforeEach(() => {
    storage = createMemoryStorage()
    appConfig.reset()
    useAppSessionStore.getState().reset()
  })
  afterEach(() => {
    appConfig.reset()
    useAppSessionStore.getState().reset()
  })

  test('login success persists tokens + status authenticated', async () => {
    const { transport } = makeTransport()
    const deps = makeDeps(storage, transport)
    const store = createAuthStore(deps)

    await store.getState().login({
      username: 'admin',
      password: 'admin',
      apiBaseUrl: 'http://server:1234/',
    })

    expect(store.getState().status).toBe('authenticated')
    expect(store.getState().error).toBeUndefined()
    // tokens persisted to the injected secure store
    expect(await storage.secure.get('access_token')).toBe('access-1')
    expect(await deps.tokenStore.hasTokens()).toBe(true)
    // fed the sync access-token cache (UrlHelper source)
    expect(getCachedAccessToken()).toBe('access-1')
    // normalized base URL written to config + prefs (trailing slash stripped)
    expect(appConfig.baseUrl).toBe('http://server:1234')
    expect(appConfig.resolvedBaseUrl).toBe('http://server:1234')
    expect(await storage.prefs.get(PREF_SERVER_URL)).toBe('http://server:1234')
    // last username remembered (prefs); password never persisted
    expect(await storage.prefs.get(PREF_LAST_USERNAME)).toBe('admin')
    expect(useAppSessionStore.getState().username).toBe('admin')
  })

  test('login persists insecure-TLS opt-in to config + prefs', async () => {
    const { transport } = makeTransport()
    const store = createAuthStore(makeDeps(storage, transport))

    await store.getState().login({
      username: 'admin',
      password: 'admin',
      apiBaseUrl: 'http://server:1234',
      insecureTls: true,
    })

    expect(appConfig.insecureTls).toBe(true)
    expect(await storage.prefs.get('insecure_tls')).toBe('true')
  })

  test('login failure sets error + unauthenticated, no tokens', async () => {
    const { transport } = makeTransport({ badLogin: true })
    const deps = makeDeps(storage, transport)
    const store = createAuthStore(deps)

    await store.getState().login({ username: 'admin', password: 'wrong' })

    expect(store.getState().status).toBe('unauthenticated')
    expect(store.getState().error).toBe('invalid credentials')
    expect(store.getState().isLoading).toBe(false)
    expect(await deps.tokenStore.hasTokens()).toBe(false)
  })

  test('logout clears local first; server revoke failure is ignored', async () => {
    const { transport, calls } = makeTransport({ failLogout: true })
    const deps = makeDeps(storage, transport)
    const store = createAuthStore(deps)

    // seed an authenticated session
    await deps.tokenStore.saveTokens({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      tokenType: 'Bearer',
    })

    await store.getState().logout()

    // local state cleared regardless of the (failing) server revoke
    expect(store.getState().status).toBe('unauthenticated')
    expect(await deps.tokenStore.hasTokens()).toBe(false)
    expect(await storage.secure.get('access_token')).toBeNull()
    expect(useAppSessionStore.getState().username).toBeNull()
    // revoke attempted with the captured bearer before clearing
    const logoutCall = calls.find((c) => c.url.includes(LOGOUT))
    expect(logoutCall?.auth).toBe('Bearer access-1')
  })

  test('checkAuth resolves authenticated when tokens exist', async () => {
    const { transport } = makeTransport()
    const deps = makeDeps(storage, transport)
    const store = createAuthStore(deps)
    await deps.tokenStore.saveTokens({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
      tokenType: 'Bearer',
    })

    await store.getState().checkAuth()
    expect(store.getState().status).toBe('authenticated')
  })

  test('checkAuth resolves unauthenticated when no tokens', async () => {
    const { transport } = makeTransport()
    const store = createAuthStore(makeDeps(storage, transport))

    expect(store.getState().status).toBe('unknown')
    await store.getState().checkAuth()
    expect(store.getState().status).toBe('unauthenticated')
  })
})
