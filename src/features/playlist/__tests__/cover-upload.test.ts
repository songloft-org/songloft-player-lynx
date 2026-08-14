import { describe, expect, test, vi } from 'vitest'

vi.mock('../../../core/config/app-config.js', () => ({
  apiPrefix: '/api/v1',
  appConfig: { resolvedBaseUrl: 'http://localhost:58091' },
}))

vi.mock('../../../core/network/token-cache.js', () => ({
  getCachedAccessToken: vi.fn(() => 'test-token'),
}))

vi.mock('../../../native/native-platform.js', () => ({
  isNativePlatformAvailable: vi.fn(() => true),
  pickAndUploadFile: vi.fn(async () => '{}'),
}))

describe('cover-upload', () => {
  test('canUploadCover returns true when platform available and token present', async () => {
    const { canUploadCover } = await import('../domain/cover-upload.js')
    expect(canUploadCover()).toBe(true)
  })

  test('uploadPlaylistCover calls pickAndUploadFile with correct URL', async () => {
    const { uploadPlaylistCover } = await import('../domain/cover-upload.js')
    const { pickAndUploadFile } = await import('../../../native/native-platform.js')
    await uploadPlaylistCover(42)
    expect(pickAndUploadFile).toHaveBeenCalledWith(
      'http://localhost:58091/api/v1/playlists/42/cover?access_token=test-token',
      'file',
      'image/*',
    )
  })
})
