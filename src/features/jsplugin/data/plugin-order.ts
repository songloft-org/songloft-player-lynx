import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getSettingsApi } from '../../settings/api/index.js'
import type { JSPlugin } from '../../../models/jsplugin.js'

/*
 * Query key intentionally shares the ['settings','plugin-order'] prefix so a
 * future settings pane (should we add one) can invalidate the same slot with
 * a wider match.
 */
const pluginOrderKey = ['settings', 'plugin-order'] as const

export function usePluginOrderQuery() {
  return useQuery({
    queryKey: pluginOrderKey,
    queryFn: () => getSettingsApi().getPluginOrder(),
    staleTime: 60_000,
  })
}

export function useUpdatePluginOrderMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (order: string[]) => getSettingsApi().updatePluginOrder(order),
    onSuccess: (cleaned) => {
      // Backend prunes orphans and returns the cleaned array — write it into
      // the cache directly so the grid re-renders without an extra roundtrip.
      queryClient.setQueryData<string[]>(pluginOrderKey, cleaned)
    },
  })
}

/**
 * Reorder a list of active plugins to match `order` (list of entry_paths),
 * appending any plugin not present in `order` (new installs) at the tail.
 *
 * Kept as a pure helper — the grid uses it directly and the unit tests exercise
 * it without mounting anything. The result preserves the input reference type
 * so callers keep the full plugin object, not just the entry_path.
 */
export function applyPluginOrder(plugins: JSPlugin[], order: string[]): JSPlugin[] {
  if (order.length === 0) return plugins
  const byEntry = new Map<string, JSPlugin>()
  for (const p of plugins) {
    if (p.entryPath) byEntry.set(p.entryPath, p)
  }
  const ordered: JSPlugin[] = []
  const consumed = new Set<string>()
  for (const ep of order) {
    const p = byEntry.get(ep)
    if (p && !consumed.has(ep)) {
      ordered.push(p)
      consumed.add(ep)
    }
  }
  for (const p of plugins) {
    if (!p.entryPath || !consumed.has(p.entryPath)) ordered.push(p)
  }
  return ordered
}
