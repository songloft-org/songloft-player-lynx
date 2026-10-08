import { createStore } from 'zustand/vanilla'
import { getSongloftStorage, type SongloftStorage } from '../storage/index.js'
import type { ReleaseManifest } from './update-contract.js'
import type { UpdateState } from './native-updater.js'

export const PREF_AUTOMATIC_UPDATE = 'client_automatic_update'
export const AUTOMATIC_UPDATE_INTERVAL = 6 * 60 * 60 * 1000
export const AUTOMATIC_UPDATE_STARTUP_INTERVAL = 10 * 60 * 1000
const RETRY_DELAYS = [30 * 60 * 1000, 2 * 60 * 60 * 1000, AUTOMATIC_UPDATE_INTERVAL]

interface AutomaticUpdateState {
  loaded: boolean
  enabled: boolean
  lastAttempt: number
  nextAttempt: number
  failures: number
  skippedBundles: string[]
  preparedBundle: string | null
}

function initialState(): AutomaticUpdateState {
  return {
    loaded: false, enabled: false, lastAttempt: 0, nextAttempt: 0, failures: 0,
    skippedBundles: [], preparedBundle: null
  }
}

/** Include the hash: a corrected release with the same version may be tried again. */
export function updateBundleKey(manifest: { bundle_update?: ReleaseManifest['bundle_update'] }): string | null {
  const bundle = manifest.bundle_update
  return bundle ? `${bundle.bundle_id}:${bundle.sha256}` : null
}

/** Bound bridge reads so a missing storage callback cannot stall updates indefinitely. */
async function readPreference(storage: SongloftStorage): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([storage.prefs.get(PREF_AUTOMATIC_UPDATE),
    new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 5000) })])
  } catch { return null }
  finally { clearTimeout(timer) }
}

/** Device-local policy; the native updater remains the authority for prepared files. */
export class AutomaticUpdatePolicy {
  readonly store = createStore<AutomaticUpdateState>(() => initialState())
  private revision = 0
  private hydration: Promise<void> | null = null
  private writes: Promise<void> = Promise.resolve()

  constructor(private readonly storage: () => SongloftStorage = getSongloftStorage) { }

  hydrate(): Promise<void> {
    if (this.hydration) return this.hydration
    const revision = this.revision
    this.hydration = (async () => {
      const raw = await readPreference(this.storage())
      if (revision !== this.revision) { this.store.setState({ loaded: true }); return }
      let saved = initialState()
      try {
        const value = JSON.parse(raw ?? 'null')
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const timestamp = (input: unknown) => typeof input === 'number' && Number.isSafeInteger(input) && input >= 0 ? input : 0
          const key = (input: unknown): input is string => typeof input === 'string' && /^[A-Za-z0-9._-]{1,96}:[a-f0-9]{64}$/.test(input)
          saved = {
            ...saved, enabled: value.enabled === true,
            lastAttempt: timestamp(value.lastAttempt), nextAttempt: timestamp(value.nextAttempt),
            failures: Math.min(timestamp(value.failures), RETRY_DELAYS.length),
            skippedBundles: Array.isArray(value.skippedBundles) ? value.skippedBundles.filter(key).slice(-16) : [],
            preparedBundle: key(value.preparedBundle) ? value.preparedBundle : null
          }
        }
      } catch { /* Missing/corrupt preferences default to disabled. */ }
      this.store.setState({ ...saved, loaded: true })
    })()
    return this.hydration
  }

  update(patch: Partial<Omit<AutomaticUpdateState, 'loaded'>>): Promise<void> {
    this.revision++
    this.store.setState(patch)
    const { loaded: _loaded, ...saved } = this.store.getState()
    const storage = this.storage()
    // Freeze each snapshot and serialize writes, so OFF cannot be overwritten by an older ON.
    const raw = JSON.stringify(saved)
    this.writes = this.writes.then(() => storage.prefs.set(PREF_AUTOMATIC_UPDATE, raw)).catch(() => { })
    return this.writes
  }

  setEnabled(enabled: boolean): Promise<void> {
    return this.update({ enabled })
  }

  skip(bundle: string | null): Promise<void> {
    if (!bundle) return Promise.resolve()
    const state = this.store.getState()
    return this.update({ skippedBundles: [...state.skippedBundles.filter(value => value !== bundle), bundle].slice(-16) })
  }

  recordAttempt(now: number): Promise<void> {
    return this.update({ lastAttempt: now, nextAttempt: now + AUTOMATIC_UPDATE_INTERVAL })
  }

  recordResult(now: number, failed: boolean): Promise<void> {
    const failures = failed ? Math.min(this.store.getState().failures + 1, RETRY_DELAYS.length) : 0
    return this.update({ failures, nextAttempt: now + (failures ? RETRY_DELAYS[failures - 1]! : AUTOMATIC_UPDATE_INTERVAL) })
  }

  /** Read on each launch before downloading, to avoid automatically reinstalling a rolled-back bundle. */
  async reconcile(native: UpdateState): Promise<void> {
    await this.hydrate()
    const prepared = this.store.getState().preparedBundle
    const pending = native.pending ? updateBundleKey(native.pending) : null
    if (pending) { if (pending !== prepared) await this.update({ preparedBundle: pending }); return }
    if (!prepared || native.download || native.running.kind === 'trial') return
    if (updateBundleKey(native.running) === prepared && native.running.kind === 'active') {
      await this.update({ preparedBundle: null }); return
    }
    if (['rollback_unconfirmed', 'startup_failed'].includes(native.last_error ?? '')) {
      await this.skip(prepared)
      await this.update({ preparedBundle: null })
    }
  }
}

export const automaticUpdatePolicy = new AutomaticUpdatePolicy()
