import { useQuery } from '@tanstack/react-query'

import { getJSPluginApi } from '../api/index.js'

export const pluginQueryKeys = {
  list: () => ['jsplugin', 'list'] as const,
  detail: (id: number) => ['jsplugin', 'detail', id] as const,
  icon: (entryPath: string, icon: string) => ['jsplugin', 'icon', entryPath, icon] as const,
  keepAlive: () => ['jsplugin', 'keep-alive'] as const,
  autoUpdate: () => ['jsplugin', 'auto-update'] as const,
  githubProxy: () => ['jsplugin', 'github-proxy'] as const,
}

export function usePluginsQuery() {
  return useQuery({
    queryKey: pluginQueryKeys.list(),
    queryFn: () => getJSPluginApi().getPlugins(),
  })
}

/** Markup that is unmistakably an SVG document, not an SPA fallback page. */
function isSvgMarkup(text: string): boolean {
  const head = text.trimStart().slice(0, 300).toLowerCase()
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))
}

/**
 * Ensure the root `<svg>` carries a `viewBox` — synthesize one from `width` /
 * `height` when absent.
 *
 * Why: Lynx's Android `<svg content>` renderer needs `viewBox` to scale the
 * artwork into the CSS-sized container (plugin icon tiles paint into 32×32).
 * A `<svg width="512" height="512">` without `viewBox` paints at its intrinsic
 * 512px and the visible 32×32 window falls in the empty top-left corner, so
 * the icon reads as blank on device. iOS's renderer handles this more
 * forgivingly, which is why the bug is Android-only. Same treatment for the
 * store `useRegistryIconQuery` path since store SVGs come from third-party
 * repos with the same variance.
 *
 * Only touches the root element and only when `viewBox` is missing.
 */
export function normalizeSvgMarkup(text: string): string {
  const openMatch = text.match(/<svg\b([^>]*)>/i)
  if (!openMatch) return text
  const attrs = openMatch[1] ?? ''
  if (/\bviewBox\s*=/i.test(attrs)) return text
  const w = attrs.match(/\bwidth\s*=\s*["']?\s*([\d.]+)/i)?.[1]
  const h = attrs.match(/\bheight\s*=\s*["']?\s*([\d.]+)/i)?.[1]
  if (!w || !h) return text
  return text.replace(openMatch[0], `<svg${attrs} viewBox="0 0 ${w} ${h}">`)
}

/**
 * SVG markup for a plugin icon, for feeding `<svg content>`.
 *
 * `enabled` is false for bitmap icons — those go to `<image>` and must not cost a
 * fetch. Icon filenames are content-hashed (`icon.27a432e2.svg`), so the result
 * never goes stale and no retry is worth doing: a miss just falls back to the
 * placeholder glyph.
 *
 * The response is validated rather than trusted: this endpoint SPA-falls-back to
 * `index.html` with a 200 for an unknown path, so a wrong filename yields HTML that
 * would otherwise be handed to the SVG renderer.
 */
export function usePluginIconQuery(entryPath: string, icon: string, enabled: boolean) {
  return useQuery({
    queryKey: pluginQueryKeys.icon(entryPath, icon),
    enabled: enabled && entryPath.length > 0 && icon.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async () => {
      const text = await getJSPluginApi().getStaticText(entryPath, icon)
      return isSvgMarkup(text) ? normalizeSvgMarkup(text) : ''
    },
  })
}

/*
 * Manager settings, read through the same api client the plugin list uses
 * (not ProxySettingsPage's raw fetch). staleTime is long because these change
 * rarely and every flip is followed by an invalidate from the mutation anyway.
 */

export function usePluginKeepAliveQuery() {
  return useQuery({
    queryKey: pluginQueryKeys.keepAlive(),
    staleTime: 5 * 60 * 1000,
    queryFn: () => getJSPluginApi().getPluginKeepAlive(),
  })
}

export function usePluginAutoUpdateQuery() {
  return useQuery({
    queryKey: pluginQueryKeys.autoUpdate(),
    staleTime: 5 * 60 * 1000,
    queryFn: () => getJSPluginApi().getPluginAutoUpdate(),
  })
}

export function useGithubProxyQuery() {
  return useQuery({
    queryKey: pluginQueryKeys.githubProxy(),
    staleTime: 5 * 60 * 1000,
    queryFn: () => getJSPluginApi().getGithubProxy(),
  })
}

/**
 * SVG markup for a **store entry's** icon URL — an external link in the common
 * case (GitHub raw), so it cannot go through `getStaticText`'s API path.
 *
 * Same validation and caching policy as `usePluginIconQuery`: the response must
 * look like an SVG document (registry URLs can SPA-fall-back to HTML), a miss
 * just falls back to the initial glyph, and content-hashed URLs never go stale.
 */
export function useRegistryIconQuery(resolvedUrl: string, enabled: boolean) {
  return useQuery({
    queryKey: ['jsplugin', 'registry-icon', resolvedUrl] as const,
    enabled: enabled && resolvedUrl.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async () => {
      const text = await getJSPluginApi().getRemoteText(resolvedUrl)
      return isSvgMarkup(text) ? normalizeSvgMarkup(text) : ''
    },
  })
}
