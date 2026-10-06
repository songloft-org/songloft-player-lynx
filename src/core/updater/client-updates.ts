import { clientBuild } from '../config/constants.js'
import { isWebPlatform } from '../../native/web-platform.js'
import { bundleCompatibility, type BuildIdentity } from './update-contract.js'
import { getUpdateState, inspectUpdateManifest, nativeUpdateMetadataAvailable, nativeUpdaterAvailable, type UpdateState } from './native-updater.js'
import { compareRelease, releaseAsset, withGithubProxy, type ReleaseCandidate, type VersionComparison } from './release-resolver.js'
import { clientReleaseResolver } from './update-metadata.js'

export interface ClientUpdateCheck {
  candidate: ReleaseCandidate
  comparison: VersionComparison
  bundleURL: string | null
  bundleReason: string
}
export function updateIdentity(state: UpdateState | null): BuildIdentity {
  // The immutable shell selects the channel even if the loaded JS identity is malformed.
  return state ? { ...state.running, channel: state.host.channel } : clientBuild
}
export async function checkClientUpdate(input: { proxy: string; force?: boolean }): Promise<ClientUpdateCheck> {
  const { proxy } = input
  const state = nativeUpdaterAvailable() && !isWebPlatform() ? await getUpdateState() : null
  const current = updateIdentity(state)
  if (current.channel === 'preview') throw new Error('update_channel_unsupported')
  if (!isWebPlatform() && !nativeUpdateMetadataAvailable()) throw new Error('metadata_unavailable')
  for (let attempt = 0; attempt < 2; attempt++) {
    const candidate = await clientReleaseResolver.resolve({ channel: current.channel, proxy, force: !!input.force || attempt > 0 })
    const comparison = compareRelease(current, candidate.manifest)
    let bundleReason: string = state ? bundleCompatibility(candidate.manifest, state.host) : 'unavailable'
    if (comparison === 'newer' && state && bundleReason === 'compatible') {
      if (!candidate.signature) bundleReason = 'signature_missing'
      else {
        try {
          // Never substitute JS parsing/compatibility for the native raw-byte signature verifier.
          await inspectUpdateManifest(candidate.rawManifest, candidate.signature)
          const asset = releaseAsset(candidate, candidate.manifest.bundle_update!.asset)
          if (!asset) throw new Error('release_changed')
          return { candidate, comparison, bundleReason: 'compatible', bundleURL: withGithubProxy(asset.browser_download_url, proxy) }
        } catch (error) {
          if (current.channel === 'dev' && attempt === 0) continue // One same-channel rolling-release retry.
          bundleReason = ['invalid_signature', 'unknown_signing_key'].includes((error as Error).message) ? 'signature_invalid' : 'incompatible'
        }
      }
    }
    return { candidate, comparison, bundleReason, bundleURL: null }
  }
  throw new Error('release_changed')
}
