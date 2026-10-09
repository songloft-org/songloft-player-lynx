import { describe, expect, test, vi } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createApiClient, createPublicClient } from '../../../core/network/api-client.js'
import { createMemoryStorage } from '../../../core/storage/index.js'
import { TokenStore } from '../../../core/network/token-store.js'
import type { Transport } from '../../../core/network/http-client.js'
import { HttpClient } from '../../../core/network/http-client.js'
import { SettingsApi } from '../api/settings-api.js'

function client(transport: Transport) {
  return createPublicClient({ transport, getBaseUrl: () => 'http://api.test' })
}

function capture(status: number, body: string): { transport: Transport; url: () => string; method: () => string; body: () => string | undefined } {
  let seenUrl = ''
  let seenMethod = ''
  let seenBody: string | undefined
  const transport: Transport = async (req) => {
    seenUrl = req.url
    seenMethod = req.method
    seenBody = req.body
    return { status, headers: {}, body }
  }
  return { transport, url: () => seenUrl, method: () => seenMethod, body: () => seenBody }
}

test('navigation save pins its server and subpath while authentication is pending', async () => {
  let baseUrl = 'http://first.test'
  let release!: () => void
  const authentication = new Promise<void>(resolve => { release = resolve })
  const cap = capture(200, JSON.stringify({ show_library: false, plugin_tabs: [] }))
  const api = new SettingsApi(new HttpClient({
    transport: cap.transport,
    getBaseUrl: () => baseUrl,
    interceptor: { onRequest: () => authentication },
  }))
  const pending = api.updateTabConfig(
    { showLibrary: false, pluginTabs: [] },
    { serverBaseUrl: 'http://first.test/music' },
  )
  baseUrl = 'http://second.test'
  release()
  await expect(pending).resolves.toEqual({ showLibrary: false, pluginTabs: [] })
  expect(cap.url()).toBe(`http://first.test/music${apiPrefix}/settings/tab-config`)
  expect(cap.method()).toBe('PUT')
})

test('navigation save does not send after its session changes during authentication', async () => {
  let current = true
  let release!: () => void
  const authentication = new Promise<void>(resolve => { release = resolve })
  const transport = vi.fn<Transport>(async () => ({ status: 200, headers: {}, body: '{}' }))
  const api = new SettingsApi(new HttpClient({
    transport,
    interceptor: { onRequest: () => authentication },
  }))
  const pending = api.updateTabConfig({ showLibrary: false, pluginTabs: [] }, {
    serverBaseUrl: 'http://first.test',
    assertCurrent: () => { if (!current) throw new Error('Server changed') },
  })
  current = false
  release()
  await expect(pending).rejects.toThrow('Server changed')
  expect(transport).not.toHaveBeenCalled()
})

test('late navigation 401 does not refresh or replay using a new session', async () => {
  let current = true
  let release!: () => void
  const response = new Promise<void>(resolve => { release = resolve })
  const tokens = new TokenStore(createMemoryStorage().secure)
  await tokens.saveTokens({
    accessToken: 'old-access', refreshToken: 'old-refresh', expiresIn: 3600, tokenType: 'Bearer',
  })
  const transport = vi.fn<Transport>(async () => {
    await response
    return { status: 401, headers: {}, body: '{"error":"expired"}' }
  })
  const { client } = createApiClient({ transport, tokens })
  const pending = new SettingsApi(client).updateTabConfig({ showLibrary: false, pluginTabs: [] }, {
    serverBaseUrl: 'http://first.test',
    assertCurrent: () => { if (!current) throw new Error('Server changed') },
  })
  await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1))
  current = false
  await tokens.saveTokens({
    accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 3600, tokenType: 'Bearer',
  })
  release()
  await expect(pending).rejects.toThrow('Server changed')
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await tokens.getAccessToken()).toBe('new-access')
})

test('navigation auth replay checks the session again after asynchronous recovery', async () => {
  let current = true
  let release!: () => void
  const recovery = new Promise<void>(resolve => { release = resolve })
  const transport = vi.fn<Transport>(async () => ({ status: 401, headers: {}, body: '{}' }))
  const onError = vi.fn(async (_ctx, _res, resend) => {
    await recovery
    return resend({ Authorization: 'Bearer new-access' })
  })
  const api = new SettingsApi(new HttpClient({ transport, interceptor: { onError } }))
  const pending = api.updateTabConfig({ showLibrary: false, pluginTabs: [] }, {
    serverBaseUrl: 'http://first.test',
    assertCurrent: () => { if (!current) throw new Error('Server changed') },
  })
  await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
  current = false
  release()
  await expect(pending).rejects.toThrow('Server changed')
  expect(transport).toHaveBeenCalledTimes(1)
})

describe('SettingsApi.getLogLevel', () => {
  test('GETs the log-level endpoint and coerces the response', async () => {
    const cap = capture(200, JSON.stringify({ level: 'debug' }))
    const api = new SettingsApi(client(cap.transport))
    await expect(api.getLogLevel()).resolves.toBe('debug')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/settings/log-level`)
    expect(cap.method()).toBe('GET')
  })

  test('falls back to info for an unexpected level value', async () => {
    const cap = capture(200, JSON.stringify({ level: 'trace' }))
    const api = new SettingsApi(client(cap.transport))
    await expect(api.getLogLevel()).resolves.toBe('info')
  })
})

describe('SettingsApi.setLogLevel', () => {
  test('PUTs the chosen level', async () => {
    const cap = capture(200, '')
    const api = new SettingsApi(client(cap.transport))
    await api.setLogLevel('warn')
    expect(cap.method()).toBe('PUT')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/settings/log-level`)
    expect(cap.body()).toBe(JSON.stringify({ level: 'warn' }))
  })
})

describe('SettingsApi.exportLogs', () => {
  test('GETs the raw log text without JSON-parsing it', async () => {
    const cap = capture(200, 'line one\nline two\n')
    const api = new SettingsApi(client(cap.transport))
    await expect(api.exportLogs()).resolves.toBe('line one\nline two\n')
    expect(cap.url()).toBe(`http://api.test${apiPrefix}/logs/export`)
    expect(cap.method()).toBe('GET')
  })

  test('an empty body resolves to an empty string', async () => {
    const cap = capture(200, '')
    const api = new SettingsApi(client(cap.transport))
    await expect(api.exportLogs()).resolves.toBe('')
  })
})
