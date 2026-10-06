import { rcp } from '@kit.RemoteCommunicationKit'
import { fileIo } from '@kit.CoreFileKit'
import { url } from '@kit.ArkTS'
import { systemDateTime } from '@kit.BasicServicesKit'
import { BundleUpdateProtocol } from './BundleUpdateProtocol'

/** Dedicated system-TLS session. Redirects are followed manually after HTTPS validation. */
export class BundleUpdateTransfer {
  readonly id: string
  readonly total: number
  bytes: number = 0
  cancelled: boolean = false
  private session?: rcp.Session = undefined
  private request?: rcp.Request = undefined
  private lastEvent: number = 0
  private failure: string = ''

  constructor(id: string, total: number) { this.id = id; this.total = total }

  static validURL(raw: string): boolean {
    try {
      if (/[\u0000-\u0020\\]/.test(raw)) return false
      const parsed = url.URL.parseURL(raw)
      if (parsed.protocol !== 'https:' || parsed.hostname.length === 0 || parsed.username || parsed.password) return false
      const fields = parsed.search.replace(/^\?/, '').split('&')
      return !fields.some((field: string) => ['token', 'access_token'].includes(decodeURIComponent(field.split('=')[0]).toLowerCase()))
    } catch (_) { return false }
  }
  cancel(): void {
    this.cancelled = true
    if (this.session && this.request) this.session.cancel(this.request)
  }
  async download(remote: string, path: string, progress: (bytes: number, total: number) => void): Promise<void> {
    const session = rcp.createSession()
    this.session = session
    try {
      let address = remote
      const started = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP)
      for (let hop = 0; hop < 9; hop++) {
        if (this.cancelled) throw new Error('cancelled')
        if (!BundleUpdateTransfer.validURL(address)) throw new Error('invalid_update_url')
        const remaining = 180000 - (systemDateTime.getUptime(systemDateTime.TimeType.STARTUP) - started)
        if (remaining <= 0) throw new Error('download_failed')
        const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC)
        this.bytes = 0
        this.failure = ''
        const request = new rcp.Request(address, 'GET')
        this.request = request
        const events: rcp.HttpEventsHandler = {
          onDataReceive: (chunk: ArrayBuffer): number => {
            if (this.cancelled || this.failure.length > 0) return 0
            if (this.bytes + chunk.byteLength > this.total || this.bytes + chunk.byteLength > BundleUpdateProtocol.maximumBundle) {
              this.failure = 'checksum_mismatch'
              session.cancel(request)
              return 0
            }
            try {
              let offset = 0
              while (offset < chunk.byteLength) {
                const count = fileIo.writeSync(file.fd, chunk.slice(offset))
                if (count <= 0) throw new Error('update_storage_unavailable')
                offset += count
              }
              this.bytes += chunk.byteLength
              const now = Date.now()
              if (this.bytes === this.total || now - this.lastEvent >= 100) {
                this.lastEvent = now
                progress(this.bytes, this.total)
              }
              return chunk.byteLength
            } catch (_) {
              this.failure = 'update_storage_unavailable'
              session.cancel(request)
              return 0
            }
          }
        }
        const configuration: rcp.Configuration = {
          transfer: { autoRedirect: false, timeout: { connectMs: Math.min(15000, remaining), transferMs: remaining, inactivityMs: Math.min(30000, remaining) } },
          security: { remoteValidation: 'system' },
          tracing: { httpEventsHandler: events }
        }
        request.configuration = configuration
        progress(0, this.total)
        try {
          if (this.cancelled) throw new Error('cancelled')
          const response = await session.fetch(request)
          if (this.cancelled) throw new Error('cancelled')
          if (this.failure) throw new Error(this.failure)
          if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
            const location = response.headers.location
            if (!location || hop === 8) throw new Error('invalid_update_url')
            address = new url.URL(location, address).href
            if (!BundleUpdateTransfer.validURL(address)) throw new Error('invalid_update_url')
            continue
          }
          if (response.statusCode < 200 || response.statusCode >= 300) throw new Error('download_failed')
          if (this.bytes !== this.total) throw new Error('checksum_mismatch')
          fileIo.fsyncSync(file.fd)
          return
        } finally { fileIo.closeSync(file.fd) }
      }
      throw new Error('invalid_update_url')
    } catch (error) {
      if (this.cancelled) throw new Error('cancelled')
      if (this.failure) throw new Error(this.failure)
      // Transport errors can contain signed URLs. Never forward them through the bridge.
      const message = (error as Error).message
      if (['invalid_update_url', 'download_failed', 'checksum_mismatch'].includes(message)) throw new Error(message)
      throw new Error('download_failed')
    } finally {
      session.close()
      this.session = undefined
      this.request = undefined
    }
  }
}
