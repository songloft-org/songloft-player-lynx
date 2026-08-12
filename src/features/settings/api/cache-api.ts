import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import {
  parseCacheConfig,
  parseCacheStats,
  parseCleanCacheResponse,
  parseDirValidateResponse,
  type CacheConfig,
  type CacheConfigUpdate,
  type CacheStats,
  type CleanCacheResponse,
  type DirValidateRequest,
  type DirValidateResponse,
} from '../domain/cache-model.js'

/**
 * Cache management API (mirrors the SettingsApi HttpClient-injection pattern).
 *
 * Endpoints:
 * - `GET  /api/v1/cache-manage/stats`        — cache usage statistics
 * - `GET  /api/v1/cache-manage/config`       — current cache configuration
 * - `PUT  /api/v1/cache-manage/config`       — update cache configuration
 * - `POST /api/v1/cache-manage/clean`        — clear all cached files
 * - `POST /api/v1/cache-manage/validate-dir` — validate a directory path
 */
export class CacheApi {
  constructor(private readonly client: HttpClient) {}

  async getStats(): Promise<CacheStats> {
    const res = await this.client.get<unknown>(`${apiPrefix}/cache-manage/stats`)
    return parseCacheStats(res.data)
  }

  async getConfig(): Promise<CacheConfig> {
    const res = await this.client.get<unknown>(`${apiPrefix}/cache-manage/config`)
    return parseCacheConfig(res.data)
  }

  async updateConfig(body: CacheConfigUpdate): Promise<CacheConfig> {
    const res = await this.client.put<unknown>(`${apiPrefix}/cache-manage/config`, body)
    return parseCacheConfig(res.data)
  }

  async cleanCache(): Promise<CleanCacheResponse> {
    const res = await this.client.post<unknown>(`${apiPrefix}/cache-manage/clean`)
    return parseCleanCacheResponse(res.data)
  }

  async validateDir(body: DirValidateRequest): Promise<DirValidateResponse> {
    const res = await this.client.post<unknown>(`${apiPrefix}/cache-manage/validate-dir`, body)
    return parseDirValidateResponse(res.data)
  }
}
