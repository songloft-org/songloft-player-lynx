import { AsyncCallback, BusinessError } from '@ohos.base'
import { rcp } from '@kit.RemoteCommunicationKit'
import { url } from '@kit.ArkTS'
import { LynxResourceRequest, LynxTemplateResourceFetcher, TemplateProviderResult } from '@lynx/lynx'
import { InsecureTls } from './InsecureTls'

/** Remote plugin templates only; Index keeps selecting the signed root bundle. */
export class SongloftTemplateResourceFetcher extends LynxTemplateResourceFetcher {
  private readonly maxBytes: number

  constructor(maxBytes: number = 50 * 1024 * 1024) {
    super()
    this.maxBytes = maxBytes
  }

  fetchTemplate(request: LynxResourceRequest, callback: AsyncCallback<TemplateProviderResult>): void {
    void this.download(request.url).then((binary: ArrayBuffer): void => {
      callback(undefined, { binary: binary })
    }, (error: Error): void => {
      const failure: BusinessError = { name: 'Template Error', code: 1, message: error.message }
      callback(failure, {})
    })
  }

  fetchSSRData(request: LynxResourceRequest, callback: AsyncCallback<ArrayBuffer>): void {
    const failure: BusinessError = { name: 'Template Error', code: 1, message: 'SSR data is not supported' }
    callback(failure, new ArrayBuffer(0))
  }

  private async download(address: string): Promise<ArrayBuffer> {
    if (/[\u0000-\u0020\\]/.test(address)) throw new Error('Invalid plugin template URL')
    const parsed = url.URL.parseURL(address)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
      throw new Error('Invalid plugin template URL')
    }
    const session = rcp.createSession()
    const request = new rcp.Request(address, 'GET')
    let failure = ''
    let bytes = 0
    const chunks: Array<Uint8Array> = []
    const onTlsChange = (enabled: boolean): void => {
      failure = 'TLS policy changed'
      session.cancel(request)
    }
    InsecureTls.addListener(onTlsChange)
    const events: rcp.HttpEventsHandler = {
      onHeaderReceive: (headers: rcp.ResponseHeaders): void => {
        const length = headers['content-length']
        if (typeof length === 'string' && /^[0-9]+$/.test(length) && Number(length) > this.maxBytes) {
          failure = 'Plugin template too large'
          session.cancel(request)
        }
      },
      onDataReceive: (chunk: ArrayBuffer): number => {
        if (failure.length > 0) return 0
        if (bytes + chunk.byteLength > this.maxBytes) {
          failure = 'Plugin template too large'
          session.cancel(request)
          return 0
        }
        chunks.push(new Uint8Array(chunk.slice(0)))
        bytes += chunk.byteLength
        return chunk.byteLength
      }
    }
    const configuration: rcp.Configuration = {
      transfer: { autoRedirect: true, maxAutoRedirects: 5, timeout: { connectMs: 15000, transferMs: 30000, inactivityMs: 30000 } },
      security: { remoteValidation: InsecureTls.isEnabled() ? 'skip' : 'system' },
      tracing: { httpEventsHandler: events }
    }
    request.configuration = configuration
    try {
      const response = await session.fetch(request)
      if (failure.length > 0) throw new Error(failure)
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`Plugin template HTTP ${response.statusCode}`)
      }
      if (bytes === 0) throw new Error('Empty plugin template')
      const binary = new Uint8Array(bytes)
      let offset = 0
      for (const chunk of chunks) {
        binary.set(chunk, offset)
        offset += chunk.byteLength
      }
      return binary.buffer as ArrayBuffer
    } catch (error) {
      if (failure.length > 0) throw new Error(failure)
      throw error as Error
    } finally {
      InsecureTls.removeListener(onTlsChange)
      session.close()
    }
  }
}
