import { useTranslation } from 'react-i18next'
import { formatBytes } from '../../home/domain/stats-format.js'
import { VirtualList } from '../../library/widgets/VirtualList.js'
import { SubPageShell } from '../../settings/widgets/SubPageShell.js'
import { indexedSongCacheAvailable } from '../data/indexed-song-cache.js'
import { cacheBatchController } from '../data/cache-batch-controller.js'
import { useCacheBatchState } from '../widgets/use-cache-batch.js'
import './CacheTasksPage.css'

export function CacheTasksPage() {
  const { t } = useTranslation()
  const state = useCacheBatchState()
  const supported = indexedSongCacheAvailable()
  const completed = state.items.filter(item => item.status === 'completed').length
  const waiting = state.items.some(item => item.status === 'waiting' || item.status === 'downloading')
  const retryable = state.items.some(item => item.status === 'failed' || item.status === 'interrupted' || item.error === 'batch_capacity_stop')
  const labels = { waiting: t('cacheTasks.waiting'), downloading: t('cacheTasks.downloading'), completed: t('cacheTasks.completed'),
    failed: t('cacheTasks.failed'), cancelled: t('cacheTasks.cancelled'), interrupted: t('cacheTasks.interrupted') }
  const errors: Record<string, string> = {
    limit_exceeded: t('player.cacheLimitExceeded'), insufficient_space: t('cacheTasks.insufficientSpace'),
    unsupported_media: t('cacheTasks.unsupported'), cache_update_required: t('cacheTasks.updateRequired'),
    batch_capacity_stop: t('cacheTasks.capacityStopped'), track_metadata_unavailable: t('cacheTasks.trackUnavailable'),
  }
  const footer = <view className='cache-tasks__nav-inset' />
  return (
    <SubPageShell title={t('cacheTasks.title')} scrollable={false} contentClassName='cache-tasks'>
      {!supported ? <text className='cache-tasks__message'>{t('cacheTasks.updateRequired')}</text> : (
        <>
          <view className='cache-tasks__summary'>
            <text className='cache-tasks__count' data-testid='cache-tasks-summary'>
              {t('cacheTasks.summary', { completed, total: state.items.length })}
            </text>
            <text className='cache-tasks__hint'>{t('cacheTasks.backgroundHint')}</text>
            {state.blocked && <text className='cache-tasks__error'>{t('cacheTasks.capacityStopped')}</text>}
            <view className='cache-tasks__actions'>
              {(waiting || state.running) && <view className='cache-tasks__button' bindtap={() => cacheBatchController.cancelRemaining()} data-testid='cache-tasks-cancel-all'>
                <text>{t('cacheTasks.cancelRemaining')}</text>
              </view>}
              {retryable && <view className={state.running ? 'cache-tasks__button cache-tasks__button--disabled' : 'cache-tasks__button'}
                bindtap={() => { if (!state.running) void cacheBatchController.retryFailed() }} data-testid='cache-tasks-retry'>
                <text>{t('cacheTasks.retryFailed')}</text>
              </view>}
            </view>
          </view>
          {state.items.length === 0 ? <text className='cache-tasks__message'>{t('cacheTasks.empty')}</text> : (
            <VirtualList items={state.items} itemKey={item => item.taskId} className='cache-tasks__list'
              footer={footer} renderItem={item => (
                <view className='cache-tasks__item' data-testid={`cache-task-${item.snapshot.id}`}>
                  <text className='cache-tasks__title' text-maxline='2'>{item.snapshot.title}</text>
                  <text className='cache-tasks__status'>
                    {item.cancelling ? t('cacheTasks.cancelling') : item.skipped ? t('cacheTasks.skipped') : labels[item.status]}
                  </text>
                  {item.status === 'downloading' && <text className='cache-tasks__status'>
                    {item.total ? `${formatBytes(item.bytes)} / ${formatBytes(item.total)}` : t('cacheTasks.unknownProgress', { bytes: formatBytes(item.bytes) })}
                  </text>}
                  {item.error && item.status !== 'cancelled' && <text className='cache-tasks__error'>
                    {errors[item.error] ?? (item.status === 'interrupted' ? t('cacheTasks.interrupted') : t('player.cacheFailed'))}
                  </text>}
                  {(item.status === 'waiting' || item.status === 'downloading') && !item.cancelling && (
                    <view className='cache-tasks__button' bindtap={() => cacheBatchController.cancel(item.taskId)} data-testid={`cache-task-cancel-${item.snapshot.id}`}>
                      <text>{t('common.cancel')}</text>
                    </view>
                  )}
                </view>
              )} />
          )}
        </>
      )}
    </SubPageShell>
  )
}
