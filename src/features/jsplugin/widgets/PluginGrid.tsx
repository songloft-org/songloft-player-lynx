import { useCallback, useRef, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { DraggableRoot, DraggableArea } from '@lynx-js/lynx-ui-draggable'

import { buildCoverUrl } from '../../../core/network/url-helper.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { JSPlugin } from '../../../models/jsplugin.js'
import { usePluginIconQuery, usePluginsQuery } from '../data/jsplugin-query.js'
import {
  applyPluginOrder,
  usePluginOrderQuery,
  useUpdatePluginOrderMutation,
} from '../data/plugin-order.js'
import { PluginIconTile } from './PluginIconTile.js'
import './PluginGrid.css'

/**
 * Home plugin grid (songloft-org/songloft#463).
 *
 * Edit mode keeps the 2D wrapped grid layout and turns every card into a
 * DraggableRoot with a handle overlaying the icon tile (DraggableArea). Only
 * touchstart/mousedown on that handle starts the drag — the rest of the card
 * is inert while editing. On drag end, the translated card's center is hit
 * tested against the captured rects of the other cards to decide the new
 * index; if the drop lands over another card, the two swap.
 *
 * Why this shape:
 * - `lynx-ui-sortable` hard-codes `allowedDirection: ['up', 'down']`, so it
 *   cannot do a wrapped 2D grid. Even in list mode long-press does not fire
 *   on web because Lynx-web does not dispatch `mouselongpress`.
 * - `lynx-ui-draggable` with `trigger='immediate'` binds only `mousedown` /
 *   `mousemove` / `mouseup` / `touchstart` / `touchmove` / `touchend`, which
 *   Lynx-web does dispatch. No patches.
 * - `touch-action: none` on the handle CSS is what actually stops the outer
 *   scroll-view from following a vertical drag — see PluginGrid.css.
 */
export function PluginGrid() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data } = usePluginsQuery()
  const { data: order = [] } = usePluginOrderQuery()
  const updateOrder = useUpdatePluginOrderMutation()
  const [editing, setEditing] = useState(false)

  const activePlugins = (data?.plugins ?? []).filter((p) => p.isActive && p.entryPath)
  const orderedPlugins = applyPluginOrder(activePlugins, order)

  if (orderedPlugins.length === 0) return null

  const onTap = (plugin: JSPlugin) => {
    if (plugin.entryPath) {
      void navigate({ to: '/plugin/$entryPath', params: { entryPath: plugin.entryPath } })
    }
  }

  return (
    <view className='plugin-grid'>
      <view className='plugin-grid__header'>
        <Icon name='settings' size={18} color={ICON_COLORS.content} />
        <text className='plugin-grid__title'>{t('jsplugin.gridTitle')}</text>
        {orderedPlugins.length > 1
          ? (
            <view
              className='plugin-grid__edit-toggle'
              bindtap={() => setEditing((v) => !v)}
              data-testid='plugin-grid-edit-toggle'
            >
              <text className='plugin-grid__edit-toggle-text'>
                {editing ? t('jsplugin.gridDoneEditing') : t('jsplugin.gridEditOrder')}
              </text>
            </view>
          )
          : null}
      </view>
      {editing
        ? (
          <EditableGrid
            plugins={orderedPlugins}
            onCommit={(entryPaths) => updateOrder.mutate(entryPaths)}
          />
        )
        : (
          <view className='plugin-grid__items'>
            {orderedPlugins.map((plugin) => (
              <PluginCard
                key={String(plugin.id)}
                plugin={plugin}
                onTap={() => onTap(plugin)}
              />
            ))}
          </view>
        )}
    </view>
  )
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface EditableGridProps {
  plugins: JSPlugin[]
  onCommit: (entryPaths: string[]) => void
}

const cardElementId = (entryPath: string) =>
  `plugin-card-${entryPath.replace(/[^a-zA-Z0-9_-]/g, '_')}`

