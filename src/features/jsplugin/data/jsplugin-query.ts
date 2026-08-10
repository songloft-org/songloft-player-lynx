import { useQuery } from '@tanstack/react-query'

import { getJSPluginApi } from '../api/index.js'

export const pluginQueryKeys = {
  list: () => ['jsplugin', 'list'] as const,
  detail: (id: number) => ['jsplugin', 'detail', id] as const,
}

export function usePluginsQuery() {
  return useQuery({
    queryKey: pluginQueryKeys.list(),
    queryFn: () => getJSPluginApi().getPlugins(),
  })
}
