import { useEffect, useRef, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'
import { formatBytes } from '../../home/domain/stats-format.js'
import { VirtualList } from '../../library/widgets/VirtualList.js'
import { SubPageShell } from '../../settings/widgets/SubPageShell.js'
import { useAuthStore } from '../../auth/store/auth-store.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { subscribeAppResumed } from '../../../native/app-lifecycle.js'
import { clearIndexedNamespace, clearLegacySongs, indexedSongCacheAvailable, listIndexedSongs, removeIndexedSong, type CachedEntry } from '../data/indexed-song-cache.js'
import { currentOfflineOwner } from '../data/offline-identity.js'
import { cachedEntryQueue, cachedSongIdentity } from '../domain/offline-cache.js'
import { forgetCachedPlayback, usePlayerStore } from '../store/player-store.js'
import { useDlnaStore } from '../store/dlna-store.js'
import { cacheBatchController } from '../data/cache-batch-controller.js'
import { useOfflineOwner } from '../widgets/use-offline-owner.js'
import { useCacheDirectory } from '../widgets/use-cache-directory.js'
import './DeviceCachePage.css'

type Removal = { namespace: string; entry?: CachedEntry; legacy?: boolean }
export function DeviceCachePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const owner = useOfflineOwner()
  const status = useAuthStore(s => s.status)
  const current = usePlayerStore(s => s.currentSong)
  const playing = usePlayerStore(s => s.isPlaying)
  const namespace = owner?.namespace ?? null
  const supported = indexedSongCacheAvailable()
  const [data, setData] = useState<{ namespace: string; entries: CachedEntry[]; bytes: number; legacy: number } | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [removal, setRemoval] = useState<Removal | null>(null)
  const epoch = useRef(0)
  const valid = () => currentOfflineOwner()?.namespace === namespace
  const load = async () => {
    'background only'
    const generation = ++epoch.current
    if (!namespace || !supported) { setData(null); return }
    setLoading(true); setError(false)
    try {
      const entries: CachedEntry[] = []
      let total = -1, bytes = 0, legacy = 0
      while (true) {
        const page = await listIndexedSongs({ namespace, offset: entries.length, limit: 200 })
        if (generation !== epoch.current || !valid()) return
        if (page.total > 10000 || total >= 0 && total !== page.total || !page.entries.length && entries.length < page.total) throw new Error('cache_index_changed')
        total = page.total; bytes = page.bytes; legacy = page.legacy_bytes
        entries.push(...page.entries)
        if (entries.length >= total) break
      }
      setData({ namespace, entries, bytes, legacy })
    } catch { if (generation === epoch.current && valid()) setError(true) }
    finally { if (generation === epoch.current) setLoading(false) }
  }
  useEffect(() => {
    setSearch(''); setRemoval(null); setData(null); void load()
    const stop = subscribeAppResumed(() => { void load() })
    return () => { ++epoch.current; stop() }
  }, [namespace, supported])
  const entries = data?.namespace === namespace ? data.entries : []
  const storage = useCacheDirectory({ namespace, busy, hasEntries: entries.length > 0, onChanged: load })
  const needle = search.trim().toLocaleLowerCase()
  const filtered = entries.filter(entry => [entry.snapshot.title, entry.snapshot.artist, entry.snapshot.album].join(' ').toLocaleLowerCase().includes(needle))
  const localCurrent = current && cachedSongIdentity(current)?.namespace === namespace ? current : null
  const play = async (entry: CachedEntry) => {
    if (busy || storage.busy || !valid()) return
    if (entry.available === false) { toast.error(t('deviceCache.fileUnavailable')); return }
    if (useDlnaStore.getState().activeDevice) { toast.error(t('deviceCache.castUnavailable')); return }
    setBusy(true)
    try {
      const queue = cachedEntryQueue(filtered, entry)
      await usePlayerStore.getState().playPlaylist(queue.playlist, queue.index)
      if (valid()) void navigate({ to: '/player' })
    } catch { toast.error(t('deviceCache.fileUnavailable')); void load() }
    finally { setBusy(false) }
  }
  const remove = async () => {
    const request = removal
    setRemoval(null)
    if (!request || busy || storage.busy || request.namespace !== currentOfflineOwner()?.namespace) return
    setBusy(true)
    try {
      if (request.legacy) await clearLegacySongs()
      else {
        const identity = request.entry ?? { namespace: request.namespace }
        await forgetCachedPlayback(identity)
        if (request.entry) await removeIndexedSong(identity)
        else {
          if (cacheBatchController.getState().namespace === request.namespace) cacheBatchController.cancelRemaining()
          await clearIndexedNamespace(request.namespace)
        }
      }
      if (valid()) await load()
    } catch { toast.error(t('player.cacheFailed')); if (valid()) await load() }
    finally { setBusy(false) }
  }
  const header = owner ? <view className='device-cache__summary'>
    {storage.controls}
    <text className='device-cache__note'>{status === 'authenticated' ? t('deviceCache.scope', { username: owner.username }) : t('deviceCache.offlineHint')}</text>
    <text className='device-cache__note' data-testid='device-cache-summary'>
      {t('deviceCache.summary', { count: entries.length, bytes: formatBytes(entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)) })}
    </text>
    {data?.namespace === namespace && <text className='device-cache__note'>{t('deviceCache.totalBytes', { bytes: formatBytes(data.bytes), legacy: formatBytes(data.legacy) })}</text>}
    <Input className='device-cache__search' value={search} maxLength={256} placeholder={t('deviceCache.search')} onInput={setSearch} />
    <view className='device-cache__actions'>
      <view className='device-cache__button' bindtap={() => { if (!busy) void load() }} data-testid='device-cache-refresh'><text>{t('common.refresh')}</text></view>
      {entries.length > 0 && <view className='device-cache__button' bindtap={() => { if (!busy && !storage.busy && namespace) setRemoval({ namespace }) }} data-testid='device-cache-clear'><text>{t('deviceCache.clear')}</text></view>}
      {(data?.legacy ?? 0) > 0 && <view className='device-cache__button' bindtap={() => { if (!busy && !storage.busy && namespace) setRemoval({ namespace, legacy: true }) }} data-testid='device-cache-clear-legacy'><text>{t('deviceCache.clearLegacy')}</text></view>}
    </view>
    {error ? <text className='device-cache__note'>{t('deviceCache.loadFailed')}</text> : loading && !data ? <text className='device-cache__note'>{t('common.loading')}</text> : null}
    {!loading && !error && filtered.length === 0 ? <text className='device-cache__note'>{t('deviceCache.empty')}</text> : null}
  </view> : null
  const footer = <view className='device-cache__inset' />
  const overlay = <><ConfirmDialog show={removal !== null} title={t('deviceCache.deleteTitle')}
    message={removal?.legacy ? t('deviceCache.clearLegacyConfirm') : removal?.entry ? t('deviceCache.deleteConfirm', { title: removal.entry.snapshot.title }) : t('deviceCache.clearConfirm')}
    confirmLabel={t('common.delete')} onConfirm={() => { void remove() }} onCancel={() => setRemoval(null)} confirmTestId='device-cache-confirm-delete' />{storage.overlay}</>
  return (
    <view className='device-cache-page'>
      <SubPageShell title={t('deviceCache.title')} onBack={() => { void navigate({ to: status === 'authenticated' ? '/settings' : '/login' }) }}
        scrollable={false} contentClassName='device-cache' overlay={overlay}>
        {!supported ? <text className='device-cache__message'>{t('cacheTasks.updateRequired')}</text> : !owner ? (
          <text className='device-cache__message'>{t('deviceCache.noIdentity')}</text>
        ) : (
          <>
            <VirtualList items={filtered} itemKey={entry => entry.key} className='device-cache__list' header={header} footer={footer} renderItem={entry => {
              const variant = JSON.parse(entry.key) as string[]
              return (
                <view className='device-cache__item'>
                  <text className='device-cache__title' text-maxline='2'>{entry.snapshot.title}</text>
                  {(entry.snapshot.artist || entry.snapshot.album) && <text className='device-cache__note' text-maxline='2'>{[entry.snapshot.artist, entry.snapshot.album].filter(Boolean).join(' · ')}</text>}
                  <text className='device-cache__note'>{`${variant[6].toUpperCase()} · ${formatBytes(entry.sizeBytes)} · ${variant[3] === 'original' ? t('deviceCache.original') : t('deviceCache.quality', { value: variant[3] })}${variant[2] === 'default' ? '' : ` · ${t('deviceCache.track', { index: variant[2] })}`}${variant[4] === '1' ? ` · ${t('deviceCache.normalized')}` : ''}`}</text>
                  {entry.available === false && <text className='device-cache__note'>{t('deviceCache.fileUnavailable')}</text>}
                  <view className='device-cache__actions'>
                    <view className='device-cache__button' bindtap={() => { void play(entry) }} data-testid={`device-cache-play-${entry.snapshot.id}`}><text>{t('common.play')}</text></view>
                    <view className='device-cache__button' bindtap={() => { if (!busy && !storage.busy) setRemoval({ namespace: entry.namespace, entry }) }} data-testid={`device-cache-delete-${entry.snapshot.id}`}><text>{t('common.delete')}</text></view>
                  </view>
                </view>
              )
            }} />
            {localCurrent && <view className='device-cache__now-playing'>
              <text className='device-cache__note' text-maxline='1'>{localCurrent.title}</text>
              <view className='device-cache__actions'>
                <view className='device-cache__button' bindtap={() => { void usePlayerStore.getState().togglePlay().catch(() => toast.error(t('deviceCache.fileUnavailable'))) }} data-testid='device-cache-toggle'><text>{playing ? t('common.pause') : t('common.play')}</text></view>
                <view className='device-cache__button' bindtap={() => { void navigate({ to: '/player' }) }} data-testid='device-cache-open-player'><text>{t('deviceCache.openPlayer')}</text></view>
              </view>
            </view>}
          </>
        )}
      </SubPageShell>
    </view>
  )
}
