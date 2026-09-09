package org.songloft.lynx.audio

import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import org.songloft.lynx.R

/**
 * Extends [DefaultMediaNotificationProvider] to place the stop/exit button
 * **after** the standard transport controls (previous / play-pause / next),
 * i.e. on the right side of the expanded notification.
 *
 * media3's `setCustomLayout` places custom buttons **before** the transport
 * controls, which is correct for the favorite button (left side) but puts the
 * stop button between favorite and previous instead of on the far right.
 * Overriding [getMediaButtons] lets us append it after the transport controls.
 *
 * Compact view (3 buttons) automatically excludes the stop button: media3's
 * notification action builder only selects buttons whose extras carry
 * `COMMAND_KEY_COMPACT_VIEW_INDEX`, which only the built-in transport buttons
 * have. The compact view therefore shows [previous, play/pause, next].
 */
@UnstableApi
class SongloftMediaNotificationProvider(
    context: android.content.Context,
) : DefaultMediaNotificationProvider(context) {

    init {
        setSmallIcon(R.drawable.ic_launcher_monochrome)
    }

    override fun getMediaButtons(
        session: MediaSession,
        playerCommands: Player.Commands,
        customLayout: ImmutableList<CommandButton>,
        showPauseButton: Boolean,
    ): ImmutableList<CommandButton> {
        val base = super.getMediaButtons(session, playerCommands, customLayout, showPauseButton)
        // Append stop button at the end (right side of the notification).
        return ImmutableList.builder<CommandButton>()
            .addAll(base)
            .add(SongloftAudioEngine.buildStopButton())
            .build()
    }
}