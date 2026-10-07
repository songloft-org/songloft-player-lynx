import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Gate for the Web mouse-drag fix in `web/drag-mouse-capture.js`.
 *
 * **The bug.** A mouse drag on a `lynx-ui` handle dies the moment the cursor
 * leaves it. web-core dispatches events by hit path, so once the pointer is off
 * the 22 px handle the handle receives no `mousemove` at all, and the
 * `mouseleave` fired on the way out is bound to `handleDragEnd` — the drag ends
 * mid-gesture and the surface snaps the card home. Touch is immune because the
 * browser captures the pointer implicitly; mouse gets nothing of the sort. The
 * host page restores that symmetry (`setPointerCapture` on `pointerdown`).
 *
 * **Why gates.** Every link in the chain is a string in someone else's file:
 * the marker attribute lives in the installed `@lynx-js/lynx-ui-draggable`, the
 * selector lives in our shim, the sortable surfaces only get the marker because
 * `SortableItemArea` is a re-export of `DraggableArea`, and the deployed
 * product only ships the shim if `copy-bundle-web.mjs` lists it. Lose any one
 * of them and the fix silently stops applying — the exact failure mode that
 * made this bug survive this long (nothing errors; drags just stutter).
 *
 * These assertions resolve against checked-in / installed inputs only, so they
 * need no prior build.
 */

const repoRoot = path.resolve(__dirname, '..', '..')
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), 'utf8')

/** Resolve through the symlink pnpm maintains, as web-host-page.test.ts does. */
function installed(pkg: string): string {
  const link = path.join(repoRoot, 'node_modules', '@lynx-js', pkg)
  expect(existsSync(link), `@lynx-js/${pkg} is not installed`).toBe(true)
  return realpathSync(link)
}

const SHIM = 'web/drag-mouse-capture.js'
const MARKER = 'ios-enable-simultaneous-touch'

describe('the drag-capture shim is loaded and shipped', () => {
  const html = read('web/index.html')
  const copy = read('scripts/copy-bundle-web.mjs')

  test('index.html loads it exactly once, deferred', () => {
    const tags = [...html.matchAll(/<script[^>]+src="\.\/(drag-mouse-capture\.js)"[^>]*>/g)]
    expect(tags, 'index.html must load the shim, or the mouse drag stays broken').toHaveLength(1)
    // `defer` both keeps it off the parse path and guarantees the listeners are
    // registered before any press can happen; the other host scripts follow the
    // same rule. (Counting raw filename occurrences is not a useful check — the
    // explanatory comment above the tag mentions it too.)
    expect(tags[0]![0], 'the shim must load deferred').toContain('defer')
  })

  test('it exists in web/ and the deploy script copies it', () => {
    expect(existsSync(path.join(repoRoot, SHIM)), `${SHIM} does not exist`).toBe(true)
    expect(
      copy,
      'copy-bundle-web.mjs must copy the shim or the deployed page 404s on its script tag '
        + '(silently: an unloaded classic script logs nothing the app can see)',
    ).toContain("'drag-mouse-capture.js'")
  })

  test('it is not gated behind a touch-only or non-mouse path', () => {
    const shim = read(SHIM)
    // The mechanism. Without the capture the fix is a no-op; without the
    // mouse-only guard, a touch pointer would be captured too and could
    // suppress native scrolling on handles whose touch-action is not `none`.
    expect(shim, 'the fix IS setPointerCapture').toContain('setPointerCapture')
    expect(
      shim,
      'capture must stay mouse-only — touch/pen already get implicit capture from the browser',
    ).toContain("pointerType !== 'mouse'")
    /*
     * The lynx elements live inside `<lynx-view>`'s shadow root, so a
     * document-level listener sees `event.target` retargeted to the *host* and
     * a plain `closest()` finds nothing. A rewrite that drops `composedPath`
     * compiles, runs, captures nothing, and looks exactly like the original bug.
     */
    expect(
      shim,
      'the handle lookup must walk event.composedPath() — event.target is retargeted to the shadow host',
    ).toContain('composedPath')
  })

  test('a mousemove with no button held never reaches a handle', () => {
    const shim = read(SHIM)
    /*
     * The other half of the fix, and the one a user hits right after a drop:
     * the card keeps following the cursor with the button up, because
     * `handleDragMove` has no dragging-state guard (see the upstream block at
     * the bottom of this file). Hovering the handle after a drop measured
     * `translate(4px, 0)` without the guard, `0px` with it. Deleting the guard
     * changes nothing else about the shim, so this assertion is the only thing
     * standing between that bug and a regression.
     *
     * Assertions are scoped to the listener *body*: every one of these strings
     * also appears in the surrounding comment, so a file-wide `toContain` would
     * pass with the code deleted (measured — a mutation that removed the
     * `stopPropagation()` call while leaving the comment in place sailed through).
     */
    const guard = shim.match(/document\.addEventListener\(\s*'mousemove'[\s\S]*?\n {2}\)/)
    expect(guard, 'the mousemove guard is gone from the shim').not.toBeNull()
    const body = guard![0]
    expect(
      body,
      'the guard must stay gated on "no button held" — moves during a real drag carry buttons != 0',
    ).toContain('event.buttons !== 0')
    expect(
      body,
      'the guard must stay scoped to handles, or hover moves anywhere on the page stop being delivered',
    ).toContain('handleFromEvent(event)')
    expect(
      body,
      'the guard must stopPropagation() in the capture phase: web-core listens deeper in the composed '
        + 'path, so merely counting the event would leave the drag running',
    ).toContain('stopPropagation()')
    expect(
      body,
      'the counter is what makes the guard observable from the driver (and from this file)',
    ).toContain('hoverMovesBlocked++')
  })
})

