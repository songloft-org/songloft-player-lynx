package org.songloft.lynx.audio

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import org.songloft.lynx.platform.ClientFileLog

/**
 * Persists the minimum playback state needed to resume after a system kill.
 *
 * SharedPreferences is the right tool here: the data is small (one URL + a
 * handful of scalars), must survive process death, and is only written from
 * the main thread (all engine calls are funneled through [SongloftAudioEngine.runOnMain]).
 *
 * State is saved on load, periodically during playback (every ~3 s via the
 * progress tick), and cleared on explicit stop / release. When the system
 * kills the process and `START_STICKY` restarts the service, the service
 * reads this store and resumes playback at the saved position.
 */
object PlaybackStateStore {
    private const val PREFS_NAME = "songloft_playback_state"
    private const val KEY_URL = "url"
    private const val KEY_POSITION_MS = "position_ms"
    private const val KEY_DURATION_MS = "duration_ms"
    private const val KEY_HLS = "hls"
    private const val KEY_HEADERS = "headers_json"
    private const val KEY_PLAY_WHEN_READY = "play_when_ready"
    private const val KEY_SAVED_AT = "saved_at"

    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs == null) {
            prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        }
    }

    fun save(
        url: String,
        positionMs: Long,
        durationMs: Long,
        hls: Boolean,
        headers: Map<String, String>?,
        playWhenReady: Boolean,
    ) {
        val p = prefs ?: return
        p.edit()
            .putString(KEY_URL, url)
            .putLong(KEY_POSITION_MS, positionMs)
            .putLong(KEY_DURATION_MS, durationMs)
            .putBoolean(KEY_HLS, hls)
            .putBoolean(KEY_PLAY_WHEN_READY, playWhenReady)
            .putLong(KEY_SAVED_AT, System.currentTimeMillis())
            .apply {
                if (headers != null) {
                    putString(KEY_HEADERS, JSONObject(headers as Map<*, *>).toString())
                } else {
                    remove(KEY_HEADERS)
                }
            }
            .apply()
    }

    fun savePosition(positionMs: Long, durationMs: Long) {
        val p = prefs ?: return
        if (p.getString(KEY_URL, null) == null) return
        p.edit()
            .putLong(KEY_POSITION_MS, positionMs)
            .putLong(KEY_DURATION_MS, durationMs)
            .putLong(KEY_SAVED_AT, System.currentTimeMillis())
            .apply()
    }

    fun load(): SavedPlaybackState? {
        val p = prefs ?: return null
        val url = p.getString(KEY_URL, null) ?: return null
        val headers = p.getString(KEY_HEADERS, null)?.let { json ->
            try {
                val obj = JSONObject(json)
                val map = HashMap<String, String>()
                for (key in obj.keys()) {
                    map[key] = obj.getString(key)
                }
                map
            } catch (e: Throwable) {
                ClientFileLog.write('W', "audio-state", "failed to parse saved headers: ${e.message}")
                null
            }
        }
        return SavedPlaybackState(
            url = url,
            positionMs = p.getLong(KEY_POSITION_MS, 0),
            durationMs = p.getLong(KEY_DURATION_MS, 0),
            hls = p.getBoolean(KEY_HLS, false),
            headers = headers,
            playWhenReady = p.getBoolean(KEY_PLAY_WHEN_READY, true),
            savedAt = p.getLong(KEY_SAVED_AT, 0),
        )
    }

    fun clear() {
        prefs?.edit()?.clear()?.apply()
        ClientFileLog.write('I', "audio-state", "playback state cleared")
    }

    fun hasSavedState(): Boolean {
        return prefs?.getString(KEY_URL, null) != null
    }
}

data class SavedPlaybackState(
    val url: String,
    val positionMs: Long,
    val durationMs: Long,
    val hls: Boolean,
    val headers: Map<String, String>?,
    val playWhenReady: Boolean,
    val savedAt: Long,
)
