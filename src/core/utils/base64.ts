/**
 * Base64 encoding for byte arrays — pure TS, no DOM globals.
 *
 * The worker realm that runs this app has no `btoa` (it is a main-thread-only
 * browser API), and Lynx itself provides no base64 helper, so the log-export
 * path — which hands a zip to the native share sheet as a base64 string —
 * needs its own. Kept dependency-free and allocation-light: one lookup table,
 * three input bytes → four chars at a time.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Encode `bytes` as a standard (padded, `+/`) base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  const len = bytes.length
  let i = 0
  for (; i + 2 < len; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += ALPHABET[(n >>> 18) & 63]
      + ALPHABET[(n >>> 12) & 63]
      + ALPHABET[(n >>> 6) & 63]
      + ALPHABET[n & 63]
  }
  const rest = len - i
  if (rest === 1) {
    const n = bytes[i] << 16
    out += ALPHABET[(n >>> 18) & 63] + ALPHABET[(n >>> 12) & 63] + '=='
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += ALPHABET[(n >>> 18) & 63] + ALPHABET[(n >>> 12) & 63]
      + ALPHABET[(n >>> 6) & 63] + '='
  }
  return out
}
