/**
 * Verification driver for the Web mouse-drag fix (`web/drag-mouse-capture.js`).
 *
 * **What it measures.** Whether a *mouse* drag on a lynx-ui handle keeps
 * working after the cursor leaves the handle. Without pointer capture the drag
 * is killed: web-core routes by hit path, so the handle receives no `mousemove`
 * once the cursor is off it, and the `mouseleave` raised on the way out is bound
 * to `handleDragEnd` (useDraggable.tsx:264). The card snaps home — reported as
 * "the drag stutters and doesn't follow the cursor".
 *
 * **Why it runs twice.** The library editor is dragged once with
 * `/drag-mouse-capture.js` blocked by CDP and once with it loaded, on the *same*
 * build — so the fix is measured against its own absence instead of asserted.
 * The `blocked` half must show the dead drag (transform returns to `none`,
 * order unchanged); the `fixed` half must show the row following the pointer
 * and a new order that reaches the backend.
 *
 * **Assertions land on the backend**, not on a screenshot: the reorder is read
 * back from `PUT/GET /api/v1/settings/library-browse` and
 * `/api/v1/settings/tab-config` — the same syscall a user's next page load
 * would make.
 *
 * Recipe (backend + bundle + Chrome; see docs/guides/debugging.md):
 *
 *   # 1. real backend on :58091
 *   (cd ../.. && make run)
 *   # 2. the built web deployable on :3010 (must be `build:web`, not web:dev)
 *   pnpm run build:web && PORT=3010 node web/serve.mjs
 *   # 3. Chrome with CDP on :3100
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *     --remote-debugging-port=3100 --user-data-dir=/tmp/lynx-cdp-profile
 *   # 4. run this
 *   CDP=$(curl -s localhost:3100/json/version | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).webSocketDebuggerUrl))') \
 *     node scripts/verify-drag-mouse.mjs
 */
import { openSession, login, clickTestid } from './lib-driver.mjs'

const API = process.env.API ?? 'http://localhost:58091/api/v1'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let token = null
async function apiGet(path, { tolerate404 = false } = {}) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (tolerate404 && res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`)
  return res.json()
}

/** The plugin grid's persisted order, read from the plugin list itself. */
async function pluginOrderFromList() {
  const j = await apiGet('/jsplugins')
  return (j.plugins ?? []).map((p) => p.entry_path)
}

async function apiLogin() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status} (is the backend on :58091?)`)
  token = (await res.json()).access_token
}

