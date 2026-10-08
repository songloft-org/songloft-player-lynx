import { subscribeAppResumed } from '../../native/app-lifecycle.js'
import { isWebPlatform } from '../../native/web-platform.js'
import {
  AutomaticUpdatePolicy, automaticUpdatePolicy, AUTOMATIC_UPDATE_INTERVAL,
  AUTOMATIC_UPDATE_STARTUP_INTERVAL, updateBundleKey
} from './automatic-update-policy.js'
import { nativeUpdateMetadataAvailable, nativeUpdaterAvailable, type UpdateState } from './native-updater.js'
import type { ClientUpdateCheck } from './client-updates.js'
import {
  cancelAutomaticClientBundle, checkClientRelease, downloadAutomaticClientBundle,
  refreshUpdateSession, updateSession, type BundleDownloadResult, type UpdateSession
} from './update-session.js'

interface AutomaticUpdateDependencies {
  policy: AutomaticUpdatePolicy
  available: () => boolean
  session: () => UpdateSession
  refresh: () => Promise<UpdateState | null>
  check: () => Promise<ClientUpdateCheck | null>
  download: (check: ClientUpdateCheck) => Promise<BundleDownloadResult>
  cancel: () => void
  subscribeResume: (listener: () => void) => () => void
  now?: () => number
}

/** Process-lifetime scheduling: no OS jobs, page dependencies or changes to the running root. */
export class AutomaticUpdateController {
  private started = false
  private busy = false
  private generation = 0
  private queuedEnable = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private wakeAt = 0
  private unsubscribePolicy = () => { }
  private unsubscribeResume = () => { }
  private readonly now: () => number

  constructor(private readonly deps: AutomaticUpdateDependencies) {
    this.now = deps.now ?? Date.now
  }

  start(): void {
    if (this.started || !this.deps.available()) return
    this.started = true
    this.unsubscribePolicy = this.deps.policy.store.subscribe((state, previous) => {
      if (state.enabled === previous.enabled && state.loaded === previous.loaded) return
      this.generation++
      this.clearTimer()
      if (!state.enabled) { this.queuedEnable = false; this.deps.cancel(); return }
      if (state.loaded) void this.request(previous.loaded ? 'enable' : 'startup')
    })
    this.unsubscribeResume = this.deps.subscribeResume(() => { void this.request('scheduled') })
    void this.deps.policy.hydrate().then(() => { void this.request('startup') })
  }

  stop(): void {
    this.started = false
    this.generation++
    this.queuedEnable = false
    this.clearTimer()
    this.unsubscribePolicy()
    this.unsubscribeResume()
    this.deps.cancel()
  }

  private due(trigger: 'startup' | 'scheduled' | 'enable'): number {
    const state = this.deps.policy.store.getState()
    const now = this.now()
    if (trigger === 'enable' || !state.lastAttempt || state.lastAttempt > now
      || state.nextAttempt > now + AUTOMATIC_UPDATE_INTERVAL) return now
    // Clock changes must not suppress checks indefinitely.
    if (trigger === 'startup' && !state.failures)
      return state.lastAttempt + AUTOMATIC_UPDATE_STARTUP_INTERVAL
    return Math.min(state.nextAttempt, now + AUTOMATIC_UPDATE_INTERVAL)
  }

  private clearTimer(): void {
    clearTimeout(this.timer)
    this.timer = undefined
    this.wakeAt = 0
  }

  private schedule(input: { delay?: number; trigger?: 'startup' | 'scheduled' } = {}): void {
    const policy = this.deps.policy.store.getState()
    const session = this.deps.session()
    if (!this.started || !policy.loaded || !policy.enabled || !this.deps.available()
      || session.native?.pending || session.restored) { this.clearTimer(); return }
    const delay = input.delay ?? Math.max(60_000, this.due('scheduled') - this.now())
    const wakeAt = this.now() + delay
    // Resume must not postpone an already-scheduled startup or retry check.
    if (this.timer !== undefined && this.wakeAt <= wakeAt) return
    this.clearTimer()
    this.wakeAt = wakeAt
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.request(input.trigger ?? 'scheduled')
    }, delay)
  }

  private async request(trigger: 'startup' | 'scheduled' | 'enable'): Promise<void> {
    const policy = this.deps.policy.store.getState()
    if (!this.started || !policy.loaded || !policy.enabled || !this.deps.available()) return
    if (this.busy) { if (trigger === 'enable') this.queuedEnable = true; return }
    const due = this.due(trigger)
    if (due > this.now()) { this.schedule({ delay: due - this.now(), trigger: trigger === 'startup' ? 'startup' : 'scheduled' }); return }
    const generation = this.generation
    const valid = () => this.started && this.generation === generation && this.deps.policy.store.getState().enabled
    this.busy = true
    this.clearTimer()
    let deferred = false
    let attempted = false
    try {
      const native = await this.deps.refresh()
      if (!valid()) return
      if (!native) throw new Error('update_state_unavailable')
      await this.deps.policy.reconcile(native)
      if (!valid()) return
      const session = this.deps.session()
      if (native.pending || session.restored) return
      if (native.running.kind === 'trial' || session.checking || session.operation || native.download) {
        deferred = true; return
      }
      await this.deps.policy.recordAttempt(this.now())
      attempted = true
      if (!valid()) return
      const check = await this.deps.check()
      if (!valid()) return
      if (!check) { deferred = true; return }
      const bundle = updateBundleKey(check.candidate.manifest)
      if (check.comparison === 'newer' && check.bundleReason === 'compatible' && check.bundleURL
        && bundle && !this.deps.policy.store.getState().skippedBundles.includes(bundle)) {
        const result = await this.deps.download(check)
        if (!valid()) return
        if (result === 'busy') { deferred = true; return }
        await this.deps.policy.recordResult(this.now(), result === 'failed')
      } else {
        await this.deps.policy.recordResult(this.now(), false)
      }
    } catch {
      if (valid()) {
        if (!attempted) await this.deps.policy.recordAttempt(this.now())
        await this.deps.policy.recordResult(this.now(), true)
      }
    } finally {
      this.busy = false
      if (deferred && attempted && valid()) await this.deps.policy.update({ nextAttempt: this.now() + 60_000 })
      if (this.queuedEnable && this.started) {
        this.queuedEnable = false
        void this.request('enable')
      } else {
        this.schedule({ delay: deferred ? 60_000 : undefined })
      }
    }
  }
}

const automaticUpdater = new AutomaticUpdateController({
  policy: automaticUpdatePolicy,
  available: () => !isWebPlatform() && nativeUpdaterAvailable() && nativeUpdateMetadataAvailable(),
  session: updateSession.getState,
  refresh: refreshUpdateSession,
  check: () => checkClientRelease(),
  download: downloadAutomaticClientBundle,
  cancel: cancelAutomaticClientBundle,
  subscribeResume: subscribeAppResumed,
})

export function startAutomaticUpdates(): void {
  'background only'
  automaticUpdater.start()
}
