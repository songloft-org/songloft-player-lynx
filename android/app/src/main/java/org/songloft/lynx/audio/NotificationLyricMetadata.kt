package org.songloft.lynx.audio

import androidx.media3.common.MediaMetadata

/** Builds each overlay from original song info, never from the previous lyric. */
internal fun buildNotificationLyricMetadata(
    original: MediaMetadata,
    lyric: String?,
    inTitle: Boolean,
): MediaMetadata {
    val line = lyric?.takeIf { it.isNotBlank() } ?: return original
    return original.buildUpon().apply {
        if (inTitle) {
            setTitle(line)
            // DefaultMediaNotificationProvider prefers displayTitle over title.
            setDisplayTitle(line)
            setArtist(original.title ?: original.displayTitle)
        } else {
            // Media3 prefers artist over subtitle for its second line.
            setArtist(line)
        }
    }.build()
}
