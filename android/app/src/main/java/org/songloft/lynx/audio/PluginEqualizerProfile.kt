package org.songloft.lynx.audio

import kotlin.math.ln
import org.json.JSONObject

/** Maps the host's preset curve to the frequencies offered by the device. */
internal class PluginEqualizerProfile private constructor(
    private val frequencies: List<Double>,
    private val gains: List<Double>,
) {
    fun gainAt(frequency: Double): Float {
        if (frequency <= frequencies.first()) return gains.first().toFloat()
        val upper = frequencies.indexOfFirst { it >= frequency }
        if (upper < 0) return gains.last().toFloat()
        val lower = upper - 1
        val fraction = ln(frequency / frequencies[lower]) / ln(frequencies[upper] / frequencies[lower])
        return (gains[lower] + fraction * (gains[upper] - gains[lower])).toFloat()
    }

    companion object {
        fun parse(payload: String): PluginEqualizerProfile {
            val json = JSONObject(payload)
            val frequencyArray = json.getJSONArray("frequencies")
            val gainArray = json.getJSONArray("gains")
            require(frequencyArray.length() == 10 && gainArray.length() == frequencyArray.length())
            val frequencies = List(frequencyArray.length()) { frequencyArray.getDouble(it) }
            val gains = List(gainArray.length()) { gainArray.getDouble(it) }
            require(frequencies.first() > 0 && frequencies.all { it.isFinite() })
            require(frequencies.zipWithNext().all { (low, high) -> low < high })
            require(gains.all { it in -12.0..12.0 })
            return PluginEqualizerProfile(frequencies, gains)
        }
    }
}