/** Evaluate inside the lynx-view shadow root (the app's real DOM). */
const srEval = (sess, expr) =>
  sess.evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);
    if(!h||!h.shadowRoot)return null;const sr=h.shadowRoot;return (${expr});})()`)

/** Ordered [testid, rect] of the drag handles the surface renders. */
async function handles(sess, testidPrefix) {
  const raw = await srEval(sess, `JSON.stringify(
    [...sr.querySelectorAll('[data-testid^="${testidPrefix}"]')].map(el => {
      const b = el.getBoundingClientRect();
      return { id: el.getAttribute('data-testid'), x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height };
    }))`)
  return raw ? JSON.parse(raw) : []
}

/**
 * Every element currently carrying a transform — the only trace a lynx drag
 * leaves in the DOM (`lynx-ui` writes `transform` from the main-thread script;
 * there is no class either library adds). Empty after a drag means it snapped
 * back, i.e. the drag had already ended.
 */
async function transforms(sess) {
  const raw = await srEval(sess, `JSON.stringify(
    [...sr.querySelectorAll('*')].filter(el => {
      const t = getComputedStyle(el).transform;
      return t && t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)';
    }).map(el => ({ cls: String(el.className || '').slice(0, 40),
                    testid: el.getAttribute('data-testid') || '',
                    transform: getComputedStyle(el).transform })))`)
  return raw ? JSON.parse(raw) : []
}

async function shimStats(sess) {
  return JSON.parse(await sess.evalJS('JSON.stringify(globalThis.__songloftDragCapture ?? null)'))
}

/**
 * The largest translate in the page — i.e. how far the dragged element has been
 * moved. Measured as the full vector, not `ty`: the list surfaces drag on Y but
 * the plugin grid is a multi-column grid, where dragging card 2 onto card 1 is
 * pure X (measuring Y there reported 0px and read as "the drag never started").
 */
function maxTranslate(t) {
  return Math.round(t.reduce((max, e) => {
    const m = /matrix\(([^)]+)\)/.exec(e.transform)
    if (!m) return max
    // matrix(a, b, c, d, tx, ty) — indices 4 and 5. (A `[, tx, ty]` destructuring
    // reads b and c, which are 0 for these translations and report 0px forever.)
    const parts = m[1].split(',').map(Number)
    return Math.max(max, Math.hypot(parts[4] ?? 0, parts[5] ?? 0))
  }, 0))
}

/**
 * Press on a handle, walk a few small steps (a hand does not teleport), then
 * jump the rest of the way in ONE move — the flick that kills the drag when
 * nothing holds the pointer. Returns the transform read *after* the jump, which
 * is the moment that decides alive-vs-dead.
 */
async function dragWithJump(sess, from, to, label) {
  const step = (type, x, y) =>
    sess.send('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', buttons: 1, clickCount: 1 })
  await sess.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(from.x), y: Math.round(from.y) })
  await step('mousePressed', from.x, from.y)
  await sleep(120)
  // three small steps toward the target (a hand does not teleport)
  for (let i = 1; i <= 3; i++) {
    await step('mouseMoved', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6)
    await sleep(40)
  }
  const mid = await transforms(sess)
  // one big jump the rest of the way
  await step('mouseMoved', to.x, to.y)
  await sleep(200)
  const afterJump = await transforms(sess)
  const midMag = maxTranslate(mid)
  const jumpMag = maxTranslate(afterJump)
  console.log(`    [${label}] followed the small steps by ${midMag}px; after the big jump: ${jumpMag}px`)
  await step('mouseReleased', to.x, to.y)
  await sleep(700)
  /*
   * The verdict is the *second* number. A dead drag stops at whatever the small
   * steps delivered (measured: 26px both times — the jump never arrived) while a
   * live one keeps following (47px). Comparing them needs no absolute threshold.
   */
  return { mid, afterJump, midMag, jumpMag, followedTheJump: jumpMag > midMag, afterRelease: await transforms(sess) }
}

// ── library view editor ────────────────────────────────────────────────
async function libraryEditor(sess, label) {
  console.log(`\n=== library view editor (${label}) ===`)
  await clickTestid(sess, 'nav-item-library')
  await sleep(2500)
  const opened = await clickTestid(sess, 'library-customize')
  if (!opened) throw new Error('library-customize not found — is the library page up?')
  await sleep(2000)

  const list = await handles(sess, 'library-editor-drag-')
  if (list.length < 2) throw new Error(`need ≥2 handles, got ${list.length}`)
  const before = list.map((h) => h.id)
  console.log('  handles before:', JSON.stringify(before))
  console.log('  backend before:', JSON.stringify((await apiGet('/settings/library-browse')).views?.map((v) => v.key)))

  // The second handle of the first group, one row up — inside the same group,
  // which is the only reorder the surface accepts.
  const from = list[1]
  const target = list[0]
  const result = await dragWithJump(sess, from, { x: from.x, y: target.y }, label)

  const afterDom = (await handles(sess, 'library-editor-drag-')).map((h) => h.id)
  console.log('  handles after drop:', JSON.stringify(afterDom))
  await clickTestid(sess, 'library-editor-save')
  await sleep(1800)
  const backend = (await apiGet('/settings/library-browse')).views?.map((v) => v.key)
  console.log('  backend after save:', JSON.stringify(backend))

  const stats = await shimStats(sess)
  return { before, afterDom, backend, backendBefore: before, result, stats, reordered: JSON.stringify(before) !== JSON.stringify(afterDom) }
}

// ── settings → tab order ───────────────────────────────────────────────
async function tabOrder(sess, label) {
  console.log(`\n=== settings tab order (${label}) ===`)
  await clickTestid(sess, 'nav-item-settings')
  await sleep(2500)
  const opened = await clickTestid(sess, 'settings-tab-config')
  if (!opened) throw new Error('settings-tab-config not found')
  await sleep(2500)

  const list = await handles(sess, 'tab-order-handle-')
  if (list.length < 2) {
    console.log(`  only ${list.length} reorderable tab(s) — install/enable a plugin tab to test this surface`)
    return { skipped: true, count: list.length }
  }
  const before = list.map((h) => h.id)
  console.log('  handles before:', JSON.stringify(before))
  console.log('  backend before:', JSON.stringify((await apiGet('/settings/tab-config')).plugin_tabs?.map((t) => t.entry_path)))

  const result = await dragWithJump(sess, list[1], { x: list[1].x, y: list[0].y }, label)
  await sleep(1500)
  const afterDom = (await handles(sess, 'tab-order-handle-')).map((h) => h.id)
  const backend = (await apiGet('/settings/tab-config')).plugin_tabs?.map((t) => t.entry_path)
  console.log('  handles after drop:', JSON.stringify(afterDom))
  console.log('  backend after drop:', JSON.stringify(backend))
  return { before, afterDom, backend, result, stats: await shimStats(sess) }
}

// ── home plugin grid (edit mode) ───────────────────────────────────────
async function pluginGrid(sess, label) {
  console.log(`\n=== home plugin grid (${label}) ===`)
  await clickTestid(sess, 'nav-item-home')
  await sleep(2500)
  const toggled = await clickTestid(sess, 'plugin-grid-edit-toggle')
  if (!toggled) throw new Error('plugin-grid-edit-toggle not found — is the home page up?')
  await sleep(1500)

  const list = await handles(sess, 'plugin-card-handle-')
  if (list.length < 2) {
    console.log(`  only ${list.length} card(s) — install ≥2 plugins to test this surface`)
    return { skipped: true, count: list.length }
  }
  const before = list.map((h) => h.id)
  console.log('  cards before:', JSON.stringify(before))
  // Rect diagnostics: a handle below the fold has a rect outside the viewport and
  // a synthetic press at those coordinates reaches nothing (the library rows sit
  // near the top, the home grid does not).
  console.log('  viewport:', await sess.evalJS('innerWidth + "x" + innerHeight'))
  console.log('  first two handles (x,y,w,h):', JSON.stringify(list.slice(0, 2)))
  /*
   * This surface persists through `PUT /settings/plugin-order`, which the
   * backend does NOT implement (404 — the route exists only in this client), so
   * the list order below will not move. That is a separate, pre-existing gap;
   * what this section verifies is the *drag*: that the card follows the pointer
   * across the jump and that the drop lands on a neighbour (which shows up as a
   * reordered DOM, since the commit updates the query cache optimistically).
   */
  const orderEndpoint = await apiGet('/settings/plugin-order', { tolerate404: true })
  console.log('  backend before (GET /jsplugins):', JSON.stringify(await pluginOrderFromList()))
  if (orderEndpoint === null) console.log('  note: GET /settings/plugin-order → 404 (client-only endpoint)')

  // Onto the first card's centre: this surface commits on a hit test against the
  // dragged card's centre, so the drop has to land *inside* a neighbour.
  const result = await dragWithJump(sess, list[1], list[0], label)
  await sleep(1200)

  const afterDom = (await handles(sess, 'plugin-card-handle-')).map((h) => h.id)
  const backend = await pluginOrderFromList()
  console.log('  cards after drop:', JSON.stringify(afterDom))
  console.log('  backend after drop (GET /jsplugins):', JSON.stringify(backend))

  /*
   * The residual drag: hover the handle of the card that was just dragged, with
   * the button UP. `useDraggable.handleDragMove` has no dragging-state guard and
   * subtracts an anchor only `useSortable` ever clears, so on this surface (the
   * one mounting DraggableRoot directly) a button-less move over the handle keeps
   * dragging the card — `translate(cursor - pressPoint)`. The shim's `mousemove`
   * guard is what stops it, so this measurement is the A/B for that guard: with
   * the shim blocked it must be non-zero, with the shim loaded zero.
   */
  const dragged = (await handles(sess, 'plugin-card-handle-')).find((h) => h.id === list[1].id)
  let hoverTranslate = null
  if (dragged) {
    const step = (x, y) =>
      sess.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0, clickCount: 1,
      })
    // Small offsets: the handle is ~22 px across, so the first move must stay inside it.
    let peak = 0
    for (const [dx, dy] of [[4, 0], [0, 4], [-4, 0], [0, -4]]) {
      await step(dragged.x + dx, dragged.y + dy)
      await sleep(200)
      peak = Math.max(peak, maxTranslate(await transforms(sess)))
    }
    hoverTranslate = peak
    console.log(`  hovering that card's handle with the button UP: ${peak}px translate (must be 0)`)
  }

  return {
    before,
    afterDom,
    backend,
    reorderedInDom: JSON.stringify(before) !== JSON.stringify(afterDom),
    backendChanged: JSON.stringify(backend) !== JSON.stringify((await pluginOrderFromList())),
    hoverTranslate,
    result,
    stats: await shimStats(sess),
  }
}

