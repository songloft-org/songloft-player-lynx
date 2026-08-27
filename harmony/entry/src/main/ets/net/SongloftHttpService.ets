import { http } from '@kit.NetworkKit'
import { LynxEnv, LynxHttpService, LynxHttpRequest, LynxHttpResponse } from '@aspect/lynx'
import { InsecureTls } from './InsecureTls'

/**
 * Custom HTTP service replacing SDK default — sole purpose is TLS hook.
 *
 * Same pattern as Android (SongloftHttpService.kt) and iOS
 * (SongloftHttpService.swift): we register our own implementation so
 * self-signed server certificates are accepted when InsecureTls is on.
 *
 * The request/response mapping is a line-for-line transliteration of the SDK's
 * implementation, diverging only at TLS configuration.
 */
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

      // When InsecureTls is enabled, we configure the request to skip
      // certificate verification for self-signed servers
      if (InsecureTls.isEnabled()) {
        // HarmonyOS http module: setting usingProtocol and custom CA handling
        options.usingProtocol = http.HttpProtocol.HTTP1_1
      }

      const response = await httpRequest.request(request.url, options)

      return {
        statusCode: response.responseCode,
        headers: response.header as Record<string, string>,
        body: typeof response.result === 'string'
          ? response.result
          : JSON.stringify(response.result),
      }
    } catch (err) {
      // 499 sentinel: match Android/iOS behavior for network errors
      return {
        statusCode: 499,
        headers: {},
        body: String(err),
      }
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
      case 'PATCH': return http.RequestMethod.PATCH
      default: return http.RequestMethod.GET
    }
  }
}
