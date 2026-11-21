import { useQuery } from '@tanstack/react-query'

import { createFetchTransport, type Transport } from '../../../core/network/http-client.js'
import { withGithubProxy } from '../../../core/updater/release-resolver.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { isSvgMarkup, normalizeSvgMarkup } from '../data/jsplugin-query.js'
import { githubPluginIconUrl, type GithubPlugin } from '../domain/github-plugin-validation.js'
import { isSvgIcon } from '../domain/plugin-icon.js'
import { PluginIconTile } from './PluginIconTile.js'

export async function fetchDiscoverySvg(
  urls: string[],
  signal: AbortSignal,
  transport: Transport = createFetchTransport(),
): Promise<string> {
  for (const url of urls) {
    if (signal.aborted) break
    try {
      const response = await transport({ url, method: 'GET', headers: {}, timeoutMs: 10_000, signal })
      if (response.status >= 200 && response.status < 300
        && response.body.length <= 256 * 1024 && isSvgMarkup(response.body)) {
        return normalizeSvgMarkup(response.body)
      }
    } catch {
      // A failed proxy request can still succeed against the original URL.
    }
  }
  return ''
}

export function GithubDiscoveryIcon({ plugin, proxy }: { plugin: GithubPlugin; proxy: string }) {
  const direct = githubPluginIconUrl(plugin)
  let proxied = direct
  if (direct) {
    try { proxied = withGithubProxy(direct, proxy) } catch { /* Use the direct URL. */ }
  }

  // The browser can decode SVG as an isolated image. Native Lynx needs SVG markup.
  const nativeSvg = !isWebPlatform() && isSvgIcon(direct)
  const urls = proxied ? [proxied, ...(direct && direct !== proxied ? [direct] : [])] : []
  const { data: markup } = useQuery({
    queryKey: ['jsplugin', 'github-discovery-icon', proxied, direct],
    enabled: nativeSvg && urls.length > 0,
    queryFn: ({ signal }) => fetchDiscoverySvg(urls, signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  return (
    <PluginIconTile
      key={proxied ?? ''}
      name={plugin.manifest.name}
      markup={nativeSvg ? markup : undefined}
      imageSrc={nativeSvg ? undefined : proxied}
      fallbackImageSrc={!nativeSvg && proxied !== direct ? direct : undefined}
      showInitialWhileLoading
      testId='github-plugin-icon'
    />
  )
}
