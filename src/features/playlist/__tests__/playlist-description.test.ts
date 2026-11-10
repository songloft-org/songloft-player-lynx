import { expect, test } from 'vitest'
import { playlistDisplayDescription } from '../domain/playlist-description.js'

test('only the entire recognized ownership marker is hidden; user text remains visible', () => {
  expect(playlistDisplayDescription('[navidrome:connection:playlist%3Ap1]')).toBe('')
  expect(playlistDisplayDescription('说明 [navidrome:connection:playlist%3Ap1]')).toBe('说明 [navidrome:connection:playlist%3Ap1]')
  expect(playlistDisplayDescription('[another-plugin:private:value]')).toBe('[another-plugin:private:value]')
})
