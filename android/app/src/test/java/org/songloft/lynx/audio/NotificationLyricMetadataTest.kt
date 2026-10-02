package org.songloft.lynx.audio

import androidx.media3.common.MediaMetadata
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class NotificationLyricMetadataTest {
    private val original = MediaMetadata.Builder()
        .setTitle("歌曲")
        .setDisplayTitle("显示标题")
        .setArtist("歌手")
        .setAlbumTitle("专辑")
        .setArtworkData(byteArrayOf(1, 2, 3), MediaMetadata.PICTURE_TYPE_FRONT_COVER)
        .build()

    @Test
    fun titleModeShowsLyricAndSongName() {
        val result = buildNotificationLyricMetadata(original, "第一句歌词", true)
        assertEquals("第一句歌词", result.title)
        assertEquals("第一句歌词", result.displayTitle)
        assertEquals("歌曲", result.artist)
        assertEquals(original.albumTitle, result.albumTitle)
        assertSame(original.artworkData, result.artworkData)
        assertEquals("歌曲", original.title)
        assertEquals("歌手", original.artist)
    }

    @Test
    fun subtitleModeKeepsSongTitleAndShowsLyricAsArtist() {
        val result = buildNotificationLyricMetadata(original, "第二句歌词", false)
        assertEquals("歌曲", result.title)
        assertEquals("显示标题", result.displayTitle)
        assertEquals("第二句歌词", result.artist)
    }

    @Test
    fun gapsRestoreOriginalMetadataInBothModes() {
        for (inTitle in listOf(true, false)) {
            for (line in listOf(null, "", "  \n")) {
                assertSame(original, buildNotificationLyricMetadata(original, line, inTitle))
            }
        }
    }

    @Test
    fun missingSongInfoDoesNotInventAnArtistOrTitle() {
        val result = buildNotificationLyricMetadata(MediaMetadata.EMPTY, "歌词", true)
        assertEquals("歌词", result.title)
        assertNull(result.artist)
        assertSame(MediaMetadata.EMPTY, buildNotificationLyricMetadata(MediaMetadata.EMPTY, null, false))
    }
}
