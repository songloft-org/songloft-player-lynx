import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import {
  parseDirectoryList,
  parseDirNames,
  parseMetadataProgress,
  parseScanProgress,
  type DirectoryList,
  type MetadataProgress,
  type ScanProgress,
} from '../../../models/library-ops.js'

/**
 * Library scan + metadata-refresh actions — batch 19. Ports the Flutter
 * `ScanApi` (`features/settings/data/scan_api.dart`), the directory listing from
 * `DirectoryApi`, and the three metadata-refresh endpoints that live on
 * `SettingsApi`.
 *
 * **The endpoint namespaces are not uniform** and this is the single easiest
 * thing to get wrong: scanning is under `/scan/*`, but metadata refresh is under
 * `/songs/*`. (Duplicate detection — not in this batch — is `/songs/duplicates`,
 * despite being a scan feature.)
 */

export interface StartScanParams {
  /** `true` rescans and overwrites existing song info; `false` skips known files. */
  reimport?: boolean
  /** Restrict the scan to these absolute directories; empty means whole library. */
  paths?: string[]
}

export interface ScanBody {
  reimport: boolean
  paths?: string[]
}

/**
 * `POST /scan` body. The `paths` key must be **absent** (not `[]`, not `null`)
 * when no directories are selected — the backend treats presence of the key as
 * "restrict to these", so an empty array would scan nothing.
 */
export function buildScanBody({ reimport = false, paths }: StartScanParams = {}): ScanBody {
  const body: ScanBody = { reimport }
  if (paths && paths.length > 0) body.paths = paths
  return body
}

/**
 * `GET /scan/directories` query. Omitting `path` asks for the music-root's first
 * level; an empty string must not be sent as `path=` (the backend would treat it
 * as an explicit path).
 */
export function buildDirectoriesQuery(path?: string): { path?: string } {
  const trimmed = path?.trim() ?? ''
  return trimmed.length > 0 ? { path: trimmed } : {}
}

export class ScanApi {
  constructor(private readonly client: HttpClient) {}

  /** `POST /scan` — fire-and-forget; progress is polled separately. */
  async startScan(params: StartScanParams = {}): Promise<void> {
    await this.client.post<unknown>(`${apiPrefix}/scan`, buildScanBody(params))
  }

  /** `GET /scan/progress` — the poll target. */
  async getScanProgress(): Promise<ScanProgress> {
    const res = await this.client.get<unknown>(`${apiPrefix}/scan/progress`)
    return parseScanProgress(res.data)
  }

  /** `POST /scan/cancel`. */
  async cancelScan(): Promise<void> {
    await this.client.post<unknown>(`${apiPrefix}/scan/cancel`)
  }

  /** `GET /scan/directories[?path=…]` — one level of the music directory tree. */
  async getDirectories(path?: string): Promise<DirectoryList> {
    const res = await this.client.get<unknown>(`${apiPrefix}/scan/directories`, {
      query: buildDirectoriesQuery(path),
    })
    return parseDirectoryList(res.data)
  }

  /** `POST /songs/refresh-metadata` — probes remote songs with missing metadata. */
  async startMetadataRefresh(): Promise<void> {
    await this.client.post<unknown>(`${apiPrefix}/songs/refresh-metadata`)
  }

  /** `GET /songs/refresh-metadata/progress`. */
  async getMetadataProgress(): Promise<MetadataProgress> {
    const res = await this.client.get<unknown>(
      `${apiPrefix}/songs/refresh-metadata/progress`,
    )
    return parseMetadataProgress(res.data)
  }

  /** `POST /songs/refresh-metadata/cancel`. */
  async cancelMetadataRefresh(): Promise<void> {
    await this.client.post<unknown>(`${apiPrefix}/songs/refresh-metadata/cancel`)
  }

  /** `GET /scan/dir-names` — every directory name under the music root, sorted;
   * feeds the name-exclude tab's autocomplete. */
  async getDirNames(): Promise<string[]> {
    const res = await this.client.get<unknown>(`${apiPrefix}/scan/dir-names`)
    return parseDirNames(res.data)
  }
}
