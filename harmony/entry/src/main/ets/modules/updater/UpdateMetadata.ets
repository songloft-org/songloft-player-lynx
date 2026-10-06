import { rcp } from '@kit.RemoteCommunicationKit'
import { url, util } from '@kit.ArkTS'
import { systemDateTime } from '@kit.BasicServicesKit'
import { BundleUpdateTransfer } from './BundleUpdateTransfer'

interface MetadataRequest { url: string; max_bytes: number }
export interface MetadataResponse { status: number; body: string }

/** No business HTTP service, TLS bypass, authorization header or cookies. */
export class UpdateMetadata {
  static async fetch(raw: string): Promise<MetadataResponse> {
    const input = JSON.parse(raw) as MetadataRequest
    if (!Number.isSafeInteger(input.max_bytes) || input.max_bytes < 1 || input.max_bytes > 524288) {
      throw new Error('invalid_metadata_request')
    }
    const session = rcp.createSession()
    let failure = ''
    try {
      let address = input.url
      const started = systemDateTime.getUptime(systemDateTime.TimeType.STARTUP)
      for (let hop = 0; hop < 9; hop++) {
        if (!BundleUpdateTransfer.validURL(address)) throw new Error('invalid_update_url')
        const remaining = 12000 - (systemDateTime.getUptime(systemDateTime.TimeType.STARTUP) - started)
        if (remaining <= 0) throw new Error('metadata_failed')
        const bytes = new Uint8Array(input.max_bytes)
        let count = 0
        const request = new rcp.Request(address, 'GET')
        request.headers = { 'Accept': 'application/json' }
        const events: rcp.HttpEventsHandler = {
          onDataReceive: (chunk: ArrayBuffer): number => {
            if (failure) return 0
            if (count + chunk.byteLength > input.max_bytes) {
              failure = 'metadata_too_large'; session.cancel(request); return 0
            }
            bytes.set(new Uint8Array(chunk), count)
            count += chunk.byteLength
            return chunk.byteLength
          }
        }
        const configuration: rcp.Configuration = {
          transfer: { autoRedirect: false, timeout: { connectMs: remaining, transferMs: remaining, inactivityMs: remaining } },
          security: { remoteValidation: 'system' }, tracing: { httpEventsHandler: events }
        }
        request.configuration = configuration
        const response = await session.fetch(request)
        if (failure) throw new Error(failure)
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          const location = response.headers.location
          if (!location || hop === 8) throw new Error('invalid_update_url')
          address = new url.URL(location, address).href
          continue
        }
        const decoder = new util.TextDecoder('utf-8', { fatal: true })
        return { status: response.statusCode, body: decoder.decodeToString(bytes.subarray(0, count)) }
      }
      throw new Error('metadata_failed')
    } catch (error) {
      if (failure) throw new Error(failure)
      if (['invalid_update_url', 'invalid_metadata_request'].includes((error as Error).message)) throw error
      throw new Error('metadata_failed')
    } finally { session.close() }
  }
}
