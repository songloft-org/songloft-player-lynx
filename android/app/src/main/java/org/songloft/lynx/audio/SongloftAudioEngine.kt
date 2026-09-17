package org.songloft.lynx.audio

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.audiofx.Equalizer
import android.database.ContentObserver
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.net.Uri
import android.provider.Settings
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Timeline
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
import org.songloft.lynx.platform.ClientFileLog

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
    const val REMOTE_COMMAND_STOP = "stop"

    /** Custom session command backing the notification's favorite button. */
    private const val FAVORITE_ACTION = "org.songloft.lynx.TOGGLE_FAVORITE"
    private val FAVORITE_SESSION_COMMAND = SessionCommand(FAVORITE_ACTION, Bundle.EMPTY)

    /** Custom session command backing the notification's stop/exit button. */
    private const val STOP_ACTION = "org.songloft.lynx.STOP_PLAYBACK"
    private val STOP_SESSION_COMMAND = SessionCommand(STOP_ACTION, Bundle.EMPTY)

    /** Progress tick cadence (ms). */
    private const val PROGRESS_INTERVAL_MS = 500L

    /**
     * Read timeout for HLS, where the first response may be a server-side transcode
     * in progress rather than a stalled connection (see [load]).
     */
    private const val HLS_READ_TIMEOUT_MS = 300_000

    /**
     * Android may deliver a stale MEDIA_STOP shortly after media3 drops the
     * foreground notification at the end of a track. Keep the suppression
     * window short and arm it only for the ended -> load transition used by
     * JS-driven auto-advance.
     */
    private const val AUTO_ADVANCE_STOP_GUARD_MS = 2_000L

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

    /** Monotonic deadline consumed by SongloftPlaybackService for one stale stop. */
    private var autoAdvanceStopGuardUntilMs = 0L

    // -- playback state persistence (for recovery after system kill) -----------

    /** Current track URL, cached for periodic position saves. */
    @Volatile
    private var currentUrl: String? = null
    private var currentHls = false
    private var currentHeaders: Map<String, String>? = null

    /** Progress tick counter — save position to disk every N ticks (~3 s at 500 ms). */
    private var progressSaveCounter = 0
    private const val PROGRESS_SAVE_INTERVAL = 6

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
                .add(STOP_SESSION_COMMAND)
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
            if (customCommand.customAction == STOP_ACTION) {
                ClientFileLog.write('I', "audio", "notification stop command received")
                // Stop playback immediately (no JS round-trip — instant UI feedback).
                stop()
                // Notify JS so it can clean up store state (currentSong, playlist, etc.).
                sink?.emit(EVENT_REMOTE_COMMAND, mapOf("command" to REMOTE_COMMAND_STOP))
                return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
            }
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

    /** The stop/exit [CommandButton] for the notification action bar. */
    fun buildStopButton(): CommandButton {
        return CommandButton.Builder()
            .setSessionCommand(STOP_SESSION_COMMAND)
            .setIconResId(R.drawable.ic_notification_close)
            .setDisplayName("退出")
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
        mediaSessionInternal?.setCustomLayout(listOf(buildFavoriteButton(), buildStopButton()))
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

    /**
     * Why the video screen would, or would not, get a picture — for the module to
     * answer `open` truthfully instead of a bare boolean.
     *
     * `NO_TRACK` and `FAILED` must stay distinct: the first means the stream is ready
     * and carries no picture (a remote song served from a `-vn` cache entry), the
     * second that the stream itself could not be loaded. Treating the latter as the
     * former is how "this file has no video track" came to mask a transcode failure:
     * on error ExoPlayer drops back to `STATE_IDLE` with a `playerError`, which reads
     * exactly like "not prepared", so the failure needs its own branch before the
     * track groups are asked.
     */
    enum class VideoTrackState { HAS_TRACK, NO_TRACK, FAILED, LOADING }

    /**
     * The decoded video's pixel dimensions if any are yet known, else `null`.
     * Main-thread only: the module pumps this from `runOnMain`. Used by pages that
     * mount after `onVideoSizeChanged` already fired.
     */
    fun currentVideoSize(): Pair<Int, Int>? {
        val size = player?.videoSize ?: return null
        if (size.width <= 0 || size.height <= 0) return null
        return size.width to size.height
    }

    /** Main-thread only: the module pumps this from `runOnMain` / the main handler. */
    fun videoTrackState(): VideoTrackState {
        val p = player ?: return VideoTrackState.FAILED
        if (p.playerError != null) return VideoTrackState.FAILED
        return when (p.playbackState) {
            Player.STATE_READY, Player.STATE_ENDED ->
                if (hasVideoTrack()) VideoTrackState.HAS_TRACK else VideoTrackState.NO_TRACK
            Player.STATE_BUFFERING, Player.STATE_IDLE -> VideoTrackState.LOADING
            else -> VideoTrackState.LOADING
        }
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
        PlaybackStateStore.init(service)

        if (sessionBoundToService) {
            ClientFileLog.write('I', "audio", "service session already bound; snapshot=${diagnosticSnapshot()}")
            return
        }

        val existingPlayer = player
        ClientFileLog.write(
            'I', "audio",
            "service session binding begin (pre-existing player=" + (existingPlayer != null) + ") "
                + "snapshot=${diagnosticSnapshot()}",
        )
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
        ClientFileLog.write('I', "audio", "service session binding complete snapshot=${diagnosticSnapshot()}")
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
        PlaybackStateStore.init(context)
        player?.let {
            ClientFileLog.write(
                'I', "audio",
                "ensurePlayer reused (sessionBoundToService=$sessionBoundToService) snapshot=${playerSnapshot(it)}",
            )
            return it
        }
        ClientFileLog.write('I', "audio", "player created before service start (race path)")
        val created = buildPlayer(context)
        created.addListener(playerListener)
        player = created
        videoOutput?.let { created.setVideoSurfaceView(it) }
        mediaSessionInternal = buildMediaSession(context.applicationContext, created)
        attachEqualizer(created.audioSessionId)
        startVolumeObserver(context)
        ClientFileLog.write('I', "audio", "ensurePlayer created snapshot=${playerSnapshot(created)}")
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
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(context, org.songloft.lynx.MainActivity::class.java)
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        launchIntent.putExtra(org.songloft.lynx.MainActivity.EXTRA_NAVIGATE_TO_PLAYER, true)
        val sessionActivity = PendingIntent.getActivity(
            context, 0, launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return MediaSession.Builder(context, forwardingPlayer)
            .setCallback(sessionCallback)
            .setCustomLayout(listOf(buildFavoriteButton(), buildStopButton()))
            .setSessionActivity(sessionActivity)
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
        ClientFileLog.write('I', "audio", "queue metadata registered: n=${metadataByUrl.size}")
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
        val queued = metadataByUrl[url]
        if (queued == null) {
            ClientFileLog.write('W', "audio", "queue refresh: no metadata for ${truncUrl(url)}")
            return
        }
        val newItem = currentItem.buildUpon()
            .setMediaMetadata(applyLyricLine(queued, queued, currentLyricLine))
            .build()
        p.replaceMediaItem(p.currentMediaItemIndex, newItem)
    }

    /** Current lyric line shown in the notification subtitle. */
    @Volatile
    private var currentLyricLine: String? = null

    /** Log-safe text: null-aware, capped at 60 chars (lyric lines, titles). */
    private fun truncText(value: Any?): String {
        val s = value?.toString() ?: "null"
        return if (s.length <= 60) s else s.take(60) + "..."
    }

    /** Log-safe URL: host + last path segment (no query, no token risk). */
    private fun truncUrl(url: String?): String {
        if (url == null) return "null"
        val host = try { java.net.URI(url).host } catch (_: Throwable) { null }
        val last = url.substringBefore('?').substringAfterLast('/')
        return truncText(if (host != null) "$host/$last" else last)
    }

    /** Compact ExoPlayer state used by lifecycle logs and exported diagnostics. */
    fun diagnosticSnapshot(): String = playerSnapshot(player)

    private fun playerSnapshot(p: Player?): String {
        if (p == null) return "player=null"
        return try {
            val mediaUrl = p.currentMediaItem?.localConfiguration?.uri?.toString()
            "player=present playWhenReady=${p.playWhenReady} isPlaying=${p.isPlaying} " +
                "playbackState=${playbackStateName(p.playbackState)}(${p.playbackState}) " +
                "suppression=${p.playbackSuppressionReason} position=${p.currentPosition} " +
                "duration=${p.duration} timelineEmpty=${p.currentTimeline.isEmpty()} " +
                "windows=${p.currentTimeline.windowCount} mediaIndex=${p.currentMediaItemIndex} " +
                "media=${truncUrl(mediaUrl)}"
        } catch (error: Throwable) {
            "player=unavailable(${error.javaClass.simpleName}: ${error.message ?: "no message"})"
        }
    }

    private fun playbackStateName(state: Int): String = when (state) {
        Player.STATE_IDLE -> "IDLE"
        Player.STATE_BUFFERING -> "BUFFERING"
        Player.STATE_READY -> "READY"
        Player.STATE_ENDED -> "ENDED"
        else -> "UNKNOWN"
    }

    private fun safeErrorText(value: String?): String = truncText(value)
        .replace(Regex("https?://[^\\s]+"), "<url>")
        .replace(Regex("((?i:access_token|token)=)[^&\\s]+"), "\$1<redacted>")
        .replace(Regex("[\\r\\n]+"), " ")

    /**
     * Update the notification's second line to the current lyric.
     *
     * `MediaMetadata.subtitle` is **not** rendered by media3's
     * `DefaultMediaNotificationProvider` — its `getNotificationContentText`
     * returns `metadata.artist` when it is set, and only falls back to
     * `subtitle` when artist is null. That is why the earlier `setSubtitle`
     * flow appeared to do nothing: every queue entry has an artist. We stamp
     * the lyric into the `artist` slot instead (the real artist is preserved
     * in [metadataByUrl] and restored when the lyric is null). This is the
     * same trick NetEase / QQ Music use for their notification-lyric feature.
     *
     * Called at most once per lyric line (see `lyric-store.syncPosition`) so
     * `replaceMediaItem` fires on line boundaries — not every progress tick.
     */
    fun updateNotificationLyric(lyric: String?) {
        currentLyricLine = lyric?.takeIf { it.isNotBlank() }
        ClientFileLog.write('I', "audio", "notif lyric: ${truncText(currentLyricLine)}")
        val p = player ?: run {
            ClientFileLog.write('W', "audio", "notif lyric dropped: no player")
            return
        }
        val currentItem = p.currentMediaItem ?: run {
            ClientFileLog.write('W', "audio", "notif lyric dropped: no current item")
            return
        }
        val url = currentItem.localConfiguration?.uri?.toString()
        val queued = url?.let { metadataByUrl[it] }
        if (queued == null) {
            ClientFileLog.write(
                'W', "audio",
                "notif lyric: no queue metadata for ${truncUrl(url)}; basing on item metadata",
            )
        }
        val newItem = currentItem.buildUpon()
            .setMediaMetadata(applyLyricLine(queued ?: currentItem.mediaMetadata, queued, currentLyricLine))
            .build()
        p.replaceMediaItem(p.currentMediaItemIndex, newItem)
    }

    /**
     * Overlay the current lyric onto [base] for notification display. When
     * lyric is null the **original** artist is actively restored: [base] can
     * be the item's own metadata, whose artist slot still holds the previous
     * line when the queue metadata missed — leaving it untouched pinned that
     * stale line to the notification across instrumental gaps and track
     * changes. `setArtist(null)` clears the slot when there is no original to
     * restore (empty second line beats a wrong one).
     */
    private fun applyLyricLine(base: MediaMetadata, queued: MediaMetadata?, lyric: String?): MediaMetadata {
        val builder = base.buildUpon()
        builder.setArtist(lyric ?: queued?.artist)
        return builder.build()
    }

    fun load(context: Context, url: String, hls: Boolean, headers: Map<String, String>?) {
        val p = ensurePlayer(context)
        val wasNaturallyEnded = p.playbackState == Player.STATE_ENDED && p.playWhenReady
        autoAdvanceStopGuardUntilMs = if (wasNaturallyEnded) {
            SystemClock.elapsedRealtime() + AUTO_ADVANCE_STOP_GUARD_MS
        } else {
            0L
        }

        currentUrl = url
        currentHls = hls
        currentHeaders = headers
        progressSaveCounter = 0

        ClientFileLog.write(
            'I', "audio",
            "load begin ${truncUrl(url)} hls=$hls headers=${headers?.size ?: 0} "
                + "queuedMetadata=${metadataByUrl.containsKey(url)} snapshot=${playerSnapshot(p)}",
        )
        if (wasNaturallyEnded) {
            ClientFileLog.write(
                'I', "audio",
                "armed auto-advance MEDIA_STOP guard (${AUTO_ADVANCE_STOP_GUARD_MS}ms)",
            )
        }
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
        try {
            p.setMediaSource(source)
            p.prepare()
            PlaybackStateStore.save(url, 0, 0, hls, headers, p.playWhenReady)
            ClientFileLog.write('I', "audio", "load prepared ${truncUrl(url)} snapshot=${playerSnapshot(p)}")
        } catch (error: Throwable) {
            ClientFileLog.write(
                'E', "audio",
                "load prepare failed ${truncUrl(url)} (${error.javaClass.simpleName}: "
                    + "${safeErrorText(error.message)}) snapshot=${playerSnapshot(p)}",
            )
            throw error
        }
    }

    fun play(context: Context) {
        val p = ensurePlayer(context)
        ClientFileLog.write('I', "audio", "play begin snapshot=${playerSnapshot(p)}")
        p.play()
        ClientFileLog.write('I', "audio", "play requested snapshot=${playerSnapshot(p)}")
    }

    fun pause() {
        val p = player
        ClientFileLog.write('I', "audio", "pause requested snapshot=${playerSnapshot(p)}")
        p?.pause()
        ClientFileLog.write('I', "audio", "pause applied snapshot=${playerSnapshot(p)}")
    }

    fun stop() {
        val p = player
        autoAdvanceStopGuardUntilMs = 0L
        currentUrl = null
        currentHeaders = null
        ClientFileLog.write('W', "audio", "stop begin snapshot=${playerSnapshot(p)}")
        p?.let {
            it.stop()
            it.clearMediaItems()
        }
        stopProgress()
        PlaybackStateStore.clear()
        emitState("idle")
        emitProgressValues(0, 0, 0)
        ClientFileLog.write('I', "audio", "stop complete snapshot=${playerSnapshot(p)}")
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
        ClientFileLog.write('W', "audio", "release begin snapshot=${diagnosticSnapshot()}")
        autoAdvanceStopGuardUntilMs = 0L
        currentUrl = null
        currentHeaders = null
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
        ClientFileLog.write('I', "audio", "release complete snapshot=${diagnosticSnapshot()}")
    }

    /**
     * Release called from [SongloftPlaybackService.onDestroy]. Identical to
     * [release] but split so the call-site is self-documenting.
     */
    fun releaseFromService() {
        ClientFileLog.write('W', "audio", "releaseFromService invoked snapshot=${diagnosticSnapshot()}")
        release()
    }

    /**
     * Attempt to resume playback from persisted state after a system kill.
     *
     * Called by [SongloftPlaybackService] when `onStartCommand` receives a null
     * intent (the hallmark of a `START_STICKY` restart). If saved state exists
     * and is recent enough (< 1 hour), re-loads the track, seeks to the saved
     * position, and resumes playback.
     *
     * Returns `true` if recovery was attempted, `false` if no valid state was found.
     */
    fun recoverPlayback(service: SongloftPlaybackService): Boolean {
        val saved = PlaybackStateStore.load()
        if (saved == null) {
            ClientFileLog.write('I', "audio", "recovery: no saved state")
            return false
        }
        val ageMs = System.currentTimeMillis() - saved.savedAt
        if (ageMs > MAX_RECOVERY_AGE_MS) {
            ClientFileLog.write(
                'W', "audio",
                "recovery: saved state too old (${ageMs / 1000}s > ${MAX_RECOVERY_AGE_MS / 1000}s), discarding",
            )
            PlaybackStateStore.clear()
            return false
        }
        ClientFileLog.write(
            'I', "audio",
            "recovery: resuming url=${truncUrl(saved.url)} position=${saved.positionMs} " +
                "hls=${saved.hls} age=${ageMs / 1000}s",
        )
        try {
            load(service, saved.url, saved.hls, saved.headers)
            val p = player
            if (p != null) {
                if (saved.positionMs > 0) {
                    p.seekTo(saved.positionMs)
                }
                if (saved.playWhenReady) {
                    p.play()
                }
            }
            ClientFileLog.write('I', "audio", "recovery: playback resumed snapshot=${diagnosticSnapshot()}")
            return true
        } catch (error: Throwable) {
            ClientFileLog.write(
                'E', "audio",
                "recovery: failed (${error.javaClass.simpleName}: ${error.message})",
            )
            PlaybackStateStore.clear()
            return false
        }
    }

    /** Don't recover state older than 1 hour — the URL/token is likely stale. */
    private const val MAX_RECOVERY_AGE_MS = 3_600_000L

    /**
     * Consume the one stale stop generated while auto-advance replaces an ended
     * item. This is called by the service only after it has verified that the
     * incoming intent is `KEYCODE_MEDIA_STOP`, never for play/pause/next keys.
     */
    fun consumeAutoAdvanceStopGuard(): Boolean {
        val deadline = autoAdvanceStopGuardUntilMs
        autoAdvanceStopGuardUntilMs = 0L
        if (deadline <= SystemClock.elapsedRealtime()) return false
        val p = player ?: return false
        return p.playWhenReady && p.playbackState != Player.STATE_IDLE
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
        if (currentUrl != null && ++progressSaveCounter >= PROGRESS_SAVE_INTERVAL) {
            progressSaveCounter = 0
            PlaybackStateStore.savePosition(p.currentPosition, duration)
        }
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
         * The media notification renders exactly this metadata, so logging it
         * closes the loop between "we replaced the item" and "the session
         * actually carries the lyric" — the end of the notif-lyric chain that
         * an export can verify without logcat.
         */
        override fun onMediaMetadataChanged(mediaMetadata: MediaMetadata) {
            ClientFileLog.write(
                'I', "audio",
                "session metadata: title=${truncText(mediaMetadata.title)} artist=${truncText(mediaMetadata.artist)}",
            )
        }

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
            ClientFileLog.write(
                'I', "audio",
                "playback state changed state=${playbackStateName(state)}($state) snapshot=${diagnosticSnapshot()}",
            )
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

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            ClientFileLog.write(
                'I', "audio",
                "playWhenReady changed value=$playWhenReady reason=$reason snapshot=${diagnosticSnapshot()}",
            )
        }

        override fun onPlaybackSuppressionReasonChanged(playbackSuppressionReason: Int) {
            ClientFileLog.write(
                'I', "audio",
                "playback suppression changed reason=$playbackSuppressionReason snapshot=${diagnosticSnapshot()}",
            )
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            ClientFileLog.write(
                'I', "audio",
                "isPlaying changed value=$isPlaying snapshot=${diagnosticSnapshot()}",
            )
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

        override fun onTimelineChanged(timeline: Timeline, reason: Int) {
            ClientFileLog.write(
                'I', "audio",
                "timeline changed reason=$reason empty=${timeline.isEmpty()} "
                    + "windows=${timeline.windowCount} periods=${timeline.periodCount} "
                    + "snapshot=${diagnosticSnapshot()}",
            )
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            val mediaUrl = mediaItem?.localConfiguration?.uri?.toString()
            ClientFileLog.write(
                'I', "audio",
                "media item transition reason=$reason media=${truncUrl(mediaUrl)} "
                    + "snapshot=${diagnosticSnapshot()}",
            )
        }

        override fun onAudioSessionIdChanged(audioSessionId: Int) {
            ClientFileLog.write(
                'I', "audio",
                "audio session id changed id=$audioSessionId snapshot=${diagnosticSnapshot()}",
            )
        }

        override fun onPlayerError(error: PlaybackException) {
            ClientFileLog.write(
                'E', "audio",
                "player error code=${error.errorCodeName} type=${error.javaClass.simpleName} "
                    + "message=${safeErrorText(error.message)} "
                    + "cause=${error.cause?.javaClass?.simpleName ?: "none"} "
                    + "snapshot=${diagnosticSnapshot()}",
            )
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
