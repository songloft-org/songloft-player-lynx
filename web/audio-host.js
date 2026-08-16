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
 * Features:
 *   - Basic playback (load/play/pause/stop/seek/volume/speed)
 *   - 10-band EQ via Web Audio API BiquadFilterNode chain
 *   - HLS via hls.js (with native HLS fallback for Safari)
 *   - MediaSession for lock-screen / system media controls
 */

(function () {
  'use strict'

  var lynxView = document.getElementById('app')
  if (!lynxView) return

  // ── constants ──

  var TICK_MS = 250

  var STATE_IDLE = 'idle'
  var STATE_LOADING = 'loading'
  var STATE_READY = 'ready'
  var STATE_PLAYING = 'playing'
  var STATE_PAUSED = 'paused'
  var STATE_COMPLETED = 'completed'
  var STATE_ERROR = 'error'

  var EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
  var EQ_TYPES = [
    'lowshelf',
    'peaking', 'peaking', 'peaking', 'peaking',
    'peaking', 'peaking', 'peaking', 'peaking',
    'highshelf',
  ]

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

  // ── HLS ──

  var hlsInstance = null

  function cleanupHls() {
    if (hlsInstance) {
      try { hlsInstance.destroy() } catch (_) {}
      hlsInstance = null
    }
  }

  function loadHls(url) {
    var Hls = window.Hls
    if (Hls && typeof Hls.isSupported === 'function' && Hls.isSupported()) {
      var hls = new Hls()
      hls.on('hlsError', function (_, data) {
        console.warn('[audio-host] hls.js error:', data)
      })
      hls.attachMedia(audio)
      hls.loadSource(url)
      hlsInstance = hls
    } else {
      // Native HLS fallback (Safari)
      audio.src = url
    }
  }

  // ── EQ (Web Audio API) ──

  var eqContext = null
  var eqSource = null
  var eqFilters = []
  var eqEnabled = false
  var eqGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

  function ensureEqContext() {
    if (eqContext) return
    var ctx = new AudioContext()
    eqContext = ctx
    eqSource = ctx.createMediaElementSource(audio)

    eqFilters = []
    for (var i = 0; i < EQ_FREQS.length; i++) {
      var filter = ctx.createBiquadFilter()
      filter.type = EQ_TYPES[i]
      filter.frequency.value = EQ_FREQS[i]
      filter.Q.value = 1
      filter.gain.value = eqGains[i]
      eqFilters.push(filter)
    }
    // Start bypassed (direct to destination)
    eqSource.connect(ctx.destination)
  }

  function connectEq() {
    if (!eqSource || !eqContext || eqFilters.length === 0) return
    try { eqSource.disconnect() } catch (_) {}

    eqSource.connect(eqFilters[0])
    for (var i = 0; i < eqFilters.length - 1; i++) {
      eqFilters[i].connect(eqFilters[i + 1])
    }
    eqFilters[eqFilters.length - 1].connect(eqContext.destination)
  }

  function disconnectEq() {
    if (!eqSource || !eqContext) return
    try { eqSource.disconnect() } catch (_) {}
    for (var i = 0; i < eqFilters.length; i++) {
      try { eqFilters[i].disconnect() } catch (_) {}
    }
    eqSource.connect(eqContext.destination)
  }

  // ── MediaSession ──

  var queueItems = []
  var queueIndex = 0

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return
    var item = queueItems[queueIndex]
    if (!item) return

    var meta = { title: item.title || 'Unknown', artist: item.artist || '' }
    if (item.artworkUrl) {
      meta.artwork = [{ src: item.artworkUrl }]
    }
    navigator.mediaSession.metadata = new MediaMetadata(meta)

    navigator.mediaSession.setActionHandler('play', function () {
      audio.play()
    })
    navigator.mediaSession.setActionHandler('pause', function () {
      audio.pause()
    })
    navigator.mediaSession.setActionHandler('previoustrack', function () {
      sendEvent('SongloftAudio.remoteCommand', { command: 'previous' })
    })
    navigator.mediaSession.setActionHandler('nexttrack', function () {
      sendEvent('SongloftAudio.remoteCommand', { command: 'next' })
    })
    navigator.mediaSession.setActionHandler('seekbackward', function () {
      var sec = Math.max(0, audio.currentTime - 10)
      audio.currentTime = sec
      positionMs = Math.round(sec * 1000)
      emitProgress()
    })
    navigator.mediaSession.setActionHandler('seekforward', function () {
      var sec = Math.min(audio.duration || 0, audio.currentTime + 10)
      audio.currentTime = sec
      positionMs = Math.round(sec * 1000)
      emitProgress()
    })
  }

  function updateMediaSessionPlayback() {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = state === STATE_PLAYING ? 'playing' : 'paused'
  }

  // ── event forwarding ──

  function sendEvent(name, data) {
    try {
      lynxView.sendGlobalEvent(name, data)
    } catch (_) {}
  }

  function emitState(newState) {
    if (state === newState) return
    state = newState
    sendEvent('SongloftAudio.stateChanged', { state: state })
    updateMediaSessionPlayback()
  }

  function emitProgress() {
    sendEvent('SongloftAudio.progress', {
      positionMs: positionMs,
      bufferedMs: positionMs + 5000,
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
    // Resume AudioContext if suspended (autoplay policy)
    if (eqContext && eqContext.state === 'suspended') {
      eqContext.resume()
    }
  })

  audio.addEventListener('pause', function () {
    stopProgress()
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

  audio.addEventListener('waiting', function () {})

  audio.addEventListener('canplay', function () {
    if (state === STATE_LOADING) {
      emitState(STATE_READY)
    }
  })

  // ── native module implementation ──

  var songloftAudio = {
    load: function (url, opts) {
      stopProgress()
      cleanupHls()
      positionMs = 0
      durationMs = 0
      audio.currentTime = 0
      audio.src = ''

      if (opts && opts.hls) {
        loadHls(url)
      } else {
        audio.src = url
      }

      updateMediaSession()
    },

    play: function () {
      if (state === STATE_COMPLETED) {
        audio.currentTime = 0
      }
      audio.play().catch(function (_) {})
    },

    pause: function () {
      audio.pause()
    },

    stop: function () {
      audio.pause()
      audio.currentTime = 0
      audio.src = ''
      cleanupHls()
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

    setQueue: function (items, startIndex) {
      queueItems = items || []
      queueIndex = startIndex || 0
      updateMediaSession()
    },

    next: function () {
      sendEvent('SongloftAudio.remoteCommand', { command: 'next' })
    },

    previous: function () {
      sendEvent('SongloftAudio.remoteCommand', { command: 'previous' })
    },

    setRepeatMode: function (_mode) {},

    setShuffle: function (_on) {},

    setFavorite: function (_isFavorite) {},

    setEqualizerEnabled: function (on) {
      eqEnabled = on
      ensureEqContext()
      if (on) {
        connectEq()
      } else {
        disconnectEq()
      }
    },

    setEqualizerBand: function (index, gainDb) {
      if (index < 0 || index >= 10) return
      eqGains[index] = gainDb
      if (eqFilters[index]) {
        eqFilters[index].gain.value = gainDb
      }
    },

    dispose: function () {
      stopProgress()
      cleanupHls()
      audio.pause()
      audio.src = ''
      audio.removeAttribute('src')
      if (eqContext) {
        eqContext.close().catch(function () {})
        eqContext = null
        eqSource = null
        eqFilters = []
      }
    },
  }

  // ── SongloftStorage module (IndexedDB) ──

  var DB_NAME = 'songloft_storage'
  var DB_VERSION = 1
  var dbReady = null

  function openDb() {
    if (dbReady) return dbReady
    dbReady = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = function (e) {
        var db = e.target.result
        if (!db.objectStoreNames.contains('prefs')) db.createObjectStore('prefs')
        if (!db.objectStoreNames.contains('secure')) db.createObjectStore('secure')
      }
      req.onsuccess = function (e) { resolve(e.target.result) }
      req.onerror = function () { reject(req.error) }
    })
    return dbReady
  }

  var songloftStorage = {
    getItem: function (area, key, callback) {
      openDb().then(function (db) {
        var store = area === 'secure' ? 'secure' : 'prefs'
        var tx = db.transaction(store, 'readonly')
        var req = tx.objectStore(store).get(key)
        req.onsuccess = function () { callback(req.result !== undefined ? req.result : null) }
        req.onerror = function () { callback(null) }
      }).catch(function () { callback(null) })
    },

    setItem: function (area, key, value) {
      openDb().then(function (db) {
        var store = area === 'secure' ? 'secure' : 'prefs'
        var tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(value, key)
      }).catch(function () {})
    },

    removeItem: function (area, key) {
      openDb().then(function (db) {
        var store = area === 'secure' ? 'secure' : 'prefs'
        var tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).delete(key)
      }).catch(function () {})
    },

    getKeys: function (area, callback) {
      openDb().then(function (db) {
        var store = area === 'secure' ? 'secure' : 'prefs'
        var tx = db.transaction(store, 'readonly')
        var req = tx.objectStore(store).getAllKeys()
        req.onsuccess = function () { callback(req.result || []) }
        req.onerror = function () { callback([]) }
      }).catch(function () { callback([]) })
    },

    getPath: function (name, callback) {
      callback('/web-virtual/' + name)
    },
  }

  // ── SongloftPlatform module (openURL + file picker) ──

  var songloftPlatform = {
    openURL: function (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    },

    pickAndUploadFile: function (uploadUrl, fieldName, mimeType, callback) {
      var input = document.createElement('input')
      input.type = 'file'
      input.accept = mimeType || '*/*'
      input.style.display = 'none'
      document.body.appendChild(input)

      input.addEventListener('change', function () {
        var file = input.files && input.files[0]
        input.remove()
        if (!file) {
          callback('cancelled', null)
          return
        }
        var form = new FormData()
        form.append(fieldName, file)
        fetch(uploadUrl, { method: 'POST', body: form, credentials: 'same-origin' })
          .then(function (resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status)
            return resp.text()
          })
          .then(function (text) { callback(null, text) })
          .catch(function (err) { callback(err.message || 'upload failed', null) })
      })

      input.addEventListener('cancel', function () {
        input.remove()
        callback('cancelled', null)
      })

      input.click()
    },

    setInsecureTls: function (_enabled) {
      // No-op on Web — the browser owns certificate trust.
    },
  }

  lynxView.nativeModulesMap = Object.assign(
    {},
    lynxView.nativeModulesMap || {},
    { SongloftAudio: songloftAudio, SongloftStorage: songloftStorage, SongloftPlatform: songloftPlatform },
  )
})()
