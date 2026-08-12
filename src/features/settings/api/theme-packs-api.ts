import { apiPrefix } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'

export interface ThemePackItem {
  id: number
  themeId: string
  name: string
  author: string
  description: string
  version: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

export interface ThemePack extends ThemePackItem {
  data: ThemePackData
}

export interface ThemePackData {
  id: string
  name: string
  author: string
  description: string
  version: string
  schemaVersion: number
  dark?: ThemePackColors
  light?: ThemePackColors
  cardRadius?: number
  controlRadius?: number
  navigationRadius?: number
  playerGradient?: string[]
}

export interface ThemePackColors {
  seedColor?: string
  backgroundColor?: string
  surfaceColor?: string
}

function parseItem(raw: Record<string, unknown>): ThemePackItem {
  return {
    id: Number(raw.id ?? 0),
    themeId: String(raw.theme_id ?? ''),
    name: String(raw.name ?? ''),
    author: String(raw.author ?? ''),
    description: String(raw.description ?? ''),
    version: String(raw.version ?? ''),
    schemaVersion: Number(raw.schema_version ?? 0),
    createdAt: String(raw.created_at ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
  }
}

export class ThemePacksApi {
  constructor(private readonly client: HttpClient) {}

  async list(): Promise<ThemePackItem[]> {
    const res = await this.client.get<unknown[]>(`${apiPrefix}/theme-packs`)
    const arr = Array.isArray(res.data) ? res.data : []
    return arr.map(r => parseItem(r as Record<string, unknown>))
  }

  async getActive(): Promise<ThemePack | null> {
    try {
      const res = await this.client.get<Record<string, unknown>>(`${apiPrefix}/theme-packs/active`)
      if (!res.data || !res.data.theme_id) return null
      return { ...parseItem(res.data), data: res.data.data as ThemePackData ?? {} as ThemePackData }
    } catch {
      return null
    }
  }

  async activate(themeId: string): Promise<void> {
    await this.client.put(`${apiPrefix}/theme-packs/active`, { theme_id: themeId })
  }

  async resetToDefault(): Promise<void> {
    await this.client.delete(`${apiPrefix}/theme-packs/active`)
  }

  async deletePack(themeId: string): Promise<void> {
    await this.client.delete(`${apiPrefix}/theme-packs/${encodeURIComponent(themeId)}`)
  }

  async refreshCatalog(): Promise<ThemePackItem[]> {
    const res = await this.client.post<unknown>(`${apiPrefix}/theme-packs/catalog/refresh`, {})
    const data = res.data as Record<string, unknown> | undefined
    const items = Array.isArray(data?.items) ? data!.items : []
    return items.map((r: unknown) => parseItem(r as Record<string, unknown>))
  }

  async installFromCatalog(themeId: string): Promise<void> {
    await this.client.post(`${apiPrefix}/theme-packs/catalog/install`, { theme_id: themeId })
  }
}
