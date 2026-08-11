import { useQuery } from '@tanstack/react-query'

import { getJSPluginApi } from '../api/index.js'

export const pluginQueryKeys = {
  list: () => ['jsplugin', 'list'] as const,
  detail: (id: number) => ['jsplugin', 'detail', id] as const,
  icon: (entryPath: string, icon: string) => ['jsplugin', 'icon', entryPath, icon] as const,
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
      return isSvgMarkup(text) ? text : ''
    },
  })
}
