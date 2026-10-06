import { createStore } from 'zustand/vanilla'
import { cancelBundleUpdate, createUpdateTaskId, getUpdateState, nativeUpdaterAvailable, prepareBundleUpdate,
  restoreBuiltinBundle, subscribeUpdateProgress, type UpdateProgress, type UpdateState } from './native-updater.js'
import type { ClientUpdateCheck } from './client-updates.js'
import { releaseAsset } from './release-resolver.js'

interface UpdateSession {
  native: UpdateState | null
  operation: 'download' | 'restore' | null
  progress: UpdateProgress | null
  error: string | null
  restored: boolean
}
/** Client task state survives About unmount. Release metadata lives in the resolver, not a server-data store. */
export const updateSession = createStore<UpdateSession>(() => ({ native: null, operation: null, progress: null, error: null, restored: false }))
let revision = 0
export async function refreshUpdateSession(): Promise<void> {
  if (!nativeUpdaterAvailable()) return
  const current = ++revision
  try {
    const native = await getUpdateState()
    if (revision === current) updateSession.setState({ native })
  } catch { /* Native startup/IO errors keep the last observed state, never fabricate success. */ }
}
export async function downloadClientBundle(check: ClientUpdateCheck): Promise<void> {
  if (!check.bundleURL || !check.candidate.signature || updateSession.getState().operation) return
  const taskId = createUpdateTaskId()
  const size = check.candidate.manifest.bundle_update!.size
  updateSession.setState({ operation: 'download', progress: { task_id: taskId, bytes: 0, total: size }, error: null, restored: false })
  const unsubscribe = subscribeUpdateProgress(taskId, progress => { updateSession.setState({ progress }) })
  try {
    const request = { task_id: taskId, manifest: check.candidate.rawManifest,
      signature: check.candidate.signature, url: check.bundleURL }
    try { await prepareBundleUpdate(request) }
    catch (error) {
      if ((error as Error).message !== 'download_failed') throw error
      const direct = releaseAsset(check.candidate, check.candidate.manifest.bundle_update!.asset)?.browser_download_url
      if (!direct || direct === request.url) throw error
      // Proxy transport failure only: retry the SAME verified asset; cancellation/signature/hash errors do not retry.
      await prepareBundleUpdate({ ...request, url: direct })
    }
  } catch (error) { updateSession.setState({ error: (error as Error).message }) }
  finally {
    unsubscribe()
    await refreshUpdateSession()
    updateSession.setState({ operation: null, progress: null })
  }
}
export function cancelClientBundle(): void {
  const state = updateSession.getState()
  const task = state.operation === 'download' ? state.progress : state.native?.download
  if (!task) return
  try { cancelBundleUpdate(task.task_id) } catch { updateSession.setState({ error: 'update_failed' }) }
}
export async function restoreClientBuiltin(): Promise<void> {
  if (updateSession.getState().operation) return
  updateSession.setState({ operation: 'restore', error: null })
  try {
    await restoreBuiltinBundle()
    updateSession.setState({ restored: true })
    await refreshUpdateSession()
  } catch (error) { updateSession.setState({ error: (error as Error).message }) }
  finally { updateSession.setState({ operation: null }) }
}
