package org.songloft.lynx.audio

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.media3.common.util.UnstableApi
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.react.bridge.ReadableArray
import com.lynx.react.bridge.ReadableMap
import com.lynx.react.bridge.ReadableType
import com.lynx.tasm.behavior.LynxContext

/**
 * Lynx native module `NativeModules.SongloftAudio` — the real Android audio
 * backend (ExoPlayer / androidx.media3), replacing the batch-5 TS mock behind
 * the same facade. Registered in `SongloftApplication` via
 * `LynxEnv.inst().registerModule("SongloftAudio", SongloftAudioModule::class.java)`
 * (the exact pattern from the official "Native Modules" guide).
 *
 * The method + event contract is kept **identical to the TS mock**
 * (`src/native/audio-types.ts`) so the facade switch is clean and the player
 * store is untouched:
 *   methods  load / play / pause / stop / seek / setVolume / setSpeed +
 *            setQueue / next / previous / setRepeatMode / setShuffle (queue is
 *            JS-store-driven, same as the mock — these are minimal no-ops here) +
 *            equalizer stubs.
 *   events   emitted through `LynxContext.sendGlobalEvent` (see
 *            [SongloftAudioEngine]): SongloftAudio.stateChanged / .progress /
 *            .error — names byte-for-byte match the TS `GlobalEventEmitter`
 *            listeners in `native-audio.ts`.
 *
 * `@LynxMethod`s are invoked on the background (BTS) thread; every call marshals
 * onto the main looper inside the engine because ExoPlayer is single-threaded.
 */
@UnstableApi
class SongloftAudioModule(context: Context) : LynxModule(context), AudioEventSink {

    private fun androidContext(): Context = (mContext as LynxContext).getContext()

    private fun lynxContext(): LynxContext = mContext as LynxContext

    private fun ensureSink() {
        // Install this module as the engine's event sink (idempotent).
        SongloftAudioEngine.sink = this
    }

    // -- source & transport --

    @LynxMethod
    fun load(url: String, opts: ReadableMap?) {
        ensureSink()
        val hls = opts != null && opts.hasKey("hls") && opts.getBoolean("hls")
        val headers = opts?.takeIf { it.hasKey("headers") }?.getMap("headers")?.let(::toStringMap)
        val ctx = androidContext()
        // Start the playback service BEFORE loading so the player is created in
        // the service context (required for the media notification to work).
        startPlaybackService(ctx)
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.load(ctx, url, hls, headers) }
    }

    @LynxMethod
    fun play() {
        ensureSink()
        val ctx = androidContext()
        startPlaybackService(ctx)
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.play(ctx) }
    }

    @LynxMethod
    fun pause() {
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.pause() }
    }

    @LynxMethod
    fun stop() {
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.stop() }
        stopPlaybackService(androidContext())
    }

    @LynxMethod
    fun seek(positionMs: Double) {
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.seek(positionMs.toLong()) }
    }

    @LynxMethod
    fun setVolume(volume: Double) {
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.setVolume(volume.toFloat()) }
    }

    @LynxMethod
    fun setSpeed(rate: Double) {
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.setSpeed(rate.toFloat()) }
    }

    // -- queue (JS-store-driven, mirrors the mock) --

    @LynxMethod
    fun setQueue(items: ReadableArray?, startIndex: Double) {
        // The JS player store owns the queue and calls load()/play() per track;
        // the native side plays one item at a time (same behaviour as the mock).
        // We DO capture per-track metadata (title/artist/url) so the media
        // notification / lock-screen has content when a track is loaded.
        val metadata = parseQueueMetadata(items)
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.setQueueMetadata(metadata) }
    }

    @LynxMethod
    fun next() {
        // Advancing is decided by the JS store, which then calls load()+play().
    }

    @LynxMethod
    fun previous() {
    }

    @LynxMethod
    fun setRepeatMode(mode: String) {
    }

    @LynxMethod
    fun setShuffle(on: Boolean) {
    }

    // -- media notification favorite button --

    @LynxMethod
    fun setFavorite(isFavorite: Boolean) {
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.setFavorite(isFavorite) }
    }

    // -- equalizer --

    @LynxMethod
    fun setEqualizerEnabled(on: Boolean) {
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.setEqualizerEnabled(on) }
    }

    @LynxMethod
    fun setEqualizerBand(index: Double, gainDb: Double) {
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.setEqualizerBand(index.toInt(), gainDb.toFloat()) }
    }

    // -- lifecycle --

    @LynxMethod
    fun dispose() {
        SongloftAudioEngine.runOnMain { SongloftAudioEngine.release() }
        stopPlaybackService(androidContext())
    }

    // -- AudioEventSink: forward engine events to the JS runtime --

    override fun emit(event: String, payload: Map<String, Any?>) {
        val params = JavaOnlyArray()
        params.pushMap(toJavaMap(payload))
        // First arg = event name JS listens for; second = transparent params
        // array delivered to the GlobalEventEmitter listener.
        lynxContext().sendGlobalEvent(event, params)
    }

    // -- helpers --

    /**
     * Start the playback service so the player/session are created inside the
     * service context. This is **critical** for the media notification: media3's
     * `MediaSessionService` only manages the foreground notification when the
     * `MediaSession` was constructed with the service as context.
     *
     * The call is best-effort: if it fails (e.g. background-start restrictions
     * on newer Android when the app is not in the foreground), playback still
     * works via the engine — only the notification is skipped.
     */
    private fun startPlaybackService(context: Context) {
        try {
            val intent = Intent(context, SongloftPlaybackService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (_: Throwable) {
            // e.g. background-start restrictions on newer Android — playback in
            // the module still works; only the notification is skipped.
        }
    }

    private fun stopPlaybackService(context: Context) {
        try {
            context.stopService(Intent(context, SongloftPlaybackService::class.java))
        } catch (_: Throwable) {
        }
    }

    private fun toJavaMap(payload: Map<String, Any?>): JavaOnlyMap {
        val map = JavaOnlyMap()
        for ((key, value) in payload) {
            when (value) {
                null -> map.putNull(key)
                is Double -> map.putDouble(key, value)
                is Int -> map.putInt(key, value)
                is Boolean -> map.putBoolean(key, value)
                is String -> map.putString(key, value)
                else -> map.putString(key, value.toString())
            }
        }
        return map
    }

    /** Parse the JS queue (`AudioItem[]`) into notification metadata entries. */
    private fun parseQueueMetadata(items: ReadableArray?): List<QueueMetadata> {
        if (items == null) return emptyList()
        val out = ArrayList<QueueMetadata>(items.size())
        for (i in 0 until items.size()) {
            if (items.getType(i) != ReadableType.Map) continue
            val map = items.getMap(i) ?: continue
            val url = optString(map, "url") ?: continue
            out.add(
                QueueMetadata(
                    url = url,
                    title = optString(map, "title"),
                    artist = optString(map, "artist"),
                    artworkUrl = optString(map, "artworkUrl"),
                ),
            )
        }
        return out
    }

    private fun optString(map: ReadableMap, key: String): String? {
        if (!map.hasKey(key) || map.getType(key) != ReadableType.String) return null
        return map.getString(key)
    }

    private fun toStringMap(readable: ReadableMap): Map<String, String> {
        val out = HashMap<String, String>()
        val it = readable.keySetIterator()
        while (it.hasNextKey()) {
            val key = it.nextKey()
            out[key] = readable.getString(key) ?: ""
        }
        return out
    }
}
