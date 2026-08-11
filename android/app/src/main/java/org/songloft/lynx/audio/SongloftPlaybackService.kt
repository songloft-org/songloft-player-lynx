package org.songloft.lynx.audio

import android.content.Intent
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import org.songloft.lynx.R

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
 * Registered in the manifest with `foregroundServiceType="mediaPlayback"` and
 * the required `<intent-filter>` for `MediaSessionService`.
 */
@UnstableApi
class SongloftPlaybackService : MediaSessionService() {

    override fun onCreate() {
        super.onCreate()
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
        SongloftAudioEngine.mediaSession?.let { addSession(it) }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return SongloftAudioEngine.mediaSession
    }

    /**
     * When the user swipes the app away from Recents, stop playback and tear
     * down the service so the notification disappears and resources are freed.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        val session = SongloftAudioEngine.mediaSession
        val player = session?.player
        if (player == null || !player.playWhenReady) {
            // Nothing playing -- stop the service immediately.
            stopSelf()
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        // Let the engine release player + session; the base class then cleans
        // up its notification manager.
        SongloftAudioEngine.releaseFromService()
        super.onDestroy()
    }
}
