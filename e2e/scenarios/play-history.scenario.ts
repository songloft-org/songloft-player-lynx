import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { fetchRealSongs, getToken } from '../fixtures/songs.js'

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:58091'

/**
 * Play history is recorded **per playback context** — a playlist, or one of the
 * seven facet dimensions. There is no global "recently played" endpoint, so every
 * assertion here names a context.
 *
 * The reads go out from the Node side rather than through `evaluateJS`: the Lynx
 * background thread has no `fetch` (see `docs/reference/api-design-conventions.md`).
 * That is also what makes this scenario worth having — it observes the server
 * state, which is exactly what the previous version did not do. It asserted only
 * that a song was playing, with a comment noting history recording is an async
 * side-effect, and so it stayed green through a client that recorded nothing at
 * all: the context went out in the JSON body while the backend reads it from the
 * query string, and `type` was never sent so the backend defaulted it to
 * `finish`, which it does not record.
 */
async function history(contextType: string, contextKey: string): Promise<any[]> {
  const token = await getToken()
  const query = `context_type=${encodeURIComponent(contextType)}&context_key=${encodeURIComponent(contextKey)}`
  const res = await fetch(`${API_BASE}/api/v1/play-history?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`GET /play-history -> ${res.status}`)
  const data = (await res.json()) as any
  return data.items ?? []
}

async function clearHistory(contextType: string, contextKey: string): Promise<void> {
  const token = await getToken()
  const query = `context_type=${encodeURIComponent(contextType)}&context_key=${encodeURIComponent(contextKey)}`
  await fetch(`${API_BASE}/api/v1/play-history?${query}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

/** A playlist ID that exists on every install: the built-in "Favorites". */
const PLAYLIST_KEY = '1'

describe('播放历史', () => {
  let driver: E2EDriver
  let songs: any[]

  beforeAll(async () => {
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    songs = await fetchRealSongs(2)
    await clearHistory('playlist', PLAYLIST_KEY)
  })

  afterAll(async () => {
    await clearHistory('playlist', PLAYLIST_KEY)
    await driver.teardown()
  })

  test('从歌单起播会记进该歌单的播放历史', async () => {
    expect(await history('playlist', PLAYLIST_KEY)).toHaveLength(0)

    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        await store.getState().playPlaylist(
          [${JSON.stringify(songs[0])}],
          0,
          { type: 'playlist', key: '${PLAYLIST_KEY}' },
        );
      })()
    `)

    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )

    // Recording is a fire-and-forget POST, so poll rather than assert once.
    await driver.waitFor(
      async () => (await history('playlist', PLAYLIST_KEY)).length > 0,
      { timeout: 8000 },
    )

    const items = await history('playlist', PLAYLIST_KEY)
    expect(items[0].song.id).toBe(songs[0].id)
  })

  test('起播时不带上下文则不进任何历史桶', async () => {
    await clearHistory('playlist', PLAYLIST_KEY)

    await driver.evaluateJS(`
      (async () => {
        const store = globalThis.__E2E_PLAYER_STORE__;
        store.getState().reset();
        await store.getState().playPlaylist([${JSON.stringify(songs[0])}], 0);
      })()
    `)

    await driver.waitFor(
      async () => (await driver.getPlayerState()).state === 'playing',
      { timeout: 8000 },
    )
    await driver.sleep(2000)

    expect(await history('playlist', PLAYLIST_KEY)).toHaveLength(0)
    expect(
      await driver.evaluateJS<unknown>(`
        globalThis.__E2E_PLAYER_STORE__?.getState()?.playbackContext ?? null
      `),
    ).toBeNull()
  })
})
