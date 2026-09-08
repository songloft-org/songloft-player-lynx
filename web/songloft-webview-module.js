/*
 * `NativeModules.SongloftWebview` for the Web target — the in-app plugin iframe.
 *
 * Why this exists: `<webview>` is absent from web-core's LYNX_TAG_TO_HTML_TAG_MAP,
 * so the element the native builds render has no Web implementation — it lands in
 * the DOM as an unknown element that does nothing. The plugin page therefore has
 * to be an iframe created on the **main thread** (the worker realm has no
 * `document`), which is also how the Flutter Web build embeds plugins
 * (`plugin_tab_page_stub.dart`): an iframe positioned over the app, talking to
 * the host over postMessage.
 *
 * Same shape as the sibling modules: `nativeModulesMap`'s values are ESM URLs,
 * imported inside the background worker, and the default export is a factory
 * `(nativeModules, call) => module`. Every method forwards through `call` and
 * lands in `webview-host.js`, which owns the iframe element.
 *
 * All three are fire-and-forget writes, like the navigation module: the iframe's
 * own messages (plugin host calls) and lifecycle notices come back the other way
 * as `sendGlobalEvent`s — see `SongloftWebview.message` / `.openFailed` in
 * `src/native/web-webview.ts`.
 */

export default function (_nativeModules, call) {
  return {
    /**
     * Create (or reuse) the iframe and point it at the plugin page.
     *
     * `selector` names the placeholder view (an id inside lynx-view's shadow
     * root, e.g. `#plugin-webview-frame`); the main thread locates it and keeps
     * the iframe glued to its live box (ResizeObserver + resize), so the
     * worker never measures and no rect can go stale. An empty/unknown
     * selector eventually reports back as `SongloftWebview.openFailed`.
     */
    open(url, selector, key) {
      void call('open', [
        url,
        typeof selector === 'string' ? selector : '',
        typeof key === 'string' ? key : '',
      ])
    },

    /**
     * Leave the plugin page without destroying it.
     *
     * This — not `close` — is what a tab switch does. Detaching the frame is
     * what crashed the renderer (error code 11); `hide` keeps the document
     * alive and off screen, so re-entering the plugin restores its state
     * instead of reloading it. See `webview-host.js` and
     * docs/archive/web-plugin-tab-crash.md.
     */
    hide(key) {
      void call('hide', [typeof key === 'string' ? key : ''])
    },

    /**
     * Deliver one message into the plugin page.
     *
     * JSON string rather than a raw object: the round trip normalises the value
     * to plain JSON (no Date/class instances surviving structured clone), which
     * is the shape the plugin SDK's `common.js` expects — same convention as the
     * native side's eval-based postMessage.
     */
    postMessage(json) {
      void call('postMessage', [json])
    },

    /**
     * Real teardown — the plugin is gone (disabled / uninstalled / updated) or
     * the session ended. Releases the plugin document; the empty frame element
     * stays attached on purpose (detaching it is the crash). Omit `key` to
     * release every plugin, which is the logout case. Safe when none is open.
     */
    close(key) {
      void call('close', [typeof key === 'string' ? key : ''])
    },
  }
}
