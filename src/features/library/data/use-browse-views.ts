import { useEffect, useState } from '@lynx-js/react'

import { getSettingsApi } from '../../settings/api/index.js'
import type { BrowseView, LibraryBrowseConfig } from '../../settings/api/settings-api.js'

/**
 * Default fallback views used when the browse-views API call fails (e.g. not
 * logged in, server doesn't support the endpoint). Matches the original
 * hardcoded artist/album/genre chips.
 */
const FALLBACK_VIEWS: BrowseView[] = [
  { id: 'artist', labelKey: 'library.facetArtist', type: 'facet', visible: true, order: 3 },
  { id: 'album', labelKey: 'library.facetAlbum', type: 'facet', visible: true, order: 4 },
  { id: 'genre', labelKey: 'library.facetGenre', type: 'facet', visible: true, order: 5 },
]

export interface UseBrowseViewsResult {
  /** Visible views sorted by order. */
  views: BrowseView[]
  loading: boolean
}

/**
 * Hook that loads the library browse views configuration from the settings API.
 * Returns only the `visible: true` views, sorted by `order`.
 * Falls back to the original 3 facets (artist/album/genre) if the API fails.
 */
export function useBrowseViews(): UseBrowseViewsResult {
  const [views, setViews] = useState<BrowseView[]>(FALLBACK_VIEWS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void getSettingsApi()
      .getLibraryBrowse()
      .then((config: LibraryBrowseConfig) => {
        if (cancelled) return
        const visible = config.views
          .filter((v) => v.visible)
          .sort((a, b) => a.order - b.order)
        setViews(visible.length > 0 ? visible : FALLBACK_VIEWS)
      })
      .catch(() => {
        if (!cancelled) setViews(FALLBACK_VIEWS)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { views, loading }
}
