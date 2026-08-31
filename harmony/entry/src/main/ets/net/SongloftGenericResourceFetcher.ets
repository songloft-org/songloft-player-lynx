import { AsyncCallback, BusinessError } from '@ohos.base'
import http from '@ohos.net.http'
import { CacheStrategy, ImageKnife, ImageKnifeOption } from '@ohos/imageknifepro'
import {
  LynxError,
  LynxGenericResourceFetcher,
  LynxResourceRequest,
  LynxResourceType,
  LynxSubErrorCode
} from '@lynx/lynx'

export class SongloftGenericResourceFetcher extends LynxGenericResourceFetcher {
  fetchResource(request: LynxResourceRequest, callback: AsyncCallback<ArrayBuffer>): void {
    const httpRequest = http.createHttp()
    httpRequest.request(request.url, {
      expectDataType: http.HttpDataType.ARRAY_BUFFER
    }, (err: BusinessError, data: http.HttpResponse) => {
      callback(err, data?.result as ArrayBuffer)
      httpRequest.destroy()
    })
  }

  fetchResourcePath(request: LynxResourceRequest, callback: AsyncCallback<string>): void {
    if (request.type !== LynxResourceType.LYNX_RESOURCE_TYPE_IMAGE) {
      callback({
        code: LynxError.LYNX_ERROR_CODE_RESOURCE,
        message: `unsupported type: ${request.type}`,
        name: 'Resource Error'
      }, '')
      return
    }

    const option = new ImageKnifeOption()
    option.loadSrc = request.url
    option.writeCacheStrategy = CacheStrategy.FILE
    ImageKnife.getInstance().preloadCache(option).then((path: string) => {
      if (path.length > 0) {
        callback(undefined, path)
        return
      }
      callback({
        code: LynxSubErrorCode.E_RESOURCE_IMAGE_PIC_SOURCE,
        message: 'Image path is invalid',
        name: 'Image Error'
      }, '')
    }).catch((reason: string) => {
      callback({
        code: LynxSubErrorCode.E_RESOURCE_IMAGE_FROM_NETWORK_OR_OTHERS,
        message: reason,
        name: 'Image Error'
      }, '')
    })
  }

  cancel(request: LynxResourceRequest): void {}
}
