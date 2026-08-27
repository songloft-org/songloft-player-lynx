import { http } from '@kit.NetworkKit'
import { util } from '@kit.ArkTS'
import { ILynxHttpService, LynxHttpRequest, LynxHttpResponse } from '@lynx/lynx'
import { HttpStreamingDelegate } from '@lynx/lynx'
import { InsecureTls } from './InsecureTls'

export class SongloftHttpService implements ILynxHttpService {
  private static _instance: SongloftHttpService = new SongloftHttpService()

  static get instance(): SongloftHttpService {
    return SongloftHttpService._instance
  }

  request(request: LynxHttpRequest, callback: (resp: LynxHttpResponse) => void): void {
    const httpRequest = http.createHttp()

    const options: http.HttpRequestOptions = {
      method: this.mapMethod(request.httpMethod),
      header: request.httpHeaders,
      extraData: request.httpBody,
      readTimeout: 30000,
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
