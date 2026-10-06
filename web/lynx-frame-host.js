/**
 * Main-thread host for nested <lynx-view> plugin frames (Web platform).
 *
 * When a plugin declares renderEngine: "lynx", the app renders a <frame> element
 * which web-core maps to a nested <lynx-view>. However, the nested <lynx-view>
 * needs explicit nativeModulesMap configuration for the plugin bridge to work.
 *
 * This script manages:
 *  - Creating/destroying the nested <lynx-view> with proper bridge modules
 *  - Forwarding child→parent host calls via sendGlobalEvent
 *  - Receiving parent→child pushes and forwarding to the child
 *
 * Loaded as a classic script in web/index.html, AFTER webview-host.js.
 */

(function () {
  'use strict'

  var lynxView = document.getElementById('app')
  if (!lynxView) return

  function sendEvent(name, data) {
    try {
      lynxView.sendGlobalEvent(name, [data])
    } catch (_) {}
  }

  // ── child <lynx-view> lifecycle ──

  /*
   * One nested <lynx-view> per plugin, kept attached across tab switches.
   *
   * Same crash as the iframe path (`webview-host.js`): detaching a plugin frame
   * is what takes the renderer down with error code 11 / SIGSEGV. Leaving a
   * plugin tab used to `removeChild` the child view, so tab switching became a
   * detach on every trip. Now it only hides.
   *
   * Unlike an iframe there is no `about:blank` escape here: web-core's
   * `#render()` bails out when `url` is falsy (`LynxView.js`), so clearing the
   * url does NOT dispose the instance — detaching is the ONLY way to release a
   * <lynx-view>. So `close` still detaches, and that is exactly where the second
   * bug lives: `disconnectedCallback` → `#disposeInstance()` is **async** (it
   * awaits the instance's `Symbol.asyncDispose` before tearing down the worker
   * and the iframe realm) and `#disposePromise` is private, so the old code's
   * `removeChild` + immediate `createElement('lynx-view')` stacked a new worker,
   * WASM instance and realm on top of one still going down. {@link awaitDisposed}
   * closes that race by waiting for the observable end of dispose before this
   * key may be recreated.
   *
   * Note web-core already awaits its own dispose when the SAME element's url
   * changes (`#render` → `if (this.#instance || this.#disposePromise) await
   * this.#disposeInstance()`), so reusing an element is safe without help.
   */
  var childViews = Object.create(null)
  var activeKey = null
  var pushReady = Object.create(null)
  var pageVisible = document.visibilityState !== 'hidden'

  function resumeChild(key) {
    if (key !== activeKey || !pushReady[key] || document.visibilityState === 'hidden') return
    var child = childViews[key]
    if (!child) return
    try {
      child.sendGlobalEvent('SongloftPluginBridge.push', [{ event: 'lifecycle', data: JSON.stringify({ state: 'resumed' }) }])
    } catch (_) {}
  }

  document.addEventListener('visibilitychange', function () {
    var visible = document.visibilityState !== 'hidden'
    if (visible && !pageVisible && activeKey !== null) resumeChild(activeKey)
    pageVisible = visible
  })
  /*
   * Monotonic token for lifecycle commands (open / hide / close).
   *
   * Creating a child can have to WAIT (see `awaitDisposed`), and anything the
   * user does in the meantime must win. Without this, `close(A)` → `open(A)` →
   * switch to B would put A back on screen the moment A's old instance finished
   * disposing, on top of B. Every async creation captures the token and gives up
   * if a newer command has arrived.
   */
  var lifecycleSeq = 0
  /** key → promise resolving once a detached child finished disposing. */
  var pendingDispose = Object.create(null)
  var resizeObs = null
  var placeholderEl = null

  function activeChild() {
    return activeKey == null ? null : childViews[activeKey] || null
  }

  /**
   * Wait for a detached <lynx-view> to finish its async dispose.
   *
   * The only public signal: `#disposeInstance` ends by emptying the element's
   * shadow root (`shadowRoot.innerHTML = ''`), after the instance's
   * `Symbol.asyncDispose` has resolved. An element that never rendered has no
   * shadow root and is already done. Capped so a web-core change that stops
   * clearing the root degrades to "recreate anyway" rather than hanging the tab.
   */
  function awaitDisposed(el) {
    var deadline = Date.now() + 2000
    return new Promise(function (resolve) {
      function check() {
        var root = el.shadowRoot
        if (!root || root.innerHTML === '' || Date.now() > deadline) {
          resolve()
          return
        }
        setTimeout(check, 16)
      }
      check()
    })
  }

  function findPlaceholder(selector) {
    if (!selector) return null
    var root = lynxView.shadowRoot
    if (!root) return null
    return root.querySelector(selector)
  }

  function placeChild() {
    var childView = activeChild()
    if (!childView || !placeholderEl) return
    var hostRect = lynxView.getBoundingClientRect()
    var rect = placeholderEl.getBoundingClientRect()
    childView.style.position = 'fixed'
    childView.style.left = (rect.left - hostRect.left) + 'px'
    childView.style.top = (rect.top - hostRect.top) + 'px'
    childView.style.width = rect.width + 'px'
    childView.style.height = rect.height + 'px'
    childView.style.display = 'block'
    childView.style.zIndex = '50'
  }

  function startFollowing(selector) {
    placeholderEl = findPlaceholder(selector)
    if (!placeholderEl) {
      // Retry after a short delay (element may not be in DOM yet)
      setTimeout(function () {
        placeholderEl = findPlaceholder(selector)
        if (placeholderEl) {
          placeChild()
          startResizeObs()
        } else {
          sendEvent('SongloftLynxFrame.openFailed', { reason: 'placeholder not found: ' + selector })
        }
      }, 500)
      return
    }
    placeChild()
    startResizeObs()
  }

  function startResizeObs() {
    if (!placeholderEl) return
    if (resizeObs) resizeObs.disconnect()
    resizeObs = new ResizeObserver(function () { placeChild() })
    resizeObs.observe(placeholderEl)
  }

  /** Take a child off screen; its worker, realm and state all keep running. */
  function hideChild(key) {
    var el = childViews[key]
    if (!el) return
    if (activeKey === key) {
      if (resizeObs) { resizeObs.disconnect(); resizeObs = null }
      placeholderEl = null
      activeKey = null
    }
    el.style.display = 'none'
  }

  /**
   * Real teardown — plugin disabled / uninstalled / updated, or logout.
   *
   * Detaching is unavoidable for a <lynx-view> (see the note above), so this
   * records the dispose so `open` cannot race it.
   */
  function releaseChild(key) {
    var el = childViews[key]
    if (!el) return
    hideChild(key)
    delete childViews[key]
    delete pushReady[key]
    if (el.parentNode) el.parentNode.removeChild(el)
    pendingDispose[key] = awaitDisposed(el).then(function () {
      delete pendingDispose[key]
    })
  }

  // ── bridge module for the child ──

  /**
   * When the child <lynx-view>'s worker calls NativeModules.SongloftPluginBridge.hostCall,
   * it routes through onNativeModulesCall. We intercept it and forward to the parent.
   */
  function handleChildModuleCall(key, name, data) {
    // A child can finish loading after it has been hidden. Keep readiness so
    // re-entry can resume it, while still suppressing inactive business RPCs.
    if (name === 'hostCall' && data[2] === 'lifecycle' && data[3] === 'ready') {
      if (!pushReady[key]) {
        pushReady[key] = true
        resumeChild(key)
      }
      return
    }
    /*
     * Active child only. Kept-alive children keep running and can call at any
     * time, but their page is unmounted — and forwarding would hand one plugin's
     * host call to whichever plugin page IS mounted, and reply into that one.
     */
    if (key !== activeKey) return
    if (name === 'hostCall') {
      // data = [frameId, callId, ns, method, paramsJson]
      sendEvent('SongloftLynxFrame.message', {
        type: 'hostCall',
        frameId: data[0],
        callId: data[1],
        ns: data[2],
        method: data[3],
        params: data[4],
      })
    }
    /*
     * Everything else the child bridge can call — registerChild, registerHost,
     * unregisterHost, hostReply, pushToChild — is parent-only or needs nothing
     * from us. `registerChild`'s frameId used to be stored in a module variable
     * that nothing ever read; the child's identity travels in each `hostCall`
     * payload instead, so there was nothing to keep.
     */
  }

  // ── native module handlers (called by parent worker via call()) ──

  var frameHandlers = {
    /**
     * open(bundleUrl, selector, globalPropsJson)
     * Create nested <lynx-view>, set url + globalProps + bridge module.
     */
    open: function (args) {
      var bundleUrl = args[0]
      var selector = args[1]
      var globalPropsJson = args[2]
      var key = typeof args[3] === 'string' && args[3] ? args[3] : bundleUrl
      if (!bundleUrl) return
      var seq = ++lifecycleSeq

      // Whatever was on screen goes off screen — hidden, not detached.
      if (activeKey != null && activeKey !== key) hideChild(activeKey)

      var existing = childViews[key]
      if (existing) {
        // Re-entry into a kept-alive plugin: no new element, no new worker. Push
        // the current globalProps, and only re-point `url` if it really moved
        // (web-core awaits its own dispose in that path).
        if (globalPropsJson) {
          try {
            existing.globalProps = Object.assign({}, existing.globalProps || {}, JSON.parse(globalPropsJson))
          } catch (_) {}
        }
        if (existing.getAttribute('url') !== bundleUrl) existing.setAttribute('url', bundleUrl)
        activeKey = key
        startFollowing(selector)
        resumeChild(key)
        return
      }

      // A freshly released key may still be disposing — never stack a new worker
      // on top of one going down.
      var ready = pendingDispose[key] || Promise.resolve()
      return ready.then(function () {
        // Superseded while waiting: the user has since left this plugin or opened
        // another one. Creating now would show a stale plugin over the live one.
        if (seq !== lifecycleSeq) return
        var childView = document.createElement('lynx-view')
        childView.style.display = 'none' // hidden until placement resolves

        // Configure the bridge module — the child's SongloftPluginBridge calls
        // route through onNativeModulesCall below.
        childView.nativeModulesMap = {
          SongloftPluginBridge: '/songloft-lynx-bridge-module.js',
        }
        childView.onNativeModulesCall = function (name, data, moduleName) {
          if (childViews[key] !== childView) return undefined
          if (moduleName === 'SongloftPluginBridge') {
            handleChildModuleCall(key, name, data)
            return undefined
          }
          return undefined
        }

        // Set globalProps before url so the child sees them on first render
        if (globalPropsJson) {
          try { childView.globalProps = JSON.parse(globalPropsJson) } catch (_) {}
        }

        childView.setAttribute('url', bundleUrl)

        // Mount inside lynx-view's shadow root (same layer as the iframe approach)
        var root = lynxView.shadowRoot
        if (root) {
          root.appendChild(childView)
        } else {
          document.body.appendChild(childView)
        }

        childViews[key] = childView
        activeKey = key
        startFollowing(selector)
      })
    },

    /** Leave the plugin page — keep the child alive, just off screen. */
    hide: function (args) {
      lifecycleSeq++
      var key = typeof args[0] === 'string' && args[0] ? args[0] : activeKey
      if (key != null) hideChild(key)
    },

    /**
     * updateGlobalProps(json) — push new globalProps to the child.
     */
    updateGlobalProps: function (args) {
      var childView = activeChild()
      if (!childView) return
      try {
        var props = JSON.parse(args[0])
        childView.globalProps = Object.assign({}, childView.globalProps || {}, props)
      } catch (_) {}
    },

    /**
     * sendEvent(name, dataJson) — forward a global event to the child.
     */
    sendEvent: function (args) {
      var childView = activeChild()
      if (!childView) return
      var name = args[0]
      var dataJson = args[1]
      try {
        var data = JSON.parse(dataJson)
        childView.sendGlobalEvent(name, [data])
      } catch (_) {}
    },

    /**
     * hostReply(callId, resultJson) — deliver a host-call reply to the child.
     */
    hostReply: function (args) {
      var childView = activeChild()
      if (!childView) return
      var callId = args[0]
      var resultJson = args[1]
      try {
        childView.sendGlobalEvent('SongloftPluginBridge.hostReply', [{ callId: callId, result: resultJson }])
      } catch (_) {}
    },

    /**
     * Real teardown — the plugin is gone, or the session ended. No key releases
     * every child (the logout case).
     */
    close: function (args) {
      lifecycleSeq++
      var key = typeof args[0] === 'string' && args[0] ? args[0] : null
      if (key != null) {
        releaseChild(key)
        return
      }
      for (var k in childViews) releaseChild(k)
    },
  }

  // ── window resize tracking ──

  var resizeTimer = null
  window.addEventListener('resize', function () {
    if (resizeTimer != null) return
    resizeTimer = setTimeout(function () {
      resizeTimer = null
      placeChild()
    }, 150)
  })

  // ── registration ──

  lynxView.nativeModulesMap = Object.assign(
    {},
    lynxView.nativeModulesMap || {},
    {
      SongloftLynxFrame: '/songloft-lynx-frame-module.js',
    },
  )

  var previousCall = lynxView.onNativeModulesCall
  lynxView.onNativeModulesCall = function (name, data, moduleName) {
    if (moduleName === 'SongloftLynxFrame') {
      var handler = frameHandlers[name]
      if (handler) return handler(data || [])
      return undefined
    }
    return previousCall ? previousCall(name, data, moduleName) : undefined
  }
})()
