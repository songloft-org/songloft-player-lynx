package org.songloft.lynx.cache

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.behavior.LynxContext
import okhttp3.OkHttpClient
import org.json.JSONObject
import org.songloft.lynx.net.InsecureTls
import java.io.File
import java.util.concurrent.Executors

/** Persistent filesDir cache. Legacy and v2 methods share one bounded serial writer. */
class SongloftSongCacheModule(context: Context) : LynxModule(context) {
    companion object {
        const val LIMIT_EXCEEDED_ERROR = "limit_exceeded"
        private val reads = Executors.newSingleThreadExecutor()
        private var instance: SongCacheStore? = null
        private var cachedClient: OkHttpClient? = null
        private var cachedInsecure: Boolean? = null
        @Synchronized private fun clientFor(insecure: Boolean): OkHttpClient {
            cachedClient?.let { if (cachedInsecure == insecure) return it }
            val builder = OkHttpClient.Builder().callTimeout(15, java.util.concurrent.TimeUnit.MINUTES)
            if (insecure) builder.sslSocketFactory(InsecureTls.socketFactory, InsecureTls.trustManager)
                .hostnameVerifier(InsecureTls.hostnameVerifier)
            val created = builder.build()
            cachedClient = created; cachedInsecure = insecure
            return created
        }
        @Synchronized private fun store(context: Context): SongCacheStore {
            return instance ?: SongCacheStore(File(context.filesDir, "song_cache")) { clientFor(InsecureTls.enabled) }
                .also { instance = it }
        }
    }
    private fun store(): SongCacheStore = store((mContext as LynxContext).getContext())
    private fun answer(callback: Callback, result: JSONObject) { callback.invoke(result.toString()) }
    private fun read(callback: Callback, operation: () -> JSONObject) {
        reads.execute {
            val result = try { operation() } catch (_: Exception) { JSONObject().put("error", "invalid_cache_request") }
            answer(callback, result)
        }
    }
    private fun progress(value: JSONObject) {
        try {
            val event = JavaOnlyMap()
            for (key in listOf("task_id", "namespace", "key", "status", "error")) {
                if (!value.isNull(key)) event.putString(key, value.getString(key))
            }
            event.putDouble("bytes", value.getLong("bytes").toDouble())
            event.putDouble("total", value.getLong("total").toDouble())
            val params = JavaOnlyArray(); params.pushMap(event)
            (mContext as LynxContext).sendGlobalEvent("songCacheProgress", params)
        } catch (_: Exception) { /* Detached page must not abort a durable download. */ }
    }
    @LynxMethod fun getCacheContract(callback: Callback) { answer(callback, JSONObject().put("version", 2)) }
    @LynxMethod fun cacheEntry(request: String, callback: Callback) { store().cacheEntry(request, ::progress) { answer(callback, it) } }
    @LynxMethod fun getEntry(request: String, callback: Callback) { read(callback) { store().getEntry(request) } }
    @LynxMethod fun listEntries(request: String, callback: Callback) { read(callback) { store().listEntries(request) } }
    @LynxMethod fun removeEntry(request: String, callback: Callback) { store().remove(request) { answer(callback, it) } }
    @LynxMethod fun clearNamespace(request: String, callback: Callback) {
        try { store().clearNamespace(JSONObject(request).getString("namespace")) { answer(callback, it) } }
        catch (_: Exception) { answer(callback, JSONObject().put("error", "invalid_cache_request")) }
    }
    @LynxMethod fun clearLegacy(callback: Callback) { store().clearLegacy { answer(callback, it) } }
    @LynxMethod fun getTasks(callback: Callback) { read(callback) { store().getTasks() } }
    @LynxMethod fun cancelTask(taskId: String) { try { store().cancel(taskId) } catch (_: Exception) {} }

    // Original five-method ABI remains available to old bundles. These files have no proven identity.
    @LynxMethod fun download(songId: String, url: String, ext: String, maxBytes: Double, callback: Callback) {
        store().legacyDownload(songId, url, ext, maxBytes) { answer(callback, it) }
    }
    @LynxMethod fun getCacheInfo(songId: String, callback: Callback) { read(callback) { store().legacyInfo(songId) } }
    @LynxMethod fun remove(songId: String, callback: Callback) { store().legacyRemove(songId) { answer(callback, it) } }
    @LynxMethod fun getCacheSize(callback: Callback) { read(callback) { JSONObject().put("bytes", store().size()) } }
    @LynxMethod fun clearAll(callback: Callback) { store().clearAll { answer(callback, it) } }
}
