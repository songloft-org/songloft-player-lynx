export {
  HttpClient,
  ApiError,
  createFetchTransport,
} from './http-client.js'
export type {
  Transport,
  TransportRequest,
  TransportResponse,
  RequestOptions,
  RequestContext,
  HttpResult,
  HttpInterceptor,
  HttpClientOptions,
} from './http-client.js'

export { AuthInterceptor } from './auth-interceptor.js'
export type { AuthInterceptorOptions, RefreshFn } from './auth-interceptor.js'

export { TokenStore } from './token-store.js'
export { getCachedAccessToken, setCachedAccessToken } from './token-cache.js'

export {
  createApiClient,
  createPublicClient,
  getSharedApiBundle,
  getSharedTokenStore,
  getSharedClient,
  setSharedOnTokenExpired,
  resetSharedApiBundleForTests,
} from './api-client.js'
export type {
  ClientBaseOptions,
  ApiClientOptions,
  ApiClientBundle,
} from './api-client.js'

export * from './url-helper.js'
export { getTranscodeFormat } from './audio-format.js'
export type { AudioPlatform } from './audio-format.js'
