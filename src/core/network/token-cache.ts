/**
 * Process-wide synchronous access-token cache.
 *
 * `UrlHelper` builds resource URLs (cover/play/lyric) synchronously and needs
 * the current access token without awaiting async secure storage — mirroring
 * the Flutter `SecureStorageService.cachedAccessToken`. `TokenStore` keeps this
 * cache in sync on save/clear/read.
 */
let cachedAccessToken: string | null = null

export function getCachedAccessToken(): string | null {
  return cachedAccessToken
}

export function setCachedAccessToken(token: string | null): void {
  cachedAccessToken = token
}
