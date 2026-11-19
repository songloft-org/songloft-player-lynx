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

  var STATE_IDLE = 'idle'
  var STATE_LOADING = 'loading'
  var STATE_READY = 'ready'
  var STATE_PLAYING = 'playing'
  var STATE_PAUSED = 'paused'
  var STATE_COMPLETED = 'completed'
  var STATE_ERROR = 'error'
  var PROGRESS_INTERVAL_MS = 250
  var SLOW_PROGRESS_INTERVAL_MS = 1000

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
  var volume = 1
  var speed = 1
  // The URL the audio engine currently holds. `audio.currentSrc` stays '' while
  // hls.js drives the element through MSE, so the video surface cannot read its
  // source from the element; keep the last `load` URL ourselves.
  var audioSrcUrl = ''
  var sourceId = null
  var sourceGeneration = 0
  var pendingSourceLoad = null
  var progressIntervalMs = PROGRESS_INTERVAL_MS
  var lastProgressAt = -Infinity

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
  var flvPlayer = null
  var flvLibrary = null

  function isFlvUrl(url) {
    return url.split(/[?#]/, 1)[0].toLowerCase().endsWith('/play.flv')
  }

  function isRadioHlsSession(url) {
    return /\/proxy\/transcode\/hls\/sessions\/[0-9a-f]+\/playlist\.m3u8(?:\?|$)/.test(url)
  }

  function loadFlvLibrary() {
    if (window.mpegts) return Promise.resolve(window.mpegts)
    if (!flvLibrary) {
      flvLibrary = new Promise(function (resolve, reject) {
        var script = document.createElement('script')
        script.src = new URL('./mpegts.js', document.baseURI).href
        script.onload = function () { resolve(window.mpegts) }
        script.onerror = function () {
          script.remove()
          reject(new Error('Could not load the HTTP-FLV player'))
        }
        document.head.appendChild(script)
      }).catch(function (error) {
        flvLibrary = null
        throw error
      })
    }
    return flvLibrary
  }

  function failFlv(generation, code, message) {
    if (generation !== sourceGeneration) return
    pendingSourceLoad = null
    releaseVideoSurface()
    emitState(STATE_ERROR)
    emitError(code, message)
  }

  function failFlvSupport(generation) {
    var Hls = window.Hls
    if ((Hls && Hls.isSupported()) || video.canPlayType('application/vnd.apple.mpegurl')) {
      failFlv(generation, 'flv_needs_hls', 'HTTP-FLV playback is unavailable; trying HLS')
    } else {
      failFlv(generation, 'flv_playback_unsupported', 'This browser cannot play this live stream. Select Audio only to listen.')
    }
  }

  function loadFlv(url) {
    var generation = sourceGeneration
    videoPrimary = true
    video.muted = false
    video.disableRemotePlayback = true
    video.volume = volume
    video.playbackRate = speed
    loadFlvLibrary().then(function (mpegts) {
      if (generation !== sourceGeneration) return
      if (!mpegts || !mpegts.getFeatureList().mseLivePlayback) {
        failFlvSupport(generation)
        return
      }
      var player = mpegts.createPlayer({ type: 'flv', url: url, isLive: true }, {
        autoCleanupSourceBuffer: true,
        stashInitialSize: 128 * 1024,
        lazyLoad: false,
      })
      flvPlayer = player
      player.on(mpegts.Events.ERROR, function (_, detail) {
        if (flvPlayer !== player || generation !== sourceGeneration) return
        if (detail === mpegts.ErrorDetails.MEDIA_FORMAT_UNSUPPORTED) {
          failFlvSupport(generation)
        } else if (detail === mpegts.ErrorDetails.MEDIA_CODEC_UNSUPPORTED) {
          failFlv(generation, 'flv_playback_unsupported', 'This browser cannot decode this live stream. Select Audio only to listen.')
        } else {
          failFlv(generation, 'flv_stream_error', 'HTTP-FLV stream failed: ' + detail)
        }
      })
      player.attachMediaElement(video)
      player.load()
    }).catch(function (error) {
      failFlv(generation, 'flv_stream_error', error.message)
    })
  }

  /** The element that currently produces sound + progress: video while MV is open. */
  function activeMedia() {
    return videoPrimary ? video : audio
  }

  function releaseVideoSurface() {
    videoOpen = false
    videoPrimary = false
    if (flvPlayer) {
      var player = flvPlayer
      flvPlayer = null
      try { player.destroy() } catch (_) {}
    }
    video.disableRemotePlayback = false
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
    if (videoPrimary && isFlvUrl(audioSrcUrl)) {
      if (video.readyState >= 1 && !video.videoWidth) return Promise.resolve('{"result":"noTrack"}')
      videoOpen = true
      video.style.display = 'block'
      emitVideoSize()
      return Promise.resolve('{"result":"opened"}')
    }
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
          syncMediaProgress(video)
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

  var browserFullscreen = null
  function fullscreenHost() {
    if (!browserFullscreen && window.__SONGLOFT_CREATE_VIDEO_FULLSCREEN__) {
      browserFullscreen = window.__SONGLOFT_CREATE_VIDEO_FULLSCREEN__(document,
        function () { return videoOpen },
        function (value) { sendEvent('SongloftVideo.fullscreenChanged', value) })
    }
    return browserFullscreen
  }

  var videoHandlers = {
    fullscreenState: function () {
      var host = fullscreenHost()
      return JSON.stringify(host ? host.state() : { supported: false, active: false })
    },
    setFullscreen: function (args) {
      var host = fullscreenHost()
      if (!host) return Promise.resolve(JSON.stringify({ supported: false, active: false }))
      var options = {}
      try { options = JSON.parse(args[0] || '{}') } catch (_) {}
      return host.set(options.enabled === true, String(options.label || 'Fullscreen')).then(JSON.stringify)
    },
    open: openVideoStream,
    close: function () {
      if (browserFullscreen) void browserFullscreen.close().catch(function () {})
      if (videoPrimary && isFlvUrl(audioSrcUrl)) {
        videoOpen = false
        video.style.display = 'none'
        return Promise.resolve('{}')
      }
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

  var pluginEqGains = null
  var pluginEqGeneration = 0

  function ensureEqContext(context) {
    if (eqContext) return
    var ctx = context || new AudioContext()
    eqContext = ctx
    eqSource = ctx.createMediaElementSource(audio)

    eqFilters = []
    for (var i = 0; i < EQ_FREQS.length; i++) {
      var filter = ctx.createBiquadFilter()
      filter.type = EQ_TYPES[i]
      filter.frequency.value = EQ_FREQS[i]
      filter.Q.value = 1
      filter.gain.value = (pluginEqGains || eqGains)[i]
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

  function renderEqualizer() {
    var gains = pluginEqGains || eqGains
    for (var i = 0; i < eqFilters.length; i++) eqFilters[i].gain.value = gains[i]
    disconnectEq()
    if (pluginEqGains || eqEnabled) connectEq()
  }

  async function setPluginEqualizer(profile) {
    var generation = ++pluginEqGeneration
    if (profile === '') {
      pluginEqGains = null
      renderEqualizer()
      return true
    }
    if (typeof AudioContext !== 'function' || videoPrimary) return false
    var context = eqContext
    var timer
    try {
      var gains = JSON.parse(profile).gains
      if (!Array.isArray(gains) || gains.length !== EQ_FREQS.length ||
          gains.some(function (gain) { return !Number.isFinite(gain) || gain < -12 || gain > 12 })) return false
      context = context || new AudioContext()
      // Do not intercept the media element before the browser allows the graph
      // to run. A blocked resume must leave the current output audible.
      if (context.state !== 'running') {
        await Promise.race([
          context.resume(),
          new Promise(function (resolve) { timer = setTimeout(resolve, 1500) }),
        ])
      }
      if (context.state !== 'running' || generation !== pluginEqGeneration || videoPrimary) return false
      ensureEqContext(context)
      pluginEqGains = gains
      renderEqualizer()
      return true
    } catch (_) {
      return false
    } finally {
      clearTimeout(timer)
      if (context && context !== eqContext) void context.close().catch(function () {})
    }
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
      sendEvent('SongloftAudio.remoteCommand', { command: 'play' })
    })
    navigator.mediaSession.setActionHandler('pause', function () {
      activeMedia().pause()
      sendEvent('SongloftAudio.remoteCommand', { command: 'pause' })
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
      emitProgress(media)
    })
    navigator.mediaSession.setActionHandler('seekforward', function () {
      var media = activeMedia()
      var sec = Math.min(media.duration || 0, media.currentTime + 10)
      media.currentTime = sec
      emitProgress(media)
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

  document.addEventListener('visibilitychange', function () {
    var visible = document.visibilityState === 'visible'
    if (visible) syncMediaProgress(activeMedia())
    sendEvent(visible ? 'SongloftLifecycle.resumed' : 'SongloftLifecycle.paused', {})
  })

  function emitState(newState) {
    if (state === newState) return
    state = newState
    sendEvent('SongloftAudio.stateChanged', { state: state })
    updateMediaSessionPlayback()
  }

  function emitProgress(media, periodic) {
    var positionMs = media ? Math.round(media.currentTime * 1000) : 0
    var live = isFlvUrl(audioSrcUrl) || isRadioHlsSession(audioSrcUrl)
    var durationMs = !live && media && Number.isFinite(media.duration) ? Math.round(media.duration * 1000) : 0
    var data = {
      positionMs: positionMs,
      bufferedMs: positionMs + 5000,
      durationMs: durationMs,
    }
    if (periodic) data.sampledAtMs = Date.now()
    sendEvent('SongloftAudio.progress', data)
  }

  function emitError(code, message) {
    sendEvent('SongloftAudio.error', { code: code, message: message })
  }

  function syncMediaProgress(media, periodic) {
    if (media !== activeMedia() || !audioSrcUrl || pendingSourceLoad ||
        media.readyState < media.HAVE_METADATA || media.ended) return
    if (periodic) {
      // Limit routine updates so they cannot keep playback transitions waiting
      // behind a stream of old positions on a slow Lynx worker.
      var now = window.performance.now()
      if (now - lastProgressAt < progressIntervalMs) return
      lastProgressAt = now
    }
    emitProgress(media, periodic)
  }

  function bindMediaProgress(media) {
    // Media events still follow the playback clock when JS intervals are throttled.
    var sync = function () { syncMediaProgress(media) }
    media.addEventListener('timeupdate', function () { syncMediaProgress(media, true) })
    media.addEventListener('durationchange', sync)
    media.addEventListener('seeked', sync)
  }

  // ── media element event handlers ──
  // Both elements forward onto the same SongloftAudio channel, but only the one
  // that is currently the active engine may emit: while video is primary the audio
  // element is parked and its events (pause etc.) must not overwrite video state.

  function bindAudioEvents(element) {
  bindMediaProgress(element)

  element.addEventListener('loadstart', function () {
    if (videoPrimary || audio !== element) return
    emitState(STATE_LOADING)
  })

  element.addEventListener('loadedmetadata', function () {
    if (videoPrimary || audio !== element) return
    if (pendingSourceLoad) {
      audio.currentTime = Math.max(0, Math.min(pendingSourceLoad.positionMs / 1000, audio.duration || Infinity))
      audio.playbackRate = speed
      audio.volume = volume
      if (audio.currentTime === 0) finishSourceLoad()
      return
    }
    emitState(STATE_READY)
    emitProgress(element)
  })

  element.addEventListener('seeked', function () {
    if (videoPrimary || audio !== element) return
    if (pendingSourceLoad) finishSourceLoad()
  })

  element.addEventListener('play', function () {
    if (videoPrimary || audio !== element) return
    emitState(STATE_PLAYING)
    // Resume AudioContext if suspended (autoplay policy)
    if (eqContext && eqContext.state === 'suspended') {
      eqContext.resume()
    }
  })

  element.addEventListener('pause', function () {
    if (videoPrimary || audio !== element) return
    if (!audio.ended) {
      syncMediaProgress(element)
      emitState(STATE_PAUSED)
    }
  })

  element.addEventListener('ended', function () {
    if (videoPrimary || audio !== element) return
    emitProgress(element)
    emitState(STATE_COMPLETED)
  })

  element.addEventListener('error', function () {
    if (videoPrimary || audio !== element) return
    pendingSourceLoad = null
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

  function finishSourceLoad(media) {
    var pending = pendingSourceLoad
    if (!pending) return
    pendingSourceLoad = null
    var generation = sourceGeneration
    media = media || audio
    emitState(STATE_READY)
    emitProgress(media)
    var intent = pending.autoplay ? media.play() : Promise.resolve()
    if (!pending.autoplay) emitState(STATE_PAUSED)
    intent.then(function () {
      if (generation !== sourceGeneration) return
      sendEvent('SongloftAudio.sourceReady', { positionMs: Math.round(media.currentTime * 1000) })
    }, function (error) {
      if (generation !== sourceGeneration) return
      emitState(STATE_ERROR)
      emitError('play_blocked', error.message || 'Playback was prevented')
    })
  }

  bindMediaProgress(video)

  video.addEventListener('loadedmetadata', function () {
    if (!videoPrimary) return
    if (pendingSourceLoad && isFlvUrl(audioSrcUrl)) {
      finishSourceLoad(video)
      return
    }
    emitState(STATE_READY)
    emitProgress(video)
  })

  video.addEventListener('play', function () {
    if (!videoPrimary || isFlvUrl(audioSrcUrl)) return
    emitState(STATE_PLAYING)
  })

  video.addEventListener('playing', function () {
    if (!videoPrimary || !isFlvUrl(audioSrcUrl)) return
    emitState(STATE_PLAYING)
  })

  video.addEventListener('pause', function () {
    if (!videoPrimary) return
    if (!video.ended) {
      syncMediaProgress(video)
      emitState(STATE_PAUSED)
    }
  })

  video.addEventListener('ended', function () {
    if (!videoPrimary) return
    emitProgress(video)
    emitState(STATE_COMPLETED)
  })

  video.addEventListener('error', function () {
    if (!videoPrimary) return
    var err = video.error
    if (isFlvUrl(audioSrcUrl)) {
      if (err && err.code === 4) {
        failFlvSupport(sourceGeneration)
      } else {
        failFlv(sourceGeneration, 'flv_stream_error', (err && err.message) || 'HTTP-FLV playback error')
      }
      return
    }
    emitState(STATE_ERROR)
    emitError(
      err ? 'MEDIA_ERR_' + err.code : 'unknown',
      (err && err.message) || 'video playback error',
    )
  })

  // ── native module implementation ──

  var songloftAudio = {
    getSourceLoadVersion: function () { return 1 },
    slowProgressUpdates: function () { progressIntervalMs = SLOW_PROGRESS_INTERVAL_MS },
    load: function (url, opts) {
      lastProgressAt = -Infinity
      var keepFlvOpen = videoOpen && isFlvUrl(url || '') && url === audioSrcUrl
      ++sourceGeneration
      if (videoPrimary) {
        releaseVideoSurface()
      }
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
        renderEqualizer()
      }
      sourceId = opts && opts.sourceId || null
      pendingSourceLoad = sourceId || isFlvUrl(url || '') ? {
        positionMs: (opts && opts.initialPositionMs) || 0,
        autoplay: !!opts && opts.autoplay === true,
      } : null
      audio.currentTime = 0
      audio.src = ''
      audioSrcUrl = url || ''
      emitState(STATE_LOADING)

      if (isFlvUrl(audioSrcUrl)) {
        loadFlv(audioSrcUrl)
        if (keepFlvOpen) {
          videoOpen = true
          video.style.display = 'block'
        }
      } else if (opts && opts.hls) {
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
      if (isRadioHlsSession(audioSrcUrl)) {
        songloftAudio.stop()
        return
      }
      if (videoPrimary && isFlvUrl(audioSrcUrl)) {
        var wasOpen = videoOpen
        ++sourceGeneration
        pendingSourceLoad = null
        releaseVideoSurface()
        videoOpen = wasOpen
        emitState(STATE_PAUSED)
        return
      }
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
      emitState(STATE_IDLE)
      emitProgress()
    },

    seek: function (ms) {
      var media = activeMedia()
      media.currentTime = Math.max(0, Math.min(ms / 1000, media.duration || 0))
      emitProgress(media)
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
      if (on) ensureEqContext()
      renderEqualizer()
    },

    setEqualizerBand: function (index, gainDb) {
      if (index < 0 || index >= 10) return
      eqGains[index] = gainDb
      if (!pluginEqGains && eqFilters[index]) {
        eqFilters[index].gain.value = gainDb
      }
    },

    getPluginEqualizerAvailable: function () {
      return typeof AudioContext === 'function' && !videoPrimary
    },

    setPluginEqualizer: setPluginEqualizer,

    // Native platforms paint the now-playing lyric in the OS notification; Web has
    // no such surface. No-op to match the no-op Web facade in `web-audio.ts`.
    updateNotificationLyric: function (_lyric, _inTitle) {},
    updateNotificationLyricWithLayout: function (lyric, inTitle) {
      songloftAudio.updateNotificationLyric(lyric, inTitle)
    },

    dispose: function () {
      progressIntervalMs = PROGRESS_INTERVAL_MS
      ++sourceGeneration
      pendingSourceLoad = null
      if (videoPrimary) releaseVideoSurface()
      audioSrcUrl = ''
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
      var files = window.__SONGLOFT_TEXT_FILES__
      if (!files || !files.pickAndUploadFile) { callback('file_transfer_unavailable', null); return }
      files.pickAndUploadFile(uploadUrl, fieldName, mimeType).then(
        function (result) { callback(result.error, result.body) },
        function () { callback('upload failed', null) },
      )
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
      SongloftAudio: new URL('./songloft-audio-module.js', document.baseURI).href,
      SongloftPlatform: new URL('./songloft-platform-module.js', document.baseURI).href,
      SongloftNavigation: new URL('./songloft-navigation-module.js', document.baseURI).href,
      SongloftVideo: new URL('./songloft-video-module.js', document.baseURI).href,
    },
  )

  /** Main-thread half of `SongloftPlatform`: this is where the DOM lives. */
  var platformHandlers = {
    setKeepScreenOn: function (args) {
      if (window.__SONGLOFT_SCREEN_AWAKE__) window.__SONGLOFT_SCREEN_AWAKE__.setEnabled(args[0])
    },
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
    openExternalURL: function (args) {
      var popup
      try {
        var url = new URL(args[0])
        if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname)
          return { error: 'invalid external URL' }
        popup = window.open('about:blank', '_blank')
        if (!popup) return { error: 'external URL popup was blocked' }
        popup.opener = null
        popup.location.replace(url.href)
        return { error: null }
      } catch (_) {
        if (popup) popup.close()
        return { error: 'could not open external URL' }
      }
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
