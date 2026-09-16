/**
 * Mouse pointer capture for lynx-ui drag handles — the missing half of dragging
 * on Web.
 *
 * **Why this is needed.** `lynx-ui`'s `useDraggable` binds
 * `main-thread:bindmouseleave` to `handleDragEnd` (useDraggable.tsx:264) and
 * `bindmousedown` to `handleDragStart` (:285) on the handle view that
 * `DraggableArea` / `SortableItemArea` render. On Web, web-core dispatches
 * events from a single listener on the host element according to the event's
 * hit path — so:
 *
 * - **touch** works, because the browser applies *implicit pointer capture*:
 *   the finger can slide off the 22 px handle and `touchmove` still arrives at
 *   the handle that received `touchstart`.
 * - **mouse** has no such capture. One quick flick moves the cursor off the
 *   handle, so the `mousemove`s land on whatever is underneath — the handle
 *   receives *zero* moves — and the `mouseleave` that fires on the way out is
 *   routed straight into `handleDragEnd`. The drag is killed mid-gesture.
 *
 * Measured on the same component code (clients/player-lynx/drag-repro: one
 * 200 px step, then 30 × 2 px steps):
 *
 * | | moves delivered | handle `mouseleave` | state after the flick |
 * |---|---|---|---|
 * | no capture (today) | 0 | 4 | `drag end` — drag killed |
 * | with capture | 1 | 0 | `drag start` — drag survives |
 * | 30 × 2 px, no capture | 30 | **84** | frequent spurious ends |
 * | 30 × 2 px, with capture | 30 | 0 | — |
 *
 * Reproduced and fixed in the real product as well — `scripts/verify-drag-mouse.mjs`
 * runs both halves on one build (the shim blocked by CDP vs loaded) and reports
 * how far the dragged element followed the pointer: library view editor
 * `26px → 26px` dead (order unchanged) vs `26px → 51px` alive (new order reaches
 * `PUT /settings/library-browse`), settings tab order `23px → 46px`, home plugin
 * grid `42px → 84px`.
 *
 * Because the surfaces reset their transform on `onDragEnd` (PluginGrid's
 * `resetOnEnd`, the sortable surfaces' own snap-back), each spurious end yanks
 * the card home — which is what reads as "the mouse drag stutters and doesn't
 * follow the cursor".
 *
 * **The other half, and it is not about a gesture.** `lynx-ui` also lets a drag
 * *start* without a pressed button: `handleDragMove` has no dragging-state guard
 * and subtracts an anchor that only `useSortable` ever clears, so on the plugin
 * grid a plain hover over the card's handle — after any press that has happened
 * before, even a click — re-applies `cursor − pressPoint` as a translate and the
 * tile follows the cursor with the button up. Measured: `translate(4px, 0)` after
 * a drop. See the `mousemove` guard at the bottom of this file; details in
 * docs/project/pitfalls.md §2.
 *
 * **How the handle is recognised.** `DraggableArea` and `SortableItemArea` both
 * render `<view ios-enable-simultaneous-touch={true}>` (Draggable.tsx:74, :159)
 * — the same view that carries the `main-thread:bindmouse*` handlers. web-core
 * keeps its event bindings internal, so this attribute is the only marker the
 * host page can key on; it survives into the DOM as
 * `ios-enable-simultaneous-touch="true"` on the `x-view`. Every draggable
 * surface in this app (PluginGrid, LibraryViewEditor, TabConfigPage,
 * PlaylistsView, PlaylistDetailPage) goes through those two components, so one
 * rule covers all of them. If upstream ever drops the attribute the capture
 * silently stops and the bug returns — the gate in
 * `src/__tests__/web-drag-mouse-capture.test.ts` is what makes that visible.
 *
 * **Why the host page and not the app.** The app's business code runs inside
 * web-core's background Worker, which has no DOM; pointer capture is a DOM API
 * on the main thread. `lynx-ui` cannot express it either — a `main-thread:`
 * script runs in the binding layer, not on a real DOM node. Capturing here
 * needs no patch to a minified upstream bundle and leaves Android/iOS/Harmony
 * untouched (this file is only loaded by the Web host page, and every handler
 * below is mouse-only).
 *
 * Loaded as a classic deferred script from web/index.html. It only registers
 * document-level listeners; `defer` guarantees they are in place before the
 * page can be interacted with.
 */

