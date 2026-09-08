/**
 * `NativeModules.SongloftLynxFrame` for the Web target — manages nested
 * <lynx-view> plugin frames from the parent worker.
 *
 * Same pattern as songloft-webview-module.js: ESM factory imported by web-core
 * in the background worker, methods forward through `call` to lynx-frame-host.js.
 */

export default function (_nativeModules, call) {
  return {
    /**
     * Create (or re-show) a nested <lynx-view> with the given bundle URL.
     * @param bundleUrl URL to the .web.bundle
     * @param selector CSS selector for the placeholder in lynx-view's shadow root
     * @param globalPropsJson JSON string of initial globalProps for the child
     * @param key the plugin's `entryPath` — what the main thread keeps children
     *   alive by, so re-entering a plugin tab reuses its worker instead of
     *   booting a second one
     */
    open(bundleUrl, selector, globalPropsJson, key) {
      void call('open', [bundleUrl, selector || '', globalPropsJson || '{}', typeof key === 'string' ? key : ''])
    },

    /**
     * Leave the plugin page without detaching the child.
     *
     * This — not `close` — is what a tab switch does: detaching a plugin frame is
     * what crashed the renderer (error code 11), and a <lynx-view> detach also
     * starts an async dispose that a same-tick recreate would race. See
     * docs/archive/web-plugin-tab-crash.md.
     */
    hide(key) {
      void call('hide', [typeof key === 'string' ? key : ''])
    },

    /** Update the child's globalProps (merge, not replace). */
    updateGlobalProps(json) {
      void call('updateGlobalProps', [json])
    },

    /** Send a global event to the child frame. */
    sendEvent(name, dataJson) {
      void call('sendEvent', [name, dataJson])
    },

    /** Deliver a host-call reply to the child. */
    hostReply(callId, resultJson) {
      void call('hostReply', [callId, resultJson])
    },

    /**
     * Real teardown — the plugin is gone (disabled / uninstalled / updated) or
     * the session ended. Detaching is the only way to release a <lynx-view>, so
     * the host waits out its async dispose before that key can be recreated.
     * Omit `key` to release every child, which is the logout case.
     */
    close(key) {
      void call('close', [typeof key === 'string' ? key : ''])
    },
  }
}
