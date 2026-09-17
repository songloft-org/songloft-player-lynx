package org.songloft.lynx.video

import android.content.Context
import android.content.pm.ActivityInfo
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import android.view.SurfaceView
import android.view.View
import android.widget.FrameLayout
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
 *
 * The fullscreen surface is hosted from `MainActivity`, *under* the Lynx view, so the
 * JS page owns every control above the picture. `open`/`close` here only toggle that
 * surface and attach/detach the engine's video output — nothing user-visible is
 * created on the native side.
 *
 * ## Sizing
 *
 * The picture is *not* stretched to fill the surface: the JS page reads the video's
 * pixel dimensions from the `videoSizeChanged` event and calls [setSurfaceLayout]
 * with a letterbox / zoom rect. The rect arrives in CSS-logical pixels (the same
 * unit `boundingClientRect` returns in Lynx) and is scaled to device px here.
 */
class SongloftVideoModule(context: Context) : LynxModule(context) {

    private fun androidContext(): Context = (mContext as LynxContext).getContext()

    private fun lynxContext(): LynxContext = mContext as LynxContext

    companion object {
        const val NAME = "SongloftVideo"

        /**
         * Byte-for-byte match with `src/native/video.ts`. Android does not push a
         * `closed` event: the framework's back key already routes to the same
         * `performRouteBack` the page uses on its own, so a separate close-from-
         * host channel would be a second source of truth for the same signal.
         */
        const val EVENT_VIDEO_SIZE_CHANGED = "SongloftVideo.videoSizeChanged"
        const val EVENT_ORIENTATION_CHANGED = "SongloftVideo.orientationChanged"

        private const val OPEN_TIMEOUT_MS = 8_000L

        private const val OPENED = "opened"
        private const val NO_TRACK = "noTrack"
        private const val FAILED = "failed"

        private var surface: SurfaceView? = null
        private var isOpen = false
        /** Set by [MainActivity] on create so [setOrientation] has a target. */
        private var activityRef: java.lang.ref.WeakReference<android.app.Activity>? = null
        /** Set by [MainActivity]. Fed the current context so events can go up. */
        private var eventEmitter: ((String, Map<String, Any?>) -> Unit)? = null
        private val mainHandler = Handler(Looper.getMainLooper())

        fun setVideoSurface(value: SurfaceView?) {
            surface = value
        }

        fun setActivity(activity: android.app.Activity?) {
            activityRef = activity?.let { java.lang.ref.WeakReference(it) }
        }

        fun setEventEmitter(emitter: ((String, Map<String, Any?>) -> Unit)?) {
            eventEmitter = emitter
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

        private fun showSurface(view: SurfaceView) {
            view.visibility = View.VISIBLE
            SongloftAudioEngine.attachVideoOutput(view) { w, h ->
                mainHandler.post { emitVideoSize(w, h) }
            }
            isOpen = true
        }

        private fun hideSurface() {
            surface?.let { view ->
                view.visibility = View.GONE
                SongloftAudioEngine.detachVideoOutput()
            }
            isOpen = false
        }

        private fun emitVideoSize(width: Int, height: Int) {
            eventEmitter?.invoke(
                EVENT_VIDEO_SIZE_CHANGED,
                mapOf("width" to width.toDouble(), "height" to height.toDouble()),
            )
        }
    }

    /**
     * Show the fullscreen surface.
     *
     * Answers **why** rather than a bare boolean:
     *
     * - `{"result":"opened"}` — the picture is up.
     * - `{"result":"noTrack"}` — the stream is ready but carries no video track.
     * - `{"result":"failed"}` — the stream itself could not be loaded.
     */
    @LynxMethod
    fun open(args: String, callback: Callback) {
        SongloftAudioEngine.runOnMain {
            decideVideoTrack(System.currentTimeMillis() + OPEN_TIMEOUT_MS) { state ->
                when (state) {
                    SongloftAudioEngine.VideoTrackState.HAS_TRACK -> {
                        val view = surface
                        if (view == null) {
                            callback.invoke(JSONObject().put("result", FAILED).toString())
                            return@decideVideoTrack
                        }
                        showSurface(view)
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
        SongloftAudioEngine.runOnMain {
            hideSurface()
            releaseOrientationLock()
        }
        callback.invoke("{}")
    }

    @LynxMethod
    fun isOpen(args: String, callback: Callback) {
        callback.invoke(JSONObject().put("result", isOpen).toString())
    }

    /**
     * Position and size the surface inside its parent. The JS page passes the rect
     * in CSS-logical pixels, computed from the decoded video's aspect ratio and the
     * user's fit/zoom choice — it is the single control point that stops a landscape
     * frame from being stretched onto a portrait window.
     */
    @LynxMethod
    fun setSurfaceLayout(args: String, callback: Callback) {
        val obj = try { JSONObject(args) } catch (_: Exception) { JSONObject() }
        val x = obj.optDouble("x", 0.0)
        val y = obj.optDouble("y", 0.0)
        val w = obj.optDouble("width", 0.0)
        val h = obj.optDouble("height", 0.0)
        val ctx = androidContext()
        SongloftAudioEngine.runOnMain {
            val view = surface ?: return@runOnMain callback.invoke("{}")
            val density = deviceDensity(ctx)
            val lp = FrameLayout.LayoutParams(
                Math.max(1, (w * density).toInt()),
                Math.max(1, (h * density).toInt()),
            )
            lp.leftMargin = (x * density).toInt()
            lp.topMargin = (y * density).toInt()
            view.layoutParams = lp
            view.requestLayout()
            callback.invoke("{}")
        }
    }

    /**
     * Request an orientation lock for the host activity. `'auto'` releases the lock.
     *
     * The manifest declares `configChanges="orientation|screenSize"`, so a lock
     * change does not tear the Activity down — the running page keeps its state.
     */
    @LynxMethod
    fun setOrientation(args: String, callback: Callback) {
        val obj = try { JSONObject(args) } catch (_: Exception) { JSONObject() }
        val mode = obj.optString("mode", "auto")
        mainHandler.post {
            val activity = activityRef?.get()
            if (activity != null) {
                activity.requestedOrientation = when (mode) {
                    "portrait" -> ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                    "landscape" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                }
            }
            callback.invoke("{}")
        }
    }

    /**
     * Pull the decoded video's pixel dimensions if any. Callers usually listen to
     * `videoSizeChanged`; this is a fallback for pages that mounted *after* the
     * first frame decoded.
     */
    @LynxMethod
    fun getVideoSize(args: String, callback: Callback) {
        SongloftAudioEngine.runOnMain {
            val size = SongloftAudioEngine.currentVideoSize()
            if (size == null) {
                callback.invoke("{}")
            } else {
                callback.invoke(
                    JSONObject().put(
                        "result",
                        JSONObject()
                            .put("width", size.first)
                            .put("height", size.second),
                    ).toString(),
                )
            }
        }
    }

    private fun releaseOrientationLock() {
        mainHandler.post {
            activityRef?.get()?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    private fun deviceDensity(context: Context): Float {
        val metrics: DisplayMetrics = context.resources.displayMetrics
        return metrics.density
    }
}