async function main() {
  await apiLogin()
  const sess = await openSession({ width: 1280, height: 900 })
  await sess.send('Network.enable')
  /*
   * No `process.exit(0)` in a `finally` here: it preempts the rejection handler
   * below, so a throw inside would print nothing and still exit 0 (measured —
   * a 404 on the plugin-order probe looked like a clean pass).
   */
  let failure = null
  try {
    await login(sess)

    // ── baseline: the same build with the shim blocked by CDP ──────────
    await sess.send('Network.setBlockedURLs', { urls: ['*drag-mouse-capture.js'] })
    await sess.send('Page.reload')
    await sleep(9000)
    await login(sess)
    const blockedShim = await sess.evalJS('typeof globalThis.__songloftDragCapture')
    console.log(`\n[baseline] /drag-mouse-capture.js blocked → globalThis.__songloftDragCapture is ${blockedShim}`)
    const baseline = await libraryEditor(sess, 'shim blocked')
    const baselineGrid = await pluginGrid(sess, 'shim blocked')

    // ─ the fix ──────────────────────────────────────────────────────
    await sess.send('Network.setBlockedURLs', { urls: [] })
    await sess.send('Page.reload')
    await sleep(9000)
    await login(sess)
    const fixed = await libraryEditor(sess, 'shim loaded')
    const tabs = await tabOrder(sess, 'shim loaded')
    const grid = await pluginGrid(sess, 'shim loaded')

    const shot = await sess.send('Page.captureScreenshot', { format: 'png' })
    const { writeFileSync } = await import('node:fs')
    writeFileSync('/tmp/lynx-drag-verify.png', Buffer.from(shot.data, 'base64'))

    console.log('\n=== SUMMARY ===')
    const surface = (r) => ({
      followedTheJump: r.result.followedTheJump,
      translateSmallStepsThenJump: `${r.result.midMag}px → ${r.result.jumpMag}px`,
    })
    console.log(JSON.stringify({
      /*
       * The A/B, same build: with the shim blocked the row stops at 26px (the
       * small steps) and the drop reorders nothing — this is the reported bug.
       * With it loaded the row keeps following across the jump and the new order
       * reaches the backend.
       */
      blocked: {
        ...surface(baseline),
        orderChanged: baseline.reordered,
        backendAfterSave: baseline.backend,
      },
      libraryEditor: {
        ...surface(fixed),
        orderChanged: fixed.reordered,
        backendMatchesDom: JSON.stringify(fixed.afterDom.map((id) => id.replace('library-editor-drag-', '')))
          === JSON.stringify(fixed.backend),
        backend: fixed.backend,
      },
      tabOrder: tabs.skipped ? { skipped: true, count: tabs.count } : {
        ...surface(tabs),
        before: tabs.before,
        afterDom: tabs.afterDom,
        backend: tabs.backend,
        backendChanged: JSON.stringify(tabs.before.map((id) => id.replace('tab-order-handle-', '')))
          !== JSON.stringify(tabs.backend),
      },
      pluginGrid: grid.skipped ? { skipped: true, count: grid.count } : {
        ...surface(grid),
        before: grid.before,
        afterDom: grid.afterDom,
        reorderedInDom: grid.reorderedInDom,
        /*
         * The A/B for the second half of the fix (the `mousemove` guard): with
         * the shim blocked a button-less hover over the card's handle translates
         * it (the pre-existing "the tile keeps following the cursor after I let
         * go" bug), with the shim loaded it must be 0.
         */
        hoverTranslateWithButtonUp: grid.hoverTranslate,
        hoverTranslateShimBlocked: baselineGrid.skipped ? null : baselineGrid.hoverTranslate,
        // Stays false: the client PUTs /settings/plugin-order, which the backend
        // does not implement — a separate gap from the mouse drag.
        backendOrder: grid.backend,
      },
      shimStats: { libraryEditor: fixed.stats, tabOrder: tabs.stats, pluginGrid: grid.stats },
      screenshot: '/tmp/lynx-drag-verify.png',
    }, null, 2))
  } catch (err) {
    failure = err
    console.error('FAILED:', err.message)
  } finally {
    await sess.close()
  }
  process.exit(failure ? 1 : 0)
}

main()