/*
 * `NativeModules.SongloftVideo` for the Web target.
 *
 * The worker feeds the method names through the native-module bag to the shared TS
 * facade (`src/native/video.ts`), which Promisifies callback-style methods. This
 * factory therefore implements the same callback shape: each method forwards to
 * the main thread via `call` and hands the returned JSON string straight to the
 * callback.
 *
 * The picture itself is a main-thread `<video>` owned by `audio-host.js` — this
 * file never touches `document`, and the JS page (`FullVideoPage`) still owns every
 * control above the surface.
 *
 * ⚠️ Must expose **every** method the facade's `NativeVideoModule` interface lists.
 * `readNativeVideo()` refuses any partial module (a missing method → null adapter
 * → `open()` returns `'failed'` forever). If you add a method to `video.ts`, add
 * a shim here in the same change.
 */

function forward(call, name) {
  return function (_argsJson, callback) {
    call(name, [_argsJson || '{}']).then(
      function (res) { callback(typeof res === 'string' ? res : '{}') },
      function (err) { callback(JSON.stringify({ error: String((err && err.message) || err) })) },
    )
  }
}

export default function (_nativeModules, call) {
  return {
    open: forward(call, 'open'),
    close: forward(call, 'close'),
    isOpen: forward(call, 'isOpen'),
    setSurfaceLayout: forward(call, 'setSurfaceLayout'),
    setOrientation: forward(call, 'setOrientation'),
    getVideoSize: forward(call, 'getVideoSize'),
  }
}
