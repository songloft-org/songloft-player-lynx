import { LynxMediaResourceFetcher, LynxOptionalBool, LynxResourceRequest } from '@lynx/lynx'

export class SongloftMediaResourceFetcher extends LynxMediaResourceFetcher {
  shouldRedirectUrl(request: LynxResourceRequest): string {
    return request.url
  }

  isLocalResource(url: string): LynxOptionalBool {
    return LynxOptionalBool.UNDEFINED
  }
}
