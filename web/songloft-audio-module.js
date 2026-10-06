/*
 * `NativeModules.SongloftAudio` for the Web target.
 *
 * Same contract as `songloft-platform-module.js`: web-core imports this ESM URL in
 * the background worker and calls the default export as a factory. Every method is
 * fire-and-forget on the native side (see `NativeSongloftAudio`), so each one just
 * forwards its arguments to the main thread through `call`, which surfaces there as
 * `lynxView.onNativeModulesCall(name, data, 'SongloftAudio')` — dispatched to the
 * real `HTMLAudioElement` adapter in `audio-host.js`.
 *
 * Playback events (progress / state / error) do NOT come back through this module;
 * `audio-host.js` emits them with `lynxView.sendGlobalEvent`, the standard Lynx
 * event channel that `NativeSongloftAudio` already listens on. So this file only
 * has to carry the worker→main method calls.
 */

var METHODS = [
  'load',
  'play',
  'pause',
  'stop',
  'seek',
  'setVolume',
  'setSpeed',
  'setQueue',
  'next',
  'previous',
  'setRepeatMode',
  'setShuffle',
  'setFavorite',
  'setEqualizerEnabled',
  'setEqualizerBand',
  'updateNotificationLyric',
  'dispose',
]

export default function (_nativeModules, call) {
  var module = {}
  module.getSourceLoadVersion = function (callback) {
    call('getSourceLoadVersion', []).then(function (version) { callback(version) }, function () { callback(0) })
  }
  for (var i = 0; i < METHODS.length; i++) {
    (function (name) {
      module[name] = function () {
        // `arguments` is the exact arg list the native method expects; relay it
        // positionally so `load(url, opts)` / `setEqualizerBand(index, gain)` etc.
        // arrive unchanged.
        void call(name, Array.prototype.slice.call(arguments))
      }
    })(METHODS[i])
  }
  return module
}
