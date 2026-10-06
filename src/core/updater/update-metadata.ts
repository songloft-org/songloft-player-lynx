import { isWebPlatform } from '../../native/web-platform.js'
import { fetchNativeUpdateMetadata } from './native-updater.js'
import { ReleaseResolver } from './release-resolver.js'

/** Browser trust on Web; dedicated native system TLS everywhere else. No HttpClient/auth interceptor. */
export async function fetchUpdateMetadata(address: string, maximum: number): Promise<{ status: number; body: string }> {
  if (!isWebPlatform()) return fetchNativeUpdateMetadata(address, maximum)
  if (!address.startsWith('https://')) throw new Error('invalid_update_url')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(address, { credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json' } })
    if (!response.url.startsWith('https://') || Number(response.headers.get('content-length')) > maximum) throw new Error('metadata_failed')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('metadata_failed')
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let bytes = 0, body = ''
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > maximum) throw new Error('metadata_too_large')
        body += decoder.decode(chunk.value, { stream: true })
      }
      body += decoder.decode()
      return { status: response.status, body }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  } finally { clearTimeout(timer) }
}
export const clientReleaseResolver = new ReleaseResolver(fetchUpdateMetadata)
