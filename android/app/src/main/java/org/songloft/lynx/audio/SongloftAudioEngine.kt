package org.songloft.lynx.audio

import android.content.Context
import android.media.AudioManager
import android.media.audiofx.Equalizer
import android.database.ContentObserver
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.net.Uri
import android.provider.Settings
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import android.view.SurfaceView
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.songloft.lynx.R

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
    const val EVENT_REMOTE_COMMAND = "SongloftAudio.remoteCommand"

    /** `remoteCommand` payload values — byte-for-byte match the TS `RemoteCommand` union. */
    const val REMOTE_COMMAND_NEXT = "next"
    const val REMOTE_COMMAND_PREVIOUS = "previous"
    const val REMOTE_COMMAND_TOGGLE_FAVORITE = "toggleFavorite"

    /** Custom session command backing the notification's favorite button. */
    private const val FAVORITE_ACTION = "org.songloft.lynx.TOGGLE_FAVORITE"
    private val FAVORITE_SESSION_COMMAND = SessionCommand(FAVORITE_ACTION, Bundle.EMPTY)

    /** Progress tick cadence (ms). */
    private const val PROGRESS_INTERVAL_MS = 500L

    /**
     * Read timeout for HLS, where the first response may be a server-side transcode
     * in progress rather than a stalled connection (see [load]).
     */
    private const val HLS_READ_TIMEOUT_MS = 300_000

    /**
     * Marks the server-side video transcode endpoint
     * (`/api/v1/songs/{id}/video-hls/playlist.m3u8`) — the only HLS source that is
     * expected to block for minutes, and therefore the only one that may raise the
     * read timeout. See [load].
     */
    private const val VIDEO_HLS_PATH_MARKER = "/video-hls/"

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

    /**
     * Current track's favorite state, pushed from JS via [setFavorite]. Drives
     * the notification's favorite button icon (filled vs outline).
     */
    @Volatile
    private var isFavorite = false

    /** MediaSession.Callback: advertises + handles the favorite custom command. */
    private val sessionCallback = object : MediaSession.Callback {
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): MediaSession.ConnectionResult {
            val sessionCommands = MediaSession.ConnectionResult.DEFAULT_SESSION_COMMANDS
                .buildUpon()
                .add(FAVORITE_SESSION_COMMAND)
                .build()
            return MediaSession.ConnectionResult.accept(
                sessionCommands,
                MediaSession.ConnectionResult.DEFAULT_PLAYER_COMMANDS,
            )
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle,
        ): ListenableFuture<SessionResult> {
            if (customCommand.customAction == FAVORITE_ACTION) {
                sink?.emit(EVENT_REMOTE_COMMAND, mapOf("command" to REMOTE_COMMAND_TOGGLE_FAVORITE))
                return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED))
        }
    }

    /** The favorite [CommandButton] reflecting the current [isFavorite] state. */
    private fun buildFavoriteButton(): CommandButton {
        val iconRes = if (isFavorite) {
            R.drawable.ic_notification_favorite_filled
        } else {
            R.drawable.ic_notification_favorite_border
        }
        return CommandButton.Builder()
            .setSessionCommand(FAVORITE_SESSION_COMMAND)
            .setIconResId(iconRes)
            .setDisplayName(if (isFavorite) "取消收藏" else "收藏")
            .build()
    }

    /**
     * Update the favorite state pushed from JS (after a successful add/remove
     * against the favorites playlist) and refresh the notification's favorite
     * button icon. `setCustomLayout` is media3's documented mechanism for
     * updating a session's custom notification buttons after construction.
     */
    fun setFavorite(value: Boolean) {
        isFavorite = value
        mediaSessionInternal?.setCustomLayout(listOf(buildFavoriteButton()))
    }

    // -- equalizer -------------------------------------------------------------

    private var equalizer: Equalizer? = null
    private var eqEnabled = false
    private val eqPendingGains = HashMap<Int, Float>()

    private fun attachEqualizer(audioSessionId: Int) {
        try {
            equalizer?.release()
            val eq = Equalizer(0, audioSessionId)
            eq.enabled = eqEnabled
            for ((index, gainDb) in eqPendingGains) {
                applyBandGain(eq, index, gainDb)
            }
            equalizer = eq
        } catch (_: Throwable) {
            // Some devices don't support Equalizer
        }
    }

    private fun applyBandGain(eq: Equalizer, index: Int, gainDb: Float) {
        val numBands = eq.numberOfBands.toInt()
        if (index < 0 || index >= numBands) return
        val milliBel = (gainDb * 100).toInt().toShort()
        val range = eq.bandLevelRange
        val clamped = milliBel.coerceIn(range[0], range[1])
        eq.setBandLevel(index.toShort(), clamped)
    }

    fun setEqualizerEnabled(on: Boolean) {
        eqEnabled = on
        equalizer?.enabled = on
    }

    fun setEqualizerBand(index: Int, gainDb: Float) {
        eqPendingGains[index] = gainDb
        val eq = equalizer ?: return
        applyBandGain(eq, index, gainDb)
    }

    private fun releaseEqualizer() {
        equalizer?.release()
        equalizer = null
    }

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

    /**
     * Surface currently receiving the video track, if a fullscreen video screen is up.
     *
     * Held as a field rather than only handed to the player because the player is
     * created lazily on two different paths ([initFromService] / [ensurePlayer]) — a
     * screen that opened first would otherwise attach to nothing.
     */
    private var videoOutput: SurfaceView? = null

    /**
     * Route the video track of whatever is playing into [view].
     *
     * Deliberately not an `exposed player` getter: the caller gets to display the
     * picture, not to drive transport, seek or replace the item. Everything else
     * about playback keeps flowing through this engine, which is what makes opening
     * the video screen free — attaching a surface to a stream that already carries a
     * video track touches neither the `MediaSource` nor the audio renderer, so
     * position and state do not so much as blink.
     *
     * Main thread only, like every other public member here.
     */
    /**
     * Called with the decoded video's pixel dimensions whenever they become known, so
     * the display can letterbox instead of stretching. Set alongside the surface.
     */
    private var videoSizeListener: ((Int, Int) -> Unit)? = null

    fun attachVideoOutput(view: SurfaceView, onVideoSize: ((Int, Int) -> Unit)? = null) {
        videoOutput = view
        videoSizeListener = onVideoSize
        player?.setVideoSurfaceView(view)
        // The size may already be known from an earlier attach, in which case no
        // change event is coming — hand over what we have.
        player?.videoSize?.takeIf { it.width > 0 && it.height > 0 }?.let {
            onVideoSize?.invoke(it.width, it.height)
        }
    }

    /**
     * Stop routing video and drop the reference.
     *
     * **Not optional on the way out.** ExoPlayer keeps writing to a `Surface` it was
     * given, so a screen that goes away without calling this leaves the player
     * pushing frames at a destroyed window: logcat fills with `Surface … abandoned`
     * and the *next* audio-only track fails inside the video renderer — playback dies
     * with nothing on screen to explain why.
     */
    fun detachVideoOutput() {
        videoOutput = null
        videoSizeListener = null
        player?.clearVideoSurface()
    }

    /**
     * Whether the stream being played actually contains a video track.
     *
     * Read from the **track groups**, not from `player.videoSize`. The size only
     * becomes known once the decoder has produced a frame, and without a surface it
     * never does — so asking about the size before opening the video screen is a
     * chicken-and-egg question that always answers "no picture". Track groups come
     * from track selection and are known as soon as the media is prepared.
     *
     * Worth asking at all because `songs.is_video` is recorded from the *original*
     * file at scan time, while a remote song may be served out of a cache entry that
     * was transcoded with `-vn` (see the parent repo's AGENTS.md on cache transcode) —
     * metadata says video, the stream has none, and the screen would just be black.
     */
    fun hasVideoTrack(): Boolean {
        val groups = player?.currentTracks?.groups ?: return false
        return groups.any { it.type == C.TRACK_TYPE_VIDEO && it.length > 0 }
    }

    // -- volume (system media stream) ------------------------------------------

    private var appContext: Context? = null
    private var audioManager: AudioManager? = null
    private var volumeObserver: ContentObserver? = null

    /**
     * Emit a `volumeChanged` event to JS with the current system media volume
     * (normalized 0–100 to match the store's scale).
     */
    const val EVENT_VOLUME_CHANGED = "SongloftAudio.volumeChanged"

    private fun getSystemVolume(): Int {
        val am = audioManager ?: return 50
        val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        if (max <= 0) return 50
        return (current * 100f / max).toInt().coerceIn(0, 100)
    }

    fun setSystemVolume(volume: Int, context: Context) {
        val am = audioManager ?: (context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager) ?: return
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val target = (volume * max / 100f).toInt().coerceIn(0, max)
        am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
    }

    fun getVolume(context: Context): Int {
        if (audioManager == null) {
            audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        }
        return getSystemVolume()
    }

    private fun startVolumeObserver(context: Context) {
        val ctx = context.applicationContext
        appContext = ctx
        if (audioManager == null) {
            audioManager = ctx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        }
        if (volumeObserver != null) return
        val observer = object : ContentObserver(mainHandler) {
            override fun onChange(selfChange: Boolean) {
                val vol = getSystemVolume()
                sink?.emit(EVENT_VOLUME_CHANGED, mapOf("volume" to vol.toDouble()))
            }
        }
        ctx.contentResolver.registerContentObserver(
            Settings.System.CONTENT_URI, true, observer,
        )
        volumeObserver = observer
    }

    private fun stopVolumeObserver() {
        val observer = volumeObserver ?: return
        appContext?.contentResolver?.unregisterContentObserver(observer)
        volumeObserver = null
    }

    // -- audio attributes for audio focus + becoming-noisy ---------------------

    private val musicAudioAttributes = AudioAttributes.Builder()
        .setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
        .build()

    private fun buildPlayer(context: Context): ExoPlayer {
        return ExoPlayer.Builder(context.applicationContext)
            .setAudioAttributes(musicAudioAttributes, /* handleAudioFocus= */ true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()
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
            mediaSessionInternal = buildMediaSession(service, existingPlayer)
        } else {
            val created = buildPlayer(service)
            created.addListener(playerListener)
            player = created
            // A video screen may already be up (it can open before the service
            // finishes starting); re-apply so it is not left with a blank surface.
            videoOutput?.let { created.setVideoSurfaceView(it) }
            mediaSessionInternal = buildMediaSession(service, created)
            attachEqualizer(created.audioSessionId)
        }
        startVolumeObserver(service)
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
        val created = buildPlayer(context)
        created.addListener(playerListener)
        player = created
        videoOutput?.let { created.setVideoSurfaceView(it) }
        mediaSessionInternal = buildMediaSession(context.applicationContext, created)
        attachEqualizer(created.audioSessionId)
        startVolumeObserver(context)
        return created
    }

    /**
     * Build the [MediaSession] wrapping [rawPlayer] in a
     * [RemoteCommandForwardingPlayer] (next/previous forwarded to JS) with the
     * favorite [sessionCallback] + initial custom layout attached.
     */
    private fun buildMediaSession(context: Context, rawPlayer: ExoPlayer): MediaSession {
        val forwardingPlayer = RemoteCommandForwardingPlayer(rawPlayer) { command ->
            sink?.emit(EVENT_REMOTE_COMMAND, mapOf("command" to command))
        }
        return MediaSession.Builder(context, forwardingPlayer)
            .setCallback(sessionCallback)
            .setCustomLayout(listOf(buildFavoriteButton()))
            .build()
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
        refreshCurrentItemMetadata()
    }

    /**
     * If the player already has a loaded item whose URL matches the metadata
     * map, update its metadata in-place so the notification refreshes without
     * waiting for the next load().
     */
    private fun refreshCurrentItemMetadata() {
        val p = player ?: return
        val currentItem = p.currentMediaItem ?: return
        val url = currentItem.localConfiguration?.uri?.toString() ?: return
        val meta = metadataByUrl[url] ?: return
        val merged = meta.buildUpon()
            .setSubtitle(currentLyricLine)
            .build()
        val newItem = currentItem.buildUpon().setMediaMetadata(merged).build()
        p.replaceMediaItem(p.currentMediaItemIndex, newItem)
    }

    /** Current lyric line shown in the notification subtitle. */
    @Volatile
    private var currentLyricLine: String? = null

    /**
     * Update the notification to show the current lyric line as the subtitle.
     * Called from JS whenever the active lyric line changes.
     */
    fun updateNotificationLyric(lyric: String?) {
        currentLyricLine = lyric
        val p = player ?: return
        val currentItem = p.currentMediaItem ?: return
        val existingMeta = currentItem.mediaMetadata
        val newMeta = existingMeta.buildUpon()
            .setSubtitle(lyric)
            .build()
        val newItem = currentItem.buildUpon().setMediaMetadata(newMeta).build()
        p.replaceMediaItem(p.currentMediaItemIndex, newItem)
    }

    fun load(context: Context, url: String, hls: Boolean, headers: Map<String, String>?) {
        val p = ensurePlayer(context)
        emitState("loading")
        // `DefaultHttpDataSource` is HttpURLConnection-backed and exposes no SSL
        // hook, so self-signed servers work here only because
        // `org.songloft.lynx.net.InsecureTls.update` mutates the process-wide
        // `HttpsURLConnection` defaults. That coupling is intentional, not an
        // oversight: making it explicit means switching to `OkHttpDataSource`,
        // i.e. a new `media3-datasource-okhttp` dependency to align in version
        // with the rest of media3. Not worth it for one TLS flag.
        val httpFactory = DefaultHttpDataSource.Factory().apply {
            if (!headers.isNullOrEmpty()) setDefaultRequestProperties(headers)
            // Radio playback is: our **http** backend -> 302 -> the upstream stream,
            // which is virtually always **https**. `DefaultHttpDataSource` refuses
            // cross-protocol redirects by default, so every such radio died at that
            // 302 with an opaque `InvalidResponseCodeException: Response code: 302`
            // — verified on-device, where a *same*-protocol 302 was followed through
            // to segment requests just fine.
            //
            // The flag also permits the reverse (https -> http) downgrade. Accepted:
            // these are public broadcast streams whose bytes are not secret, and the
            // alternative is that the feature does not work at all.
            setAllowCrossProtocolRedirects(true)
        }
        // Attach media metadata (if the JS store pre-registered it via setQueue)
        // so the foreground notification / lock screen shows title + artist.
        val itemBuilder = MediaItem.Builder().setUri(url)
        metadataByUrl[url]?.let { itemBuilder.setMediaMetadata(it) }
        val item = itemBuilder.build()
        val source = if (hls || url.endsWith(".m3u8")) {
            // `/video-hls/playlist.m3u8` transcodes the **whole file** before it
            // answers, so the first request can sit there for minutes on a weak
            // server. `DefaultHttpDataSource`'s 8 s default read timeout turns that
            // into a `SocketTimeoutException` surfacing as a generic playback error —
            // indistinguishable from the 503 the same endpoint returns when ffmpeg is
            // missing, which is the wrong thing to go looking at.
            //
            // Scoped to that endpoint **by URL**, because `hls` is no longer unique to
            // it: HLS radios now pass the flag too (their `.m3u8` extension cannot be
            // sniffed off the built URL, which carries `?access_token=…`). A live
            // stream must NOT inherit this timeout — waiting is the expected state for
            // a transcode, but for a broadcast it would make a dead stream take five
            // minutes to report instead of eight seconds.
            if (url.contains(VIDEO_HLS_PATH_MARKER)) {
                httpFactory.setReadTimeoutMs(HLS_READ_TIMEOUT_MS)
            }
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

    fun setVolume(volume: Float, context: Context) {
        val am = audioManager ?: (context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager) ?: return
        audioManager = am
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val target = (volume * max).toInt().coerceIn(0, max)
        am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
    }

    fun setSpeed(rate: Float) {
        player?.setPlaybackSpeed(rate.coerceIn(0.5f, 3f))
    }

    /** Full release -- called by the module's `dispose()`. */
    fun release() {
        stopProgress()
        releaseEqualizer()
        stopVolumeObserver()
        mediaSessionInternal?.release()
        mediaSessionInternal = null
        player?.removeListener(playerListener)
        player?.release()
        player = null
        audioManager = null
        appContext = null
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
        /**
         * Forward the decoded video dimensions to whoever is displaying them.
         *
         * The video screen cannot work this out for itself: `player.videoSize` is only
         * populated once a frame has been decoded, which cannot happen before it has
         * lent the player a surface. Without this the surface just fills its parent and
         * every video is stretched to the device's aspect ratio.
         */
        override fun onVideoSizeChanged(videoSize: androidx.media3.common.VideoSize) {
            if (videoSize.width > 0 && videoSize.height > 0) {
                videoSizeListener?.invoke(videoSize.width, videoSize.height)
            }
        }

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
