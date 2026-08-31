import { LynxMediaResourceFetcher, LynxOptionalBool, LynxResourceRequest } from '@lynx/lynx'

export class SongloftMediaResourceFetcher extends LynxMediaResourceFetcher {
  shouldRedirectUrl(request: LynxResourceRequest): string {
    if (request.url === '/app_icon.png') {
      return 'resource://rawfile/app_icon.png'
    }
    return request.url
  }

  isLocalResource(url: string): LynxOptionalBool {
    return LynxOptionalBool.UNDEFINED
  }
}
