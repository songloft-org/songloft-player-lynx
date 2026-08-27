import { http } from '@kit.NetworkKit'
import { LynxEnv, LynxHttpService, LynxHttpRequest, LynxHttpResponse } from '@lynx/lynx'
import { InsecureTls } from './InsecureTls'

export class SongloftHttpService implements LynxHttpService {
  private static instance: SongloftHttpService | null = null

  static register(lynxEnv: LynxEnv): void {
    SongloftHttpService.instance = new SongloftHttpService()
    lynxEnv.registerHttpService(SongloftHttpService.instance)
  }

  async fetch(request: LynxHttpRequest): Promise<LynxHttpResponse> {
    const httpRequest = http.createHttp()

    try {
      const options: http.HttpRequestOptions = {
        method: this.mapMethod(request.method),
        header: request.headers,
        extraData: request.body,
        readTimeout: 30000,
        connectTimeout: 15000,
      }

      if (InsecureTls.isEnabled()) {
        options.usingProtocol = http.HttpProtocol.HTTP1_1
      }

      const response = await httpRequest.request(request.url, options)

      const responseBody = typeof response.result === 'string'
        ? response.result
        : JSON.stringify(response.result)

      const result: LynxHttpResponse = {
        statusCode: response.responseCode,
        headers: response.header as Record<string, string>,
        body: responseBody,
      }
      return result
    } catch (err) {
      const errorResult: LynxHttpResponse = {
        statusCode: 499,
        headers: {},
        body: String(err),
      }
      return errorResult
    } finally {
      httpRequest.destroy()
    }
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
