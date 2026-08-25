import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { getToken } from '../fixtures/songs.js'

/**
 * Playlist pinning. The ordering is the backend's job (`ORDER BY pinned_at IS NULL,
 * pinned_at DESC, position`), so the scenario drives the real `/playlists/{id}/pin`
 * endpoint over HTTP (the BTS has no `fetch`) and asserts both the returned
 * `pinned_at` and the list re-ordering, then unpins to leave the library as it found
 * it.
 */
describe('歌单置顶', () => {
  let driver: E2EDriver
  let playlistId: number
  const API = 'http://localhost:58091/api/v1'

  async function setPinned(id: number, pinned: boolean): Promise<Record<string, unknown>> {
    const token = await getToken()
    const res = await fetch(`${API}/playlists/${id}/pin`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    })
    expect(res.ok).toBe(true)
    return (await res.json()) as Record<string, unknown>
  }

  async function listIds(): Promise<number[]> {
    const token = await getToken()
    const res = await fetch(`${API}/playlists?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = (await res.json()) as { playlists?: { id: number }[] }
    return (data.playlists ?? []).map((p) => p.id)
  }

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')

    const token = await getToken()
    const res = await fetch(`${API}/playlists?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = (await res.json()) as { playlists?: { id: number }[] }
    const playlists = data.playlists ?? []
    playlistId = playlists.length > 0 ? playlists[playlists.length - 1].id : 1
  })

  afterAll(async () => {
    // Leave the library as we found it.
    await setPinned(playlistId, false).catch(() => {})
    await driver.teardown()
  })

  test('置顶写入 pinned_at 并把歌单排到最前', async () => {
    const updated = await setPinned(playlistId, true)
    expect(updated.pinned_at).toBeTruthy()

    const ids = await listIds()
    expect(ids[0]).toBe(playlistId)
  })

  test('应用内的歌单列表能渲染', async () => {
    await driver.evaluateJS(`globalThis.__E2E_ROUTER__?.navigate({ to: '/library' })`)
    await driver.sleep(800)
    const path = await driver.evaluateJS<string>(
      `globalThis.__E2E_ROUTER__?.state?.location?.pathname ?? 'unknown'`,
    )
    expect(path).toBe('/library')
    await stepScreenshot(driver, 'playlist-pin-library')
  })

  test('取消置顶后 pinned_at 清空', async () => {
    const updated = await setPinned(playlistId, false)
    expect(updated.pinned_at).toBeFalsy()
  })
})
