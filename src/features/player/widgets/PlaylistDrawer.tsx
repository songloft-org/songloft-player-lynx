import { useEffect, useRef } from '@lynx-js/react'

import {
  SheetBackdrop,
  SheetContent,
  SheetHandle,
  SheetRoot,
  SheetView,
  type SheetRootRef,
} from '@lynx-js/lynx-ui-sheet'

import { usePlayerStore } from '../store/index.js'

/** Vertical drag-claim ranges for a bottom sheet (per lynx-ui Sheet docs). */
const CLAIMED_ANGLES: [number, number][] = [
  [-135, -45],
  [45, 135],
]

/**
 * Playback-queue drawer, a lynx-ui bottom `Sheet` imperatively opened/closed to
 * follow the store's `showPlaylistDrawer` flag. Lists the current queue (current
 * track highlighted); tapping a row plays it, the ✕ removes it. Dismissing the
 * sheet (backdrop / drag) routes back through `closePlaylistDrawer`.
 */
export function PlaylistDrawer() {
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
            <text className='drawer__title'>Up next</text>
            <text className='drawer__count'>{`${playlist.length} songs`}</text>
          </view>
          <scroll-view className='drawer__list' scroll-y>
            {playlist.map((song, index) => (
              <view
                key={`${song.id}:${index}`}
                className={index === currentIndex
                  ? 'drawer__row drawer__row--active'
                  : 'drawer__row'}
                bindtap={() => {
                  void usePlayerStore.getState().playPlaylist(playlist, index)
                  usePlayerStore.getState().closePlaylistDrawer()
                }}
              >
                <view className='drawer__row-meta'>
                  <text className='drawer__row-title'>{song.title}</text>
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
            ))}
          </scroll-view>
        </SheetContent>
      </SheetView>
    </SheetRoot>
  )
}
