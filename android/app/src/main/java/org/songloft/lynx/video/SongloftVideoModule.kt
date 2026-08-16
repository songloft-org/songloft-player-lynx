package org.songloft.lynx.video

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
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

        /** Event JS listens for so it can drop any "transcoding…" pending state. */
        const val EVENT_CLOSED = "SongloftVideo.closed"

        private var activity: SongloftVideoActivity? = null
        private val mainHandler = Handler(Looper.getMainLooper())

        fun setActivity(value: SongloftVideoActivity?) {
            activity = value
            if (value == null) sink?.invoke()
        }

        /** Set by the module instance so the activity's exit reaches JS. */
        @Volatile
        private var sink: (() -> Unit)? = null

        internal fun installSink(block: () -> Unit) {
            sink = block
        }
    }

    init {
        installSink { emitClosed() }
    }

    /**
     * Show the fullscreen surface.
     *
     * Answers `{"result": false}` when there is no video track to show, rather than
     * opening a black rectangle. That case is real and invisible from JS:
     * `songs.is_video` is recorded from the original file at scan time, while a remote
     * song may be served out of a cache entry that was transcoded with `-vn`.
     */
    @LynxMethod
    fun open(args: String, callback: Callback) {
        val ctx = (mContext as LynxContext).getContext()
        SongloftAudioEngine.runOnMain {
            if (!SongloftAudioEngine.hasVideoTrack()) {
                callback.invoke(JSONObject().put("result", false).toString())
                return@runOnMain
            }
            val intent = Intent(ctx, SongloftVideoActivity::class.java)
            if (ctx !is android.app.Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
            callback.invoke(JSONObject().put("result", true).toString())
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

    private fun emitClosed() {
        val params = JavaOnlyArray()
        params.pushMap(JavaOnlyMap())
        (mContext as? LynxContext)?.sendGlobalEvent(EVENT_CLOSED, params)
    }
}
