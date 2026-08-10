package org.songloft.lynx.audio

import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Foreground media service (roadmap R5: background playback + notification /
 * lock-screen controls). It does **not** own the player — the player and its
 * [MediaSession] live in [SongloftAudioEngine] (created lazily by the module) —
 * it merely hands media3 the existing session so the framework can surface the
 * playback notification and route media-button / lock-screen actions while the
 * app is backgrounded.
 *
 * The module starts this service (`startForegroundService`) when playback begins
 * and stops it on stop/dispose. Registered in the manifest with
 * `foregroundServiceType="mediaPlayback"`.
 *
 * NOTE (best-effort, batch B2): foreground playback + progress/state events are
 * the guaranteed deliverable; the background notification path can only be
 * validated on a real device via CI-built APK. If the notification does not
 * appear, the standard media3 fix is to drive playback through a
 * `MediaController` connected to this service rather than an engine-owned player
 * — tracked in PROGRESS.
 */
@UnstableApi
class SongloftPlaybackService : MediaSessionService() {
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return SongloftAudioEngine.mediaSession
    }
}
