import { useQuery } from '@tanstack/react-query'

import { getSongsApi } from '../../library/api/index.js'
import type { PlaybackContext } from '../domain/playback-context.js'

/** Stable query key — the context is the cache identity. */
export const playHistoryQueryKeys = {
  all: () => ['play-history'] as const,
  forContext: (context: PlaybackContext) =>
    ['play-history', context.type, context.key] as const,
}

/**
 * One playback context's history.
 *
 * Not paginated: the backend caps each context at 50 entries and returns them
 * all. `enabled` lets the caller hold off until the panel is actually open.
 */
export function usePlayHistoryQuery(context: PlaybackContext | undefined, enabled = true) {
  return useQuery({
    queryKey: context ? playHistoryQueryKeys.forContext(context) : playHistoryQueryKeys.all(),
    queryFn: () => getSongsApi().getPlayHistory(context!),
    enabled: enabled && context != null,
  })
}
