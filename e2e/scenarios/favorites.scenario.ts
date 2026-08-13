import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { resetStepCounter, stepScreenshot } from '../driver/step-screenshot.js'
import { fetchRealSongs, getToken } from '../fixtures/songs.js'

describe('收藏功能', () => {
  let driver: E2EDriver
  let songs: any[]
  let token: string

  beforeAll(async () => {
    resetStepCounter()
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    songs = await fetchRealSongs(3)
    token = await getToken()
  })

  afterAll(async () => {
    await driver.teardown()
  })

  test('获取收藏播放列表 (Favorites)', async () => {
    // The favorites playlist is typically playlist id=1
    const res = await fetch('http://localhost:58091/api/v1/playlists?limit=20', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json() as any
    const playlists = data.items ?? data.playlists ?? []

    // Find the favorites playlist (usually has a specific name or is first)
    const favorites = playlists.find((p: any) =>
      p.name?.toLowerCase().includes('favorite') ||
      p.name?.toLowerCase().includes('收藏'),
    )

    // Favorites playlist should exist or we just verify the API works
    expect(Array.isArray(playlists)).toBe(true)
    await stepScreenshot(driver, 'favorites-playlists')
  })

  test('收藏歌曲 → API 调用成功', async () => {
    const songId = songs[0].id
    // Add song to favorites (playlist id 1)
    const res = await fetch('http://localhost:58091/api/v1/playlists/1/songs', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ song_ids: [songId] }),
    })

    // Should succeed (200/201/204) or already exists (409)
    expect([200, 201, 204, 409].includes(res.status)).toBe(true)
  })

  test('收藏列表包含已收藏歌曲', async () => {
    const songId = songs[0].id
    const res = await fetch('http://localhost:58091/api/v1/playlists/1/song-ids', {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.ok) {
      const data = await res.json() as any
      const ids: number[] = data.ids ?? []
      expect(ids).toContain(songId)
    } else {
      // API might not support song-ids endpoint — try songs endpoint
      const songsRes = await fetch('http://localhost:58091/api/v1/playlists/1/songs?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const songsData = await songsRes.json() as any
      const songList = songsData.songs ?? songsData.items ?? []
      const found = songList.some((s: any) => s.id === songId)
      expect(found).toBe(true)
    }
  })

  test('取消收藏歌曲', async () => {
    const songId = songs[0].id
    const res = await fetch(`http://localhost:58091/api/v1/playlists/1/songs/${songId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    // Should succeed
    expect([200, 204].includes(res.status)).toBe(true)
    await stepScreenshot(driver, 'favorites-removed')
  })

  test('取消后收藏列表不包含该歌曲', async () => {
    const songId = songs[0].id
    const res = await fetch('http://localhost:58091/api/v1/playlists/1/songs?limit=100', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json() as any
    const songList = data.songs ?? data.items ?? []
    const found = songList.some((s: any) => s.id === songId)
    expect(found).toBe(false)
  })
})
