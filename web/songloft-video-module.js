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
 */

export default function (_nativeModules, call) {
  return {
    open(_argsJson, callback) {
      call('open', ['{}']).then(
        (res) => callback(typeof res === 'string' ? res : '{}'),
        (err) => callback(JSON.stringify({ error: String((err && err.message) || err) })),
      )
    },

    close(_argsJson, callback) {
      call('close', ['{}']).then(
        (res) => callback(typeof res === 'string' ? res : '{}'),
        (err) => callback(JSON.stringify({ error: String((err && err.message) || err) })),
      )
    },

    isOpen(_argsJson, callback) {
      call('isOpen', ['{}']).then(
        (res) => callback(typeof res === 'string' ? res : '{}'),
        (err) => callback(JSON.stringify({ error: String((err && err.message) || err) })),
      )
    },
  }
}