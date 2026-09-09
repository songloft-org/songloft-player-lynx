package org.songloft.lynx.audio

import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi

/**
 * Wraps the engine's [androidx.media3.exoplayer.ExoPlayer] for the
 * [androidx.media3.session.MediaSession] only — the raw player keeps being
 * driven directly by [SongloftAudioEngine] for actual playback control.
 *
 * The JS player store (not ExoPlayer's own timeline) owns the queue: native
 * only ever loads one `MediaItem` at a time (see `SongloftAudioModule.load`),
 * so ExoPlayer's own `hasNextMediaItem()`/`hasPreviousMediaItem()` are always
 * false and the notification would never show next/previous buttons. This
 * wrapper forces both commands to always be available and, when tapped,
 * forwards the command to JS as a `remoteCommand` event instead of performing
 * a real seek — the JS store decides how to advance and then calls
 * `load()`/`play()` for the new track itself.
 */
@UnstableApi
class RemoteCommandForwardingPlayer(
    player: Player,
    private val onRemoteCommand: (String) -> Unit,
) : ForwardingPlayer(player) {

    override fun getAvailableCommands(): Player.Commands {
        // Both the "smart" seek commands (used by the notification's own
        // seek-to-next/previous buttons) and the `_MEDIA_ITEM` variants (used
        // by the legacy media-button path — hardware/Bluetooth next/previous,
        // `KEYCODE_MEDIA_NEXT`) must be enabled: they dispatch through
        // different `Player` methods below.
        return super.getAvailableCommands().buildUpon()
            .add(Player.COMMAND_SEEK_TO_NEXT)
            .add(Player.COMMAND_SEEK_TO_PREVIOUS)
            .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
            .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
            .add(Player.COMMAND_STOP)
            .build()
    }

    override fun seekToNext() = onRemoteCommand(SongloftAudioEngine.REMOTE_COMMAND_NEXT)

    override fun seekToNextMediaItem() = onRemoteCommand(SongloftAudioEngine.REMOTE_COMMAND_NEXT)

    override fun seekToPrevious() = onRemoteCommand(SongloftAudioEngine.REMOTE_COMMAND_PREVIOUS)

    override fun seekToPreviousMediaItem() =
        onRemoteCommand(SongloftAudioEngine.REMOTE_COMMAND_PREVIOUS)

    override fun stop() {
        onRemoteCommand(SongloftAudioEngine.REMOTE_COMMAND_STOP)
    }
}
