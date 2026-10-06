import { useEffect, useRef, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { Song } from '../../../models/song.js'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { cacheBatchController, captureCacheBatch, collectPlaylistForCache, initializeCacheBatch,
  prepareCacheBatch, type CacheBatchCapture } from '../data/cache-batch-controller.js'
import { currentCacheNamespace } from '../data/cache-context.js'
import { indexedSongCacheAvailable } from '../data/indexed-song-cache.js'

interface PendingBatch { songs: Song[]; captured: CacheBatchCapture }

/** Shared UI submission, including video confirmation; queued parameters never follow later player changes. */
export function useCacheBatchSubmission() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingBatch | null>(null)
  const inFlight = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  const report = (error: unknown) => {
    const code = error instanceof Error ? error.message : ''
    toast.error(t(code === 'cache_playlist_changed' ? 'cacheTasks.playlistChanged' :
      code === 'cache_queue_full' ? 'cacheTasks.tooMany' : code === 'cancelled' ? 'cacheTasks.contextChanged' :
      code === 'cache_update_required' ? 'cacheTasks.updateRequired' : 'player.cacheFailed'))
  }
  const enqueue = async (batch: PendingBatch) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const prepared = await prepareCacheBatch(batch.songs, batch.captured)
      if (currentCacheNamespace() !== batch.captured.namespace) throw new Error('cancelled')
      initializeCacheBatch()
      await cacheBatchController.setNamespace(batch.captured.namespace)
      const added = cacheBatchController.submit(prepared.requests, prepared.failed)
      toast.success(t(added ? 'cacheTasks.queued' : 'cacheTasks.duplicate', { count: added }))
      if (alive.current) void navigate({ to: '/settings/cache-tasks' })
    } catch (error) { report(error) }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  const confirm = async (songs: readonly Song[], captured: CacheBatchCapture) => {
    const allowed = songs.filter(song => song.type !== 'radio' && !song.isLive).map(song => ({ ...song }))
    if (!allowed.length) { toast.error(t('cacheTasks.unsupported')); return }
    if (allowed.length !== songs.length) toast.show(t('cacheTasks.excluded', { count: songs.length - allowed.length }))
    const batch = { songs: allowed, captured }
    if (allowed.some(song => song.isVideo)) setPending(batch)
    else await enqueue(batch)
  }
  const beginSongs = (songs: readonly Song[]) => {
    if (inFlight.current || pending) return
    if (!indexedSongCacheAvailable()) { toast.error(t('cacheTasks.updateRequired')); return }
    try { void confirm(songs, captureCacheBatch()) } catch (error) { report(error) }
  }
  const beginPlaylist = async (id: number) => {
    if (inFlight.current || pending) return
    if (!indexedSongCacheAvailable()) { toast.error(t('cacheTasks.updateRequired')); return }
    inFlight.current = true; setBusy(true)
    try {
      const captured = captureCacheBatch()
      const songs = await collectPlaylistForCache(id, captured)
      if (!alive.current) return
      inFlight.current = false
      await confirm(songs, captured)
    } catch (error) { report(error) }
    finally { inFlight.current = false; if (alive.current) setBusy(false) }
  }
  const confirmation = (
    <ConfirmDialog show={pending !== null} title={t('player.cacheVideoWarnTitle')}
      message={t('player.cacheVideoWarnContent')} confirmLabel={t('common.confirm')}
      onConfirm={() => { const batch = pending; setPending(null); if (batch) void enqueue(batch) }}
      onCancel={() => setPending(null)} />
  )
  return { beginSongs, beginPlaylist, busy: busy || pending !== null, confirmation }
}

export function useCacheBatchState() {
  const [state, setState] = useState(cacheBatchController.getState)
  useEffect(() => {
    const unsubscribe = cacheBatchController.subscribe(() => setState(cacheBatchController.getState()))
    initializeCacheBatch()
    setState(cacheBatchController.getState())
    return unsubscribe
  }, [])
  return state
}
