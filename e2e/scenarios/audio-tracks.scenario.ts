import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createDriver, type E2EDriver } from '../driver/index.js'
import { getToken } from '../fixtures/songs.js'

// Real multi-track media is required. Keep unavailable coverage visibly skipped.
const songId = Number(process.env.E2E_AUDIO_TRACK_SONG_ID ?? 0)
const apiBase = process.env.E2E_API_BASE ?? 'http://localhost:58091'

describe.skipIf(!Number.isSafeInteger(songId) || songId <= 0)('音轨：真实后端与原生准备/seek', () => {
  let driver: E2EDriver
  let song: Record<string, unknown>
  let indices: number[]

  beforeAll(async () => {
    const token = await getToken()
    const headers = { Authorization: `Bearer ${token}` }
    const [songResponse, tracksResponse] = await Promise.all([
      fetch(`${apiBase}/api/v1/songs/${songId}`, { headers }),
      fetch(`${apiBase}/api/v1/songs/${songId}/audio-tracks`, { headers }),
    ])
    if (!songResponse.ok || !tracksResponse.ok) throw new Error('Audio track fixture is unavailable')
    const raw = await songResponse.json() as Record<string, unknown>
    const tracks = await tracksResponse.json() as { tracks: Array<{ index: number }> }
    indices = tracks.tracks.map((track) => track.index)
    expect(indices.length).toBeGreaterThanOrEqual(2)
    song = { ...raw, isVideo: raw.is_video, isLive: raw.is_live,
      fileSize: raw.file_size, bitRate: raw.bit_rate, sampleRate: raw.sample_rate,
      addedAt: raw.added_at, updatedAt: raw.updated_at }
    driver = await createDriver()
    await driver.launch()
    await driver.login('admin', 'admin')
    await driver.evaluateJS(`globalThis.__E2E_PLAYER_STORE__.getState().playPlaylist([${JSON.stringify(song)}])`)
    await driver.waitFor(async () => (await driver.getPlayerState()).state === 'playing', { timeout: 15_000 })
  }, 60_000)

  afterAll(async () => { await driver?.teardown() })

  test('暂停切换到另一音轨，实际准备后恢复毫秒进度', async () => {
    await driver.tapPlayer('pause')
    await driver.evaluateJS('globalThis.__E2E_PLAYER_STORE__.getState().seek(5000)')
    await driver.sleep(400)
    await driver.evaluateJS(`globalThis.__E2E_PLAYER_STORE__.getState().setAudioTrack(${indices[1]})`)
    const state = await driver.evaluateJS<Record<string, unknown>>(`(() => {
      const s = globalThis.__E2E_PLAYER_STORE__.getState();
      return { track: s.audioTrack, switching: s.isAudioTrackSwitching, error: s.audioTrackError, playing: s.isPlaying, position: s.currentTime };
    })()`)
    expect(state.error).toBeUndefined()
    expect(state.track).toBe(indices[1])
    expect(state.switching).toBe(false)
    expect(state.playing).toBe(false)
    expect(Math.abs(Number(state.position) - 5000)).toBeLessThan(500)
    await driver.sleep(700)
    expect(Math.abs((await driver.getPlayerState()).positionMs - Number(state.position))).toBeLessThan(100)
  })

  test('播放切换与快速连切不会提交旧源；下一首清除选择', async () => {
    await driver.tapPlayer('play')
    await driver.waitFor(async () => (await driver.getPlayerState()).state === 'playing')
    await driver.evaluateJS(`Promise.all([
      globalThis.__E2E_PLAYER_STORE__.getState().setAudioTrack(${indices[0]}),
      globalThis.__E2E_PLAYER_STORE__.getState().setAudioTrack(${indices[1]})
    ])`)
    expect(await driver.evaluateJS('globalThis.__E2E_PLAYER_STORE__.getState().audioTrack')).toBe(indices[1])
    const before = (await driver.getPlayerState()).positionMs
    await driver.sleep(700)
    expect((await driver.getPlayerState()).positionMs).toBeGreaterThan(before)
    await driver.evaluateJS(`globalThis.__E2E_PLAYER_STORE__.getState().playPlaylist([${JSON.stringify(song)}])`)
    expect(await driver.evaluateJS('globalThis.__E2E_PLAYER_STORE__.getState().audioTrack')).toBeNull()
    await driver.tapPlayer('pause')
  })
})
