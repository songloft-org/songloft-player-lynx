import { useTranslation } from 'react-i18next'

import { SortableRoot, SortableItem, SortableItemArea } from '@lynx-js/lynx-ui-sortable'

import { usePlayerStore } from '../store/index.js'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { BackdropBlur } from '../../../shared/ui/BackdropBlur.js'
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

  if (!show) return null

  const close = () => usePlayerStore.getState().closePlaylistDrawer()

  return (
    <view className='drawer__root' data-testid='playlist-drawer'>
      {/* Real backdrop blur, behind the dim so the page is blurred and then
          darkened. A preceding sibling, not a child: the scrim below owns
          tap-to-dismiss and a child would sit in front of it. */}
      <BackdropBlur />
      <view className='drawer__backdrop' bindtap={close} />
      <view className='drawer__panel drawer__panel--queue' catchtap={() => {}}>
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
        <SortableRoot
          as='ScrollView'
          scrollableClassName='drawer__list'
          data={playlist.map((song, index) => ({
            getSortingKey: () => `${song.id}:${index}`,
            dataItem: { song, index },
          }))}
          onSortEnd={(sorted) => {
            const oldIndices = playlist.map((_, i) => i)
            const newOrder = sorted.map((d) => d.dataItem.index)
            for (let i = 0; i < newOrder.length; i++) {
              if (newOrder[i] !== oldIndices[i]) {
                usePlayerStore.getState().reorderPlaylist(newOrder[i], i)
                break
              }
            }
          }}
        >
          {(item) => (
            <SortableItem
              sortingKey={`${item.dataItem.song.id}:${item.dataItem.index}`}
              as='DraggableRoot'
              className={item.dataItem.index === currentIndex
                ? 'drawer__row drawer__row--active'
                : 'drawer__row'}
            >
              <SortableItemArea>
                <view className='drawer__row-handle' data-testid={`drawer-drag-${item.dataItem.song.id}`}>
                  <Icon name='menu' size={16} color={ICON_COLORS.content2} />
                </view>
              </SortableItemArea>
              <view
                className='drawer__row-meta'
                bindtap={() => {
                  void usePlayerStore.getState().playPlaylist(playlist, item.dataItem.index)
                  usePlayerStore.getState().closePlaylistDrawer()
                }}
              >
                <text className='drawer__row-title'>{item.dataItem.song.title}</text>
                {item.dataItem.song.artist
                  ? <text className='drawer__row-artist'>{item.dataItem.song.artist}</text>
                  : null}
              </view>
              <view
                className='drawer__row-remove'
                catchtap={() => usePlayerStore.getState().removeFromPlaylist(item.dataItem.index)}
              >
                <text className='drawer__row-remove-glyph'>✕</text>
              </view>
            </SortableItem>
          )}
        </SortableRoot>
      </view>
    </view>
  )
}
