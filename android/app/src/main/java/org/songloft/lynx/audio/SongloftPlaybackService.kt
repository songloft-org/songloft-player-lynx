package org.songloft.lynx.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import org.songloft.lynx.R
import org.songloft.lynx.platform.ClientFileLog

/**
 * Foreground media service backing background playback + notification /
 * lock-screen controls.
 *
 * In the standard media3 architecture the **service** must own the lifecycle of
 * the [MediaSession] and its underlying player so the framework can display
 * the media-style notification and keep the service in the foreground while
 * audio is active.
 *
 * Previous behaviour: [SongloftAudioEngine] created the `MediaSession` with
 * `applicationContext`. The framework could not associate that session with
 * this `MediaSessionService`, so `onUpdateNotification` was never called and
 * the foreground notification was never posted.
 *
 * Fixed behaviour:
 * 1. [onCreate] calls [SongloftAudioEngine.initFromService] with `this` (the
 *    service) so the `MediaSession` is bound to the service context. If the
 *    player was already created (module `load` won a race), the session is
 *    re-created with the service context while the existing player is kept.
 * 2. [onGetSession] returns the engine's session -- guaranteed non-null after
 *    `onCreate`.
 * 3. [onTaskRemoved] / [onDestroy] release the player to avoid leaked sessions.
 *
 * The module ([SongloftAudioModule]) starts this service **before** issuing any
 * play/load command, ensuring (in the common case) the service is alive and
 * the session is created with the right context before ExoPlayer transitions
 * to `STATE_READY -> isPlaying = true`.
 *
 * ## Foreground-service start deadline
 *
 * Whoever calls `startForegroundService()` (see [SongloftAudioModule.play])
 * has **5 seconds** on Android O+ to call `startForeground()` or the OS kills
 * the process with `ForegroundServiceDidNotStartInTimeException`. That is the
 * "playback stopped like the app crashed" symptom: playback silently dies,
 * often mid-song, whenever media3's own notification is late to appear
 * (network stall on `load`, transcode HLS, MediaSession still connecting).
 *
 * `DefaultMediaNotificationProvider` only posts a real notification once the
 * player transitions to playing, which can easily be more than 5 seconds
 * after the service starts on a bad connection. So [onStartCommand] posts a
 * lightweight placeholder foreground notification **immediately** — media3
 * then replaces it with its own MediaStyle notification as soon as playback
 * begins. This costs one extra notification-manager call per service start
 * and buys unconditional compliance with the deadline.
 *
 * ## Why the placeholder is conditional ([mediaNotificationOwnsSlot])
 *
 * The placeholder and media3's own notification share **notification id 1001**
 * (`DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID`), which is what
 * makes "media3 replaces it" work at all. The same sharing makes the reverse
 * true: whoever posts last wins the slot.
 *
 * And media3 posts *through this service*. `MediaNotificationManager`'s
 * foreground path is `ContextCompat.startForegroundService(service, selfIntent)`
 * followed by `setForegroundServiceNotification(...)` — so every notification
 * update while playing re-enters [onStartCommand], **after** the MediaStyle
 * notification was set (AMS delivers the start command through the main looper).
 * An unconditional placeholder therefore overwrote the media notification
 * within milliseconds of media3 posting it, every single time: measured on
 * device, the shade showed the blank silent "Songloft" placeholder for the
 * whole song and the real player card only appeared while **paused** (the
 * paused path is `notify()`, which does not self-start the service).
 *
 * So the placeholder is posted only while media3 does *not* hold the slot.
 * [mediaNotificationOwnsSlot] mirrors media3's own `startedInForeground`: it is
 * set from the `startInForegroundRequired` flag of the most recent
 * [onUpdateNotification], **before** delegating, because delegating is what
 * triggers the re-entrant start command. Any state in which media3 has given
 * the foreground up (paused, stopped, session gone) sets it back to false, so
 * the next `startForegroundService` from [SongloftAudioModule] still gets its
 * deadline covered.
 *
 * Registered in the manifest with `foregroundServiceType="mediaPlayback"` and
 * the required `<intent-filter>` for `MediaSessionService`.
 */
