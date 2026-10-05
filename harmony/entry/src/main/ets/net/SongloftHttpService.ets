import { http } from '@kit.NetworkKit'
import { util } from '@kit.ArkTS'
import { ILynxHttpService, LynxHttpRequest, LynxHttpResponse, LynxServiceCenter, LynxServiceType } from '@lynx/lynx'
import { HttpStreamingDelegate } from '@lynx/lynx'
import { InsecureTls } from './InsecureTls'

export class SongloftHttpService implements ILynxHttpService {
  private static _instance: SongloftHttpService = new SongloftHttpService()

  static get instance(): SongloftHttpService {
    return SongloftHttpService._instance
  }

  /**
   * Register this service as the Lynx SDK's HTTP backing.
   *
   * Called from `EntryAbility.onCreate`. Kept as a static wrapper so the call
   * site names our service (mirrors the Android/iOS gates that grep for a
   * literal registration call, and lets the native-module-contract test
   * confirm the hookup by substring rather than by inspecting the SDK's
   * service center).
   */
  static register(): void {
    LynxServiceCenter.registerService(LynxServiceType.Http, SongloftHttpService._instance)
  }

  request(request: LynxHttpRequest, callback: (resp: LynxHttpResponse) => void): void {
    const httpRequest = http.createHttp()

    const headers: Record<string, string> = {}
    let readTimeout = 30000
    for (const name of Object.keys(request.httpHeaders)) {
      if (name.toLowerCase() === 'x-songloft-request-timeout-ms') {
        const timeoutMs = Number(request.httpHeaders[name])
        if (Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 1800000) {
          readTimeout = timeoutMs
        }
      } else {
        headers[name] = request.httpHeaders[name]
      }
    }

    const options: http.HttpRequestOptions = {
      method: this.mapMethod(request.httpMethod),
      header: headers,
      extraData: request.httpBody,
      readTimeout: readTimeout,
      connectTimeout: 15000,
    }

    if (InsecureTls.isEnabled()) {
      options.usingProtocol = http.HttpProtocol.HTTP1_1
    }

    httpRequest.request(request.url, options).then((response) => {
      httpRequest.destroy()
      const resp = new LynxHttpResponse()
      resp.url = request.url
      resp.statusCode = response.responseCode as number
      resp.statusText = 'OK'
      resp.httpHeaders = response.header as Record<string, string>
      const result = response.result
      if (typeof result === 'string') {
        const encoder = new util.TextEncoder()
        const encoded = encoder.encodeInto(result)
        resp.httpBody = encoded.buffer as ArrayBuffer
      } else if (result instanceof ArrayBuffer) {
        resp.httpBody = result
      }
      callback(resp)
    }).catch((err: Error) => {
      httpRequest.destroy()
      const resp = new LynxHttpResponse()
      resp.url = request.url
      resp.statusCode = 499
      resp.statusText = err.message
      callback(resp)
    })
  }

  requestStreaming(request: LynxHttpRequest, callback: (resp: LynxHttpResponse) => void,
    delegate: HttpStreamingDelegate): void {
    this.request(request, callback)
  }

  private mapMethod(method: string): http.RequestMethod {
    switch (method.toUpperCase()) {
      case 'GET': return http.RequestMethod.GET
      case 'POST': return http.RequestMethod.POST
      case 'PUT': return http.RequestMethod.PUT
      case 'DELETE': return http.RequestMethod.DELETE
      default: return http.RequestMethod.POST
    }
  }
}
