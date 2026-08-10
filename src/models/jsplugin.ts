import { z } from 'zod'

import { makeParsers, nowIso } from './_shared.js'

export const jsPluginSchema = z
  .object({
    id: z.coerce.number().catch(0),
    name: z.string().nullish().catch(undefined),
    version: z.string().nullish().catch(undefined),
    description: z.string().nullish().catch(undefined),
    author: z.string().nullish().catch(undefined),
    homepage: z.string().nullish().catch(undefined),
    entry_path: z.string().nullish().catch(undefined),
    main: z.string().nullish().catch(undefined),
    icon: z.string().nullish().catch(undefined),
    permissions: z.array(z.string()).catch([]),
    file_path: z.string().catch(''),
    status: z.string().catch('inactive'),
    render_engine: z.string().nullish().catch(undefined),
    created_at: z.string().nullish().catch(undefined),
    updated_at: z.string().nullish().catch(undefined),
  })
  .transform((p) => ({
    id: p.id,
    name: p.name ?? undefined,
    version: p.version ?? undefined,
    description: p.description ?? undefined,
    author: p.author ?? undefined,
    homepage: p.homepage ?? undefined,
    entryPath: p.entry_path ?? undefined,
    main: p.main ?? undefined,
    icon: p.icon ?? undefined,
    permissions: p.permissions,
    filePath: p.file_path,
    status: p.status as 'active' | 'inactive' | 'error',
    renderEngine: p.render_engine ?? undefined,
    createdAt: p.created_at ?? nowIso(),
    updatedAt: p.updated_at ?? nowIso(),
    isActive: p.status === 'active',
    isError: p.status === 'error',
    displayName: p.name ?? p.file_path.split('/').pop() ?? '',
  }))

export type JSPlugin = z.output<typeof jsPluginSchema>

const jsPluginParsers = makeParsers(jsPluginSchema)
export const parseJSPlugin = jsPluginParsers.parse
export const safeParseJSPlugin = jsPluginParsers.safeParse

export const jsPluginListResponseSchema = z
  .object({
    plugins: z.array(jsPluginSchema).catch([]),
  })
  .transform((r) => ({ plugins: r.plugins }))

export type JSPluginListResponse = z.output<typeof jsPluginListResponseSchema>

const jsPluginListParsers = makeParsers(jsPluginListResponseSchema)
export const parseJSPluginListResponse = jsPluginListParsers.parse

export const registryPluginEntrySchema = z
  .object({
    name: z.string().catch(''),
    entry_path: z.string().catch(''),
    version: z.string().catch(''),
    description: z.string().nullish().catch(undefined),
    author: z.string().nullish().catch(undefined),
    homepage: z.string().nullish().catch(undefined),
    icon: z.string().nullish().catch(undefined),
    download_url: z.string().catch(''),
    installed: z.boolean().catch(false),
    installed_version: z.string().nullish().catch(undefined),
    has_update: z.boolean().catch(false),
    source_url: z.string().nullish().catch(undefined),
    identity: z.string().nullish().catch(undefined),
  })
  .transform((p) => ({
    name: p.name,
    entryPath: p.entry_path,
    version: p.version,
    description: p.description ?? undefined,
    author: p.author ?? undefined,
    homepage: p.homepage ?? undefined,
    icon: p.icon ?? undefined,
    downloadUrl: p.download_url,
    installed: p.installed,
    installedVersion: p.installed_version ?? undefined,
    hasUpdate: p.has_update,
    sourceUrl: p.source_url ?? undefined,
    identity: p.identity ?? undefined,
  }))

export type RegistryPluginEntry = z.output<typeof registryPluginEntrySchema>

export const registryRefreshResponseSchema = z
  .object({
    plugins: z.array(registryPluginEntrySchema).catch([]),
    total: z.coerce.number().catch(0),
    page: z.coerce.number().catch(1),
    page_size: z.coerce.number().catch(20),
  })
  .transform((r) => ({
    plugins: r.plugins,
    total: r.total,
    page: r.page,
    pageSize: r.page_size,
  }))

export type RegistryRefreshResponse = z.output<typeof registryRefreshResponseSchema>

const registryRefreshParsers = makeParsers(registryRefreshResponseSchema)
export const parseRegistryRefreshResponse = registryRefreshParsers.parse
