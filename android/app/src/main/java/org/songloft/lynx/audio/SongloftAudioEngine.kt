package org.songloft.lynx.audio

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
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
 * **Lifecycle / notification architecture:**
 *
 * For the media notification to work, `MediaSessionService` must be able to
 * associate the `MediaSession` with itself. This requires the `MediaSession` to
 * be created with the **service** as the `context` argument (not
 * `applicationContext`). The flow is:
 *
 * 1. Module calls `startForegroundService()` then posts engine commands via
 *    [runOnMain].
 * 2. [SongloftPlaybackService.onCreate] calls [initFromService], which creates
 *    the `ExoPlayer` and `MediaSession` using the service context.
 * 3. Any subsequent [ensurePlayer] call from the module is a no-op (player
 *    already exists).
 * 4. If the service hasn't started yet when a module command runs (race),
 *    [ensurePlayer] creates a player with `applicationContext` so playback is
 *    not blocked. When the service subsequently starts, [initFromService]
 *    re-creates the `MediaSession` with the correct service context.
 *
 * Event payloads and the state vocabulary are kept **identical to the TS mock**
 * (`src/native/audio-types.ts`):
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

    /**
     * Whether [initFromService] has been called (i.e. the `MediaSession` was
     * created with the service context). Used to decide whether a late service
     * start needs to re-create the session.
     */
    private var sessionBoundToService = false

    /** Installed by the module; forwards events to `LynxContext.sendGlobalEvent`. */
    @Volatile
    var sink: AudioEventSink? = null

    /** Read by [SongloftPlaybackService.onGetSession]. */
    val mediaSession: MediaSession?
        get() = mediaSessionInternal

    private var progressActive = false

    /**
     * url -> media metadata (title / artist / artwork), populated from the JS
     * store's `setQueue` so the media notification / lock-screen has content.
     */
    private val metadataByUrl = HashMap<String, MediaMetadata>()

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

    /**
     * Called from [SongloftPlaybackService.onCreate] on the main thread.
     * Creates the player + session using the **service** context so the
     * framework can bind the notification to this service. If the player was
     * already created (race: module's `load` ran before the service started),
     * we keep the player but re-create the `MediaSession` with the correct
     * context.
     */
    fun initFromService(service: SongloftPlaybackService) {
        if (sessionBoundToService) return          // already done

        val existingPlayer = player
        if (existingPlayer != null) {
            // Player exists but was created before the service. Re-create the
            // MediaSession with the service context so notifications work.
            mediaSessionInternal?.release()
            mediaSessionInternal = MediaSession.Builder(service, existingPlayer).build()
        } else {
            val created = ExoPlayer.Builder(service.applicationContext).build()
            created.addListener(playerListener)
            player = created
            mediaSessionInternal = MediaSession.Builder(service, created).build()
        }
        sessionBoundToService = true
    }

    /**
     * Lazily create the ExoPlayer + MediaSession. Main thread only.
     *
     * Normally [initFromService] runs first (the service starts before the
     * module's `runOnMain` block), so this is a no-op. If there is a race and
     * this runs first, it creates the player with `applicationContext` so
     * playback is not blocked; [initFromService] will later re-create the
     * session with the correct context.
     */
    fun ensurePlayer(context: Context): ExoPlayer {
        player?.let { return it }
        val appContext = context.applicationContext
        val created = ExoPlayer.Builder(appContext).build()
        created.addListener(playerListener)
        player = created
        mediaSessionInternal = MediaSession.Builder(appContext, created).build()
        return created
    }

    // -- controls (main thread) ------------------------------------------------

    /**
     * Replace the queue metadata (url -> title/artist/artwork) so the media
     * notification has content. Playback itself stays one-item-at-a-time driven
     * by the JS store (same as the mock); this only feeds notification metadata.
     */
    fun setQueueMetadata(items: List<QueueMetadata>) {
        metadataByUrl.clear()
        for (item in items) {
            if (item.url.isEmpty()) continue
            val builder = MediaMetadata.Builder()
            item.title?.let { builder.setTitle(it) }
            item.artist?.let { builder.setArtist(it) }
            item.artworkUrl?.takeIf { it.isNotEmpty() }?.let {
                builder.setArtworkUri(Uri.parse(it))
            }
            metadataByUrl[item.url] = builder.build()
        }
    }

    fun load(context: Context, url: String, hls: Boolean, headers: Map<String, String>?) {
        val p = ensurePlayer(context)
        emitState("loading")
        val httpFactory = DefaultHttpDataSource.Factory().apply {
            if (!headers.isNullOrEmpty()) setDefaultRequestProperties(headers)
        }
        // Attach media metadata (if the JS store pre-registered it via setQueue)
        // so the foreground notification / lock screen shows title + artist.
        val itemBuilder = MediaItem.Builder().setUri(url)
        metadataByUrl[url]?.let { itemBuilder.setMediaMetadata(it) }
        val item = itemBuilder.build()
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

    /** Full release -- called by the module's `dispose()`. */
    fun release() {
        stopProgress()
        mediaSessionInternal?.release()
        mediaSessionInternal = null
        player?.removeListener(playerListener)
        player?.release()
        player = null
        sessionBoundToService = false
    }

    /**
     * Release called from [SongloftPlaybackService.onDestroy]. Identical to
     * [release] but split so the call-site is self-documenting.
     */
    fun releaseFromService() {
        release()
    }

    // -- progress --------------------------------------------------------------

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

    // -- ExoPlayer listener -> facade events -----------------------------------

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
                // Don't emit `paused` on natural end -- `completed` already fired.
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

/** One queue entry's notification metadata (parsed from the JS `setQueue`). */
data class QueueMetadata(
    val url: String,
    val title: String?,
    val artist: String?,
    val artworkUrl: String?,
)
