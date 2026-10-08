import { createStore } from 'zustand/vanilla'
import {
  cancelBundleUpdate, createUpdateTaskId, getUpdateState, nativeUpdaterAvailable, prepareBundleUpdate,
  restoreBuiltinBundle, subscribeUpdateProgress, type UpdateProgress, type UpdateState
} from './native-updater.js'
import { checkClientUpdate, type ClientUpdateCheck } from './client-updates.js'
import { releaseAsset } from './release-resolver.js'
import { automaticUpdatePolicy, updateBundleKey } from './automatic-update-policy.js'
import { getSettingsApi } from '../../features/settings/api/index.js'

export interface UpdateSession {
  native: UpdateState | null
  operation: 'download' | 'restore' | null
  progress: UpdateProgress | null
  error: string | null
  restored: boolean
  checking: boolean
  check: ClientUpdateCheck | null
  checkError: string | null
  downloadSource: 'manual' | 'automatic' | null
}
/** Client task state survives About unmount. Release metadata lives in the resolver, not a server-data store. */
export const updateSession = createStore<UpdateSession>(() => ({
  native: null, operation: null, progress: null, error: null,
  restored: false, checking: false, check: null, checkError: null, downloadSource: null
}))
let revision = 0
let checkRevision = 0
let checking: Promise<ClientUpdateCheck | null> | null = null
let transfer: { cancelled: boolean; bundle: string | null } | null = null

/** Manual and automatic checks share the entire request, including native inspection. */
export function checkClientRelease(input: { force?: boolean } = {}): Promise<ClientUpdateCheck | null> {
  if (checking) return checking
  if (updateSession.getState().operation || updateSession.getState().native?.download) return Promise.resolve(null)
  const current = ++checkRevision
  updateSession.setState({ checking: true, checkError: null })
  checking = (async () => {
    let proxy = ''
    try { proxy = await getSettingsApi().getGithubProxy() } catch { /* Public releases work without the backend. */ }
    try {
      const check = await checkClientUpdate({ proxy, force: !!input.force })
      if (current !== checkRevision) return null
      updateSession.setState({ check })
      return check
    } catch (error) {
      if (current === checkRevision) updateSession.setState({ checkError: (error as Error).message })
      throw error
    } finally {
      checking = null
      updateSession.setState({ checking: false })
    }
  })()
  return checking
}

export async function refreshUpdateSession(): Promise<UpdateState | null> {
  if (!nativeUpdaterAvailable()) return null
  const current = ++revision
  try {
    const native = await getUpdateState()
    if (revision === current) updateSession.setState({ native })
    return native
  } catch { return null /* Never fabricate success from a failed native read. */ }
}

export type BundleDownloadResult = 'prepared' | 'failed' | 'busy'

export function downloadClientBundle(check: ClientUpdateCheck): Promise<BundleDownloadResult> {
  return downloadBundle({ check, source: 'manual' })
}
export function downloadAutomaticClientBundle(check: ClientUpdateCheck): Promise<BundleDownloadResult> {
  return downloadBundle({ check, source: 'automatic' })
}

async function downloadBundle(input: { check: ClientUpdateCheck; source: 'manual' | 'automatic' }): Promise<BundleDownloadResult> {
  const { check, source } = input
  const state = updateSession.getState()
  if (!check.bundleURL || !check.candidate.signature || check.comparison !== 'newer' || check.bundleReason !== 'compatible'
    || state.operation || state.checking || state.native?.download || state.native?.pending || state.restored) return 'busy'
  if (source === 'automatic' && !automaticUpdatePolicy.store.getState().enabled) return 'busy'
  const taskId = createUpdateTaskId()
  const size = check.candidate.manifest.bundle_update!.size
  const task = { cancelled: false, bundle: updateBundleKey(check.candidate.manifest) }
  transfer = task
  updateSession.setState({
    operation: 'download', downloadSource: source,
    progress: { task_id: taskId, bytes: 0, total: size }, error: null, restored: false
  })
  let unsubscribe = () => { }
  let prepared = false
  try {
    unsubscribe = subscribeUpdateProgress(taskId, progress => { updateSession.setState({ progress }) })
    await automaticUpdatePolicy.hydrate()
    // Journal before the native call, covering process death after native commit but before its callback.
    await automaticUpdatePolicy.update({ preparedBundle: task.bundle })
    if (task.cancelled) throw new Error('cancelled')
    const request = {
      task_id: taskId, manifest: check.candidate.rawManifest,
      signature: check.candidate.signature, url: check.bundleURL
    }
    try { await prepareBundleUpdate(request) }
    catch (error) {
      if (task.cancelled) throw new Error('cancelled')
      if ((error as Error).message !== 'download_failed') throw error
      const direct = releaseAsset(check.candidate, check.candidate.manifest.bundle_update!.asset)?.browser_download_url
      if (!direct || direct === request.url) throw error
      // Proxy transport failure only: retry the SAME verified asset; cancellation/signature/hash errors do not retry.
      await prepareBundleUpdate({ ...request, url: direct })
    }
    prepared = true
    return 'prepared'
  } catch (error) {
    updateSession.setState({ error: (error as Error).message })
    return 'failed'
  }
  finally {
    unsubscribe()
    const native = await refreshUpdateSession()
    // Timeout may race native durable completion. A real pending record always wins.
    if (!prepared && !native?.pending && !native?.download && native) await automaticUpdatePolicy.update({ preparedBundle: null })
    transfer = null
    updateSession.setState({ operation: null, progress: null, downloadSource: null })
  }
}
export function cancelClientBundle(): void {
  const state = updateSession.getState()
  const task = state.operation === 'download' ? state.progress : state.native?.download
  if (!task) return
  if (transfer) transfer.cancelled = true
  void automaticUpdatePolicy.skip(transfer?.bundle ?? automaticUpdatePolicy.store.getState().preparedBundle)
  try { cancelBundleUpdate(task.task_id) } catch { updateSession.setState({ error: 'update_failed' }) }
}
export function cancelAutomaticClientBundle(): void {
  if (updateSession.getState().downloadSource === 'automatic') cancelClientBundle()
}
export async function restoreClientBuiltin(): Promise<void> {
  if (updateSession.getState().operation) return
  checkRevision++
  updateSession.setState({ operation: 'restore', error: null, check: null, checkError: null })
  try {
    await automaticUpdatePolicy.hydrate()
    await automaticUpdatePolicy.setEnabled(false)
    await restoreBuiltinBundle()
    await automaticUpdatePolicy.update({ preparedBundle: null })
    updateSession.setState({ restored: true })
    await refreshUpdateSession()
  } catch (error) { updateSession.setState({ error: (error as Error).message }) }
  finally { updateSession.setState({ operation: null }) }
}
