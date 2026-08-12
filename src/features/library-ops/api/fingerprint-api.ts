import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import {
  parseFingerprintStatus,
  parseFingerprintProgress,
  parseFingerprintCancelResponse,
  type FingerprintStatus,
  type FingerprintProgress,
  type FingerprintCancelResponse,
} from '../../../models/fingerprint.js'
import {
  parseDuplicatesResult,
  parseBatchDeleteResponse,
  type DuplicatesResult,
  type BatchDeleteResponse,
} from '../../../models/duplicate.js'

/**
 * Fingerprint computation + duplicate detection API — ports the Flutter
 * `ScanApi`'s fingerprint methods (lines 137-380 of `scan_api.dart`).
 *
 * Endpoints:
 * - `GET  /scan/fingerprints/status`   — overall fingerprint stats
 * - `POST /scan/fingerprints`          — trigger computation
 * - `GET  /scan/fingerprints/progress` — poll while computing
 * - `POST /scan/fingerprints/cancel`   — cancel running computation
 * - `GET  /songs/duplicates`           — fetch duplicate groups
 * - `POST /songs/batch-delete`         — batch-delete songs by ID
 */
export class FingerprintApi {
  constructor(private readonly client: HttpClient) {}

  /** `GET /scan/fingerprints/status` — fingerprint stats overview. */
  async getFingerprintStatus(): Promise<FingerprintStatus> {
    const res = await this.client.get<unknown>(`${apiPrefix}/scan/fingerprints/status`)
    return parseFingerprintStatus(res.data)
  }

  /**
   * `POST /scan/fingerprints` — trigger fingerprint computation.
   * Body is optional; pass `recomputeAll` or `retryFailed` to control behavior.
   */
  async startFingerprintCompute(params?: {
    recomputeAll?: boolean
    retryFailed?: boolean
  }): Promise<void> {
    const body: Record<string, boolean> = {}
    if (params?.recomputeAll) body.recompute_all = true
    if (params?.retryFailed) body.retry_failed = true
    await this.client.post<unknown>(
      `${apiPrefix}/scan/fingerprints`,
      Object.keys(body).length > 0 ? body : undefined,
    )
  }

  /** `GET /scan/fingerprints/progress` — poll target during computation. */
  async getFingerprintProgress(): Promise<FingerprintProgress> {
    const res = await this.client.get<unknown>(`${apiPrefix}/scan/fingerprints/progress`)
    return parseFingerprintProgress(res.data)
  }

  /** `POST /scan/fingerprints/cancel` — cancel a running computation. */
  async cancelFingerprintCompute(): Promise<FingerprintCancelResponse> {
    const res = await this.client.post<unknown>(`${apiPrefix}/scan/fingerprints/cancel`)
    return parseFingerprintCancelResponse(res.data)
  }

  /** `GET /songs/duplicates` — fetch all duplicate groups. */
  async getDuplicates(): Promise<DuplicatesResult> {
    const res = await this.client.get<unknown>(`${apiPrefix}/songs/duplicates`)
    return parseDuplicatesResult(res.data)
  }

  /**
   * `POST /songs/batch-delete` — delete songs by ID.
   * @param ids Song IDs to delete.
   * @param deleteFiles Whether to also remove audio files from disk.
   */
  async batchDelete(ids: number[], deleteFiles: boolean): Promise<BatchDeleteResponse> {
    const res = await this.client.post<unknown>(`${apiPrefix}/songs/batch-delete`, {
      ids,
      delete_files: deleteFiles,
    })
    return parseBatchDeleteResponse(res.data)
  }
}