function EditableGrid({ plugins, onCommit }: EditableGridProps) {
  // Rects captured on drag start; index is aligned with `plugins`.
  const rectsRef = useRef<Rect[]>([])
  // Last translate reported by `onDragging`. Needed because `lynx-ui-draggable`
  // with `resetOnEnd: true` zeroes its internal translate BEFORE firing
  // `onDragEnd`, so the callback always receives `{x:0, y:0}`. We keep our
  // own copy that survives the reset.
  const lastTranslateRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  // Live drag state — `target` is the slot the source card is currently over.
  // Non-source cards use it to compute a shift transform so they visibly
  // reflow while the drag is in progress (setState fires on every dragging
  // event, so this rerenders the grid at drag frequency).
  const [dragState, setDragState] = useState<{ source: number; target: number } | null>(null)

  const captureRects = useCallback((sourceIndex: number) => {
    console.log('[PluginGrid] dragStart source=', sourceIndex, 'capturing rects for', plugins.length, 'cards')
    lastTranslateRef.current = { x: 0, y: 0 }
    setDragState({ source: sourceIndex, target: sourceIndex })
    if (typeof lynx === 'undefined' || typeof lynx.createSelectorQuery !== 'function') {
      console.log('[PluginGrid] no lynx.createSelectorQuery bridge — rects cannot be measured on this host')
      return
    }
    rectsRef.current = []
    plugins.forEach((plugin, index) => {
      lynx
        .createSelectorQuery()
        .select(`#${cardElementId(plugin.entryPath!)}`)
        .invoke({
          method: 'boundingClientRect',
          success: (res) => {
            const r = res as Partial<Rect> | undefined
            if (!r || typeof r.left !== 'number') return
            rectsRef.current[index] = {
              left: r.left,
              top: r.top ?? 0,
              right: r.right ?? (r.left + (r.width ?? 0)),
              bottom: r.bottom ?? ((r.top ?? 0) + (r.height ?? 0)),
              width: r.width ?? 0,
              height: r.height ?? 0,
            }
          },
        })
        .exec()
    })
  }, [plugins])

  const hitTest = useCallback((sourceIndex: number, translate: { x: number; y: number }) => {
    const rects = rectsRef.current
    const source = rects[sourceIndex]
    if (!source) return sourceIndex
    const cx = source.left + source.width / 2 + translate.x
    const cy = source.top + source.height / 2 + translate.y
    for (let i = 0; i < plugins.length; i++) {
      if (i === sourceIndex) continue
      const r = rects[i]
      if (!r) continue
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return i
    }
    return sourceIndex
  }, [plugins])

  const onDragging = useCallback((sourceIndex: number, translate: { x: number; y: number }) => {
    lastTranslateRef.current = translate
    const target = hitTest(sourceIndex, translate)
    setDragState((prev) => (
      prev && prev.source === sourceIndex && prev.target === target
        ? prev
        : { source: sourceIndex, target }
    ))
  }, [hitTest])

  const onDragEnd = useCallback(
    (sourceIndex: number, translateFromLib: { x: number; y: number }) => {
      // `lynx-ui-draggable` zeroes its own translate BEFORE firing `onDragEnd`
      // when `resetOnEnd: true`. Fall back to our last-known translate.
      const translate = translateFromLib.x === 0 && translateFromLib.y === 0
        ? lastTranslateRef.current
        : translateFromLib
      const hitIndex = hitTest(sourceIndex, translate)
      console.log('[PluginGrid] dragEnd source=', sourceIndex, 'translate=', translate, 'hit=', hitIndex)
      setDragState(null)
      if (hitIndex === sourceIndex) return
      const next = plugins.slice()
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(hitIndex, 0, moved!)
      onCommit(next.map((p) => p.entryPath!))
    },
    [plugins, onCommit, hitTest],
  )

  // Where should the card at old index `i` visually sit right now?
  // If the source were dropped at `target`, `i`'s new slot in the reordered
  // list is `newIndex`, and its shift is `rects[newIndex] - rects[i]`.
  const shiftFor = (i: number): { x: number; y: number } => {
    if (!dragState || i === dragState.source) return { x: 0, y: 0 }
    const { source, target } = dragState
    let newIndex = i
    if (source < target && i > source && i <= target) newIndex = i - 1
    else if (source > target && i >= target && i < source) newIndex = i + 1
    if (newIndex === i) return { x: 0, y: 0 }
    const rects = rectsRef.current
    const from = rects[i]
    const to = rects[newIndex]
    if (!from || !to) return { x: 0, y: 0 }
    return { x: to.left - from.left, y: to.top - from.top }
  }

  return (
    <view
      className='plugin-grid__items plugin-grid__items--sort-active'
      consume-slide-event={[[-180, 180]]}
    >
      {plugins.map((plugin, index) => {
        const isSource = dragState?.source === index
        const shift = isSource ? { x: 0, y: 0 } : shiftFor(index)
        // Source card: leave `transform` alone — lynx-ui-draggable writes it
        // on the main thread via `setStyleProperty('transform', ...)`. Setting
        // it from React would race that write.
        const style = isSource ? undefined : { transform: `translate(${shift.x}px, ${shift.y}px)` }
        return (
          <DraggableRoot
            key={String(plugin.id)}
            id={cardElementId(plugin.entryPath!)}
            trigger='immediate'
            allowedDirection='all'
            resetOnEnd={true}
            onDragStart={() => captureRects(index)}
            onDragging={(t) => onDragging(index, t)}
            onDragEnd={(t) => onDragEnd(index, t)}
            className={`plugin-grid__card plugin-grid__card--editing${
              !isSource && dragState ? ' plugin-grid__card--shifting' : ''
            }`}
            style={style}
          >
            <view className='plugin-grid__icon-slot'>
              <PluginIcon plugin={plugin} />
              <DraggableArea className='plugin-grid__drag-handle'>
                <view
                  className='plugin-grid__drag-handle-inner'
                  data-testid={`plugin-card-handle-${plugin.id}`}
                >
                  <Icon name='drag' size={22} color={ICON_COLORS.primaryContent} />
                </view>
              </DraggableArea>
            </view>
            <text className='plugin-grid__card-name'>{plugin.displayName}</text>
          </DraggableRoot>
        )
      })}
    </view>
  )
}

