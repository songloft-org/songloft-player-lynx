import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import { AuthApi } from '../api/auth-api.js'

function client(transport: Transport) {
  return createPublicClient({
    transport,
    getBaseUrl: () => 'http://api.test',
  })
}

describe('AuthApi', () => {
  test('login parses AuthTokens (snake_case → camelCase) and skips auth header', async () => {
    let seenAuth: string | undefined
    const transport: Transport = async (req) => {
      seenAuth = req.headers['Authorization']
      expect(req.url).toContain(`${apiPrefix}/auth/login`)
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      }
    }
    const tokens = await new AuthApi(client(transport)).login({
      username: 'admin',
      password: 'admin',
    })
    expect(tokens.accessToken).toBe('a')
    expect(tokens.refreshToken).toBe('r')
    expect(tokens.expiresIn).toBe(3600)
    expect(seenAuth).toBeUndefined()
  })

  test('logout attaches the explicit bearer when given', async () => {
    let seenAuth: string | undefined
    const transport: Transport = async (req) => {
      seenAuth = req.headers['Authorization']
      return { status: 200, headers: {}, body: '' }
    }
    await new AuthApi(client(transport)).logout('captured-token')
    expect(seenAuth).toBe('Bearer captured-token')
  })

  test('getTokens parses the list + total via the batch-2 model', async () => {
    const transport: Transport = async (req) => {
      expect(req.url).toContain(`${apiPrefix}/auth/tokens`)
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({
          tokens: [
            {
              id: 1,
              token_id: 'tok-1',
              token_type: 'access',
              client_info: 'web',
              expires_at: '2026-01-01T00:00:00Z',
              revoked_at: null,
              created_at: '2025-01-01T00:00:00Z',
            },
          ],
          total: 1,
        }),
      }
    }
    const page = await new AuthApi(client(transport)).getTokens({ limit: 10, offset: 0 })
    expect(page.total).toBe(1)
    expect(page.tokens).toHaveLength(1)
    expect(page.tokens[0]!.tokenId).toBe('tok-1')
    expect(page.tokens[0]!.tokenType).toBe('access')
    expect(page.tokens[0]!.clientInfo).toBe('web')
  })
})
