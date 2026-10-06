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
  // The URL the audio engine currently holds. `audio.currentSrc` stays '' while
  // hls.js drives the element through MSE, so the video surface cannot read its
  // source from the element; keep the last `load` URL ourselves.
  var audioSrcUrl = ''
  var sourceId = null
  var sourceGeneration = 0
  var pendingSourceLoad = null

  // ── HLS ──

  var hlsInstance = null

  function cleanupHls() {
    if (hlsInstance) {
      try { hlsInstance.destroy() } catch (_) {}
      hlsInstance = null
    }
  }

  function loadHls(url, onManifest) {
    var Hls = window.Hls
    if (Hls && typeof Hls.isSupported === 'function' && Hls.isSupported()) {
      var hls = new Hls()
      hls.on('hlsError', function (_, data) {
        console.warn('[audio-host] hls.js error:', data)
      })
      if (onManifest) {
        hls.on(Hls.Events.MANIFEST_PARSED, onManifest)
      }
      hls.attachMedia(audio)
      hls.loadSource(url)
      hlsInstance = hls
    } else {
      // Native HLS fallback (Safari)
      audio.src = url
    }
  }

  // ── video surface ──
  //
  // Layered like the Android host: a full-viewport <video> sits *under* <lynx-view>
  // and the JS page (FullVideoPage) draws the controls above it. On Web, while MV is
  // open the video also becomes the *single* media element — sound and picture come
  // from this one element, so there is no dual-stream drift — and its events are
  // forwarded onto the existing SongloftAudio channel so the player store keeps
  // working without knowing the engine swapped underneath it.

  var video = document.createElement('video')
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.muted = true
  video.crossOrigin = 'anonymous'
  video.removeAttribute('controls')
  video.style.position = 'fixed'
  video.style.top = '0'
  video.style.left = '0'
  video.style.width = '100vw'
  video.style.height = '100vh'
  video.style.objectFit = 'contain'
  video.style.background = '#000'
  video.style.zIndex = '0'
  video.style.pointerEvents = 'none'
  video.style.display = 'none'
  document.body.insertBefore(video, lynxView)

  var videoOpen = false
  var videoPrimary = false
  var videoHls = null

  /** The element that currently produces sound + progress: video while MV is open. */
  function activeMedia() {
    return videoPrimary ? video : audio
  }

  function releaseVideoSurface() {
    videoOpen = false
    videoPrimary = false
    if (videoHls) {
      try { videoHls.destroy() } catch (_) {}
      videoHls = null
    }
    // Detach stale event handlers before `load()` so an "empty src" error from the
    // cleanup cannot fire into the next open and settle it as a false failure.
    video.onloadedmetadata = null
    video.onerror = null
    try { video.pause() } catch (_) {}
    video.removeAttribute('src')
    try { video.load() } catch (_) {}
    video.style.display = 'none'
  }

  function startSingleVideo(startAt) {
    try { video.currentTime = startAt } catch (_) {}
    var pr
    try { pr = video.play() } catch (_) { pr = null }
    if (pr && typeof pr.then === 'function') {
      pr.catch(function () {
        // Browser refused unmuted playback (no main-thread user activation): keep
        // the picture but hand sound back to the parked audio element so the user
        // never ends up with a frozen fullscreen and no sound.
        if (videoPrimary && !video.ended) {
          video.muted = true
          videoPrimary = false
          try { audio.currentTime = video.currentTime || startAt } catch (_) {}
          audio.play().catch(function () {})
        }
      })
    }
  }

  function openVideoStream() {
    return new Promise(function (resolve) {
      releaseVideoSurface()
      var url = audioSrcUrl || audio.currentSrc || audio.src
      if (!url || url === 'about:blank') {
        resolve('{"result":"failed"}')
        return
      }

      var startAt = audio.currentTime || 0
      var settled = false
      var finish = function (reason) {
        if (settled) return
        settled = true
        if (reason === 'opened') {
          videoOpen = true
          videoPrimary = true
          video.style.display = 'block'
          try { audio.pause() } catch (_) {}
          // Stop the audio engine's HLS pipeline so it doesn't keep fetching the
          // same TS segments behind the now-primary video.
          cleanupHls()
        } else {
          releaseVideoSurface()
        }
        resolve(JSON.stringify({ result: reason }))
      }

      // Single-element takeover: this video is the sound source now.
      video.muted = false

      var isHls = /\.m3u8(?:$|\?)/i.test(url)
      if (isHls && window.Hls && typeof window.Hls.isSupported === 'function' && window.Hls.isSupported()) {
        var hls = new window.Hls()
        videoHls = hls
        hls.on(window.Hls.Events.ERROR, function (_, data) {
          if (data && data.fatal) finish('failed')
        })
        hls.on(window.Hls.Events.MANIFEST_PARSED, function () {
          startSingleVideo(startAt)
          finish('opened')
        })
        hls.attachMedia(video)
        hls.loadSource(url)
        video.style.display = 'block'
        return
      }

      // Direct container. Safari native-HLS also lands here when the window has no
      // hls.js engine; the <video> element still plays that playlist natively.
      video.onloadedmetadata = function () {
        if (video.videoWidth > 0) {
          startSingleVideo(startAt)
          finish('opened')
        } else {
          finish('noTrack')
        }
      }
      video.onerror = function () {
        finish('failed')
      }
      video.src = url
      video.style.display = 'block'
    })
  }

  /**
   * Emit `SongloftVideo.videoSizeChanged` whenever the browser reports a
   * decoded picture size. `loadedmetadata` is the earliest reliable point
   * (before that `videoWidth` / `videoHeight` are 0 on some browsers); `resize`
   * catches a mid-play change (HLS variant switch, rotated iOS capture).
   *
   * Not guarded by `videoPrimary`: the FullVideoPage subscribes to the size
   * event as soon as it mounts, and there is only ever one <video> element
   * here — a stale event does no harm.
   */
  function emitVideoSize() {
    var w = video.videoWidth || 0
    var h = video.videoHeight || 0
    if (w <= 0 || h <= 0) return
    sendEvent('SongloftVideo.videoSizeChanged', { width: w, height: h })
  }

  video.addEventListener('loadedmetadata', emitVideoSize)
  video.addEventListener('resize', emitVideoSize)

  var videoHandlers = {
    open: openVideoStream,
    close: function () {
      var primary = videoPrimary
      var url = audioSrcUrl
      var resumeAt = video.currentTime || audio.currentTime || 0
      var shouldResume = primary && state === STATE_PLAYING
      releaseVideoSurface()
      if (!primary) return Promise.resolve('{}')

      var isHls = /\.m3u8(?:$|\?)/i.test(url)
      if (!isHls) {
        audio.src = url
        if (resumeAt > 0) {
          try { audio.currentTime = resumeAt } catch (_) {}
        }
        if (shouldResume) audio.play().catch(function () {})
        return Promise.resolve('{}')
      }

      // Video played the HLS playlist while primary and the audio pipeline was torn
      // down; rebuild it and resume from where the video left off. Bonus: this also
      // loses only one segment, never re-fetches the whole playlist from 0.
      var Hls = window.Hls
      if (Hls && typeof Hls.isSupported === 'function' && Hls.isSupported()) {
        cleanupHls()
        var hls = new Hls()
        hls.on('hlsError', function (_, data) {
          console.warn('[audio-host] hls.js error:', data)
        })
        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          try { audio.currentTime = resumeAt } catch (_) {}
          if (shouldResume) audio.play().catch(function () {})
        })
        hls.attachMedia(audio)
        hls.loadSource(url)
        hlsInstance = hls
      } else {
        audio.src = url
        if (resumeAt > 0) {
          try { audio.currentTime = resumeAt } catch (_) {}
        }
        if (shouldResume) audio.play().catch(function () {})
      }
      return Promise.resolve('{}')
    },
    isOpen: function () {
      return Promise.resolve(JSON.stringify({ result: videoOpen }))
    },
    /**
     * The page computes a letterbox rect in CSS pixels from the video's
     * aspect. On device the host applies that rect to a native surface; the
     * browser here already does letterbox at element level (`object-fit:
     * contain`), so applying it a second time would just crop the picture
     * inside the picture. The right answer is a no-op that keeps the same
     * three-host method surface.
     */
    setSurfaceLayout: function () {
      return Promise.resolve('{}')
    },
    /**
     * `screen.orientation.lock` needs fullscreen + a user gesture and is not
     * offered by every browser. The rotate button in the JS page is a
     * best-effort call, so a rejection here is not user-visible — the page
     * still runs. Treat any failure as "no orientation lock available".
     */
    setOrientation: function (args) {
      var mode = 'auto'
      try {
        var json = args && args[0]
        var obj = json ? JSON.parse(json) : {}
        if (obj && typeof obj.mode === 'string') mode = obj.mode
      } catch (_) {}
      try {
        if (screen && screen.orientation && typeof screen.orientation.lock === 'function') {
          if (mode === 'portrait') return screen.orientation.lock('portrait').then(
            function () { return '{}' },
            function () { return '{}' },
          )
          if (mode === 'landscape') return screen.orientation.lock('landscape').then(
            function () { return '{}' },
            function () { return '{}' },
          )
          if (typeof screen.orientation.unlock === 'function') {
            try { screen.orientation.unlock() } catch (_) {}
          }
        }
      } catch (_) {}
      return Promise.resolve('{}')
    },
    getVideoSize: function () {
      var w = video.videoWidth || 0
      var h = video.videoHeight || 0
      if (w <= 0 || h <= 0) return Promise.resolve('{}')
      return Promise.resolve(JSON.stringify({ result: { width: w, height: h } }))
    },
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
      activeMedia().play()
    })
    navigator.mediaSession.setActionHandler('pause', function () {
      activeMedia().pause()
    })
    navigator.mediaSession.setActionHandler('previoustrack', function () {
      sendEvent('SongloftAudio.remoteCommand', { command: 'previous' })
    })
    navigator.mediaSession.setActionHandler('nexttrack', function () {
      sendEvent('SongloftAudio.remoteCommand', { command: 'next' })
    })
    navigator.mediaSession.setActionHandler('seekbackward', function () {
      var media = activeMedia()
      var sec = Math.max(0, media.currentTime - 10)
      media.currentTime = sec
      positionMs = Math.round(sec * 1000)
      emitProgress()
    })
    navigator.mediaSession.setActionHandler('seekforward', function () {
      var media = activeMedia()
      var sec = Math.min(media.duration || 0, media.currentTime + 10)
      media.currentTime = sec
      positionMs = Math.round(sec * 1000)
      emitProgress()
    })
  }

  function updateMediaSessionPlayback() {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = state === STATE_PLAYING ? 'playing' : 'paused'
  }

  // ── event forwarding ──

  /*
   * `sendGlobalEvent(name, params)` takes an **array**, not the payload.
   *
   * web-core relays `params` to the worker and the emitter there ends in
   * `listener.apply(context, params)`. A plain object has no `length`, so `apply`
   * passes *zero* arguments and every listener sees `undefined` — the audio
   * facade's state / progress / error handlers all silently received nothing.
   * The array wrapper is what makes `[payload]` arrive as the first argument, which
   * is the contract `src/native/*.ts` is written against on device too.
   */
  function sendEvent(name, data) {
    if (sourceId && (name === 'SongloftAudio.stateChanged' || name === 'SongloftAudio.progress' || name === 'SongloftAudio.error' || name === 'SongloftAudio.sourceReady')) {
      data.sourceId = sourceId
    }
    try {
      lynxView.sendGlobalEvent(name, [data])
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
      var media = activeMedia()
      if (media && !media.paused && !media.ended) {
        positionMs = Math.round((media.currentTime || 0) * 1000)
        durationMs = Math.round((media.duration || 0) * 1000)
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

  // ── media element event handlers ──
  // Both elements forward onto the same SongloftAudio channel, but only the one
  // that is currently the active engine may emit: while video is primary the audio
  // element is parked and its events (pause etc.) must not overwrite video state.

  function bindAudioEvents(element) {
  element.addEventListener('loadstart', function () {
    if (videoPrimary || audio !== element) return
    emitState(STATE_LOADING)
  })

  element.addEventListener('loadedmetadata', function () {
    if (videoPrimary || audio !== element) return
    durationMs = Math.round((audio.duration || 0) * 1000)
    if (pendingSourceLoad) {
      audio.currentTime = Math.max(0, Math.min(pendingSourceLoad.positionMs / 1000, audio.duration || Infinity))
      audio.playbackRate = speed
      audio.volume = volume
      if (audio.currentTime === 0) finishSourceLoad()
      return
    }
    emitState(STATE_READY)
    emitProgress()
  })

  element.addEventListener('seeked', function () {
    if (videoPrimary || audio !== element) return
    if (pendingSourceLoad) finishSourceLoad()
  })

  element.addEventListener('play', function () {
    if (videoPrimary || audio !== element) return
    emitState(STATE_PLAYING)
    startProgress()
    // Resume AudioContext if suspended (autoplay policy)
    if (eqContext && eqContext.state === 'suspended') {
      eqContext.resume()
    }
  })

  element.addEventListener('pause', function () {
    if (videoPrimary || audio !== element) return
    stopProgress()
    if (!audio.ended) {
      emitState(STATE_PAUSED)
    }
  })

  element.addEventListener('ended', function () {
    if (videoPrimary || audio !== element) return
    stopProgress()
    positionMs = durationMs
    emitProgress()
    emitState(STATE_COMPLETED)
  })

  element.addEventListener('error', function () {
    if (videoPrimary || audio !== element) return
    pendingSourceLoad = null
    stopProgress()
    var err = audio.error
    emitState(STATE_ERROR)
    emitError(
      err ? 'MEDIA_ERR_' + err.code : 'unknown',
      (err && err.message) || 'audio playback error',
    )
  })

  element.addEventListener('waiting', function () {})

  element.addEventListener('canplay', function () {
    if (videoPrimary || audio !== element || pendingSourceLoad) return
    if (state === STATE_LOADING) {
      emitState(STATE_READY)
    }
  })
  }
  bindAudioEvents(audio)

  function finishSourceLoad() {
    var pending = pendingSourceLoad
    if (!pending) return
    pendingSourceLoad = null
    var generation = sourceGeneration
    positionMs = Math.round(audio.currentTime * 1000)
    emitState(STATE_READY)
    emitProgress()
    var intent = pending.autoplay ? audio.play() : Promise.resolve()
    if (!pending.autoplay) emitState(STATE_PAUSED)
    intent.then(function () {
      if (generation !== sourceGeneration) return
      sendEvent('SongloftAudio.sourceReady', { positionMs: positionMs })
    }, function (error) {
      if (generation !== sourceGeneration) return
      emitState(STATE_ERROR)
      emitError('play_blocked', error.message || 'Playback was prevented')
    })
  }

  video.addEventListener('loadedmetadata', function () {
    if (!videoPrimary) return
    durationMs = Math.round((video.duration || 0) * 1000)
    emitState(STATE_READY)
    emitProgress()
  })

  video.addEventListener('play', function () {
    if (!videoPrimary) return
    emitState(STATE_PLAYING)
    startProgress()
  })

  video.addEventListener('pause', function () {
    if (!videoPrimary) return
    stopProgress()
    if (!video.ended) {
      emitState(STATE_PAUSED)
    }
  })

  video.addEventListener('ended', function () {
    if (!videoPrimary) return
    stopProgress()
    positionMs = durationMs
    emitProgress()
    emitState(STATE_COMPLETED)
  })

  video.addEventListener('error', function () {
    if (!videoPrimary) return
    stopProgress()
    var err = video.error
    emitState(STATE_ERROR)
    emitError(
      err ? 'MEDIA_ERR_' + err.code : 'unknown',
      (err && err.message) || 'video playback error',
    )
  })

  // ── native module implementation ──

  var songloftAudio = {
    getSourceLoadVersion: function () { return 1 },
    load: function (url, opts) {
      if (videoPrimary) {
        releaseVideoSurface()
      }
      stopProgress()
      cleanupHls()
      // Each source owns its element/listeners. Late events from the outgoing
      // element cannot be mislabeled as the newly requested source.
      var outgoing = audio
      audio = new Audio()
      audio.preload = 'auto'
      audio.crossOrigin = 'anonymous'
      audio.volume = volume
      audio.playbackRate = speed
      bindAudioEvents(audio)
      outgoing.pause()
      outgoing.removeAttribute('src')
      outgoing.load()
      if (eqContext) {
        try { eqSource.disconnect() } catch (_) {}
        eqSource = eqContext.createMediaElementSource(audio)
        if (eqEnabled) connectEq()
        else disconnectEq()
      }
      ++sourceGeneration
      sourceId = opts && opts.sourceId || null
      pendingSourceLoad = sourceId ? {
        positionMs: opts.initialPositionMs || 0,
        autoplay: opts.autoplay === true,
      } : null
      positionMs = 0
      durationMs = 0
      audio.currentTime = 0
      audio.src = ''
      audioSrcUrl = url || ''
      emitState(STATE_LOADING)

      if (opts && opts.hls) {
        loadHls(url)
      } else {
        audio.src = url
      }

      updateMediaSession()
    },

    play: function () {
      if (pendingSourceLoad) { pendingSourceLoad.autoplay = true; return }
      if (videoPrimary) {
        if (video.ended) video.currentTime = 0
        video.play().catch(function (_) {})
        return
      }
      if (state === STATE_COMPLETED) {
        audio.currentTime = 0
      }
      audio.play().catch(function (_) {})
    },

    pause: function () {
      if (pendingSourceLoad) pendingSourceLoad.autoplay = false
      if (videoPrimary) {
        video.pause()
        return
      }
      audio.pause()
    },

    stop: function () {
      ++sourceGeneration
      pendingSourceLoad = null
      videoPrimary && releaseVideoSurface()
      audio.pause()
      audio.currentTime = 0
      audio.src = ''
      audioSrcUrl = ''
      cleanupHls()
      stopProgress()
      positionMs = 0
      emitState(STATE_IDLE)
      emitProgress()
    },

    seek: function (ms) {
      if (videoPrimary) {
        var sec = Math.max(0, Math.min(ms / 1000, video.duration || 0))
        video.currentTime = sec
        positionMs = Math.round(sec * 1000)
        emitProgress()
        return
      }
      var sec = Math.max(0, Math.min(ms / 1000, audio.duration || 0))
      audio.currentTime = sec
      positionMs = Math.round(sec * 1000)
      emitProgress()
    },

    getVolume: function () {
      sendEvent('SongloftAudio.volumeChanged', {
        volume: Math.round((videoPrimary ? video.volume : audio.volume) * 100),
      })
    },
    setVolume: function (v) {
      volume = Math.min(1, Math.max(0, v))
      video.volume = volume
      audio.volume = volume
    },

    setSpeed: function (rate) {
      speed = Math.min(3, Math.max(0.5, rate))
      video.playbackRate = speed
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

    // Native platforms paint the now-playing lyric in the OS notification; Web has
    // no such surface. No-op to match the no-op Web facade in `web-audio.ts`.
    updateNotificationLyric: function (_lyric, _inTitle) {},

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

  // ── SongloftPlatform module (openURL + file picker + clipboard) ──

  function legacyCopy(text) {
    var ta = null
    var previousFocus = document.activeElement
    try {
      ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      return document.execCommand('copy') === true
    } catch (_) { return false }
    finally {
      if (ta) ta.remove()
      if (previousFocus && previousFocus.isConnected && previousFocus.focus) previousFocus.focus()
    }
  }

  async function writeClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        return { error: null }
      }
    } catch (_) { /* Try the legacy copy path, which must also confirm success. */ }
    return { error: legacyCopy(text) ? null : 'clipboard_failed' }
  }


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

    setClipboard: function (text) {
      // Legacy bundles ignore the result; current callers await the confirming method.
      void writeClipboard(text).catch(function () {})
    },

    setInsecureTls: function (_enabled) {
      // No-op on Web — the browser owns certificate trust.
    },

    /**
     * Hand a base64-encoded file to the user. Web has no OS share sheet, so
     * this decodes the payload and triggers a browser download through an
     * object-URL anchor. The native hosts present their share sheet instead —
     * the TS facade (`shareFile`) is identical on all three.
     */
    shareFile: function (base64, fileName, mimeType, callback) {
      try {
        var bin = atob(base64)
        var bytes = new Uint8Array(bin.length)
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        var blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' })
        var url = URL.createObjectURL(blob)
        var a = document.createElement('a')
        a.href = url
        a.download = fileName || 'songloft-logs.zip'
        document.body.appendChild(a)
        a.click()
        a.remove()
        // Give the browser a beat to start the download before revoking.
        setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
        callback(null)
      } catch (e) {
        callback((e && e.message) || 'download failed')
      }
    },
  }

  /* ── browser back button (SongloftNavigation) ──────────────────────────────
   *
   * The app runs in a Web Worker, which has no `history` and no `popstate`, so
   * intercepting browser back has to happen here. The mechanism is one sentinel
   * history entry whose presence is kept **exactly equal** to the `consumable` flag
   * JS mirrors down:
   *
   *   consumable  → one sentinel sits above our real entry. Browser back consumes
   *                 it, we immediately re-push (re-arming the guard) and forward the
   *                 press to JS.
   *   !consumable → no sentinel. Browser back leaves the page, with no JS involved.
   *
   * That second line is the whole reason for mirroring a flag rather than asking JS
   * per press: at a tab root the browser does what a web user expects, and it keeps
   * working if the worker is wedged. It is also why there is no "press again to
   * exit" prompt on Web — leaving on the first press *is* the platform behaviour.
   *
   * Known limitation: if the page was opened directly in a fresh tab there is no
   * earlier entry, so back cannot leave. That is browser behaviour, not something
   * this can paper over.
   */
  var BACK_SENTINEL = { songloftBackGuard: 1 }
  var backConsumable = false
  var sentinelPresent = false
  /* popstate events we caused ourselves, which must not be read as a user press. */
  var suppressedPops = 0
  /* `history.back()` is async, so only one removal may be outstanding. */
  var sentinelOpInFlight = false
  var backSeq = 0

  function pushSentinel() {
    history.pushState(BACK_SENTINEL, '', location.href)
    sentinelPresent = true
  }

  /*
   * Drive `sentinelPresent` towards `backConsumable`.
   *
   * Re-entrant on purpose: adding is synchronous, removing is not, so after an
   * async removal completes the flag may already have flipped back again. Looping
   * through this one function keeps the two in sync without a queue.
   */
  function syncSentinel() {
    if (sentinelOpInFlight) return
    if (backConsumable === sentinelPresent) return
    if (backConsumable) {
      pushSentinel()
      syncSentinel()
      return
    }
    sentinelOpInFlight = true
    suppressedPops++
    sentinelPresent = false
    history.back()
  }

  window.addEventListener('popstate', function () {
    if (suppressedPops > 0) {
      suppressedPops--
      sentinelOpInFlight = false
      syncSentinel()
      return
    }
    // A real user press consumed the sentinel.
    sentinelPresent = false
    if (!backConsumable) return
    pushSentinel()
    backSeq++
    sendEvent('SongloftNavigation.backPressed', { seq: backSeq })
  })

  var navigationHandlers = {
    setBackConsumable: function (args) {
      backConsumable = !!args[0]
      syncSentinel()
    },
    notifyBackHandled: function () {
      // Watchdog is Android-only; see songloft-navigation-module.js.
    },
    /*
     * Best-effort "leave the page".
     *
     * Not reachable from the back button on Web: at a tab root `consumable` is
     * false, so the browser leaves on its own and JS never sees the press. This
     * exists so the three hosts expose one interface, and for any future explicit
     * "quit" affordance.
     *
     * Steps over the sentinel as well as our own entry when one is up. If there is
     * no earlier entry to reach, the browser clamps and we stay put — same
     * limitation as plain browser back in a fresh tab.
     */
    exitApp: function () {
      var steps = sentinelPresent ? 2 : 1
      if (sentinelPresent) {
        suppressedPops++
        sentinelPresent = false
      }
      history.go(-steps)
    },
  }

  /*
   * Registration, in the shape web-core actually consumes.
   *
   * `nativeModulesMap`'s values are **ESM URLs** that the background worker
   * `import()`s; the default export is a factory `(nativeModules, call) => module`.
   * This file used to hand it the objects below directly, which made every entry
   * `import("[object Object]")` — the import rejected, `Promise.all` in
   * `createNativeModules` rejected with it, and `NativeModules` was left holding
   * only web-core's own `bridge` and `LynxExposureModule`. So *none* of the modules
   * existed on Web, silently: the plugin file picker said "SongloftPlatform native
   * module not available", the clipboard write did nothing, and the Web audio fix
   * from batch 43 never took effect (the facade fell through to the silent mock).
   *
   * `SongloftStorage` is deliberately **not** registered. The worker already has a
   * working IndexedDB backend (`core/storage/idb-storage.ts`, DB `songloft`), and
   * this file's storage object uses a *different* DB (`songloft_storage`) — wiring
   * it in would switch the backend out from under the persisted login token and
   * log the user out on refresh. Leaving it out lets storage detection fall through
   * to `idb-storage`, exactly as it does today.
   */
  lynxView.nativeModulesMap = Object.assign(
    {},
    lynxView.nativeModulesMap || {},
    {
      SongloftAudio: '/songloft-audio-module.js',
      SongloftPlatform: '/songloft-platform-module.js',
      SongloftNavigation: '/songloft-navigation-module.js',
      SongloftVideo: '/songloft-video-module.js',
    },
  )

  /** Main-thread half of `SongloftPlatform`: this is where the DOM lives. */
  var platformHandlers = {
    setPlaybackShortcuts: function (args) {
      if (window.__SONGLOFT_KEYBOARD__) window.__SONGLOFT_KEYBOARD__.configure(args[0])
    },
    pickTextFile: function (args) {
      return window.__SONGLOFT_TEXT_FILES__
        ? window.__SONGLOFT_TEXT_FILES__.pickTextFile(args[0])
        : { error: 'file_transfer_unavailable' }
    },
    saveTextFile: function (args) {
      return window.__SONGLOFT_TEXT_FILES__
        ? window.__SONGLOFT_TEXT_FILES__.saveTextFile(args[0])
        : { error: 'file_transfer_unavailable' }
    },
    cancelTextFile: function () {
      if (window.__SONGLOFT_TEXT_FILES__) window.__SONGLOFT_TEXT_FILES__.cancelTextFile()
    },
    openURL: function (args) {
      songloftPlatform.openURL(args[0])
    },
    setClipboard: function (args) {
      songloftPlatform.setClipboard(args[0])
    },
    setClipboardWithResult: function (args) {
      return writeClipboard(args[0])
    },
    pickAndUploadFile: function (args) {
      return new Promise(function (resolve) {
        songloftPlatform.pickAndUploadFile(args[0], args[1], args[2], function (error, body) {
          resolve({ error: error, body: body })
        })
      })
    },
    shareFile: function (args) {
      return new Promise(function (resolve) {
        songloftPlatform.shareFile(args[0], args[1], args[2], function (error) {
          resolve({ error: error })
        })
      })
    },
  }

  var previousCall = lynxView.onNativeModulesCall
  lynxView.onNativeModulesCall = function (name, data, moduleName) {
    if (moduleName === 'SongloftNavigation') {
      var navHandler = navigationHandlers[name]
      if (navHandler) return navHandler(data || [])
      return undefined
    }
    if (moduleName === 'SongloftPlatform') {
      var handler = platformHandlers[name]
      if (handler) return handler(data || [])
      return undefined
    }
    if (moduleName === 'SongloftAudio') {
      // Every audio method is fire-and-forget with positional args, so relay
      // straight to the HTMLAudioElement adapter. Playback events return via
      // `sendGlobalEvent`, not this channel.
      var fn = songloftAudio[name]
      if (typeof fn === 'function') return fn.apply(songloftAudio, data || [])
      return undefined
    }
    if (moduleName === 'SongloftVideo') {
      var videoFn = videoHandlers[name]
      if (typeof videoFn === 'function') return videoFn(data || [])
      return undefined
    }
    return previousCall ? previousCall(name, data, moduleName) : undefined
  }
})()
