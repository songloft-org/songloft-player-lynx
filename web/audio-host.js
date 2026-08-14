/**
 * Main-thread audio host for the Web platform.
 *
 * Creates an HTMLAudioElement on the main thread and registers it as
 * `NativeModules.SongloftAudio` via the LynxView's nativeModulesMap. The worker
 * wraps it with NativeSongloftAudio — the same tested path used on Android/iOS
 * — so the player store gets real audio instead of the silent mock.
 *
 * This file is loaded as a classic script in web/index.html, BEFORE the
 * web-core client module, so nativeModulesMap is populated when the LynxView
 * initializes.
 *
 * Architecture:
 *   Worker (player-store) → NativeSongloftAudio → native module bridge
 *   → Main thread (this file) → HTMLAudioElement
 *   Events flow back: HTMLAudioElement → this file → sendGlobalEvent
 *   → Worker GlobalEventEmitter → NativeSongloftAudio → player-store
 *
 * The native module interface is fire-and-forget (void methods); the worker's
 * NativeSongloftAudio promisifies them. Events (stateChanged, progress, error)
 * travel back as Lynx global events.
 */

(function () {
  'use strict'

  var lynxView = document.getElementById('app')
  if (!lynxView) return

  // ── constants ──

  /** Progress tick cadence (ms) — matches the native event cadence. */
  var TICK_MS = 250

  /** Valid state strings, byte-for-byte match with AudioState. */
  var STATE_IDLE = 'idle'
  var STATE_LOADING = 'loading'
  var STATE_READY = 'ready'
  var STATE_PLAYING = 'playing'
  var STATE_PAUSED = 'paused'
  var STATE_COMPLETED = 'completed'
  var STATE_ERROR = 'error'

  // ── audio element ──

  var audio = new Audio()
  audio.preload = 'auto'
  audio.crossOrigin = 'anonymous'

  var state = STATE_IDLE
  var positionMs = 0
  var durationMs = 0
  var volume = 1
  var speed = 1
  var progressTimer = null

  // ── event forwarding ──

  function sendEvent(name, data) {
    try {
      lynxView.sendGlobalEvent(name, data)
    } catch (_) {
      // LynxView not yet initialized; the event is early enough that it
      // wouldn't have a listener anyway.
    }
  }

  function emitState(newState) {
    if (state === newState) return
    state = newState
    sendEvent('SongloftAudio.stateChanged', { state: state })
  }

  function emitProgress() {
    sendEvent('SongloftAudio.progress', {
      positionMs: positionMs,
      bufferedMs: positionMs + 5000, // rough estimate
      durationMs: durationMs,
    })
  }

  function emitError(code, message) {
    sendEvent('SongloftAudio.error', { code: code, message: message })
  }

  // ── progress timer ──

  function startProgress() {
    stopProgress()
    progressTimer = setInterval(function () {
      if (audio && !audio.paused && !audio.ended) {
        positionMs = Math.round((audio.currentTime || 0) * 1000)
        durationMs = Math.round((audio.duration || 0) * 1000)
        emitProgress()
      }
    }, TICK_MS)
  }

  function stopProgress() {
    if (progressTimer != null) {
      clearInterval(progressTimer)
      progressTimer = null
    }
  }

  // ── audio element event handlers ──

  audio.addEventListener('loadstart', function () {
    emitState(STATE_LOADING)
  })

  audio.addEventListener('loadedmetadata', function () {
    durationMs = Math.round((audio.duration || 0) * 1000)
    emitState(STATE_READY)
    emitProgress()
  })

  audio.addEventListener('play', function () {
    emitState(STATE_PLAYING)
    startProgress()
  })

  audio.addEventListener('pause', function () {
    stopProgress()
    // Don't emit 'paused' if we ended — the 'ended' handler already did.
    if (!audio.ended) {
      emitState(STATE_PAUSED)
    }
  })

  audio.addEventListener('ended', function () {
    stopProgress()
    positionMs = durationMs
    emitProgress()
    emitState(STATE_COMPLETED)
  })

  audio.addEventListener('error', function () {
    stopProgress()
    var err = audio.error
    emitState(STATE_ERROR)
    emitError(
      err ? 'MEDIA_ERR_' + err.code : 'unknown',
      (err && err.message) || 'audio playback error',
    )
  })

  audio.addEventListener('waiting', function () {
    // Buffering — the store can show a spinner.
  })

  audio.addEventListener('canplay', function () {
    if (state === STATE_LOADING) {
      emitState(STATE_READY)
    }
  })

  // ── native module implementation ──
  //
  // Implements the SongloftAudioNativeModule interface. All methods are
  // fire-and-forget (void); the worker's NativeSongloftAudio promisifies them.
  // Method names and signatures must match the Kotlin/Swift native modules.

  var songloftAudio = {
    load: function (url, opts) {
      stopProgress()
      positionMs = 0
      durationMs = 0
      audio.currentTime = 0
      audio.src = ''
      // Let the src clear propagate before setting the new one.
      audio.src = url
      // loadstart → loadedmetadata will handle state transitions.
    },

    play: function () {
      if (state === STATE_COMPLETED) {
        audio.currentTime = 0
      }
      audio.play().catch(function (_) {
        // Autoplay may be blocked; the error event will fire.
      })
    },

    pause: function () {
      audio.pause()
    },

    stop: function () {
      audio.pause()
      audio.currentTime = 0
      audio.src = ''
      stopProgress()
      positionMs = 0
      emitState(STATE_IDLE)
      emitProgress()
    },

    seek: function (ms) {
      var sec = Math.max(0, Math.min(ms / 1000, audio.duration || 0))
      audio.currentTime = sec
      positionMs = Math.round(sec * 1000)
      emitProgress()
    },

    setVolume: function (v) {
      volume = Math.min(1, Math.max(0, v))
      audio.volume = volume
    },

    setSpeed: function (rate) {
      speed = Math.min(3, Math.max(0.5, rate))
      audio.playbackRate = speed
    },

    setQueue: function (_items, _startIndex) {
      // Queue management is handled by the player store; the native module
      // plays one item at a time. No-op on the web side.
    },

    next: function () {
      // The store drives queue navigation; the native module just plays
      // whatever is loaded. No-op.
    },

    previous: function () {
      // No-op (same as next).
    },

    setRepeatMode: function (_mode) {
      // Handled by the store.
    },

    setShuffle: function (_on) {
      // Handled by the store.
    },

    setFavorite: function (_isFavorite) {
      // Handled by the UI.
    },

    setEqualizerEnabled: function (_on) {
      // Follow-up: Web Audio API BiquadFilterNode chain.
    },

    setEqualizerBand: function (_index, _gainDb) {
      // Follow-up: same as above.
    },

    dispose: function () {
      stopProgress()
      audio.pause()
      audio.src = ''
      audio.removeAttribute('src')
    },
  }

  // Register the native module before the LynxView initializes.
  // web-core reads nativeModulesMap during the custom element upgrade.
  lynxView.nativeModulesMap = Object.assign(
    {},
    lynxView.nativeModulesMap || {},
    { SongloftAudio: songloftAudio },
  )
})()