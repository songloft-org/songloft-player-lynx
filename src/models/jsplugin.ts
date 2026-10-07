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
    update_url: z.string().nullish().catch(undefined),
    download_url: z.string().nullish().catch(undefined),
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
    ...(p.update_url ? { updateUrl: p.update_url } : {}),
    ...(p.download_url ? { downloadUrl: p.download_url } : {}),
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

/*
 * One row of the plugin store. `conflict` is a **boolean** from the backend
 * (`true` = a *different* author's plugin owns this entry_path locally);
 * `conflictWith` carries the human-readable description of the plugin being
 * replaced. It used to be parsed as a string, so the backend's `true` fell into
 * the `.catch()` and became `undefined` — the whole conflict flow was dead.
 */
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
    source_name: z.string().nullish().catch(undefined),
    identity: z.string().nullish().catch(undefined),
    conflict: z.boolean().catch(false),
    conflict_with: z.string().nullish().catch(undefined),
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
    sourceName: p.source_name ?? undefined,
    identity: p.identity ?? undefined,
    conflict: p.conflict,
    conflictWith: p.conflict_with ?? undefined,
  }))

export type RegistryPluginEntry = z.output<typeof registryPluginEntrySchema>

export const registryRefreshResponseSchema = z
  .object({
    plugins: z.array(registryPluginEntrySchema).catch([]),
    total: z.coerce.number().catch(0),
    page: z.coerce.number().catch(1),
    page_size: z.coerce.number().catch(20),
    warnings: z.array(z.string()).catch([]),
  })
  .transform((r) => ({
    plugins: r.plugins,
    total: r.total,
    page: r.page,
    pageSize: r.page_size,
    warnings: r.warnings,
  }))

export type RegistryRefreshResponse = z.output<typeof registryRefreshResponseSchema>

const registryRefreshParsers = makeParsers(registryRefreshResponseSchema)
export const parseRegistryRefreshResponse = registryRefreshParsers.parse

/*
 * Upload / batch-update result shapes — the endpoints answer with per-file and
 * per-plugin details that the manager surfaces (upload: "3 installed, 1 failed
 * because …"; update-all: stats plus one row per plugin). Same defensive style as
 * the models above: every field `.catch()`-ed so a shape drift degrades the *list*
 * rather than throwing the page.
 */

export const jsPluginUploadResultSchema = z
  .object({
    file_name: z.string().catch(''),
    success: z.boolean().catch(false),
    error: z.string().nullish().catch(undefined),
  })
  .transform((r) => ({
    fileName: r.file_name,
    success: r.success,
    error: r.error ?? undefined,
  }))

export type JSPluginUploadResult = z.output<typeof jsPluginUploadResultSchema>

export const jsPluginUploadResponseSchema = z
  .object({
    total: z.coerce.number().catch(0),
    success: z.coerce.number().catch(0),
    failed: z.coerce.number().catch(0),
    message: z.string().catch(''),
    results: z.array(jsPluginUploadResultSchema).catch([]),
  })
  .transform((r) => ({
    total: r.total,
    success: r.success,
    failed: r.failed,
    message: r.message,
    results: r.results,
  }))

export type JSPluginUploadResponse = z.output<typeof jsPluginUploadResponseSchema>

const jsPluginUploadParsers = makeParsers(jsPluginUploadResponseSchema)
export const parseJSPluginUploadResponse = jsPluginUploadParsers.parse

export const jsPluginBatchUpdateResultSchema = z
  .object({
    plugin_id: z.coerce.number().catch(0),
    plugin_name: z.string().catch(''),
    entry_path: z.string().catch(''),
    success: z.boolean().catch(false),
    has_update: z.boolean().catch(false),
    current_version: z.string().catch(''),
    new_version: z.string().catch(''),
    error: z.string().nullish().catch(undefined),
  })
  .transform((r) => ({
    pluginId: r.plugin_id,
    pluginName: r.plugin_name,
    entryPath: r.entry_path,
    success: r.success,
    hasUpdate: r.has_update,
    currentVersion: r.current_version,
    newVersion: r.new_version,
    error: r.error ?? undefined,
  }))

export type JSPluginBatchUpdateResult = z.output<typeof jsPluginBatchUpdateResultSchema>

export const jsPluginBatchUpdateResponseSchema = z
  .object({
    total: z.coerce.number().catch(0),
    updated: z.coerce.number().catch(0),
    failed: z.coerce.number().catch(0),
    skipped: z.coerce.number().catch(0),
    message: z.string().catch(''),
    results: z.array(jsPluginBatchUpdateResultSchema).catch([]),
  })
  .transform((r) => ({
    total: r.total,
    updated: r.updated,
    failed: r.failed,
    skipped: r.skipped,
    message: r.message,
    results: r.results,
  }))

export type JSPluginBatchUpdateResponse = z.output<typeof jsPluginBatchUpdateResponseSchema>

const jsPluginBatchUpdateParsers = makeParsers(jsPluginBatchUpdateResponseSchema)
export const parseJSPluginBatchUpdateResponse = jsPluginBatchUpdateParsers.parse

export interface JSPluginUpdateCheck {
  hasUpdate: boolean
  currentVersion: string
  remoteVersion: string
  downloadUrl: string
}

export const jsPluginUpdateCheckSchema = z
  .object({
    has_update: z.boolean().catch(false),
    current_version: z.string().catch(''),
    remote_version: z.string().catch(''),
    download_url: z.string().catch(''),
  })
  .transform((r) => ({
    hasUpdate: r.has_update,
    currentVersion: r.current_version,
    remoteVersion: r.remote_version,
    downloadUrl: r.download_url,
  }))

const jsPluginUpdateCheckParsers = makeParsers(jsPluginUpdateCheckSchema)
export const parseJSPluginUpdateCheck = jsPluginUpdateCheckParsers.parse