(function () {
  'use strict'

  /*
   * The handle marker, and the only selector this file needs. Present on both
   * DraggableArea and SortableItemArea.
   */
  var HANDLE_SELECTOR = '[ios-enable-simultaneous-touch]'

  /*
   * Diagnostics for the driver scripts (scripts/lib-driver.mjs and friends):
   * "did the host actually capture?" is otherwise invisible — a capture that
   * never fires and a drag that stays broken look identical from the outside.
   */
  var stats = {
    captures: 0,
    captureLost: 0,
    errors: 0,
    lastError: null,
    dragStartBlocked: 0,
    selectionBlocked: 0,
    hoverMovesBlocked: 0,
    capturing: false,
  }
  globalThis.__songloftDragCapture = stats

  /*
   * The lynx elements live inside `<lynx-view id="app">`'s shadow root, where a
   * document-level listener sees `event.target` retargeted to the shadow *host*
   * — never the handle. `composedPath()` is the real path and holds for any
   * nesting web-core may use, so it is the only reliable lookup here.
   */
  function handleFromEvent(event) {
    var path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target]
    for (var i = 0; i < path.length; i++) {
      var node = path[i]
      if (node && node.nodeType === 1 && node.matches && node.matches(HANDLE_SELECTOR)) {
        return node
      }
    }
    return null
  }

  /*
   * Capture-phase on the document, so this runs before web-core's own listener
   * on the host element.
   */
  document.addEventListener(
    'pointerdown',
    function (event) {
      /*
       * Mouse only. Touch and pen already get implicit pointer capture from the
       * browser — that is the whole asymmetry being fixed — and capturing a
       * touch pointer here could suppress native scrolling on any handle whose
       * `touch-action` is not `none`.
       */
      if (event.pointerType !== 'mouse') return
      if (event.button !== 0) return

      var handle = handleFromEvent(event)
      if (!handle) return

      try {
        handle.setPointerCapture(event.pointerId)
        stats.captures++
        stats.capturing = true
      } catch (err) {
        /*
         * The pointer can already be gone (a press and release inside one
         * frame) or the element can have left the DOM. Not fatal: without
         * capture the gesture degrades to exactly the pre-fix behaviour.
         */
        stats.errors++
        stats.lastError = String((err && err.message) || err)
      }
    },
    true
  )

  /*
   * Pointer capture releases itself on pointerup/pointercancel, and implicitly
   * when the element leaves the DOM — mirror that in `capturing` so the
   * selection guard below cannot get stuck on.
   */
  function releaseCapture() {
    stats.capturing = false
  }
  document.addEventListener('pointerup', releaseCapture, true)
  document.addEventListener('pointercancel', releaseCapture, true)
  document.addEventListener(
    'lostpointercapture',
    function () {
      stats.capturing = false
      stats.captureLost++
    },
    true
  )

  /*
   * Native HTML5 drag-and-drop is the second way a mouse gesture can be stolen:
   * Chrome makes `<img>` elements draggable by default, and `Icon` renders its
   * `<svg content>` as a real `<img src="blob:…">` on Web. A native drag takes
   * over the gesture and stops delivering `mousemove`, which would freeze the
   * lynx drag regardless of the capture above. This is not defensive decoration:
   * driving a real drag on a settings tab-order row — the handle that contains an
   * `Icon` — tripped it once (`__songloftDragCapture.dragStartBlocked`). The
   * handles exist to be dragged by lynx, never by the browser, so refuse it —
   * scoped to handle subtrees, so nothing else on the page loses native dragging.
   */
  document.addEventListener(
    'dragstart',
    function (event) {
      if (!handleFromEvent(event)) return
      event.preventDefault()
      stats.dragStartBlocked++
    },
    true
  )

  /*
   * Selection is the third: a press-drag over text or graphics starts a text
   * selection, and the highlight it paints is what a dragged card appears to
   * smear. Suppressed only while a capture we started is live and only inside a
   * handle, so ordinary text selection elsewhere is untouched.
   */
  document.addEventListener(
    'selectstart',
    function (event) {
      if (!stats.capturing) return
      if (!handleFromEvent(event)) return
      event.preventDefault()
      stats.selectionBlocked++
    },
    true
  )

  /*
   * The fourth is not about a gesture at all: **a drag requires a pressed
   * button, and on Web `lynx-ui` does not enforce that.**
   *
   * `useDraggable`'s `handleDragMove` (useDraggable.tsx:204) carries no
   * "am I dragging?" guard — it computes `cursor − touchStartPoint` and writes
   * the transform on *every* `mousemove` that reaches the handle. The anchor it
   * subtracts is cleared only by `MTSResetInternalTranslateValues()`, and the
   * library's only caller of that is `useSortable` (useSortable.tsx:455). So the
   * `SortableRoot` surfaces shed the anchor when a sort ends, while `PluginGrid`
   * — the one surface mounting `DraggableRoot`/`DraggableArea` directly — keeps
   * it for the life of the node. Measured after a drop on the plugin grid:
   * moving the cursor back over that card's handle with the button up writes
   * `transform: translate(4px, 0)`, and the tile keeps following the pointer.
   * The user sees a card being dragged with nothing pressed.
   *
   * The missing invariant is restored at the one place the host can check it —
   * the handle — and without knowing which surface it belongs to: a `mousemove`
   * with no button held must not reach a handle. Moves made *during* a real drag
   * carry `buttons !== 0`, so this cannot interfere with dragging; and
   * `stopPropagation()` in the capture phase means web-core (whose listener sits
   * on the `<lynx-view>` host, further along the composed path) never dispatches
   * it to the binding layer.
   */
  document.addEventListener(
    'mousemove',
    function (event) {
      if (event.buttons !== 0) return
      if (!handleFromEvent(event)) return
      event.stopPropagation()
      stats.hoverMovesBlocked++
    },
    true
  )
})()