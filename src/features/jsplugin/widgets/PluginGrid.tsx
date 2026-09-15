import { useCallback, useRef, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Draggable } from '@lynx-js/lynx-ui-draggable'

// Draggable's onDragEnd hands us a { x, y } page-space translate. We type it
// locally instead of pulling `@lynx-js/lynx-ui-common` into package.json just
// for one two-field interface.
type DragTranslate = { x: number; y: number }

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
 * Home plugin grid, with an edit mode for drag-drop reordering
 * (songloft-org/songloft#463). The bottom-tab config is a separate concern —
 * settings page owns that; this only reorders how the grid renders here.
 *
 * The drag primitive is `@lynx-js/lynx-ui-draggable` (not `-sortable`): sortable
 * is a one-dimensional list — it walks item indices with a per-axis delta and
 * ignores `flex-wrap`, so on this grid horizontal moves went nowhere and
 * vertical moves only jumped by list index. Draggable is a single-item follow-
 * finger primitive; hit-testing, swap and reset are done here.
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

interface EditableGridProps {
  plugins: JSPlugin[]
  onCommit: (entryPaths: string[]) => void
}

/**
 * Edit-mode grid. Long-press a card to pick it up (2D free drag via
 * `<Draggable allowedDirection='all' trigger='longpress' resetOnEnd>`), then
 * release over another card to swap positions.
 *
 * Rects are captured on drag START (not layout), because `flex-wrap` layout
 * only settles after the DOM is in place — asking the rect map before touch
 * would race. On drag END we take the dragged card's starting-rect center,
 * add the final translate, and find which card that point falls inside.
 * `resetOnEnd` snaps the drag transform back to 0 so React's re-render is
 * the source of truth for position.
 */
function EditableGrid({ plugins, onCommit }: EditableGridProps) {
  // Rects are captured on drag start and consumed on drag end; using a ref
  // avoids re-rendering the whole grid on every gesture start.
  const rectsRef = useRef<Map<string, { x: number; y: number; w: number; h: number }>>(new Map())

  const captureRects = useCallback(() => {
    const nextRects = new Map<string, { x: number; y: number; w: number; h: number }>()
    const pending = plugins.length
    if (pending === 0) {
      rectsRef.current = nextRects
      return
    }
    for (const p of plugins) {
      const key = p.entryPath!
      lynx.createSelectorQuery()
        .select(`#${cardElementId(key)}`)
        ?.invoke({
          method: 'boundingClientRect',
          params: {},
          success: (res) => {
            const r = res as { left: number; top: number; width: number; height: number }
            nextRects.set(key, { x: r.left, y: r.top, w: r.width, h: r.height })
          },
        })
        .exec()
    }
    // The queries are async but ReactLynx doesn't give us a "all done" hook —
    // we rely on drag END coming later (after longpress → drag start → user
    // drags → user releases), which gives all the rect callbacks time to land.
    rectsRef.current = nextRects
  }, [plugins])

  const onDragEnd = useCallback((draggedKey: string, translate: DragTranslate) => {
    const rects = rectsRef.current
    const src = rects.get(draggedKey)
    if (!src) return
    const dropCenter = { x: src.x + src.w / 2 + translate.x, y: src.y + src.h / 2 + translate.y }
    let targetKey: string | null = null
    for (const [key, r] of rects.entries()) {
      if (key === draggedKey) continue
      if (
        dropCenter.x >= r.x &&
        dropCenter.x <= r.x + r.w &&
        dropCenter.y >= r.y &&
        dropCenter.y <= r.y + r.h
      ) {
        targetKey = key
        break
      }
    }
    if (targetKey === null) return
    const currentKeys = plugins.map((p) => p.entryPath!)
    const from = currentKeys.indexOf(draggedKey)
    const to = currentKeys.indexOf(targetKey)
    if (from < 0 || to < 0 || from === to) return
    const next = currentKeys.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    onCommit(next)
  }, [plugins, onCommit])

  return (
    <view className='plugin-grid__items'>
      {plugins.map((plugin) => {
        const key = plugin.entryPath!
        return (
          <Draggable
            key={String(plugin.id)}
            id={cardElementId(key)}
            trigger='longpress'
            allowedDirection='all'
            resetOnEnd={true}
            onDragStart={captureRects}
            onDragEnd={(translate) => onDragEnd(key, translate)}
            className='plugin-grid__card plugin-grid__card--editing'
          >
            <PluginIcon plugin={plugin} />
            <text className='plugin-grid__card-name'>{plugin.displayName}</text>
          </Draggable>
        )
      })}
    </view>
  )
}

function cardElementId(entryPath: string): string {
  // Selector-safe id: entry_path can carry slashes / dots. Prefix + normalise.
  return `plugin-grid-card-${entryPath.replace(/[^\w-]/g, '-')}`
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

/** Extension sniffing on the declared filename, ignoring any query string. */
export function isSvgIcon(icon: string | undefined): boolean {
  return (icon ?? '').split('?')[0]!.trim().toLowerCase().endsWith('.svg')
}
