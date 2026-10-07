import { z } from 'zod'

import { compareStableVersions } from '../../../core/updater/update-contract.js'
import type { JSPlugin } from '../../../models/jsplugin.js'

/** Published manifests carry the same required hashes as the Go installer. */
const manifestSchema = z.object({
  name: z.string().refine(value => utf8Size(value) >= 2 && utf8Size(value) <= 50),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  entryPath: z.string().regex(/^[a-z][a-z0-9-]*$/),
  main: z.string().regex(/\.(js|jsc)$/).refine(safeRelativePath),
  permissions: z.array(z.string()),
  entryHash: z.string().regex(/^[a-f0-9]{64}$/),
  zipHash: z.string().regex(/^[a-f0-9]{64}$/),
  description: z.string().optional().default(''),
  author: z.string().optional().default(''),
  homepage: z.string().optional().default(''),
  minHostVersion: z.string().optional().default(''),
  renderEngine: z.enum(['', 'webview', 'lynx']).optional().default(''),
  download_url: z.string().optional().default(''),
  updateUrl: z.string().optional().default(''),
})

/** TextEncoder is not available in every Lynx realm. */
export function utf8Size(value: string): number {
  let size = 0
  for (const char of value) {
    const point = char.codePointAt(0) ?? 0
    size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4
  }
  return size
}

export function safeRelativePath(value: string): boolean {
  return !value.startsWith('/') && !value.includes('\\') && !value.includes(':')
    && value.split('/').every(part => part !== '..' && part !== '.')
}

export type GithubPluginManifest = z.output<typeof manifestSchema>
export function parseGithubPluginManifest(value: unknown): GithubPluginManifest {
  return manifestSchema.parse(value)
}

export interface GithubRepository {
  id: number
  fullName: string
  defaultBranch: string
  stars: number
  updatedAt: string
}

export interface GithubPlugin {
  repository: GithubRepository
  manifest: GithubPluginManifest
  downloadUrl: string
  releaseUrl: string
  publishedAt: string
}

/** Only this repository's own raw/contents/update metadata may be followed. */
export function isRepositoryMetadataUrl(address: string, repository: string): boolean {
  try {
    const url = new URL(address)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return false
    const path = url.pathname.toLowerCase(), repo = repository.toLowerCase()
    return url.hostname === 'raw.githubusercontent.com' && path.startsWith(`/${repo}/`)
      || url.hostname === 'github.com' && path.startsWith(`/${repo}/raw/`)
  } catch { return false }
}

export function releaseDownload(address: string, repository: string): { tag: string; file: string } | null {
  try {
    const url = new URL(address)
    const prefix = `/${repository}/releases/download/`
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password
      || url.search || url.hash || !url.pathname.toLowerCase().startsWith(prefix.toLowerCase())) return null
    const parts = url.pathname.slice(prefix.length).split('/')
    if (parts.length !== 2) return null
    const tag = decodeURIComponent(parts[0]!), file = decodeURIComponent(parts[1]!)
    return tag && file.endsWith('.jsplugin.zip') && !file.includes('/') && !file.includes('\\') ? { tag, file } : null
  } catch { return null }
}

export function hostCompatibility(minimum: string, current: string | undefined): 'compatible' | 'incompatible' | 'unknown' {
  if (!minimum) return 'compatible'
  if (!current) return 'unknown'
  const comparison = compareStableVersions(current.replace(/^v/, ''), minimum.replace(/^v/, ''))
  return comparison == null ? 'unknown' : comparison < 0 ? 'incompatible' : 'compatible'
}

/** Never infer repository identity from a self-declared author/homepage. */
export function occupiedPlugin(plugin: GithubPlugin, installed: readonly JSPlugin[]): JSPlugin | undefined {
  return installed.find(item => item.entryPath === plugin.manifest.entryPath)
}

export function installedFromRepository(plugin: GithubPlugin, installed: JSPlugin | undefined): boolean {
  return !!installed && (isRepositoryMetadataUrl(installed.updateUrl ?? '', plugin.repository.fullName)
    || releaseDownload(installed.downloadUrl ?? '', plugin.repository.fullName) != null)
}

export function discoveryHasUpdate(plugin: GithubPlugin, installed: JSPlugin | undefined): boolean {
  return installedFromRepository(plugin, installed)
    && (compareStableVersions(plugin.manifest.version, installed?.version ?? '') ?? 0) > 0
}