@UnstableApi
class SongloftPlaybackService : MediaSessionService() {

    override fun onCreate() {
        super.onCreate()
        ClientFileLog.init(this)
        ClientFileLog.write('I', "audio-svc", "created")
        // Custom small icon so the media notification (and the badge over its
        // large icon/artwork) shows the Songloft logo instead of media3's
        // built-in music-note placeholder (`media3_notification_small_icon`).
        // The monochrome adaptive-icon layer is already alpha-safe for this.
        setMediaNotificationProvider(
            DefaultMediaNotificationProvider(this).apply {
                setSmallIcon(R.drawable.ic_launcher_monochrome)
            },
        )
        // Create (or re-bind) the player + session using this service's context
        // so the framework's notification manager can post the media notification.
        SongloftAudioEngine.initFromService(this)
        // Register the session with this MediaSessionService so it manages the
        // foreground notification lifecycle automatically. Without this call the
        // service is unaware of the session and never posts the notification.
        val session = SongloftAudioEngine.mediaSession
        if (session == null) {
            // initFromService unconditionally builds one, so this should be
            // unreachable — but if it ever happens the notification is exactly
            // what breaks, so say so in the exported log.
            ClientFileLog.write('W', "audio-svc", "no session after initFromService; notification will not appear")
        } else {
            addSession(session)
        }
        ensureNotificationChannel()
    }

    /**
     * Whether media3 currently holds notification id 1001 as this service's
     * foreground notification. See the class-level docstring — posting the
     * placeholder while this is true throws the media player card away.
     */
    private var mediaNotificationOwnsSlot = false

    /** Whether the notification currently in the shade is our placeholder. */
    private var placeholderPosted = false

