import { useEffect, useRef, useState } from '@lynx-js/react'
import type { Song } from '../../../models/song.js'
import type { ScrollEvent } from '@lynx-js/types'
import { VirtualList, type VirtualListProps } from '../../library/widgets/VirtualList.js'
import { VerticalSlider } from '../../../shared/ui/VerticalSlider.js'
import { songTitleInitial } from '../domain/song-title-initial.js'
import { firstVisibleRowByBounds, firstVisibleSongIndex, normalizeVisibleCells, playlistIndexFromRatio, type RowBounds } from '../domain/playlist-scroll.js'
import { isWebPlatform } from '../../../native/web-platform.js'
import { useBreakpoint } from '../../../shared/responsive/useBreakpoint.js'
import './PlaylistSongList.css'

interface Props<T> extends VirtualListProps<T> {
  locateSongId?: number
  total: number
  loadingMore: boolean
  hasMore: boolean
  loadFailed: boolean
  enabled: boolean
}

let listCounter = 0
export function PlaylistSongList<T extends Song>({ total, loadingMore, hasMore,
  loadFailed, enabled, locateSongId, ...listProps }: Props<T>) {
  const songs = listProps.items
  const [listId] = useState(() => `playlist-song-list-${++listCounter}`)
  const { height, onLayoutChange } = useBreakpoint(0, '.playlist-song-list')
  const { height: navInset, onLayoutChange: onInsetLayout } = useBreakpoint(0, '.playlist-song-list__nav-inset')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [requestedIndex, setRequestedIndex] = useState<number | null>(null)
  useEffect(() => {
    if (locateSongId == null) return
    const index = songs.findIndex(song => song.id === locateSongId)
    if (index >= 0) { latestRequest.current++; setRequestedIndex(index) }
    else if (hasMore && !loadingMore && !loadFailed) listProps.onEndReached?.()
  }, [locateSongId, songs, hasMore, loadingMore, loadFailed])
  const [showLabel, setShowLabel] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const alive = useRef(true)
  const scrollRevision = useRef(0)
  const readSerial = useRef(0)
  const appliedRead = useRef(0)
  const webReading = useRef(false)
  const webReadAgain = useRef(false)
  const latestRead = useRef<() => void>(() => {})
  const latestRequest = useRef(0)
  const isWeb = useRef(isWebPlatform())
  const loadCursor = useRef(-1)
  const dragging = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      latestRequest.current++
      clearTimeout(hideTimer.current)
    }
  }, [])

  const showHint = () => {
    setShowLabel(true)
    clearTimeout(hideTimer.current)
    if (!dragging.current) hideTimer.current = setTimeout(() => { if (alive.current) setShowLabel(false) }, 1500)
  }

  const scrollTo = (index: number, request: number) => {
    if (!alive.current || latestRequest.current !== request || typeof lynx === 'undefined' || !songs[index]) return
    lynx.createSelectorQuery().select(`#${listId}`).invoke({
      method: 'scrollToPosition',
      params: { position: index + (listProps.header ? 1 : 0), itemKey: String(songs[index]!.id), alignTo: 'top', smooth: false },
      success: () => {
        if (!alive.current || latestRequest.current !== request) return
        showHint()
      },
    }).exec()
    // Invoking the method does not prove that newly appended rows have been
    // laid out. Keep the destination until visible rows confirm it on any host.
  }

  useEffect(() => {
    if (requestedIndex === null) return
    if (requestedIndex < songs.length) scrollTo(requestedIndex, latestRequest.current)
    else if (!loadingMore && hasMore && !loadFailed) {
      if (loadCursor.current === songs.length) { setRequestedIndex(null); return }
      loadCursor.current = songs.length
      listProps.onEndReached?.()
    }
    else if (!loadingMore && (!hasMore || loadFailed)) setRequestedIndex(null)
  }, [requestedIndex, songs, loadingMore, hasMore, loadFailed])

  useEffect(() => {
    if (requestedIndex === null || requestedIndex >= songs.length) return
    // Both native and Web can receive data before committing the new list-items.
    // Retry until visible rows confirm the destination, with a finite fallback.
    let attempts = 0
    const request = latestRequest.current
    const timer = setInterval(() => {
      if (++attempts > 25) { setRequestedIndex(null); return }
      scrollTo(requestedIndex, request)
    }, 200)
    return () => clearInterval(timer)
  }, [requestedIndex, songs])

  const seek = (ratio: number) => {
    const target = playlistIndexFromRatio(1 - ratio, total)
    if (requestedIndex === target) { showHint(); return }
    latestRequest.current++
    loadCursor.current = -1
    setRequestedIndex(target)
    showHint()
  }
  const readPosition = (event: ScrollEvent) => {
    scrollRevision.current++
    listProps.onScroll?.(event)
    // SongRow uses 48px covers with 8px top/bottom padding. This immediate
    // estimate also covers hosts whose optional visible-cell invoke has no
    // payload; the actual visible-cell result below refines it when available.
    const offset = Number(event.detail.scrollTop)
    if (Number.isFinite(offset) && songs.length > 0) {
      setCurrentIndex(Math.min(songs.length - 1, Math.max(0, Math.floor(offset / 64))))
    }
    readVisiblePosition()
  }
  const readVisiblePosition = () => {
    if (isWeb.current && webReading.current) { webReadAgain.current = true; return }
    const observedScroll = scrollRevision.current
    const serial = ++readSerial.current
    // Web coalesces pending reads and always revisits the latest position.
    if (typeof lynx === 'undefined') return
    const request = latestRequest.current
    const valid = () => alive.current && request === latestRequest.current && observedScroll === scrollRevision.current && serial > appliedRead.current
    if (isWeb.current) {
      webReading.current = true
      const bounds = (selector: string): Promise<RowBounds | undefined> => new Promise(resolve => {
        if (!valid()) { resolve(undefined); return }
        lynx.createSelectorQuery().select(selector).invoke({ method: 'boundingClientRect',
          success: (res: unknown) => resolve(valid() ? res as RowBounds : undefined),
          fail: () => resolve(undefined),
        }).exec()
      })
      void (async () => {
        try {
          const viewport = await bounds(`#${listId}`)
          if (!viewport) return
          const rowBounds = (index: number) => bounds(`#${listId}-item-${songs[index]?.id}`)
          const index = await firstVisibleRowByBounds(songs.length, viewport, rowBounds)
          if (index === undefined || !valid()) return
          const targetBounds = requestedIndex !== null ? await rowBounds(requestedIndex) : undefined
          if (!valid()) return
          appliedRead.current = serial
          setCurrentIndex(index)
          if (targetBounds && targetBounds.bottom > viewport.top && targetBounds.top < viewport.bottom) setRequestedIndex(null)
        } finally {
          webReading.current = false
          if (webReadAgain.current && alive.current) {
            webReadAgain.current = false
            latestRead.current()
          }
        }
      })()
      return
    }
    let payload: unknown
    const top = 0
    const apply = () => {
      if (payload === undefined || top === undefined) return
      if (!alive.current || request !== latestRequest.current || observedScroll !== scrollRevision.current || serial <= appliedRead.current) return
      const cells = normalizeVisibleCells(payload, top)
      const index = firstVisibleSongIndex(cells, songs.map(song => song.id))
      if (index !== undefined) {
        appliedRead.current = serial
        setCurrentIndex(index)
        if (requestedIndex !== null && cells.some(cell =>
          cell.itemKey === String(songs[requestedIndex]?.id) && Number(cell.bottom) > 0 && Number(cell.top) < (height || 400))) {
          setRequestedIndex(null)
        }
      }
    }
    lynx.createSelectorQuery().select(`#${listId}`).invoke({ method: 'getVisibleCells',
      success: (res: unknown) => {
        payload = res ?? []
        apply()
      },
    }).exec()
  }
  latestRead.current = readVisiblePosition
  useEffect(() => {
    if (!showLabel) return
    // Web can finish replacing offscreen placeholders after its last scroll
    // event. Confirm the settled rows while the user can see the hint.
    const timer = setInterval(readVisiblePosition, 200)
    return () => clearInterval(timer)
  }, [showLabel, songs, requestedIndex])
  const song = songs[Math.min(currentIndex, songs.length - 1)]
  const ratio = total > 1 ? currentIndex / (total - 1) : 0
  const thumbRatio = total > 1 ? (requestedIndex ?? currentIndex) / (total - 1) : 0
  const showScrollbar = enabled && total > 20
  const hintTop = Math.max(0, Math.min(ratio * (height || 400), (height || 400) - (navInset || 100) - 64))
  return <view id={`${listId}-host`} className='playlist-song-list' bindlayoutchange={onLayoutChange}>
    <view id={`${listId}-inset`} className='playlist-song-list__nav-inset'
      flatten={false} bindlayoutchange={onInsetLayout} />
    <VirtualList<T> {...listProps} id={listId} onScroll={readPosition} estimatedItemHeight={64}
      className={`${listProps.className ?? ''}${showScrollbar ? ' playlist-song-list__rows--scrollbar' : ''}`} />
    {showScrollbar ? <>
      <VerticalSlider value={1 - thumbRatio} onChange={seek} testId='playlist-scrollbar'
        onDragStart={() => { dragging.current = true; showHint() }}
        onDragEnd={() => { dragging.current = false; showHint() }}
        className='playlist-song-list__scrollbar' trackClassName='playlist-song-list__track'
        thumbClassName='playlist-song-list__thumb' indicatorClassName='playlist-song-list__indicator' />
      {showLabel && song ? <view className='playlist-song-list__hint' style={{ top: `${hintTop}px` }}>
        <text className='playlist-song-list__hint-title'>{`${songTitleInitial(song.title)} · ${song.title}`}</text>
        <text className='playlist-song-list__hint-count'>{`${currentIndex + 1} / ${total}`}</text>
      </view> : null}
    </> : null}
  </view>
}