function PluginCard({ plugin, onTap }: { plugin: JSPlugin; onTap: () => void }) {
  return (
    <view className='plugin-grid__card' bindtap={onTap} data-testid={`plugin-card-${plugin.id}`}>
      <PluginIcon plugin={plugin} />
      <text className='plugin-grid__card-name'>{plugin.displayName}</text>
    </view>
  )
}

/**
 * Plugin icon, split by file type — the reason the grid used to look empty.
 *
 * Most backend plugin icons are `.svg`, and Lynx's `<image>` does not render SVG on
 * any mobile backend. The obvious fix, `<svg src={url}>`, does not work here either:
 * the native SVG element delegates URL loading to a host-registered
 * `GenericResourceFetcher`, and this Android host registers none — on device it logs
 * `getGenericResourceFetcher is null, svg fetch src failed!` and draws nothing. So
 * the markup is fetched over the app's authenticated client and handed to
 * `<svg content>`, which needs no host support (it is how `shared/ui/Icon.tsx` has
 * always worked).
 *
 * The rendering (and the no-icon fallback, which used to be a `settings` glyph
 * here and the plugin's initial on the other two surfaces) belongs to
 * `PluginIconTile`; this only resolves where the markup comes from.
 */
function PluginIcon({ plugin }: { plugin: JSPlugin }) {
  const icon = plugin.icon ?? ''
  const entryPath = plugin.entryPath ?? ''
  const isSvg = isSvgIcon(icon)
  const { data: markup } = usePluginIconQuery(entryPath, icon, isSvg)
  const hasIcon = Boolean(icon && entryPath)

  return (
    <PluginIconTile
      markup={hasIcon && isSvg ? markup : undefined}
      imageSrc={hasIcon && !isSvg
        ? buildCoverUrl(`/api/v1/jsplugin/${entryPath}/static/${icon}`)
        : undefined}
      name={plugin.displayName}
    />
  )
}

/**
 * Extension sniffing on the declared icon.
 *
 * Two shapes reach here:
 *   1. bare filename declared in `plugin.json`, e.g. `icon.svg` — check its
 *      extension directly (ignoring any query string appended by callers);
 *   2. registry entry URL going through the server proxy, e.g.
 *      `/api/v1/proxy?url=<encoded external icon URL>` — the path itself is
 *      `/api/v1/proxy` and would otherwise mis-route to `<image>`. Inspect the
 *      `url=` query parameter (URL-decoded) so a proxied `.svg` still wins.
 */
export function isSvgIcon(icon: string | undefined): boolean {
  const raw = (icon ?? '').trim()
  if (!raw) return false
  const [path, query] = raw.split('?', 2)
  if (path && path.toLowerCase().endsWith('.svg')) return true
  if (!query) return false
  for (const part of query.split('&')) {
    if (!part.startsWith('url=')) continue
    let target = part.slice(4)
    try {
      target = decodeURIComponent(target)
    } catch {
      // malformed percent-encoding; fall through with the raw value
    }
    return target.split('?')[0]!.toLowerCase().endsWith('.svg')
  }
  return false
}
