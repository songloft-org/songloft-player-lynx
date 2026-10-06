/*
 * `NativeModules.SongloftPlatform` for the Web target.
 *
 * This file is what `nativeModulesMap` actually wants. web-core's
 * `createNativeModules` does:
 *
 *     import(moduleStr).then(m => modules[name] = m.default?.(nativeModules, call))
 *
 * — the map's **values are ESM URLs**, imported inside the background worker, and
 * the default export is a factory. `audio-host.js` used to put plain objects in
 * that map instead, so every entry was `import("[object Object]")`: the import
 * rejected, `Promise.all` rejected, and `NativeModules` ended up with nothing but
 * web-core's own `bridge` / `LynxExposureModule`. That is why the file picker
 * reported "SongloftPlatform native module not available" on Web and why the
 * clipboard write silently did nothing.
 *
 * Because the factory runs in the **worker**, nothing here may touch `document` /
 * `window` / `navigator`. Every method forwards to the main thread through `call`,
 * which surfaces there as `lynxView.onNativeModulesCall(name, data, moduleName)`
 * — see `audio-host.js`.
 */

export default function (_nativeModules, call) {
  return {
    setPlaybackShortcuts(state) { void call('setPlaybackShortcuts', [state]).catch(() => {}) },
    pickTextFile(options, callback) {
      call('pickTextFile', [options]).then(
        res => callback(res?.error ?? null, res?.body ?? null),
        () => callback('file_transfer_failed', null),
      )
    },
    saveTextFile(options, callback) {
      call('saveTextFile', [options]).then(
        res => callback(res?.error ?? null),
        () => callback('file_transfer_failed'),
      )
    },
    cancelTextFile() { void call('cancelTextFile', []).catch(() => {}) },
    openURL(url) {
      void call('openURL', [url])
    },

    setClipboard(text) {
      void call('setClipboard', [text]).catch(() => {})
    },

    setClipboardWithResult(text, callback) {
      call('setClipboardWithResult', [text]).then(
        result => callback(result?.error === null ? null : 'clipboard_failed'),
        () => callback('clipboard_failed'),
      )
    },

    setInsecureTls(_enabled) {
      // No-op on Web — the browser owns certificate trust.
    },

    /**
     * Lynx's callback convention is `(error, result)`, while the RPC gives back a
     * promise, so the adaptation happens here rather than in the TS facade (which
     * is shared with the native hosts and must not know about Web).
     */
    pickAndUploadFile(uploadUrl, fieldName, mimeType, callback) {
      call('pickAndUploadFile', [uploadUrl, fieldName, mimeType]).then(
        (res) => {
          const out = res || {}
          callback(out.error ?? null, out.body ?? null)
        },
        (err) => callback(String((err && err.message) || err || 'upload failed'), null),
      )
    },

    /**
     * Hand a base64-encoded file to the user. On native this is the OS share
     * sheet; on Web the main thread decodes it and triggers a browser download
     * (there is no share sheet here). Same callback adaptation as
     * `pickAndUploadFile`.
     */
    shareFile(base64, fileName, mimeType, callback) {
      call('shareFile', [base64, fileName, mimeType]).then(
        (res) => {
          const out = res || {}
          callback(out.error ?? null)
        },
        (err) => callback(String((err && err.message) || err || 'share failed')),
      )
    },
  }
}
