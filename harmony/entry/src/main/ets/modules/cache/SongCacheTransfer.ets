import { rcp } from '@kit.RemoteCommunicationKit'
import { fileIo, statfs } from '@kit.CoreFileKit'
import { url } from '@kit.ArkTS'
import { systemDateTime } from '@kit.BasicServicesKit'
import { InsecureTls } from '../../net/InsecureTls'

/** Bounded media streaming, with actual task cancellation and the user's server TLS policy. */
export class SongCacheTransfer {
  bytes: number = 0
  total: number = 0
  format: string
  cancelled: boolean = false
  private readonly remaining: number
  private readonly indexed: boolean
  private session?: rcp.Session = undefined
  private request?: rcp.Request = undefined
  private failure: string = ''
  private lastEvent: number = 0

  constructor(remaining: number, format: string, indexed: boolean) {
    this.remaining = remaining
    this.format = format
    this.indexed = indexed
  }
  static validURL(raw: string): boolean {
    try {
      if (/[\u0000-\u0020\\]/.test(raw)) return false
      const parsed = url.URL.parseURL(raw)
      return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname.length > 0 && !parsed.username && !parsed.password
    } catch (_) { return false }
  }
  cancel(): void {
    this.cancelled = true
    if (this.session && this.request) this.session.cancel(this.request)
  }
  private actualFormat(contentType: string): string {
    switch (contentType.split(';')[0].trim().toLowerCase()) {
      case 'audio/mpeg': case 'audio/mp3': return 'mp3'
      case 'audio/flac': case 'audio/x-flac': return 'flac'
      case 'audio/mp4': return 'm4a'
      case 'video/mp4': return 'mp4'
      case 'audio/aac': return 'aac'
      case 'audio/wav': case 'audio/x-wav': case 'audio/wave': return 'wav'
      case 'audio/ogg': case 'application/ogg': return this.format === 'opus' ? 'opus' : 'ogg'
      case 'text/html': case 'application/json': case 'application/vnd.apple.mpegurl':
      case 'application/x-mpegurl': case 'audio/mpegurl': throw new Error('unsupported_media')
      default: return this.format
    }
  }
  async download(remote: string, path: string, progress: (bytes: number, total: number) => void): Promise<void> {
    const session = rcp.createSession()
    this.session = session
    const onTlsChange = (enabled: boolean): void => { this.cancel() }
    InsecureTls.addListener(onTlsChange)
    try {
      let address = remote
      const started = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP)
      for (let hop = 0; hop < 9; hop++) {
        if (this.cancelled) throw new Error('cancelled')
        if (!SongCacheTransfer.validURL(address)) throw new Error('invalid_cache_request')
        const deadline = 15 * 60000 - (systemDateTime.getUptime(systemDateTime.TimeType.STARTUP) - started)
        if (deadline <= 0) throw new Error('download_failed')
        const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC)
        this.bytes = 0
        this.total = 0
        this.failure = ''
        let redirect = false
        let redirectedBytes = 0
        const request = new rcp.Request(address, 'GET')
        this.request = request
        const events: rcp.HttpEventsHandler = {
          onHeaderReceive: (headers: rcp.ResponseHeaders): void => {
            if (this.cancelled || this.failure.length > 0) return
            try {
              const fields = headers as Record<string, string | string[] | undefined>
              redirect = typeof fields['location'] === 'string'
              if (redirect) return
              const length = fields['content-length']
              if (typeof length === 'string' && /^[0-9]+$/.test(length)) this.total = Number(length)
              if (!Number.isSafeInteger(this.total) || this.total > this.remaining) throw new Error('limit_exceeded')
              if (statfs.getFreeSizeSync(path) < this.total + 524288) throw new Error('insufficient_space')
              if (this.indexed) {
                if (fields['content-range'] !== undefined) throw new Error('unsupported_media')
                const contentType = fields['content-type']
                if (typeof contentType === 'string') this.format = this.actualFormat(contentType)
              }
            } catch (error) {
              const message = (error as Error).message
              this.failure = ['limit_exceeded', 'insufficient_space', 'unsupported_media'].includes(message) ? message : 'download_failed'
              session.cancel(request)
            }
          },
          onDataReceive: (chunk: ArrayBuffer): number => {
            if (this.cancelled || this.failure.length > 0) return 0
            if (redirect) {
              redirectedBytes += chunk.byteLength
              if (redirectedBytes > 65536) { this.failure = 'download_failed'; session.cancel(request); return 0 }
              return chunk.byteLength
            }
            if (this.bytes + chunk.byteLength > this.remaining) { this.failure = 'limit_exceeded'; session.cancel(request); return 0 }
            try {
              if (statfs.getFreeSizeSync(path) < chunk.byteLength + 524288) throw new Error('insufficient_space')
              let offset = 0
              while (offset < chunk.byteLength) {
                const count = fileIo.writeSync(file.fd, chunk.slice(offset))
                if (count <= 0) throw new Error('cache_storage_unavailable')
                offset += count
              }
              this.bytes += chunk.byteLength
              const now = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP)
              if (now - this.lastEvent >= 100) { this.lastEvent = now; progress(this.bytes, this.total) }
              return chunk.byteLength
            } catch (error) {
              this.failure = (error as Error).message === 'insufficient_space' ? 'insufficient_space' : 'cache_storage_unavailable'
              session.cancel(request)
              return 0
            }
          }
        }
        const configuration: rcp.Configuration = {
          transfer: { autoRedirect: false, timeout: { connectMs: Math.min(15000, deadline), transferMs: deadline, inactivityMs: Math.min(30000, deadline) } },
          security: { remoteValidation: InsecureTls.isEnabled() ? 'skip' : 'system' },
          tracing: { httpEventsHandler: events }
        }
        request.configuration = configuration
        try {
          progress(0, 0)
          if (this.cancelled) throw new Error('cancelled')
          const response = await session.fetch(request)
          if (this.cancelled) throw new Error('cancelled')
          if (this.failure) throw new Error(this.failure)
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            const location = response.headers.location
            if (!location || hop === 8) throw new Error('download_failed')
            address = new url.URL(location, address).href
            continue
          }
          if (response.statusCode < 200 || response.statusCode >= 300 || this.bytes <= 0 ||
            this.total > 0 && this.bytes !== this.total) throw new Error('download_failed')
          fileIo.fsyncSync(file.fd)
          progress(this.bytes, this.total)
          return
        } finally { fileIo.closeSync(file.fd) }
      }
      throw new Error('download_failed')
    } catch (error) {
      if (this.cancelled) throw new Error('cancelled')
      if (this.failure) throw new Error(this.failure)
      const message = (error as Error).message
      if (['invalid_cache_request', 'download_failed'].includes(message)) throw new Error(message)
      throw new Error('download_failed')
    } finally {
      InsecureTls.removeListener(onTlsChange)
      session.close()
      this.session = undefined
      this.request = undefined
    }
  }
}
