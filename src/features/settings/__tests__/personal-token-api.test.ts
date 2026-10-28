import { afterEach, expect, test, vi } from 'vitest'
import { appConfig } from '../../../core/config/app-config.js'
import { HttpClient, type Transport } from '../../../core/network/http-client.js'
import { useAppSessionStore } from '../../../store/app-session.js'
import { PersonalTokenApi, personalTokenSession } from '../api/personal-token-api.js'

const original = appConfig.baseUrl
afterEach(() => { appConfig.baseUrl = original; useAppSessionStore.getState().reset() })

test('creates once, parses metadata and paginates; revoke sends the management ID', async () => {
  appConfig.baseUrl = 'https://server.test/music'
  const token = { id: 'device', name: 'HA', prefix: 'sl_pat_short', created_at: '2026-10-28T00:00:00Z', last_used_at: null, revoked_at: null }
  const transport = vi.fn<Transport>(async request => ({
    status: request.method === 'POST' ? 201 : request.method === 'DELETE' ? 204 : 200,
    headers: {}, body: request.method === 'POST' ? JSON.stringify({ ...token, token: 'sl_pat_secret' }) : request.method === 'DELETE' ? '' : JSON.stringify({ tokens: [token], total: 21, limit: 20, offset: 20 }),
  }))
  const api = new PersonalTokenApi(new HttpClient({ transport }), personalTokenSession())
  expect(await api.create(' HA ')).toBe('sl_pat_secret')
  const list = await api.list(20)
  expect(list.tokens[0]).toEqual({ id: 'device', name: 'HA', prefix: 'sl_pat_short', createdAt: token.created_at, lastUsedAt: null, revokedAt: null })
  expect(list.total).toBe(21)
  expect(JSON.parse(transport.mock.calls[0]![0].body!)).toEqual({ name: 'HA' })
  expect(transport.mock.calls[1]![0].url).toContain('/music/api/v1/auth/personal-tokens?limit=20&offset=20')
  await api.revoke('device')
  expect(transport.mock.calls[2]![0].url).toContain('/auth/personal-tokens/device')
  expect(transport.mock.calls[2]![0].body).toBeUndefined()
})

test('a session switch during authentication stops creation before sending', async () => {
  let release!: () => void
  const auth = new Promise<void>(resolve => { release = resolve })
  const transport = vi.fn<Transport>()
  const api = new PersonalTokenApi(new HttpClient({ transport, interceptor: { onRequest: () => auth } }), personalTokenSession())
  const task = api.create('HA')
  const result = expect(task).rejects.toThrow('session_changed')
  useAppSessionStore.getState().setUsername('another-session')
  release()
  await result
  expect(transport).not.toHaveBeenCalled()
})

test('an obsolete response never reveals a credential to the next session', async () => {
  let release!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  const api = new PersonalTokenApi(new HttpClient({ transport: async () => {
    await wait
    return { status: 201, headers: {}, body: JSON.stringify({ token: 'sl_pat_secret' }) }
  } }), personalTokenSession())
  const task = api.create('HA')
  const result = expect(task).rejects.toThrow('session_changed')
  useAppSessionStore.getState().setUsername(null)
  release()
  await result
})
