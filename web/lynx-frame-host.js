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

  var childView = null
  var childFrameId = null
  var resizeObs = null
  var placeholderEl = null

  function findPlaceholder(selector) {
    if (!selector) return null
    var root = lynxView.shadowRoot
    if (!root) return null
    return root.querySelector(selector)
  }

  function placeChild() {
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

  function destroyChild() {
    if (resizeObs) { resizeObs.disconnect(); resizeObs = null }
    if (childView && childView.parentNode) childView.parentNode.removeChild(childView)
    childView = null
    childFrameId = null
    placeholderEl = null
  }

  // ── bridge module for the child ──

  /**
   * When the child <lynx-view>'s worker calls NativeModules.SongloftPluginBridge.hostCall,
   * it routes through onNativeModulesCall. We intercept it and forward to the parent.
   */
  function handleChildModuleCall(name, data) {
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
    } else if (name === 'registerChild') {
      childFrameId = data[0]
    }
    // registerHost, unregisterHost, hostReply, pushToChild are parent-only
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
      if (!bundleUrl) return

      destroyChild()

      childView = document.createElement('lynx-view')
      childView.style.display = 'none' // hidden until placement resolves

      // Configure the bridge module — the child's SongloftPluginBridge calls
      // route through onNativeModulesCall below.
      childView.nativeModulesMap = {
        SongloftPluginBridge: '/songloft-lynx-bridge-module.js',
      }
      childView.onNativeModulesCall = function (name, data, moduleName) {
        if (moduleName === 'SongloftPluginBridge') {
          handleChildModuleCall(name, data)
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

      startFollowing(selector)
    },

    /**
     * updateGlobalProps(json) — push new globalProps to the child.
     */
    updateGlobalProps: function (args) {
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
      if (!childView) return
      var callId = args[0]
      var resultJson = args[1]
      try {
        childView.sendGlobalEvent('SongloftPluginBridge.hostReply', [{ callId: callId, result: resultJson }])
      } catch (_) {}
    },

    close: function () {
      destroyChild()
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
