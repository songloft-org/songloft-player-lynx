import { describe, expect, test } from 'vitest'

import { apiPrefix } from '../../../core/config/app-config.js'
import { createPublicClient } from '../../../core/network/api-client.js'
import type { Transport } from '../../../core/network/http-client.js'
import { ScanSettingsApi } from '../api/scan-settings-api.js'

function capture(body: string) {
  let seenUrl = ''
  let seenMethod = ''
  let seenBody: string | undefined
  const transport: Transport = async (req) => {
    seenUrl = req.url
    seenMethod = req.method
    seenBody = req.body
    return { status: 200, headers: {}, body }
  }
  return {
    api: new ScanSettingsApi(
      createPublicClient({ transport, getBaseUrl: () => 'http://api.test' }),
    ),
    url: () => seenUrl,
    method: () => seenMethod,
    body: () => seenBody,
  }
}

const url = (path: string) => `http://api.test${apiPrefix}${path}`

describe('auto-create playlists', () => {
  test('reads the enabled flag', async () => {
    const cap = capture(JSON.stringify({ enabled: false }))
    await expect(cap.api.getAutoCreatePlaylists()).resolves.toBe(false)
    expect(cap.method()).toBe('GET')
    expect(cap.url()).toBe(url('/settings/scan-auto-create-playlists'))
  })

  /** This endpoint defaults to **true** — the odd one out among the flags. */
  test('an empty body defaults to true, not false', async () => {
    const cap = capture('{}')
    await expect(cap.api.getAutoCreatePlaylists()).resolves.toBe(true)
  })

  test('writes the flag', async () => {
    const cap = capture('')
    await cap.api.setAutoCreatePlaylists(false)
    expect(cap.method()).toBe('PUT')
    expect(cap.url()).toBe(url('/settings/scan-auto-create-playlists'))
    expect(cap.body()).toBe(JSON.stringify({ enabled: false }))
  })
})

describe('auto fingerprint', () => {
  test('an empty body defaults to false', async () => {
    const cap = capture('{}')
    await expect(cap.api.getAutoFingerprint()).resolves.toBe(false)
    expect(cap.url()).toBe(url('/settings/scan-auto-fingerprint'))
  })

  test('writes the flag', async () => {
    const cap = capture('')
    await cap.api.setAutoFingerprint(true)
    expect(cap.method()).toBe('PUT')
    expect(cap.body()).toBe(JSON.stringify({ enabled: true }))
  })
})

describe('playlist mode', () => {
  test('reads and coerces the mode', async () => {
    const cap = capture(JSON.stringify({ mode: 'bubble_up' }))
    await expect(cap.api.getPlaylistMode()).resolves.toBe('bubble_up')
    expect(cap.url()).toBe(url('/settings/scan-playlist-mode'))
  })

  test('an unknown mode falls back to directory', async () => {
    const cap = capture(JSON.stringify({ mode: 'nope' }))
    await expect(cap.api.getPlaylistMode()).resolves.toBe('directory')
  })

  test('writes the mode', async () => {
    const cap = capture('')
    await cap.api.setPlaylistMode('top_level')
    expect(cap.method()).toBe('PUT')
    expect(cap.body()).toBe(JSON.stringify({ mode: 'top_level' }))
  })
})

describe('scan title source', () => {
  /** Defaults to `tag` — contrast with remote-title-source below. */
  test('an empty body defaults to tag', async () => {
    const cap = capture('{}')
    await expect(cap.api.getTitleSource()).resolves.toBe('tag')
    expect(cap.url()).toBe(url('/settings/scan-title-source'))
  })

  test('reads filename', async () => {
    const cap = capture(JSON.stringify({ title_source: 'filename' }))
    await expect(cap.api.getTitleSource()).resolves.toBe('filename')
  })

  test('writes snake_case', async () => {
    const cap = capture('')
    await cap.api.setTitleSource('filename')
    expect(cap.body()).toBe(JSON.stringify({ title_source: 'filename' }))
  })
})

describe('remote title source', () => {
  /**
   * Defaults to `filename`, the opposite of `scan-title-source`. Getting these
   * two backwards silently flips the user's metadata behaviour, so both defaults
   * are asserted explicitly.
   */
  test('an empty body defaults to filename, not tag', async () => {
    const cap = capture('{}')
    await expect(cap.api.getRemoteTitleSource()).resolves.toBe('filename')
    expect(cap.url()).toBe(url('/settings/remote-title-source'))
  })

  test('writes snake_case', async () => {
    const cap = capture('')
    await cap.api.setRemoteTitleSource('tag')
    expect(cap.method()).toBe('PUT')
    expect(cap.body()).toBe(JSON.stringify({ title_source: 'tag' }))
  })
})

describe('auto scan', () => {
  test('an empty body defaults to disabled at one hour', async () => {
    const cap = capture('{}')
    await expect(cap.api.getAutoScan()).resolves.toEqual({
      enabled: false,
      intervalSeconds: 3600,
    })
    expect(cap.url()).toBe(url('/settings/auto-scan'))
  })

  test('reads both fields', async () => {
    const cap = capture(JSON.stringify({ enabled: true, interval_seconds: 21600 }))
    await expect(cap.api.getAutoScan()).resolves.toEqual({
      enabled: true,
      intervalSeconds: 21600,
    })
  })

  test('an off-grid server interval snaps to a selectable option', async () => {
    const cap = capture(JSON.stringify({ enabled: true, interval_seconds: 900 }))
    await expect(cap.api.getAutoScan()).resolves.toEqual({
      enabled: true,
      intervalSeconds: 600,
    })
  })

  test('writes both fields in snake_case', async () => {
    const cap = capture('')
    await cap.api.setAutoScan(true, 10800)
    expect(cap.method()).toBe('PUT')
    expect(cap.body()).toBe(JSON.stringify({ enabled: true, interval_seconds: 10800 }))
  })
})

/**
 * `path` is the music root — display-only everywhere above this layer (see the
 * model doc comment). `updateMusicPath` is a plain transport: it sends whatever
 * `path` it is given. The "path always comes from cache, never the caller"
 * invariant is enforced one layer up, in `buildMusicPathUpdate`
 * (`data/exclude-dir-data.ts`) — covered there, not here.
 */
describe('music path + exclude lists', () => {
  test('getMusicPath GETs and maps snake_case', async () => {
    const cap = capture(JSON.stringify({
      path: '/music',
      exclude_dirs: ['.cache'],
      exclude_paths: [],
      auto_create_exclude_dirs: [],
    }))
    const setting = await cap.api.getMusicPath()
    expect(cap.method()).toBe('GET')
    expect(cap.url()).toBe(url('/settings/music-path'))
    expect(setting).toEqual({
      path: '/music',
      excludeDirs: ['.cache'],
      excludePaths: [],
      autoCreateExcludeDirs: [],
    })
  })

  test('updateMusicPath PUTs the full object in snake_case, including path', async () => {
    const cap = capture(JSON.stringify({
      path: '/music',
      exclude_dirs: ['a'],
      exclude_paths: ['/music/b'],
      auto_create_exclude_dirs: ['c'],
    }))
    await cap.api.updateMusicPath({
      path: '/music',
      excludeDirs: ['a'],
      excludePaths: ['/music/b'],
      autoCreateExcludeDirs: ['c'],
    })
    expect(cap.method()).toBe('PUT')
    expect(cap.url()).toBe(url('/settings/music-path'))
    expect(cap.body()).toBe(JSON.stringify({
      path: '/music',
      exclude_dirs: ['a'],
      exclude_paths: ['/music/b'],
      auto_create_exclude_dirs: ['c'],
    }))
  })
})
