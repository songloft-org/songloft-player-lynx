/**
 * The four proxy-related settings the `ProxySettingsPage` edits, in their API
 * shape.
 *
 * `allowlist` is a `string[]` here (what the backend stores). The page joins it
 * with newlines for the multi-line field and splits/trims/filters it back on
 * save — that text↔list conversion is a UI concern and stays in the page.
 */
export interface ProxySettings {
  /** Outbound HTTP proxy for backend requests (`{proxy: string}`). */
  httpProxy: string
  /** GitHub mirror prefix (`{proxy: string}`). */
  githubProxy: string
  /** Whether the server proxies HLS radio streams (`{enabled: boolean}`). */
  hlsEnabled: boolean
  /** Private-network allowlist for the resource proxy (`{allowlist: string[]}`). */
  allowlist: string[]
}
