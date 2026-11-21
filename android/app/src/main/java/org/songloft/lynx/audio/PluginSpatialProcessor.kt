package org.songloft.lynx.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor.AudioFormat
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import kotlin.math.abs
import kotlin.math.roundToInt
import org.json.JSONObject

internal class PluginSpatialProfile(
    val side: Float,
    val dry: Float,
    val taps: List<Tap>,
) {
    class Tap(val milliseconds: Double, val gain: Float)

    companion object {
        fun parse(json: JSONObject): PluginSpatialProfile {
            val side = json.getDouble("side")
            val dry = json.getDouble("dry")
            val values = json.getJSONArray("taps")
            require(side in 1.0..1.5 && dry in 0.0..1.0 && values.length() <= 48)
            val taps = List(values.length()) { index ->
                val tap = values.getJSONObject(index)
                val time = tap.getDouble("milliseconds")
                val gain = tap.getDouble("gain")
                require(time in 1.0..1000.0 && gain in -1.0..1.0)
                Tap(time, gain.toFloat())
            }
            require((dry + taps.sumOf { abs(it.gain).toDouble() }) * side <= 1.00001)
            return PluginSpatialProfile(side.toFloat(), dry.toFloat(), taps)
        }
    }
}

@UnstableApi
internal class PluginSpatialProcessor : BaseAudioProcessor() {
    @Volatile var profile: PluginSpatialProfile? = null
    @Volatile var channels = 0
        private set

    private var active: PluginSpatialProfile? = null
    private var offsets = IntArray(0)
    private var left = FloatArray(0)
    private var right = FloatArray(0)
    private var cursor = 0

    override fun onConfigure(format: AudioFormat): AudioFormat =
        if (format.encoding == C.ENCODING_PCM_16BIT && format.channelCount in 1..2)
            format else AudioFormat.NOT_SET

    override fun onFlush() {
        channels = if (outputAudioFormat == AudioFormat.NOT_SET) 0 else outputAudioFormat.channelCount
        val frames = if (channels == 0) 0 else inputAudioFormat.sampleRate + 1
        left = FloatArray(frames)
        right = FloatArray(if (channels == 2) frames else 0)
        active = null
        cursor = 0
    }

    override fun onReset() {
        channels = 0
        left = FloatArray(0)
        right = FloatArray(0)
    }

    override fun queueInput(input: ByteBuffer) {
        // Media3 can drain with its shared empty buffer before any samples arrive.
        if (!input.hasRemaining()) return
        val output = replaceOutputBuffer(input.remaining())
        val next = profile
        if (next == null || channels == 0 || (channels == 1 && next.taps.isEmpty())) {
            active = null
            output.put(input)
        } else {
            if (next !== active) {
                active = next
                offsets = next.taps.map { (it.milliseconds * inputAudioFormat.sampleRate / 1000).roundToInt() }.toIntArray()
                left.fill(0f)
                right.fill(0f)
                cursor = 0
            }
            while (input.remaining() >= channels * Short.SIZE_BYTES) {
                val l = input.short.toFloat()
                val r = if (channels == 2) input.short.toFloat() else l
                val mid = (l + r) * 0.5f
                val side = (l - r) * (next.side * 0.5f)
                output.putShort(sample(mid + side, left, next))
                if (channels == 2) output.putShort(sample(mid - side, right, next))
                cursor = (cursor + 1) % left.size
            }
            output.put(input)
        }
        output.flip()
    }

    private fun sample(input: Float, history: FloatArray, config: PluginSpatialProfile): Short {
        var output = input * config.dry
        for (i in offsets.indices) {
            val past = cursor - offsets[i]
            output += history[if (past < 0) past + history.size else past] * config.taps[i].gain
        }
        history[cursor] = input
        return output.roundToInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
    }
}
