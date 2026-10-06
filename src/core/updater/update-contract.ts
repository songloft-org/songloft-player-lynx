/** Protocol 1: security verification belongs to the immutable native updater. */
export type UpdateChannel = 'dev' | 'stable' | 'preview'
export type UpdatePlatform = 'android' | 'ios' | 'harmony'

export interface BuildIdentity {
  version: string
  package_version: string
  native_version: string
  build_number: number
  git_commit: string
  build_time: string
  channel: UpdateChannel
  release_tag: string
}

export interface UpdateAsset { name: string; size: number; sha256: string }
export interface BundleTarget {
  platform: UpdatePlatform
  engine: string
  minimum_host_version: string
  minimum_bridge: number
  maximum_bridge: number
  required_capabilities: string[]
}
export interface BundleUpdate {
  protocol: number
  bundle_id: string
  asset: string
  size: number
  sha256: string
  local_schema: number
  targets: BundleTarget[]
}
export interface ReleaseManifest extends BuildIdentity {
  assets: UpdateAsset[]
  bundle_update: BundleUpdate | null
}
export interface NativeHostInfo extends BuildIdentity {
  platform: UpdatePlatform
  engine: string
  update_protocol: number
  bridge_version: number
  local_schema: number
  capabilities: readonly string[]
  trusted_key_ids: readonly string[]
}

const stableVersion = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/
export function compareStableVersions(a: string, b: string): number | null {
  const left = stableVersion.exec(a)
  const right = stableVersion.exec(b)
  if (!left || !right) return null
  for (let index = 1; index <= 3; index++) {
    const difference = Number(left[index]) - Number(right[index])
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid update manifest')
  return value as Record<string, unknown>
}
function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024) throw new Error('Invalid update text')
  return value
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid update number')
  return value
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 64) throw new Error('Invalid update list')
  const result = value.map(string)
  if (new Set(result).size !== result.length) throw new Error('Duplicate update values')
  return result
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error('Invalid update list')
  return value
}
function platform(value: unknown): UpdatePlatform {
  if (value !== 'android' && value !== 'ios' && value !== 'harmony') throw new Error('Invalid update platform')
  return value
}
function assetName(value: unknown): string {
  const result = string(value)
  if (!/^[a-zA-Z0-9._-]+$/.test(result) || result === '.' || result === '..') throw new Error('Unsafe update asset path')
  return result
}
function asset(raw: unknown): UpdateAsset {
  const data = object(raw)
  const result = { name: assetName(data.name), size: integer(data.size), sha256: string(data.sha256) }
  if (result.size === 0 || !/^[0-9a-f]{64}$/.test(result.sha256)) throw new Error('Invalid update asset')
  return result
}

export function parseReleaseManifest(raw: unknown): ReleaseManifest {
  const data = object(raw)
  if (data.channel !== 'dev' && data.channel !== 'stable' && data.channel !== 'preview') throw new Error('Invalid update channel')
  const version = string(data.version)
  const releaseTag = string(data.release_tag)
  const buildNumber = integer(data.build_number)
  const nativeVersion = string(data.native_version)
  const gitCommit = typeof data.git_commit === 'string' ? data.git_commit : 'unknown'
  if (buildNumber === 0 || !stableVersion.test(nativeVersion)) throw new Error('Invalid native build identity')
  if (data.channel === 'dev' ? version !== 'dev' || releaseTag !== 'dev'
    : releaseTag !== `v${version}` || (data.channel === 'stable' && !stableVersion.test(version)))
    throw new Error('Update version does not match channel')
  const assets = array(data.assets, 16).map(asset)
  if (new Set(assets.map(value => value.name)).size !== assets.length) throw new Error('Duplicate update assets')
  let bundle: BundleUpdate | null = null
  if (data.bundle_update != null) {
    const value = object(data.bundle_update)
    const targets = array(value.targets, 3).map(rawTarget => {
      const target = object(rawTarget)
      const result: BundleTarget = {
        platform: platform(target.platform), engine: string(target.engine),
        minimum_host_version: string(target.minimum_host_version),
        minimum_bridge: integer(target.minimum_bridge), maximum_bridge: integer(target.maximum_bridge),
        required_capabilities: strings(target.required_capabilities),
      }
      if (!stableVersion.test(result.engine) || !stableVersion.test(result.minimum_host_version) ||
        result.minimum_bridge > result.maximum_bridge) throw new Error('Invalid update target')
      return result
    })
    if (targets.length === 0 || new Set(targets.map(target => target.platform)).size !== targets.length)
      throw new Error('Duplicate or missing update targets')
    bundle = { protocol: integer(value.protocol), bundle_id: string(value.bundle_id),
      asset: assetName(value.asset), size: integer(value.size), sha256: string(value.sha256),
      local_schema: integer(value.local_schema), targets }
    if (!/^[a-zA-Z0-9._-]+$/.test(bundle.bundle_id) || bundle.asset !== 'songloft-lynx-main.lynx.bundle' ||
      bundle.size === 0 || bundle.size > 32 * 1024 * 1024 || !/^[0-9a-f]{64}$/.test(bundle.sha256))
      throw new Error('Invalid update bundle')
    if (bundle.bundle_id !== `${data.channel}-${buildNumber}-${gitCommit}`) throw new Error('Invalid bundle identity')
    const listed = assets.find(candidate => candidate.name === bundle!.asset)
    if (!listed || listed.size !== bundle.size || listed.sha256 !== bundle.sha256) throw new Error('Update bundle differs from asset list')
  }
  return { version, release_tag: releaseTag, channel: data.channel,
    package_version: string(data.package_version), native_version: nativeVersion,
    build_number: buildNumber, git_commit: gitCommit,
    build_time: typeof data.build_time === 'string' ? data.build_time : 'unknown', assets, bundle_update: bundle }
}

export type BundleCompatibility = 'compatible' | 'unavailable' | 'protocol' | 'channel' | 'platform' |
  'engine' | 'host_version' | 'bridge' | 'capability' | 'schema' | 'signing_key'

/** A presentation check only. Native prepare MUST verify raw signature/hash again. */
export function bundleCompatibility(manifest: ReleaseManifest, host: NativeHostInfo): BundleCompatibility {
  const bundle = manifest.bundle_update
  if (!bundle) return 'unavailable'
  if (bundle.protocol !== 1 || host.update_protocol !== 1) return 'protocol'
  if (host.channel === 'preview' || manifest.channel !== host.channel) return 'channel'
  const target = bundle.targets.find(value => value.platform === host.platform)
  if (!target) return 'platform'
  if (target.engine !== host.engine) return 'engine'
  const version = compareStableVersions(host.native_version, target.minimum_host_version)
  if (version == null || version < 0) return 'host_version'
  if (host.bridge_version < target.minimum_bridge || host.bridge_version > target.maximum_bridge) return 'bridge'
  if (target.required_capabilities.some(value => !host.capabilities.includes(value))) return 'capability'
  if (bundle.local_schema !== host.local_schema) return 'schema'
  if (host.trusted_key_ids.length === 0) return 'signing_key'
  return 'compatible'
}
