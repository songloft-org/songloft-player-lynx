package org.songloft.lynx.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
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
 * ## Why the slot needs a watchdog ([verifyMediaNotification])
 *
 * Owning the slot is not the same as still being in the shade. At the end of a
 * track media3 hands the foreground slot back (`onUpdateNotification` with
 * `startInForegroundRequired = false`), auto-advance immediately loads the next
 * item, and media3 takes the slot again — three notification transitions inside
 * ~150ms. HyperOS answers that burst by dropping the media notification of the
 * session it considers inactive, and the removal lands *after* the new card was
 * posted: the exported log shows the card re-posted at `+0.545s` and media3's
 * own delete intent (`KEYCODE_MEDIA_STOP` + session URI, only sent when a
 * notification is actually removed) arriving at `+1.181s`.
 *
 * Both bookkeepers are then wrong in the same direction: this service's
 * [mediaNotificationOwnsSlot] and media3's `startedInForeground` both say the
 * card is up, so nobody re-posts. Playback keeps going (the stale STOP is
 * suppressed, see [isMediaNotificationStopIntent]) with no notification and no
 * lock-screen controls, until something else happens to call
 * [onUpdateNotification] — a lyric line, a track change, a play/pause. A track
 * without synced lyrics produces none of those, which is why the shade stayed
 * empty for 77 seconds in issue #2 and why the bug reads as "occasional".
 *
 * So the only reliable judgement is the one taken from outside our own
 * bookkeeping: ask the notification manager what is actually posted
 * ([mediaCardInShade]) and re-post through media3's funnel when the card is
 * gone while the player is playing. See `docs/project/pitfalls.md` §3.
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

    // -- notification watchdog -------------------------------------------------

    /** Main-thread ticker; the service's callbacks all run on the main looper. */
    private val watchdogHandler = Handler(Looper.getMainLooper())

    /** Whether [watchdogTick] is currently queued. Keeps arming idempotent. */
    private var watchdogScheduled = false

    /** Guard against the fast check and the heartbeat both re-posting. */
    private var lastRepostAtMs = 0L

    /** Re-posts since the card was last actually seen — the circuit breaker's input. */
    private var repostsSinceLastSighting = 0

    /** Cumulative count, logged so a repeating removal is visible in the export. */
    private var repostTotal = 0

    /** Set when [MAX_BLIND_REPOSTS] re-posts in a row left the shade empty. */
    private var repostSuppressed = false

    /** Cleared for good if this ROM refuses to report our own notifications. */
    private var activeNotificationsReadable = true

    private val watchdogTick = Runnable {
        watchdogScheduled = false
        verifyMediaNotification("heartbeat")
        // Self-sustaining only while playing: a paused or stopped player has
        // nothing to defend, and the next onUpdateNotification re-arms us.
        if (isPlayingNow()) scheduleWatchdog(WATCHDOG_INTERVAL_MS)
    }

    /**
     * Queue a notification check. A pending check is never pushed further out —
     * a short fast check replaces a queued heartbeat, not the other way round.
     */
    private fun scheduleWatchdog(delayMs: Long) {
        if (watchdogScheduled) {
            if (delayMs >= WATCHDOG_INTERVAL_MS) return
            watchdogHandler.removeCallbacks(watchdogTick)
        }
        watchdogScheduled = true
        watchdogHandler.postDelayed(watchdogTick, delayMs)
    }

    /**
     * Re-post the media notification if it is gone from the shade while the
     * player is playing.
     *
     * Deliberately gated on `isPlaying` rather than on "playback ongoing":
     * since Android 13 the user may swipe a foreground-service notification
     * away, and re-posting a card the user just dismissed would be fighting
     * them. While *playing* that dismissal cannot reach us silently — media3's
     * delete intent stops playback, so `isPlaying` turns false and this returns
     * early. What is left is exactly the failure this exists for: the card
     * removed by something outside the app while audio keeps running.
     *
     * The repair goes through [onUpdateNotification], i.e. media3's own funnel,
     * so the card is rebuilt from the session (correct artwork, actions and
     * lyric line) and [mediaNotificationOwnsSlot] is realigned on the way.
     */
    private fun verifyMediaNotification(reason: String) {
        val session = SongloftAudioEngine.mediaSession ?: return
        if (!isPlayingNow(session)) return
        // Nothing to defend if media3 itself would show nothing for this player.
        if (!mediaNotificationWillShow(session)) return

        if (mediaCardInShade()) {
            if (repostSuppressed) {
                repostSuppressed = false
                ClientFileLog.write(
                    'I', "audio-svc",
                    "notification watchdog re-armed (card seen in the shade again)",
                )
            }
            repostsSinceLastSighting = 0
            return
        }
        if (repostSuppressed) return

        val now = SystemClock.elapsedRealtime()
        if (lastRepostAtMs != 0L && now - lastRepostAtMs < MIN_REPOST_INTERVAL_MS) return
        if (repostsSinceLastSighting >= MAX_BLIND_REPOSTS) {
            // Either this ROM does not report the foreground notification back
            // to us, or it removes the card faster than we can post it. Both
            // make further re-posts pointless; stop instead of looping forever.
            repostSuppressed = true
            ClientFileLog.write(
                'W', "audio-svc",
                "notification watchdog disarmed: $repostsSinceLastSighting re-posts left "
                    + "id=$PLACEHOLDER_NOTIFICATION_ID unreported",
            )
            return
        }

        lastRepostAtMs = now
        repostsSinceLastSighting++
        repostTotal++
        ClientFileLog.write(
            'W', "audio-svc",
            "media notification missing from the shade (reason=$reason repost=#$repostTotal "
                + "ownsSlot=$mediaNotificationOwnsSlot placeholder=$placeholderPosted) "
                + "snapshot=${SongloftAudioEngine.diagnosticSnapshot()}",
        )
        onUpdateNotification(session, /* startInForegroundRequired= */ true)
    }

    /**
     * Whether media3's player card is the thing posted on
     * [PLACEHOLDER_NOTIFICATION_ID] right now.
     *
     * Reading the channel is what separates the card from our own placeholder
     * on the shared id — the same distinction `dumpsys notification` shows, and
     * the reason a stuck placeholder counts as "card missing" here. Unreadable
     * (old API, or a ROM that throws) reports `true`: no judgement means no
     * repair, never a blind re-post.
     */
    private fun mediaCardInShade(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || !activeNotificationsReadable) return true
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return true
        return try {
            nm.activeNotifications.any { posted ->
                posted.id == PLACEHOLDER_NOTIFICATION_ID
                    && (Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                        || posted.notification.channelId != PLACEHOLDER_CHANNEL_ID)
            }
        } catch (error: Throwable) {
            // Log once: this runs on a timer, and the exported log has to stay
            // readable.
            activeNotificationsReadable = false
            ClientFileLog.write(
                'W', "audio-svc",
                "activeNotifications unreadable, watchdog off "
                    + "(${error.javaClass.simpleName}: ${error.message ?: "no message"})",
            )
            true
        }
    }

    /** Strict "sound is coming out" test, not media3's broader ongoing-playback one. */
    private fun isPlayingNow(session: MediaSession? = SongloftAudioEngine.mediaSession): Boolean {
        return try {
            session?.player?.isPlaying == true
        } catch (error: Throwable) {
            false
        }
    }

    /**
     * Post a placeholder foreground notification before delegating to the base
     * class. See the class-level docstring: the 5-second deadline is why, and
     * [mediaNotificationOwnsSlot] is why it is conditional. The base class's own
     * logic calls `startForeground` with the MediaStyle notification as soon as
     * media3 has one, replacing the placeholder.
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val ownsSlotBefore = mediaNotificationOwnsSlot
        val isRestart = intent == null && (flags and START_FLAG_REDELIVERY == 0)
        ClientFileLog.write(
            'I', "audio-svc",
            "onStartCommand startId=$startId flags=$flags action=${intent?.action ?: "null"} "
                + "isRestart=$isRestart "
                + "mediaButtonKey=${mediaButtonKeyCode(intent) ?: "none"} "
                + "ownsSlot=$ownsSlotBefore media3Ongoing=${media3PlaybackOngoing()} "
                + "playerOngoing=${playerPlaybackOngoing()} "
                + "snapshot=${SongloftAudioEngine.diagnosticSnapshot()}",
        )

        // START_STICKY restart after system kill: intent is null, player is
        // empty. Try to resume from persisted state.
        if (isRestart) {
            ClientFileLog.write('I', "audio-svc", "detected START_STICKY restart, attempting recovery")
            if (!mediaNotificationOwnsSlot) startForegroundPlaceholder()
            val recovered = SongloftAudioEngine.recoverPlayback(this)
            ClientFileLog.write(
                'I', "audio-svc",
                "recovery result=$recovered snapshot=${SongloftAudioEngine.diagnosticSnapshot()}",
            )
            if (!recovered) {
                stopSelf()
                return START_STICKY
            }
            return START_STICKY
        }

        // When a song ends, media3 releases the foreground notification. On
        // Android 13+ the system sends a stale MEDIA_STOP intent ~500ms later
        // to kill the inactive session. The next song can already be READY by
        // then, so checking BUFFERING alone misses the exact failure window.
        // The engine arms a short guard only across its ended -> load transition;
        // require the notification STOP key + session data so user media buttons
        // pass through.
        if (isMediaNotificationStopIntent(intent)
            && SongloftAudioEngine.consumeAutoAdvanceStopGuard()
        ) {
            ClientFileLog.write(
                'W', "audio-svc",
                "suppressed stale MEDIA_STOP during auto-advance "
                    + "snapshot=${SongloftAudioEngine.diagnosticSnapshot()}",
            )
            // This intent *is* the removal notice for the card media3 just
            // re-posted (see the class docstring): the delete intent only fires
            // when a notification actually left the shade. Suppressing the stop
            // keeps audio alive, so check the slot right away instead of waiting
            // out a full heartbeat.
            scheduleWatchdog(STOP_SUPPRESSED_CHECK_DELAY_MS)
            return START_STICKY
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
        // media3's single funnel is also the single place the watchdog needs to
        // be armed from: every isPlaying transition passes through here, and the
        // tick keeps itself alive from there on.
        if (isPlayingNow(session)) scheduleWatchdog(WATCHDOG_INTERVAL_MS)
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

    /** Read the media-button key without using the API-33 overload on old devices. */
    private fun mediaButtonKeyCode(intent: Intent?): Int? {
        if (intent?.action != Intent.ACTION_MEDIA_BUTTON) return null
        val event = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT)
        }
        return event?.keyCode
    }

    /**
     * Media3's notification delete action carries the session URI as Intent data;
     * hardware/media-router buttons do not. Keep the auto-advance guard scoped to
     * that delete callback so a user's explicit STOP remains functional.
     */
    private fun isMediaNotificationStopIntent(intent: Intent?): Boolean {
        return mediaButtonKeyCode(intent) == KeyEvent.KEYCODE_MEDIA_STOP
            && intent?.data != null
    }

    private fun clearPlaceholder() {
        placeholderPosted = false
        ClientFileLog.write('I', "audio-svc", "placeholder cleared (nothing to show)")
        @Suppress("DEPRECATION")
        stopForeground(/* removeNotification= */ true)
    }

    private fun startForegroundPlaceholder() {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(this, org.songloft.lynx.MainActivity::class.java)
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        launchIntent.putExtra(org.songloft.lynx.MainActivity.EXTRA_NAVIGATE_TO_PLAYER, true)
        val contentIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(this, PLACEHOLDER_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(getString(R.string.app_name))
            .setContentIntent(contentIntent)
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
        watchdogHandler.removeCallbacks(watchdogTick)
        watchdogScheduled = false
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

        /** Watchdog period while playing. One binder read per tick. */
        private const val WATCHDOG_INTERVAL_MS = 10_000L

        /**
         * The stale MEDIA_STOP arrives ~0.7s after the track ended, and it is
         * itself the removal notice, so the card can be back well inside the
         * gap where the user would reach for the shade.
         */
        private const val STOP_SUPPRESSED_CHECK_DELAY_MS = 400L

        /** Floor between two re-posts, so a fast check plus a tick counts once. */
        private const val MIN_REPOST_INTERVAL_MS = 2_000L

        /** Re-posts tolerated without ever seeing the card before giving up. */
        private const val MAX_BLIND_REPOSTS = 3
    }
}
