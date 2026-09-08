/**
 * Main-thread plugin iframe host for the Web platform.
 *
 * The app's business code runs inside web-core's background Worker, which has no
 * `document`, and `<webview>` has no Web implementation in web-core — so the
 * plugin page is an iframe THIS file creates on the main thread, positioned over
 * a placeholder element the app renders (the worker measures it with
 * `boundingClientRect` and forwards the rect through the module below). The
 * plugin talks to the host over `window.postMessage` — the same bridge the
 * Flutter Web build uses (plugin_tab_page_stub.dart) and the one the plugin SDK
 * (`common.js`) already speaks when it detects it is embedded (`window.parent !==
 * window`).
 *
 * Loaded as a classic script in web/index.html, AFTER audio-host.js (so the
 * nativeModulesMap merge below sees its entries) and BEFORE the web-core client
 * module (so the map is complete when <lynx-view> upgrades and imports the
 * module URLs).
 */

(function () {
  'use strict'

  var lynxView = document.getElementById('app')
  if (!lynxView) return

  /*
   * Same array contract as audio-host.js: web-core ends in
   * `listener.apply(ctx, params)`, so a plain object (no `length`) delivers zero
   * arguments and the listener sees `undefined`.
   */
  function sendEvent(name, data) {
    try {
      lynxView.sendGlobalEvent(name, [data])
    } catch (_) {}
  }

  // ── iframe lifecycle ──

  /*
   * One iframe per plugin, kept alive and NEVER detached.
   *
   * Detaching a cross-process plugin frame is what crashed the renderer
   * (error code 11 / SIGSEGV, `EXC_BAD_ACCESS` at a fixed `0xf8` offset):
   * leaving a plugin tab used to run `close()` → `remove()`, and with an
   * extension that injects into every frame (`all_frames: true` +
   * `match_about_blank`) plus DevTools open, Chrome dereferences a null in the
   * teardown path. Reproduced 15/15 with all three conditions present; drop any
   * one of them and it never fires (no extension 0/6, DevTools closed 0/8, frame
   * left attached 0/5). Removing only the `about:blank` assignment does NOT help
   * (3/3 still crash) — the detach itself is the trigger, so the rule here is
   * simply: never detach.
   * See docs/archive/web-plugin-tab-crash.md.
   *
   * The Flutter Web build reached the same fix from the same crash
   * (`clients/player` `32d8924`, Offstage-based keep-alive).
   *
   * Consequences we accept on purpose:
   *  - Keyed by plugin (`entryPath`), not by URL: the URL carries `?theme=` and
   *    `?access_token=`, so a URL key would strand a frame per theme flip and
   *    per re-login. Same key → the existing frame navigates.
   *  - The map never shrinks. `close()` tears the *document* down by navigating
   *    to `about:blank` and keeps the (now empty) element, because dropping the
   *    element means detaching it. An empty iframe costs a DOM node; a detach
   *    costs a renderer crash.
   *  - Only the active frame follows the placeholder and may talk to the host;
   *    hidden plugins keep running but their messages are ignored (their page is
   *    unmounted, so there is nobody to reply to — and delivering them to the
   *    page that IS mounted would cross plugin boundaries).
   */
  var frames = Object.create(null)
  var activeKey = null

  function activeFrame() {
    return activeKey == null ? null : frames[activeKey] || null
  }

  /*
   * Follow-the-placeholder placement.
   *
   * The worker names a selector (an id inside lynx-view's shadow root); THIS
   * thread finds the element and mirrors its live box onto the fixed iframe:
   *
   *   - The placeholder's `getBoundingClientRect()` is viewport-relative; the
   *     iframe's `position: fixed` containing block is **lynx-view itself**
   *     (paint containment — `contain: strict` — makes the host element the
   *     containing block for fixed descendants, verified by experiment), so
   *     the placement subtracts the lynx-view box's origin from the rect.
   *   - A ResizeObserver on the placeholder catches the two height changes a
   *     one-shot measurement cannot: the `--nav-inset` tier flipping when a
   *     song starts (80 → 148), and the wide↔narrow shell swap. Both previously
   * left the iframe covering the nav capsule / mini-player — the reported
   * "layering" bug — because nothing told the worker to re-measure.
   *   - window resize re-reads the box for position-only moves (an RO on the
   *     element itself only fires when its *size* changes).
   *
   * The iframe stays hidden until the first placement lands, so it can never
   * flash at (0,0) over unrelated UI.
   */
  var followTarget = null
  var followObserver = null
  var followTimer = null

  function placeFromElement() {
    var iframe = activeFrame()
    if (!iframe || !followTarget) return
    var rect = followTarget.getBoundingClientRect()
    if (!(rect.width > 0) || !(rect.height > 0)) return
    var base = lynxView.getBoundingClientRect()
    iframe.style.left = (rect.left - base.left) + 'px'
    iframe.style.top = (rect.top - base.top) + 'px'
    iframe.style.width = rect.width + 'px'
    iframe.style.height = rect.height + 'px'
    /*
     * Still the "first placement landed" marker, and now also what un-hides a
     * kept-alive frame on re-entry: `hide` sets `visibility: hidden`, and a
     * frame may only become visible once its rect is known good. Never show a
     * frame anywhere else.
     */
    iframe.style.visibility = 'visible'
  }

  function stopFollowing() {
    if (followObserver) {
      try { followObserver.disconnect() } catch (_) {}
      followObserver = null
    }
    if (followTimer != null) {
      clearTimeout(followTimer)
      followTimer = null
    }
    followTarget = null
  }

  /*
   * Locate the placeholder and start following it. The element lives in
   * lynx-view's shadow root, and the `open` call can beat web-core's element
   * flush there (the worker's effect fires before the main-thread DOM commit
   * lands), so a short poll covers the race instead of failing permanently:
   * ~100ms × 30 = 3s of grace, then the worker is told via `openFailed` and
   * falls back to the "unavailable" message.
   */
  function startFollowing(selector, attempt) {
    if (!activeFrame()) return
    var el = null
    try {
      var root = lynxView.shadowRoot
      el = root ? root.querySelector(selector) : null
    } catch (_) {}
    if (!el) {
      if (attempt >= 30) {
        sendEvent('SongloftWebview.openFailed', {})
        return
      }
      followTimer = setTimeout(function () {
        if (activeFrame()) startFollowing(selector, attempt + 1)
      }, 100)
      return
    }
    followTarget = el
    placeFromElement()
    try {
      followObserver = new ResizeObserver(placeFromElement)
      followObserver.observe(el)
    } catch (_) {
      // No RO (ancient browsers): the resize listener below still covers most
      // changes; a stale rect beats no iframe at all.
    }
  }

  function onWindowResize() {
    if (activeFrame()) placeFromElement()
  }

  function ensureIframe(key) {
    if (frames[key]) return frames[key]
    var el = document.createElement('iframe')
    el.style.position = 'fixed'
    el.style.border = 'none'
    el.style.background = 'transparent'
    el.style.visibility = 'hidden'
    /*
     * `credentialless` (Chrome 106+) exempts this cross-origin document from
     * the host page's COEP: require-corp — which otherwise demands the iframe's
     * *own* response carry a COEP header and blocks the load with
     * ERR_BLOCKED_BY_RESPONSE. The host page must keep COEP for web-core's
     * SharedArrayBuffer, and the plugin's auth travels in the URL token (not
     * cookies), so credentialless costs nothing here.
     *
     * This is the **fallback half** of a two-layer fix: the backend now sends
     * `Cross-Origin-Embedder-Policy: credentialless` on plugin HTML responses
     * (internal/jsplugin/routes.go), which Firefox 119+ only honours in header
     * form. The attribute covers Chromium against a backend older than that
     * change, and the two coexist harmlessly. Browsers supporting neither —
     * Safari — still cannot embed cross-origin here; the embedded deploy is
     * same-origin and needs neither layer.
     */
    el.setAttribute('credentialless', '')
    /*
     * Mount INSIDE lynx-view's shadow root, not on body — the whole reason
     * z-index works here at all. `contain: strict` makes lynx-view a stacking
     * context, so a body-level frame sits above EVERYTHING the app paints (the
     * More sheet at z-index 100 included) and can only be fought by hiding it,
     * which looks like the plugin vanishing behind the sheet's scrim. Inside
     * the shadow root the frame joins the app's own stacking context: page
     * content (z auto) stays under it, and the app's overlays paint over it —
     * the sheet's translucent scrim dims the plugin content, exactly like any
     * other page. Verified by experiment: web-core leaves foreign direct
     * children of the shadow root alone across navigations, and paint
     * containment both makes lynx-view the fixed containing block (see
     * `placeFromElement`) and clips the frame to the app's box — the app fills
     * the viewport, so that clip is invisible (and correct).
     *
     * z-index 50: above page content (auto/0), below every app overlay — nav
     * capsule 90, mini-player 91, sheets/popovers 100, dialogs 200/201. The
     * toast pill gets its own z-index (see ToastHost.css) because it lands
     * inside the frame's rect on plugin tabs.
     */
    el.style.zIndex = '50'
    el.addEventListener('load', function () {
      sendEvent('SongloftWebview.load', {})
    })
    ;(lynxView.shadowRoot || document.body).appendChild(el)
    frames[key] = el
    return el
  }

  /**
   * Take a frame off screen without touching its document — the keep-alive half
   * of the fix. The plugin keeps running (timers, sockets, scroll position); it
   * simply stops being placed, painted and hit-tested.
   */
  function hideFrame(key) {
    var el = frames[key]
    if (!el) return
    if (activeKey === key) {
      stopFollowing()
      activeKey = null
    }
    // `visibility: hidden` alone removes it from painting AND hit-testing, which
    // is why nothing here has to fight z-index or pointer-events.
    el.style.visibility = 'hidden'
  }

  /**
   * Release a plugin's document while keeping its (now empty) frame attached.
   *
   * This is the real teardown — plugin disabled, uninstalled, force-updated, or
   * the user logged out. Navigating to `about:blank` drops the plugin's JS,
   * timers and network; the element stays because detaching it is the crash (see
   * the note at the top of this section). The next `open` for the same key
   * navigates this frame back to the plugin.
   */
  function releaseFrame(key) {
    var el = frames[key]
    if (!el) return
    hideFrame(key)
    el.src = 'about:blank'
  }

  // ── plugin → host messages ──

  /*
   * Only accept messages from our own iframe (same reference check as the
   * Flutter build's `Object.is(source, iframe.contentWindow)`): the page has
   * other postMessage traffic (web-core's `lynx:mtsready`, diagnostics), and a
   * plain `e.data.type` filter alone would let any other frame's `songloft-*`
   * message forge a host call.
   */
  function onWindowMessage(e) {
    /*
     * The ACTIVE frame only. Kept-alive frames keep running and can post at any
     * time, but their page is unmounted (no handler, nobody to reply to), and
     * forwarding them while another plugin is on screen would hand plugin A's
     * host call to plugin B's page — and reply into B.
     */
    var iframe = activeFrame()
    if (!iframe || e.source !== iframe.contentWindow) return
    var data = e.data
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return
    sendEvent('SongloftWebview.message', data)
  }
  window.addEventListener('message', onWindowMessage)

  // ── viewport changes ──

  /*
   * Debounced: a resize storm must not re-read the placeholder box per event.
   * The placement itself is re-read from the live element (see
   * `placeFromElement`), so this only has to re-trigger it.
   */
  var resizeTimer = null
  window.addEventListener('resize', function () {
    if (resizeTimer != null) return
    resizeTimer = setTimeout(function () {
      resizeTimer = null
      onWindowResize()
    }, 150)
  })

  // ── native module handlers ──

  var webviewHandlers = {
    /*
     * `open(url, selector)` — the selector names the placeholder inside
     * lynx-view's shadow root; placement and following are decided here (see
     * `startFollowing`), the worker never measures anything.
     */
    open: function (args) {
      var url = args[0]
      var selector = args[1]
      var key = typeof args[2] === 'string' && args[2] ? args[2] : url
      if (!url) return
      // Whatever was on screen goes off screen — hidden, not destroyed.
      if (activeKey != null && activeKey !== key) hideFrame(activeKey)
      stopFollowing()
      var el = ensureIframe(key)
      activeKey = key
      /*
       * Only navigate when the URL actually changed. On re-entry to a
       * kept-alive plugin the URL is identical, so the document — and with it
       * the plugin's state — survives; the frame is merely placed and shown
       * again. A changed URL (new token after re-login, or the embed/pushed
       * variant of the same plugin) navigates this frame instead of stranding
       * a second one.
       */
      if (el.src !== url) el.src = url
      startFollowing(typeof selector === 'string' ? selector : '', 0)
    },

    /** Leave the plugin page — keep it alive, just off screen. */
    hide: function (args) {
      var key = typeof args[0] === 'string' && args[0] ? args[0] : activeKey
      if (key != null) hideFrame(key)
    },

    postMessage: function (args) {
      var el = activeFrame()
      var win = el && el.contentWindow
      if (!win) return
      var msg
      try {
        msg = JSON.parse(args[0])
      } catch (e) {
        return
      }
      // '*' is the only workable targetOrigin in the standalone deploy, where
      // the page origin differs from the backend serving the plugin.
      win.postMessage(msg, '*')
    },

    /**
     * Real teardown: the plugin is gone (disabled / uninstalled / force-updated)
     * or the session ended. Releases the document, keeps the empty frame.
     * With no key, releases every frame — the logout case.
     */
    close: function (args) {
      var key = typeof args[0] === 'string' && args[0] ? args[0] : null
      if (key != null) {
        releaseFrame(key)
        return
      }
      for (var k in frames) releaseFrame(k)
    },
  }

  // ── registration ──

  // Merge, never replace: audio-host.js has already registered its three
  // modules when this runs (script order in index.html guarantees it).
  lynxView.nativeModulesMap = Object.assign(
    {},
    lynxView.nativeModulesMap || {},
    {
      SongloftWebview: '/songloft-webview-module.js',
    },
  )

  // Chain onto audio-host.js's wrapper the same way it chains onto web-core's.
  var previousCall = lynxView.onNativeModulesCall
  lynxView.onNativeModulesCall = function (name, data, moduleName) {
    if (moduleName === 'SongloftWebview') {
      var handler = webviewHandlers[name]
      if (handler) return handler(data || [])
      return undefined
    }
    return previousCall ? previousCall(name, data, moduleName) : undefined
  }
})()
