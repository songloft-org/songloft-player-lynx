package org.songloft.lynx.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertEquals
import org.junit.Test

class PluginSpatialProcessorTest {
    @Test
    fun appliesTheStereoMatrixAndSignedReflectionThenFlushesHistory() {
        val processor = PluginSpatialProcessor()
        processor.configure(AudioFormat(48000, 2, C.ENCODING_PCM_16BIT))
        processor.flush()
        processor.profile = PluginSpatialProfile(1.5f, 0.4f, listOf(PluginSpatialProfile.Tap(1.0, -0.1f)))

        val input = silence(49)
        input.putShort(0, 16000)
        processor.queueInput(input)
        val output = processor.output.order(ByteOrder.nativeOrder())
        assertEquals(8000, output.getShort(0).toInt())
        assertEquals(-1600, output.getShort(2).toInt())
        assertEquals(-2000, output.getShort(48 * 4).toInt())
        assertEquals(400, output.getShort(48 * 4 + 2).toInt())

        processor.flush()
        processor.queueInput(silence(49))
        val afterSeek = processor.output
        while (afterSeek.hasRemaining()) assertEquals(0, afterSeek.getShort().toInt())
    }

    @Test
    fun acceptsMedia3SharedEmptyBufferBeforeTheFirstSample() {
        val processor = PluginSpatialProcessor()
        processor.configure(AudioFormat(48000, 2, C.ENCODING_PCM_16BIT))
        processor.flush()

        processor.queueInput(AudioProcessor.EMPTY_BUFFER)
        assertEquals(0, processor.output.remaining())
    }

    private fun silence(frames: Int): ByteBuffer =
        ByteBuffer.allocateDirect(frames * 4).order(ByteOrder.nativeOrder())
}