describe('the handle marker is still on the components the app uses', () => {
  const shim = read(SHIM)
  const draggable = path.join(installed('lynx-ui-draggable'), 'src', 'Draggable.tsx')
  const source = readFileSync(draggable, 'utf8')

  test('both sides agree on the attribute name, byte for byte', () => {
    expect(
      source,
      `${MARKER} is gone from Draggable.tsx — the shim's selector matches nothing and the `
        + 'mouse drag silently reverts to the old broken behaviour',
    ).toContain(MARKER)
    expect(shim, 'the shim must select the same marker the library renders').toContain(MARKER)
  })

  test('DraggableArea renders the marker, not just DraggableRoot', () => {
    /*
     * The marker must be on the element that carries the `main-thread:bindmouse*`
     * handlers — that is `DraggableArea`, which is what the app mounts as the
     * handle. `DraggableRoot` sets the attribute too; asserting the count keeps a
     * refactor from moving the marker onto a wrapper the capture would still
     * find (harmless) while *dropping* it from the area (fatal).
     */
    const occurrences = [...source.matchAll(new RegExp(MARKER, 'g'))]
    expect(occurrences.length, 'expected the marker on both DraggableRoot and DraggableArea')
      .toBeGreaterThanOrEqual(2)
    const area = source.match(/export function DraggableArea[\s\S]*?\n\}/)
    expect(area, 'DraggableArea not found in Draggable.tsx').not.toBeNull()
    expect(
      area![0],
      'DraggableArea is the mounted handle — the marker has to be on it',
    ).toContain(MARKER)
  })

  test('every sortable surface inherits it via the re-export', () => {
    /*
     * `SortableItemArea` is `DraggableArea` renamed, so LibraryViewEditor,
     * TabConfigPage, PlaylistsView and PlaylistDetailPage are covered by the one
     * selector. If sortable ever ships its own area component, that component
     * needs the marker — and this test is where that shows up.
     */
    const sortable = readFileSync(
      path.join(installed('lynx-ui-sortable'), 'src', 'Sortable.tsx'),
      'utf8',
    )
    expect(
      sortable,
      'SortableItemArea must stay a re-export of DraggableArea, or the sortable surfaces '
        + 'fall outside the capture',
    ).toContain('export { DraggableArea as SortableItemArea }')
  })
})

describe('the upstream cause is still the one we are compensating for', () => {
  const useDraggable = readFileSync(
    path.join(installed('lynx-ui-draggable'), 'src', 'useDraggable.tsx'),
    'utf8',
  )

  test('mouseleave is still bound to the drag-end handler', () => {
    /*
     * This is the defect, stated positively: `mouseleave` ends a drag. It is
     * only acceptable because the capture above keeps the pointer from
     * "leaving" while the button is down — and, unlike a swallow-the-event hack,
     * that is what touch already relies on.
     *
     * If this binding disappears, upstream has fixed the real thing: drop the
     * shim (and this file) rather than keeping a workaround with no cause.
     */
    const bindings = useDraggable.match(
      /'main-thread:bindmouse(leave|move|up|down|longpress)':\s*([A-Za-z]+)/g,
    )
    expect(bindings, 'the mouse binding table in useDraggable.tsx moved').not.toBeNull()
    const byName = new Map(
      bindings!.map((line) => {
        const [, event, handler] = line.match(/'main-thread:bind(mouse\w+)':\s*([A-Za-z]+)/)!
        return [event!, handler!]
      }),
    )
    expect(
      byName.get('mouseleave'),
      'mouseleave must still route to handleDragEnd — that binding is why a flick kills the drag',
    ).toBe('handleDragEnd')
    expect(
      byName.get('mousemove'),
      'mousemove must still route to handleDragMove — that is what the capture restores delivery to',
    ).toBe('handleDragMove')
  })

  test('handleDragMove still applies the delta with no dragging-state guard', () => {
    /*
     * The defect behind the shim's `mousemove` guard, stated positively: the move
     * handler subtracts whatever anchor the last `mousedown` left behind and
     * writes the transform, unconditionally. `handleDragEnd` does not clear it;
     * `resetInternalValues` exists but the only caller in these two packages is
     * the sortable (`useSortable.tsx:455`), which is precisely why the plugin
     * grid — mounting `DraggableRoot` directly — is the surface where a plain
     * hover keeps dragging the card.
     *
     * If upstream adds the guard (or clears the anchor on end), delete the
     * `mousemove` guard here too: asserting `not.toMatch` is meant to fail loudly
     * rather than let a workaround outlive its cause.
     */
    const body = useDraggable.match(/const handleDragMove = \([\s\S]*?\n {2}\}/)
    expect(body, 'handleDragMove moved in useDraggable.tsx').not.toBeNull()
    expect(body![0], 'the delta is still what drives the transform').toContain('getCurrentDelta')
    expect(
      body![0],
      'handleDragMove must still be unguarded — if it now checks a dragging flag, drop the shim guard',
    ).not.toMatch(/isDragging|dragState|draggingRef/)
    expect(
      body![0],
      'the anchor must still survive the move handler (it is only cleared elsewhere)',
    ).not.toContain('resetInternalValues')
    const sortable = readFileSync(
      path.join(installed('lynx-ui-sortable'), 'src', 'useSortable.tsx'),
      'utf8',
    )
    expect(
      sortable,
      'the sortable must still be the one clearing the anchor — that is the whole reason the plugin grid differs',
    ).toContain('MTSResetInternalTranslateValues')
  })
})
