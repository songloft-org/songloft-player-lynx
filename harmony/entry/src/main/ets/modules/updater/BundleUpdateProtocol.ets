import { cryptoFramework } from '@kit.CryptoArchitectureKit'
import { util } from '@kit.ArkTS'

export interface UpdateIdentity {
  version: string
  package_version: string
  native_version: string
  build_number: number
  git_commit: string
  build_time: string
  channel: string
  release_tag: string
}
export interface UpdatePublicKey {
  key_id: string
  key_bits: number
  algorithm: string
  spki_base64: string
}
export interface UpdateEngines { android: string; ios: string; harmony: string }
export interface UpdateHost extends UpdateIdentity {
  update_protocol: number
  bridge_version: number
  local_schema: number
  engines: UpdateEngines
  capabilities: string[]
  trusted_keys: UpdatePublicKey[]
}
export interface UpdateAsset { name: string; size: number; sha256: string }
export interface UpdateTarget {
  platform: string
  engine: string
  minimum_host_version: string
  minimum_bridge: number
  maximum_bridge: number
  required_capabilities: string[]
}
export interface UpdateBundle {
  protocol: number
  bundle_id: string
  asset: string
  size: number
  sha256: string
  local_schema: number
  targets: UpdateTarget[]
}
export interface UpdateManifest extends UpdateIdentity {
  assets: UpdateAsset[]
  bundle_update: UpdateBundle
}
interface UpdateSignature { protocol: number; key_id: string; algorithm: string; signature: string }
export interface UpdateRequest { task_id: string; manifest: string; signature: string; url: string }

/** Only immutable shell keys authorize a candidate; TS compatibility is presentation only. */
export class BundleUpdateProtocol {
  static readonly maximumManifest: number = 128 * 1024
  static readonly maximumBundle: number = 32 * 1024 * 1024

