import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
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
