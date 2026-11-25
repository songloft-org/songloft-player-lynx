import { beforeEach, describe, expect, test } from 'vitest'

import {
  consumeLyricsScreenReturn,
  markLyricsScreenBeforeAdjust,
} from '../domain/lyrics-return-screen.js'

/**
 * Leaving the player's lyrics screen for the adjust route unmounts FullPlayerPage.
 * The flag handed between them must be one-shot: a later mount (or rotate) must
 * not re-enter the lyrics screen when the user had deliberately gone to cover.
 */
describe('lyrics-return-screen flag', () => {
  beforeEach(() => {
    // Drain any state a previous test left behind.
    consumeLyricsScreenReturn()
  })

  test('off by default', () => {
    expect(consumeLyricsScreenReturn()).toBe(false)
  })

  test('mark then consume returns true once, then clears', () => {
    markLyricsScreenBeforeAdjust()
    expect(consumeLyricsScreenReturn()).toBe(true)
    expect(consumeLyricsScreenReturn()).toBe(false)
  })
})