    /**
     * Post a placeholder foreground notification before delegating to the base
     * class. See the class-level docstring: the 5-second deadline is why, and
     * [mediaNotificationOwnsSlot] is why it is conditional. The base class's own
     * logic calls `startForeground` with the MediaStyle notification as soon as
     * media3 has one, replacing the placeholder.
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val ownsSlotBefore = mediaNotificationOwnsSlot
        ClientFileLog.write(
            'I', "audio-svc",
            "onStartCommand startId=$startId flags=$flags action=${intent?.action ?: "null"} "
                + "ownsSlot=$ownsSlotBefore media3Ongoing=${media3PlaybackOngoing()} "
                + "playerOngoing=${playerPlaybackOngoing()} "
                + "snapshot=${SongloftAudioEngine.diagnosticSnapshot()}",
        )
        // When a song ends, media3 releases the foreground notification. On
        // Android 13+ the system sends a MEDIA_BUTTON stop intent ~500ms later
        // to kill the "inactive" session. If the next song is already loading
        // (BUFFERING + playWhenReady), letting media3 dispatch this intent
        // would call player.stop() and reset to IDLE. Suppress it.
        if (intent?.action == Intent.ACTION_MEDIA_BUTTON) {
            val player = SongloftAudioEngine.mediaSession?.player
            if (player != null && player.playWhenReady
                && player.playbackState == Player.STATE_BUFFERING
            ) {
                ClientFileLog.write(
                    'W', "audio-svc",
                    "suppressed MEDIA_BUTTON during auto-advance "
                        + "(BUFFERING + playWhenReady) snapshot=${SongloftAudioEngine.diagnosticSnapshot()}",
                )
                return START_STICKY
            }
        }
        if (!mediaNotificationOwnsSlot) startForegroundPlaceholder()
        val result = super.onStartCommand(intent, flags, startId)
        ClientFileLog.write(
            'I', "audio-svc",
            "onStartCommand returned=$result ownsSlot=$mediaNotificationOwnsSlot "
                + "placeholder=$placeholderPosted media3Ongoing=${media3PlaybackOngoing()} "
                + "playerOngoing=${playerPlaybackOngoing()}",
        )
        return result
    }

    /**
     * media3's single funnel for showing / updating / dropping the media
     * notification. Recording the ownership flag here — and before `super`,
     * whose foreground path re-enters [onStartCommand] — is what keeps the
     * placeholder from clobbering the notification it exists to bridge to.
     */
    override fun onUpdateNotification(session: MediaSession, startInForegroundRequired: Boolean) {
        val ownsSlotBefore = mediaNotificationOwnsSlot
        ClientFileLog.write(
            'I', "audio-svc",
            "notification update requested=$startInForegroundRequired mirrorBefore=$ownsSlotBefore "
                + "media3Ongoing=${media3PlaybackOngoing()} playerOngoing=${playerPlaybackOngoing(session)} "
                + "snapshot=${SongloftAudioEngine.diagnosticSnapshot()}",
        )
        if (startInForegroundRequired != mediaNotificationOwnsSlot) {
            // Transitions only: while playing this runs on every metadata change
            // (each lyric line), and the whole point of the exported log is to
            // stay readable.
            ClientFileLog.write(
                'I', "audio-svc",
                "media notification " + (if (startInForegroundRequired) "owns" else "released")
                    + " the foreground slot",
            )
        }
        mediaNotificationOwnsSlot = startInForegroundRequired
        super.onUpdateNotification(session, startInForegroundRequired)
        if (mediaNotificationWillShow(session)) {
            // media3 is posting into id 1001, so whatever is in the shade is
            // (about to be) its notification, not ours.
            placeholderPosted = false
        } else if (placeholderPosted) {
            // Nothing will replace the placeholder: media3 shows no notification
            // for an idle or empty player, and `maybeStopForegroundService` only
            // cancels id 1001 when media3 itself had posted there. A placeholder
            // put up for a `load()` that then failed would otherwise sit in the
            // shade forever — blank, silent and (ONGOING | NO_CLEAR) undismissable.
            clearPlaceholder()
        }
        ClientFileLog.write(
            'I', "audio-svc",
            "notification update applied mirrorAfter=$mediaNotificationOwnsSlot "
                + "placeholder=$placeholderPosted media3Ongoing=${media3PlaybackOngoing()} "
                + "playerOngoing=${playerPlaybackOngoing(session)} "
                + "snapshot=${SongloftAudioEngine.diagnosticSnapshot()}",
        )
    }

    /**
     * Whether media3 will have a notification to show for [session], mirroring
     * `MediaNotificationManager.shouldShowNotification`. Read from the session's
     * player rather than tracked, so it cannot drift from what media3 decides.
     */
    private fun mediaNotificationWillShow(session: MediaSession): Boolean {
        val player = session.player
        return player.playbackState != Player.STATE_IDLE && !player.currentTimeline.isEmpty()
    }

    private fun clearPlaceholder() {
        placeholderPosted = false
        ClientFileLog.write('I', "audio-svc", "placeholder cleared (nothing to show)")
        @Suppress("DEPRECATION")
        stopForeground(/* removeNotification= */ true)
    }

