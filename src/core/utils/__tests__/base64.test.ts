import { describe, expect, test } from 'vitest'

import { bytesToBase64 } from '../base64.js'

/**
 * The log-export path hands a zip to the native share sheet as base64, so a
 * silent encoding error would produce a corrupt archive on every device while
 * every unit test here stayed green. Cross-check against Node's own Buffer
 * encoder rather than a hand-computed fixture.
 */
function nodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

describe('bytesToBase64', () => {
  test('matches Node Buffer for lengths covering all padding cases', () => {
    // Lengths 0..4 hit the 0, 1, 2 and 3-byte remainder branches; a longer
    // pseudo-random buffer exercises the steady-state loop.
    for (let len = 0; len <= 4; len++) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 0xff)
      expect(bytesToBase64(bytes), `length ${len}`).toBe(nodeBase64(bytes))
    }
    const big = Uint8Array.from({ length: 1000 }, (_, i) => (i * 251 + 7) & 0xff)
    expect(bytesToBase64(big)).toBe(nodeBase64(big))
  })

  test('encodes the classic RFC 4648 fixtures', () => {
    const enc = (s: string) => bytesToBase64(new TextEncoder().encode(s))
    expect(enc('')).toBe('')
    expect(enc('f')).toBe('Zg==')
    expect(enc('fo')).toBe('Zm8=')
    expect(enc('foo')).toBe('Zm9v')
    expect(enc('foob')).toBe('Zm9vYg==')
    expect(enc('fooba')).toBe('Zm9vYmE=')
    expect(enc('foobar')).toBe('Zm9vYmFy')
  })

  test('handles high bytes without sign-extension corruption', () => {
    // 0xff would come out wrong if a byte were treated as a signed value.
    const bytes = new Uint8Array([0xff, 0x00, 0x80, 0x7f])
    expect(bytesToBase64(bytes)).toBe(nodeBase64(bytes))
  })
})
