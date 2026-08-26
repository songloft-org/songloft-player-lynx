import { useQuery } from '@tanstack/react-query'

import { getSettingsApi } from '../api/index.js'

/**
 * TanStack Query hook for reading the four proxy settings.
 *
 * Replaces the raw `fetch`-in-an-effect the page used to do — that loading gate
 * never flushed in the ReactLynx test harness, which is why this page had no
 * render test. Going through the query layer mocks cleanly.
 */

export const proxyQueryKeys = {
  all: () => ['settings', 'proxy'] as const,
}

/** Fetch all four proxy settings (http / github / hls / allowlist) in parallel. */
export function useProxySettingsQuery() {
  return useQuery({
    queryKey: proxyQueryKeys.all(),
    queryFn: () => getSettingsApi().getProxySettings(),
  })
}