    private fun startForegroundPlaceholder() {
        val notification = NotificationCompat.Builder(this, PLACEHOLDER_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(getString(R.string.app_name))
            // Silent + minimum priority so it never actually shows to the user
            // — it exists only to fulfill the FGS start deadline. Media3
            // overwrites this the moment the real MediaStyle notification is
            // built, which happens as soon as playback starts.
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .build()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    PLACEHOLDER_NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
                )
            } else {
                @Suppress("DEPRECATION")
                startForeground(PLACEHOLDER_NOTIFICATION_ID, notification)
            }
            placeholderPosted = true
            ClientFileLog.write(
                'I', "audio-svc",
                "placeholder foreground started (id=$PLACEHOLDER_NOTIFICATION_ID sdk=${Build.VERSION.SDK_INT})",
            )
        } catch (error: Throwable) {
            // Some background-start restrictions (Android 12+) can throw here.
            // We tried; the media notification path will still work if the app
            // is foreground, and the OS will terminate us if we were required
            // to be foreground and could not become so.
            ClientFileLog.write(
                'E', "audio-svc",
                "placeholder foreground failed (${error.javaClass.simpleName}: ${error.message ?: "no message"})",
            )
        }
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (nm.getNotificationChannel(PLACEHOLDER_CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            PLACEHOLDER_CHANNEL_ID,
            getString(R.string.app_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            setShowBadge(false)
            enableLights(false)
            enableVibration(false)
            setSound(null, null)
        }
        nm.createNotificationChannel(channel)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        val session = SongloftAudioEngine.mediaSession
        // A null here refuses the controller connection — the media notification
        // never updates. Log the refusal; it is the one branch that produces the
        // "notification never shows lyrics" symptom with no visible error.
        if (session == null) {
            ClientFileLog.write('W', "audio-svc", "onGetSession: session is null; controller refused")
        }
        return session
    }

    /**
     * When the user swipes the app away from Recents, stop playback and tear
     * down the service so the notification disappears and resources are freed.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        val session = SongloftAudioEngine.mediaSession
        val player = session?.player
        ClientFileLog.write(
            'W', "audio-svc",
            "task removed action=${rootIntent?.action ?: "null"} "
                + "media3Ongoing=${media3PlaybackOngoing()} playerOngoing=${playerPlaybackOngoing()} "
                + "ownsSlot=$mediaNotificationOwnsSlot "
                + "placeholder=$placeholderPosted snapshot=${SongloftAudioEngine.diagnosticSnapshot()}",
        )
        if (player == null || !player.playWhenReady) {
            // Nothing playing -- stop the service immediately.
            stopSelf()
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        // Android does not provide a destruction reason here. The pre-release
        // snapshot lets the exported log distinguish an explicit stop from a
        // service that was reclaimed while a track was still playing.
        ClientFileLog.write(
            'W', "audio-svc",
            "destroyed begin reason=unknown media3Ongoing=${media3PlaybackOngoing()} "
                + "playerOngoing=${playerPlaybackOngoing()} "
                + "ownsSlot=$mediaNotificationOwnsSlot placeholder=$placeholderPosted "
                + "snapshot=${SongloftAudioEngine.diagnosticSnapshot()}",
        )
        mediaNotificationOwnsSlot = false
        placeholderPosted = false
        // Let the engine release player + session; the base class then cleans
        // up its notification manager.
        SongloftAudioEngine.releaseFromService()
        ClientFileLog.write('I', "audio-svc", "destroyed release complete")
        super.onDestroy()
    }

    /** The exact foreground decision exposed by Media3's service implementation. */
    private fun media3PlaybackOngoing(): Boolean {
        return try {
            isPlaybackOngoing()
        } catch (error: Throwable) {
            ClientFileLog.write(
                'W', "audio-svc",
                "isPlaybackOngoing unavailable (${error.javaClass.simpleName}: ${error.message ?: "no message"})",
            )
            false
        }
    }

    /** A player-only comparison value, useful when Media3 and the player diverge. */
    private fun playerPlaybackOngoing(session: MediaSession? = SongloftAudioEngine.mediaSession): Boolean {
        return try {
            val player = session?.player ?: return false
            player.isPlaying || (player.playWhenReady && player.playbackState != Player.STATE_ENDED)
        } catch (error: Throwable) {
            ClientFileLog.write(
                'W', "audio-svc",
                "player ongoing snapshot unavailable (${error.javaClass.simpleName}: "
                    + "${error.message ?: "no message"})",
            )
            false
        }
    }

    companion object {
        /** Placeholder channel used only to satisfy the FGS start deadline. */
        private const val PLACEHOLDER_CHANNEL_ID = "songloft.playback.placeholder"
        private const val PLACEHOLDER_NOTIFICATION_ID = 1001
    }
}
