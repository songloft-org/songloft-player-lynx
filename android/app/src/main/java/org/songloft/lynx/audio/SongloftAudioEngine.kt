package org.songloft.lynx.audio

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.session.MediaSession

/**
 * Process-wide audio engine backing [SongloftAudioModule] and
 * [SongloftPlaybackService].
 *
 * ExoPlayer must be created and driven on a thread with a `Looper`; all Lynx
 * `@LynxMethod` calls arrive on the background (BTS) thread, so every public
 * method here funnels through [runOnMain] onto the main looper. The engine owns
 * a single [ExoPlayer] plus a media3 [MediaSession] (so the foreground
 * [SongloftPlaybackService] can surface a system notification / lock-screen
 * controls) and re-broadcasts ExoPlayer state/progress/error through the
 * [AudioEventSink] the module installs.
 *
 * Event payloads and the state vocabulary are kept **identical to the TS mock**
 * (`src/native/audio-types.ts`) so the facade can swap native ⇄ mock cleanly:
 *   - stateChanged: { state: idle|loading|ready|playing|paused|completed|error }
 *   - progress:     { positionMs, bufferedMs, durationMs }
 *   - error:        { code, message }
 */
@UnstableApi
object SongloftAudioEngine {
    /** Event names must byte-for-byte match the TS listeners in native-audio.ts. */
    const val EVENT_STATE = "SongloftAudio.stateChanged"
    const val EVENT_PROGRESS = "SongloftAudio.progress"
    const val EVENT_ERROR = "SongloftAudio.error"

    /** Progress tick cadence (ms). */
    private const val PROGRESS_INTERVAL_MS = 500L

    private val mainHandler = Handler(Looper.getMainLooper())

    private var player: ExoPlayer? = null
    private var mediaSessionInternal: MediaSession? = null

    /** Installed by the module; forwards events to `LynxContext.sendGlobalEvent`. */
    @Volatile
    var sink: AudioEventSink? = null

    /** Read by [SongloftPlaybackService.onGetSession]. */
    val mediaSession: MediaSession?
        get() = mediaSessionInternal

    private var progressActive = false

    private val progressTick = object : Runnable {
        override fun run() {
            emitProgress()
            if (progressActive) mainHandler.postDelayed(this, PROGRESS_INTERVAL_MS)
        }
    }

    /** Run [block] on the main looper (immediately if already there). */
    fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block()
        else mainHandler.post(block)
    }

    /** Lazily create the ExoPlayer + MediaSession. Main thread only. */
    private fun ensurePlayer(context: Context): ExoPlayer {
        player?.let { return it }
        val appContext = context.applicationContext
        val created = ExoPlayer.Builder(appContext).build()
        created.addListener(playerListener)
        player = created
        mediaSessionInternal = MediaSession.Builder(appContext, created).build()
        return created
    }

    // ── controls (main thread) ──────────────────────────────────────────────

    fun load(context: Context, url: String, hls: Boolean, headers: Map<String, String>?) {
        val p = ensurePlayer(context)
        emitState("loading")
        val httpFactory = DefaultHttpDataSource.Factory().apply {
            if (!headers.isNullOrEmpty()) setDefaultRequestProperties(headers)
        }
        val item = MediaItem.fromUri(url)
        val source = if (hls || url.endsWith(".m3u8")) {
            HlsMediaSource.Factory(httpFactory).createMediaSource(item)
        } else {
            ProgressiveMediaSource.Factory(httpFactory).createMediaSource(item)
        }
        p.setMediaSource(source)
        p.prepare()
    }

    fun play(context: Context) {
        val p = ensurePlayer(context)
        p.play()
    }

    fun pause() {
        player?.pause()
    }

    fun stop() {
        player?.let {
            it.stop()
            it.clearMediaItems()
        }
        stopProgress()
        emitState("idle")
        emitProgressValues(0, 0, 0)
    }

    fun seek(positionMs: Long) {
        player?.seekTo(if (positionMs < 0) 0 else positionMs)
        emitProgress()
    }

    fun setVolume(volume: Float) {
        player?.volume = volume.coerceIn(0f, 1f)
    }

    fun setSpeed(rate: Float) {
        player?.setPlaybackSpeed(rate.coerceIn(0.5f, 3f))
    }

    fun release() {
        stopProgress()
        mediaSessionInternal?.release()
        mediaSessionInternal = null
        player?.release()
        player = null
    }

    // ── progress ──────────────────────────────────────────────────────────────

    private fun startProgress() {
        if (progressActive) return
        progressActive = true
        mainHandler.post(progressTick)
    }

    private fun stopProgress() {
        progressActive = false
        mainHandler.removeCallbacks(progressTick)
    }

    private fun emitProgress() {
        val p = player ?: return
        val duration = if (p.duration == C.TIME_UNSET || p.duration < 0) 0L else p.duration
        emitProgressValues(p.currentPosition, p.bufferedPosition, duration)
    }

    private fun emitProgressValues(positionMs: Long, bufferedMs: Long, durationMs: Long) {
        sink?.emit(
            EVENT_PROGRESS,
            mapOf(
                "positionMs" to positionMs.toDouble(),
                "bufferedMs" to bufferedMs.toDouble(),
                "durationMs" to durationMs.toDouble(),
            ),
        )
    }

    private fun emitState(state: String) {
        sink?.emit(EVENT_STATE, mapOf("state" to state))
    }

    // ── ExoPlayer listener → facade events ─────────────────────────────────────

    private val playerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
            when (state) {
                Player.STATE_BUFFERING -> emitState("loading")
                Player.STATE_READY -> emitState("ready")
                Player.STATE_ENDED -> {
                    stopProgress()
                    emitProgress()
                    emitState("completed")
                }
                Player.STATE_IDLE -> {}
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) {
                emitState("playing")
                startProgress()
            } else {
                stopProgress()
                val p = player
                // Don't emit `paused` on natural end — `completed` already fired.
                if (p == null || p.playbackState != Player.STATE_ENDED) emitState("paused")
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            stopProgress()
            sink?.emit(
                EVENT_ERROR,
                mapOf(
                    "code" to error.errorCodeName,
                    "message" to (error.message ?: "playback error"),
                ),
            )
            emitState("error")
        }
    }
}

/** Sink the module installs to forward engine events to the JS runtime. */
interface AudioEventSink {
    fun emit(event: String, payload: Map<String, Any?>)
}
