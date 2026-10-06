import { describe, expect, test } from 'vitest'

import { createPublicClient } from '../../../core/network/api-client.js'
import { SongsApi } from '../../library/api/songs-api.js'
import { parseAudioTracks } from '../../../models/audio-track.js'
import { audioTracksQueryKey } from '../data/audio-tracks-query.js'
import type { Song } from '../../../models/song.js'

describe('audio tracks backend contract', () => {
  test('query identities isolate profile, server, user, song and file revision', () => {
    const scope = { profile: 'a', server: 'https://music/a', username: 'alice', song: { id: 7, updatedAt: 'one' } as Song }
    const original = audioTracksQueryKey(scope)
    for (const patch of [{ profile: 'b' }, { server: 'https://music/b' }, { username: 'bob' },
      { song: { ...scope.song, id: 8 } }, { song: { ...scope.song, updatedAt: 'two' } },
    ]) expect(audioTracksQueryKey({ ...scope, ...patch })).not.toEqual(original)
  })
  test('uses the object endpoint and preserves audio-relative indices and default', async () => {
    let requestUrl = ''
    const api = new SongsApi(createPublicClient({
      getBaseUrl: () => 'http://api.test',
      transport: async (request) => {
        requestUrl = request.url
        return { status: 200, headers: {}, body: JSON.stringify({ tracks: [
          { index: 2, title: '原唱', codec: 'aac', language: 'zho', default: true },
          { index: 5, title: '伴奏', codec: 'aac', default: false },
        ] }) }
      },
    }))
    expect(await api.getTracks(7)).toEqual([
      { index: 2, title: '原唱', codec: 'aac', language: 'zho', default: true },
      { index: 5, title: '伴奏', codec: 'aac', language: null, default: false },
    ])
    expect(requestUrl).toBe('http://api.test/api/v1/songs/7/audio-tracks')
  })

  test('empty probe result is supported, malformed payload is not an empty success', () => {
    expect(parseAudioTracks({ tracks: [] })).toEqual([])
    expect(() => parseAudioTracks([])).toThrow()
    expect(() => parseAudioTracks({ tracks: null })).toThrow()
  })

  test('drops invalid and duplicate indices without fabricating index zero', () => {
    expect(parseAudioTracks({ tracks: [null, {}, { index: -1 }, { index: 0.5 },
      { index: 3, title: '', language: 4, codec: {}, default: 'true' }, { index: 3 },
    ] })).toEqual([{ index: 3, title: null, language: null, codec: '', default: false }])
  })
})
