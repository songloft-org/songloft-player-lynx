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
     * Create a nested <lynx-view> with the given bundle URL.
     * @param bundleUrl URL to the .web.bundle
     * @param selector CSS selector for the placeholder in lynx-view's shadow root
     * @param globalPropsJson JSON string of initial globalProps for the child
     */
    open(bundleUrl, selector, globalPropsJson) {
      void call('open', [bundleUrl, selector || '', globalPropsJson || '{}'])
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

    /** Destroy the nested <lynx-view>. */
    close() {
      void call('close', [])
    },
  }
}