  static bytes(value: string): Uint8Array { return new util.TextEncoder().encodeInto(value) }
  static hex(value: Uint8Array): string {
    return Array.from(value).map((byte: number) => byte.toString(16).padStart(2, '0')).join('')
  }
  static hash(value: Uint8Array): string {
    const digest = cryptoFramework.createMd('SHA256')
    digest.updateSync({ data: value })
    return BundleUpdateProtocol.hex(digest.digestSync().data)
  }
  static compare(a: string, b: string): number {
    const pattern = /^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/
    if (!pattern.test(a) || !pattern.test(b)) throw new Error('invalid_manifest')
    const left = a.split('.').map((value: string) => Number(value))
    const right = b.split('.').map((value: string) => Number(value))
    for (let index = 0; index < 3; index++) {
      if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1
    }
    return 0
  }
  static time(value: string): number {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return NaN
    return Date.parse(value)
  }
  static key(manifest: UpdateManifest): string {
    return manifest.bundle_update.sha256 + '-' + manifest.bundle_update.bundle_id
  }
  static verify(raw: string, signature: string, host: UpdateHost): UpdateManifest {
    const data = BundleUpdateProtocol.bytes(raw)
    if (data.length === 0 || data.length > BundleUpdateProtocol.maximumManifest || signature.length > 8192) {
      throw new Error('invalid_manifest')
    }
    const envelope = JSON.parse(signature) as UpdateSignature
    if (envelope.protocol !== 1 || envelope.algorithm !== 'rsa-pkcs1v15-sha256') throw new Error('invalid_signature')
    const key = host.trusted_keys.find((value: UpdatePublicKey) => value.key_id === envelope.key_id)
    if (!key) throw new Error('unknown_signing_key')
    try {
      if (key.algorithm !== envelope.algorithm || ![2048, 3072, 4096].includes(key.key_bits)) throw new Error('invalid_signature')
      const helper = new util.Base64Helper()
      const sig = helper.decodeSync(envelope.signature)
      if (helper.encodeToStringSync(sig) !== envelope.signature) throw new Error('invalid_signature')
      const generator = cryptoFramework.createAsyKeyGenerator('RSA' + key.key_bits)
      const pair = generator.convertKeySync({ data: helper.decodeSync(key.spki_base64) }, null)
      const verify = cryptoFramework.createVerify('RSA' + key.key_bits + '|PKCS1|SHA256')
      verify.initSync(pair.pubKey)
      if (!verify.verifySync({ data: data }, { data: sig })) throw new Error('invalid_signature')
    } catch (_) { throw new Error('invalid_signature') }
    const manifest = JSON.parse(raw) as UpdateManifest
    BundleUpdateProtocol.compatible(manifest, host)
    return manifest
  }
  static compatible(manifest: UpdateManifest, host: UpdateHost): void {
    if (!['dev', 'stable'].includes(host.channel) || manifest.channel !== host.channel) throw new Error('incompatible_channel')
    if (!Number.isInteger(manifest.build_number) || manifest.build_number < 1 || manifest.build_number > 2100000000) {
      throw new Error('invalid_manifest')
    }
    BundleUpdateProtocol.compare(manifest.native_version, manifest.native_version)
    if (manifest.channel === 'dev') {
      if (manifest.version !== 'dev' || manifest.release_tag !== 'dev') throw new Error('invalid_manifest')
    } else {
      BundleUpdateProtocol.compare(manifest.version, manifest.version)
      if (manifest.release_tag !== 'v' + manifest.version) throw new Error('invalid_manifest')
    }
    const bundle = manifest.bundle_update
    if (bundle.protocol !== 1 || host.update_protocol !== 1) throw new Error('incompatible_protocol')
    if (bundle.local_schema !== host.local_schema) throw new Error('incompatible_schema')
    if (!/^[A-Za-z0-9._-]{1,96}$/.test(bundle.bundle_id) ||
      bundle.bundle_id !== manifest.channel + '-' + manifest.build_number + '-' + manifest.git_commit ||
      bundle.asset !== 'songloft-lynx-main.lynx.bundle' || !Number.isInteger(bundle.size) ||
      bundle.size < 1 || bundle.size > BundleUpdateProtocol.maximumBundle || !/^[0-9a-f]{64}$/.test(bundle.sha256) ||
      !Array.isArray(manifest.assets) || manifest.assets.length < 1 || manifest.assets.length > 16) throw new Error('invalid_manifest')
    const names = new Set<string>()
    for (const asset of manifest.assets) {
      if (!/^[A-Za-z0-9._-]+$/.test(asset.name) || ['.', '..'].includes(asset.name) || names.has(asset.name) ||
        !Number.isInteger(asset.size) || asset.size < 1 || !/^[0-9a-f]{64}$/.test(asset.sha256)) throw new Error('invalid_manifest')
      names.add(asset.name)
    }
    const listed = manifest.assets.find((value: UpdateAsset) => value.name === bundle.asset)
    if (!listed || listed.size !== bundle.size || listed.sha256 !== bundle.sha256 ||
      !Array.isArray(bundle.targets) || bundle.targets.length < 1 || bundle.targets.length > 3) throw new Error('invalid_manifest')
    const platforms = new Set<string>()
    for (const target of bundle.targets) {
      if (!['android', 'ios', 'harmony'].includes(target.platform) || platforms.has(target.platform) ||
        !Number.isInteger(target.minimum_bridge) || !Number.isInteger(target.maximum_bridge) ||
        target.minimum_bridge < 0 || target.maximum_bridge < target.minimum_bridge ||
        !Array.isArray(target.required_capabilities) || target.required_capabilities.length > 64 ||
        new Set<string>(target.required_capabilities).size !== target.required_capabilities.length ||
        target.required_capabilities.some((value: string) => typeof value !== 'string' || value.length === 0 || value.length > 1024)) {
        throw new Error('invalid_manifest')
      }
      BundleUpdateProtocol.compare(target.engine, target.engine)
      BundleUpdateProtocol.compare(target.minimum_host_version, target.minimum_host_version)
      platforms.add(target.platform)
    }
    const target = bundle.targets.find((value: UpdateTarget) => value.platform === 'harmony')
    if (!target) throw new Error('incompatible_platform')
    if (target.engine !== host.engines.harmony) throw new Error('incompatible_engine')
    if (BundleUpdateProtocol.compare(host.native_version, target.minimum_host_version) < 0) throw new Error('incompatible_host')
    if (host.bridge_version < target.minimum_bridge || host.bridge_version > target.maximum_bridge) throw new Error('incompatible_bridge')
    if (target.required_capabilities.some((value: string) => !host.capabilities.includes(value))) throw new Error('incompatible_capability')
  }
  static newUpdate(candidate: UpdateManifest, current: UpdateIdentity, host: UpdateHost): void {
    if (host.channel === 'stable') {
      if (BundleUpdateProtocol.compare(candidate.version, current.version) <= 0 ||
        BundleUpdateProtocol.compare(candidate.version, host.version) <= 0) throw new Error('update_not_newer')
    } else {
      const commits = /^[0-9a-f]{7,40}$/
      if (commits.test(current.git_commit) && commits.test(candidate.git_commit)) {
        if (current.git_commit === candidate.git_commit) throw new Error('update_not_newer')
      } else {
        const delta = BundleUpdateProtocol.time(candidate.build_time) - BundleUpdateProtocol.time(current.build_time)
        if (!Number.isFinite(delta) || delta < 600000) throw new Error('update_not_newer')
      }
    }
  }
}
