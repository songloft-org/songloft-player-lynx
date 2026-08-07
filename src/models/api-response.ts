/**
 * Generic API response wrapper `{ data?, error?, detail? }` — mirrors the
 * Flutter `ApiResponse<T>`. `isSuccess` is derived from the absence of `error`.
 */
export interface ApiResponse<T> {
  data?: T
  error?: string
  detail?: string
}

export function apiSuccess<T>(data: T): ApiResponse<T> {
  return { data }
}

export function apiFailure<T = never>(error: string, detail?: string): ApiResponse<T> {
  return { error, detail }
}

export function isApiSuccess<T>(res: ApiResponse<T>): boolean {
  return res.error == null
}

export function isApiError<T>(res: ApiResponse<T>): boolean {
  return res.error != null
}
