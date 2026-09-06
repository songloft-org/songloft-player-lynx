import { useState } from '@lynx-js/react'

import './PluginIconTile.css'

export interface PluginIconTileProps {
  /** Fetched SVG markup. When present it wins — the `<svg content>` path. */
  markup?: string
  /** Resolved bitmap URL, used when there is no SVG markup. */
  imageSrc?: string
  /** Display name; its first character is the fallback when no icon renders. */
  name: string
  testId?: string
}

/**
 * The plugin's icon tile — one shape for every surface that shows a plugin **as
 * an object**: the home grid, the manager list and the store list. Those three
 * had each drawn their own (40/36/40px, `--radius-sm` / a full circle /
 * `--radius-md`, two background treatments, and a glyph-vs-initial fallback),
 * and the manager's circle additionally wore a 2px status ring.
 *
 * A rounded square, which is the Apple app-icon convention (App Store, the
 * Settings app's per-app rows). A circle reads as a person's avatar, and with
 * `overflow: hidden` it also clipped the corners off the square logos plugins
 * actually ship.
 *
 * The nav bar's plugin glyph is deliberately **not** this: 24px, bare, tinted by
 * active state, because it belongs to the row of tab icons it sits in rather
 * than to this set — see `.nav-item__plugin-icon` in `ShellLayout.css` and
 * `PluginTabIcon.tsx`.
 *
 * This component does **not** fetch. The three call sites resolve markup two
 * different ways — `usePluginIconQuery` over the authenticated backend for
 * installed plugins, `useRegistryIconQuery` for a store entry's external URL —
 * so they pass the result in and this owns only the rendering and the fallback.
 */
export function PluginIconTile({ markup, imageSrc, name, testId }: PluginIconTileProps) {
  // A bitmap that 404s (or is not decodable) would otherwise leave an empty tile;
  // the initial is a better answer than a hole. Carried over from the store tile,
  // which was the only one of the three that handled this.
  const [bitmapFailed, setBitmapFailed] = useState(false)
  const initial = name.slice(0, 1).toUpperCase() || '?'

  return (
    <view className='plugin-icon-tile' data-testid={testId}>
      {markup
        ? <svg className='plugin-icon-tile__img' content={markup} />
        : imageSrc && !bitmapFailed
          ? (
            <image
              className='plugin-icon-tile__img'
              /* `mode`, not `object-fit`: Lynx `<image>` has no such CSS
                 property. `aspectFit` (= contain) because cropping a
                 non-square logo cuts the mark. */
              mode='aspectFit'
              src={imageSrc}
              binderror={() => setBitmapFailed(true)}
            />
          )
          : <text className='plugin-icon-tile__initial'>{initial}</text>}
    </view>
  )
}
