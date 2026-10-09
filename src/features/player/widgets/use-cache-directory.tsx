import { useEffect, useRef, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { subscribeAppResumed } from '../../../native/app-lifecycle.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { cacheDirectorySupported, cancelCacheMigration, chooseCacheDirectory, migrateCacheDirectory,
  readCacheDirectory, restoreCacheDirectory, subscribeCacheMigration, type CacheDirectory, type MigrationProgress } from '../data/cache-directory.js'
import { createCacheTaskId } from '../data/indexed-song-cache.js'
import { currentOfflineOwner } from '../data/offline-identity.js'
import { forgetCachedPlayback, playbackSourceKindOf, usePlayerStore } from '../store/player-store.js'

/** Controls live in the scrolling header; confirmation stays outside the virtual list. */
export function useCacheDirectory(input: { namespace: string | null; busy: boolean; hasEntries: boolean; onChanged: () => Promise<void> }) {
  const { t } = useTranslation()
  const [android, setAndroid] = useState(false)
  const [supported, setSupported] = useState(false)
  const [ready, setReady] = useState(false)
  const [directory, setDirectory] = useState<CacheDirectory | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState(false)
  const [progress, setProgress] = useState<MigrationProgress | null>(null)
  const current = useRef(input)
  current.current = input
  const generation = useRef(0)
  const refreshGeneration = useRef(0)
  const working = useRef(false)
  const migration = useRef<string | null>(null)
  const stopProgress = useRef<(() => void) | null>(null)
  const refresh = async (epoch: number) => {
    'background only'
    const request = ++refreshGeneration.current
    const value = await readCacheDirectory()
    if (generation.current === epoch && request === refreshGeneration.current) setDirectory(value)
  }
  useEffect(() => {
    const epoch = ++generation.current
    working.current = false; setBusy(false); setConfirmation(false); setProgress(null); setDirectory(null); setReady(false); setSupported(false)
    const isAndroid = getPlatformTarget() === 'android'
    setAndroid(isAndroid)
    const initialize = async () => {
      'background only'
      try {
        const available = isAndroid && await cacheDirectorySupported()
        if (generation.current !== epoch) return
        setSupported(available)
        if (available) await refresh(epoch)
      } catch { if (generation.current === epoch) toast.error(t('cacheDirectory.unavailable')) }
      finally { if (generation.current === epoch) setReady(true) }
    }
    void initialize()
    const stop = subscribeAppResumed(() => { 'background only'; if (isAndroid) void initialize() })
    return () => {
      ++generation.current; stop(); stopProgress.current?.(); stopProgress.current = null
      if (migration.current) cancelCacheMigration(migration.current)
      migration.current = null
    }
  }, [input.namespace])
  const perform = async (action: () => Promise<boolean>, migrating = false) => {
    'background only'
    if (working.current || !ready || !supported) return
    if (current.current.busy) { toast.error(t('cacheDirectory.busy')); return }
    const epoch = generation.current
    working.current = true; setBusy(true)
    try {
      if (await action() && epoch === generation.current) toast.success(t(migrating ? 'cacheDirectory.migrated' : 'cacheDirectory.saved'))
    } catch (error) {
      if (epoch === generation.current) {
        const reason = error instanceof Error ? error.message : ''
        toast.error(t(reason === 'cache_busy' ? 'cacheDirectory.busy' : reason === 'cancelled' ? 'cacheDirectory.cancelled'
          : migrating ? 'cacheDirectory.failed' : 'cacheDirectory.unavailable'))
      }
    } finally {
      if (epoch === generation.current) {
        stopProgress.current?.(); stopProgress.current = null; migration.current = null
        working.current = false; setBusy(false); setProgress(null)
        try { await refresh(epoch); if (epoch === generation.current) await current.current.onChanged() }
        catch { if (epoch === generation.current) toast.error(t('cacheDirectory.unavailable')) }
      }
    }
  }
  const migrate = () => {
    'background only'
    setConfirmation(false)
    const namespace = input.namespace
    if (!namespace || namespace !== currentOfflineOwner()?.namespace) return
    void perform(async () => {
      'background only'
      const taskId = createCacheTaskId()
      migration.current = taskId
      const epoch = generation.current
      setProgress({ task_id: taskId, namespace, done: 0, total: 0 })
      stopProgress.current = subscribeCacheMigration(taskId, value => {
        'background only'
        if (generation.current === epoch && value.namespace === namespace) setProgress(value)
      })
      await forgetCachedPlayback({ namespace })
      if (generation.current !== epoch || currentOfflineOwner()?.namespace !== namespace) { cancelCacheMigration(taskId); return false }
      const player = usePlayerStore.getState()
      if (player.currentSong && playbackSourceKindOf(player.currentSong.id) === 'cache') player.reset()
      await migrateCacheDirectory({ task_id: taskId, namespace })
      return true
    }, true)
  }
  const blocked = busy || input.busy || !ready || !supported
  const controls = !android || !input.namespace ? null : <view data-testid='cache-directory'>
    <text className='device-cache__title'>{t('cacheDirectory.title')}</text>
    <text className='device-cache__note'>{directory?.label ?? t('cacheDirectory.default')}</text>
    <text className='device-cache__note'>{t('cacheDirectory.help')}</text>
    {!ready && <text className='device-cache__note'>{t('common.loading')}</text>}
    {ready && !supported && <text className='device-cache__note'>{t('cacheDirectory.upgrade')}</text>}
    {directory?.available === false && <text className='device-cache__note'>{t('cacheDirectory.unavailable')}</text>}
    {supported && <view className='device-cache__actions'>
      <view className='device-cache__button' bindtap={() => { if (!blocked) void perform(chooseCacheDirectory) }} data-testid='cache-directory-choose'><text>{t('cacheDirectory.choose')}</text></view>
      {directory?.tree && <view className='device-cache__button' bindtap={() => { if (!blocked) void perform(async () => { await restoreCacheDirectory(); return true }) }} data-testid='cache-directory-default'><text>{t('cacheDirectory.restore')}</text></view>}
      {input.hasEntries && <view className='device-cache__button' bindtap={() => { if (!blocked) setConfirmation(true) }} data-testid='cache-directory-migrate'><text>{t('cacheDirectory.migrate')}</text></view>}
    </view>}
    {progress && <view>
      <text className='device-cache__note'>{t('cacheDirectory.progress', { done: progress.done, total: progress.total })}</text>
      <view className='device-cache__button' bindtap={() => { if (migration.current) cancelCacheMigration(migration.current) }} data-testid='cache-directory-cancel'><text>{t('common.cancel')}</text></view>
    </view>}
  </view>
  const overlay = <ConfirmDialog show={confirmation} title={t('cacheDirectory.migrate')} message={t('cacheDirectory.confirm')}
    confirmLabel={t('cacheDirectory.migrate')} onConfirm={migrate} onCancel={() => setConfirmation(false)} confirmTestId='cache-directory-confirm' />
  return { controls, overlay, busy }
}
