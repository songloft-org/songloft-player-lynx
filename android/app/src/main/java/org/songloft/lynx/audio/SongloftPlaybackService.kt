package org.songloft.lynx.audio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
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
     * Post a placeholder foreground notification before delegating to the base
     * class. See the class-level docstring: the 5-second deadline is why. The
     * base class's own logic will call `startForeground` again once media3's
     * MediaStyle notification is ready, replacing the placeholder.
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundPlaceholder()
        return super.onStartCommand(intent, flags, startId)
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
        } catch (_: Throwable) {
            // Some background-start restrictions (Android 12+) can throw here.
            // We tried; the media notification path will still work if the app
            // is foreground, and the OS will terminate us if we were required
            // to be foreground and could not become so.
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
        ClientFileLog.write('I', "audio-svc", "task removed (playing=${player?.playWhenReady})")
        if (player == null || !player.playWhenReady) {
            // Nothing playing -- stop the service immediately.
            stopSelf()
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        ClientFileLog.write('I', "audio-svc", "destroyed")
        // Let the engine release player + session; the base class then cleans
        // up its notification manager.
        SongloftAudioEngine.releaseFromService()
        super.onDestroy()
    }

    companion object {
        /** Placeholder channel used only to satisfy the FGS start deadline. */
        private const val PLACEHOLDER_CHANNEL_ID = "songloft.playback.placeholder"
        private const val PLACEHOLDER_NOTIFICATION_ID = 1001
    }
}
