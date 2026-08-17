import { afterEach, expect, test, vi } from 'vitest'

import { appConfig } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'

/**
 * Regression for "从文件安装点击没反应".
 *
 * The upload URL is handed to `pickAndUploadFile`, which on every platform posts
 * multipart **outside** `HttpClient` — the native hosts use OkHttp / URLSession and
 * the Web host a bare `fetch`. So none of the usual machinery applies: no
 * interceptor attaches the bearer token, and nothing resolves a relative path.
 * This used to return `/api/v1/jsplugins/upload`, which meant a guaranteed 401
 * (the endpoint is `@Security BearerAuth`) and, on native, a URL the uploader
 * cannot even parse. The page's empty `catch` then turned all of that into "the
 * button does nothing".
 *
 * The token is read at call time from a module import, so each case has to mock
 * that module before loading the api — hence the `resetModules` + dynamic import.
 */

const client = {} as HttpClient

afterEach(() => vi.resetModules())

async function uploadUrlWithToken(token: string | null): Promise<string> {
  vi.doMock('../../../core/network/token-cache.js', () => ({
    getCachedAccessToken: () => token,
  }))
  const { JSPluginApi } = await import('../api/jsplugin-api.js')
  return new JSPluginApi(client).getUploadUrl()
}

test('the upload URL is absolute and carries the access token', async () => {
  const url = await uploadUrlWithToken('tok-123')

  expect(url.startsWith(appConfig.resolvedBaseUrl)).toBe(true)
  expect(url).toContain('/api/v1/jsplugins/upload')
  expect(url).toContain('access_token=tok-123')
})

test('a token with URL-unsafe characters is encoded exactly once', async () => {
  // JWTs are base64url and safe, but a proxy-issued token need not be — and
  // double-encoding would fail auth just as silently as omitting it.
  const url = await uploadUrlWithToken('a+b/c=d&e')

  expect(url).toContain('access_token=a%2Bb%2Fc%3Dd%26e')
  expect(url).not.toContain('%25')
})

test('without a token the URL is still absolute, not a bare path', async () => {
  const url = await uploadUrlWithToken(null)

  expect(url.startsWith('http')).toBe(true)
  expect(url).not.toContain('access_token')
})
