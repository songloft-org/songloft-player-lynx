import { useTranslation } from 'react-i18next'

import { VirtualList } from '../../library/widgets/VirtualList.js'
import { usePlayerStore } from '../store/index.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { ModalMaterial } from '../../../shared/ui/ModalMaterial.js'
import { ModalScrim } from '../../../shared/ui/ModalScrim.js'
import { ScrollingText } from '../../../shared/ui/ScrollingText.js'
import { usePresence } from '../../../shared/ui/usePresence.js'
import '../../../shared/ui/overlay-motion.css'
import './SheetShell.css'

export function PlaylistDrawer() {
  const { t } = useTranslation()
  const show = usePlayerStore((s) => s.showPlaylistDrawer)
  const playlist = usePlayerStore((s) => s.playlist)
  const currentIndex = usePlayerStore((s) => s.currentIndex)

  useBackHandler(show, () => {
    usePlayerStore.getState().closePlaylistDrawer()
    return true
  })

  const close = () => usePlayerStore.getState().closePlaylistDrawer()

  const { mounted, leaving } = usePresence(show)
  if (!mounted) return null

  const leaveClass = leaving ? ' overlay--leave-fade' : ''
  const panelMotion = leaving ? 'overlay--leave-up' : 'overlay--enter-up'

  return (
    <view className='drawer__root' data-testid='playlist-drawer'>
      {/* Light page dim; the content panel owns its local material. */}

      <ModalScrim className={`drawer__backdrop${leaveClass}`} bindtap={close} />
      <view className={`drawer__panel drawer__panel--queue ${panelMotion}`} flatten={false} catchtap={() => {}}>
        <ModalMaterial shape='sheet' captureTarget='songloft-player-content' />
        <view className='drawer__handle-wrap'>
          <view className='drawer__handle' />
        </view>
        <view className='drawer__header'>
          <text className='drawer__title'>{t('player.upNext')}</text>
          <text className='drawer__count'>
            {t(
              playlist.length === 1 ? 'common.songCountOne' : 'common.songCountOther',
              { count: playlist.length },
            )}
          </text>
        </view>
        {/* The queue renders in the native `<list>` (VirtualList), i.e.
            virtualized. The previous SortableRoot/ScrollView mounted every row
            eagerly — each a main-thread DraggableRoot with a layoutchange
            listener and a drag overlay — which froze the app on 500+ song
            queues (songloft-org/songloft-player-lynx#4). Trade-off: drag to
            reorder is gone; rows still tap to play and ✕ to remove. */}
        <VirtualList
          className='drawer__list drawer__list--queue'
          items={playlist}
          itemKey={(song, index) => `${song.id}:${index}`}
          renderItem={(song, index) => (
            <view
              className={index === currentIndex
                ? 'drawer__row drawer__row--active'
                : 'drawer__row'}
            >
              <view
                className='drawer__row-meta'
                bindtap={() => {
                  void usePlayerStore.getState().playQueueIndex(index)
                  usePlayerStore.getState().closePlaylistDrawer()
                }}
              >
                <ScrollingText textClassName='drawer__row-title' text={song.title} />
                {song.artist
                  ? <text className='drawer__row-artist'>{song.artist}</text>
                  : null}
              </view>
              <view
                className='drawer__row-remove'
                catchtap={() => usePlayerStore.getState().removeFromPlaylist(index)}
              >
                <text className='drawer__row-remove-glyph'>✕</text>
              </view>
            </view>
          )}
        />
      </view>
    </view>
  )
}
