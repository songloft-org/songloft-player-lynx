package org.songloft.lynx.video

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.tasm.behavior.LynxContext
import org.json.JSONObject
import org.songloft.lynx.audio.SongloftAudioEngine

/**
 * Fullscreen video playback for the song already loaded in the audio engine.
 * Exposed to JS as `NativeModules.SongloftVideo`.
 *
 * `open` takes no URL on purpose. The picture comes from the stream the audio engine
 * is *already* playing (`player-store` loads video songs with `?media=video`), so
 * there is nothing to load here — handing this module a URL would invite it to open a
 * second player, which is exactly the design this avoids: one player means no
 * audio/video drift, one `MediaSession`, and one place where EQ and TLS settings
 * apply.
 */
class SongloftVideoModule(context: Context) : LynxModule(context) {

    companion object {
        const val NAME = "SongloftVideo"

        private const val OPEN_TIMEOUT_MS = 8_000L

        private const val OPENED = "opened"
        private const val NO_TRACK = "noTrack"
        private const val FAILED = "failed"

        private var activity: SongloftVideoActivity? = null
        private val mainHandler = Handler(Looper.getMainLooper())

        fun setActivity(value: SongloftVideoActivity?) {
            activity = value
        }

        /**
         * Wait until the item's fate is known before answering `open`.
         *
         * The item can still be buffering when `open` arrives, in which case
         * `hasVideoTrack()` reads like "no track" — the exact misreport this contract
         * exists to kill (a transcode failure drops ExoPlayer back to `STATE_IDLE`
         * with an error, indistinguishable from a not-yet-prepared stream). Poll on the
         * main handler, where the engine requires us to be, until ready / failed /
         * deadline.
         */
        private fun decideVideoTrack(
            deadlineMs: Long,
            completion: (SongloftAudioEngine.VideoTrackState) -> Unit,
        ) {
            val state = SongloftAudioEngine.videoTrackState()
            if (state != SongloftAudioEngine.VideoTrackState.LOADING) {
                completion(state)
                return
            }
            if (System.currentTimeMillis() >= deadlineMs) {
                completion(SongloftAudioEngine.VideoTrackState.FAILED)
                return
            }
            mainHandler.postDelayed({ decideVideoTrack(deadlineMs, completion) }, 100L)
        }
    }

    /**
     * Show the fullscreen surface.
     *
     * Answers **why** rather than a bare boolean:
     *
     * - `{"result":"opened"}` — the picture is up.
     * - `{"result":"noTrack"}` — the stream is ready but carries no video track.
     *   `songs.is_video` is recorded from the original file at scan time, while a
     *   remote song may be served out of a cache entry that was transcoded with `-vn`.
     * - `{"result":"failed"}` — the stream itself could not be loaded (a transcode the
     *   server refused, a 404 on the HLS playlist).
     */
    @LynxMethod
    fun open(args: String, callback: Callback) {
        val ctx = (mContext as LynxContext).getContext()
        SongloftAudioEngine.runOnMain {
            decideVideoTrack(System.currentTimeMillis() + OPEN_TIMEOUT_MS) { state ->
                when (state) {
                    SongloftAudioEngine.VideoTrackState.HAS_TRACK -> {
                        val intent = Intent(ctx, SongloftVideoActivity::class.java)
                        if (ctx !is android.app.Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        ctx.startActivity(intent)
                        callback.invoke(JSONObject().put("result", OPENED).toString())
                    }
                    SongloftAudioEngine.VideoTrackState.NO_TRACK ->
                        callback.invoke(JSONObject().put("result", NO_TRACK).toString())
                    SongloftAudioEngine.VideoTrackState.FAILED,
                    SongloftAudioEngine.VideoTrackState.LOADING,
                    ->
                        callback.invoke(JSONObject().put("result", FAILED).toString())
                }
            }
        }
    }

    @LynxMethod
    fun close(args: String, callback: Callback) {
        mainHandler.post { activity?.finish() }
        callback.invoke("{}")
    }

    @LynxMethod
    fun isOpen(args: String, callback: Callback) {
        callback.invoke(JSONObject().put("result", activity != null).toString())
    }
}
