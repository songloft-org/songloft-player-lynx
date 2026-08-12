import { useEffect, useRef } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import {
  SheetBackdrop,
  SheetContent,
  SheetHandle,
  SheetRoot,
  SheetView,
  type SheetRootRef,
} from '@lynx-js/lynx-ui-sheet'
import { SortableRoot, SortableItem, SortableItemArea } from '@lynx-js/lynx-ui-sortable'

import { usePlayerStore } from '../store/index.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'

/** Vertical drag-claim ranges for a bottom sheet (per lynx-ui Sheet docs). */
const CLAIMED_ANGLES: [number, number][] = [
  [-135, -45],
  [45, 135],
]

export function PlaylistDrawer() {
  const { t } = useTranslation()
  const show = usePlayerStore((s) => s.showPlaylistDrawer)
  const playlist = usePlayerStore((s) => s.playlist)
  const currentIndex = usePlayerStore((s) => s.currentIndex)

  const ref = useRef<SheetRootRef>(null)

  useEffect(() => {
    if (show) ref.current?.open()
    else ref.current?.close()
  }, [show])

  return (
    <SheetRoot
      ref={ref}
      side='bottom'
      snapPoints={['70%']}
      initialSnap={0}
      claimedGestureAngles={CLAIMED_ANGLES}
      onShowChange={(visible: boolean) => {
        if (!visible) usePlayerStore.getState().closePlaylistDrawer()
      }}
    >
      <SheetView className='drawer__viewport'>
        <SheetBackdrop className='drawer__backdrop' />
        <SheetContent className='drawer__content' innerClassName='drawer__inner'>
          <SheetHandle className='drawer__handle' />
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
              // Find what moved: compare old vs new positions
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
        </SheetContent>
      </SheetView>
    </SheetRoot>
  )
}
