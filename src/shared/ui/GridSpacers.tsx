import './GridSpacers.css'

/**
 * Invisible trailing spacers that pad a flex-wrap card grid's last row.
 *
 * Why this exists: a responsive card grid (`flex: 1 0 <min>; max-width: <cap>`
 * on the cards) fills every full row edge-to-edge — left & right margins both
 * zero, covers a constant size. But the *last* row is usually short, and
 * `flex-grow: 1` would stretch its few cards to fill the whole width — a lone
 * trailing card balloons to 300+px. There is no way to both "fill the width"
 * and "keep the last row's cards the same size" without something occupying
 * the empty slots, so these invisible spacers do exactly that: they take the
 * same flex sizing as a real card (`flex: 1 0 <min>; max-width: <cap>`) but
 * `height: 0`, so they pad a short last row to a full one (cards stay uniform)
 * while surplus spacers collapse into zero-height invisible rows below.
 *
 * Render at most `count` (default 8 — enough for up to ~8 columns; any extra
 * just forms invisible zero-height rows, harmless).
 *
 * The card min/max sizes are read from the grid container's CSS custom
 * properties `--grid-card-min` and `--grid-card-max` (set by each grid), with
 * hardcoded fallbacks.
 */
export function GridSpacers({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <view key={`grid-spacer-${i}`} className='grid-spacer' />
      ))}
    </>
  )
}
