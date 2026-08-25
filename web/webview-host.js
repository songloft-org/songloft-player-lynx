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

  var iframe = null

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
    if (!iframe || !followTarget) return
    var rect = followTarget.getBoundingClientRect()
    if (!(rect.width > 0) || !(rect.height > 0)) return
    var base = lynxView.getBoundingClientRect()
    iframe.style.left = (rect.left - base.left) + 'px'
    iframe.style.top = (rect.top - base.top) + 'px'
    iframe.style.width = rect.width + 'px'
    iframe.style.height = rect.height + 'px'
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
    if (!iframe) return
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
        if (iframe) startFollowing(selector, attempt + 1)
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
    if (iframe) placeFromElement()
  }

  function ensureIframe() {
    if (iframe) return iframe
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
    iframe = el
    return el
  }

  function destroyIframe() {
    if (!iframe) return
    stopFollowing()
    var el = iframe
    iframe = null
    el.src = 'about:blank'
    el.remove()
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
      if (!url) return
      stopFollowing()
      var el = ensureIframe()
      if (el.src !== url) el.src = url
      startFollowing(typeof selector === 'string' ? selector : '', 0)
    },

    postMessage: function (args) {
      var win = iframe && iframe.contentWindow
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

    close: function () {
      destroyIframe()
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
