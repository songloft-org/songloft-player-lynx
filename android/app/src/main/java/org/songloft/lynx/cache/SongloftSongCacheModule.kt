package org.songloft.lynx.cache

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.tasm.behavior.LynxContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * Song audio file cache module.
 * Downloads audio files to app-internal cache and provides lookup/removal.
 * Exposed to JS as `NativeModules.SongloftSongCache`.
 */
class SongloftSongCacheModule(context: Context) : LynxModule(context) {

    companion object {
        private const val CACHE_DIR_NAME = "song_cache"
    }

    private val executor = Executors.newCachedThreadPool()
    private val client = OkHttpClient()

    private fun getCacheDir(): File {
        val ctx = (mContext as LynxContext).getContext()
        val dir = File(ctx.cacheDir, CACHE_DIR_NAME)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /**
     * Download audio from [url] into `{cacheDir}/song_cache/{songId}`.
     * Callback receives `{"path":"..."}` on success, `{"error":"..."}` on failure.
     */
    @LynxMethod
    fun download(songId: String, url: String, callback: Callback) {
        executor.execute {
            try {
                val file = File(getCacheDir(), songId)
                val request = Request.Builder().url(url).build()
                val response = client.newCall(request).execute()
                if (!response.isSuccessful) {
                    callback.invoke(JSONObject().put("error", "HTTP ${response.code}").toString())
                    return@execute
                }
                response.body?.byteStream()?.use { input ->
                    FileOutputStream(file).use { output ->
                        input.copyTo(output)
                    }
                } ?: run {
                    callback.invoke(JSONObject().put("error", "Empty response body").toString())
                    return@execute
                }
                callback.invoke(JSONObject().put("path", file.absolutePath).toString())
            } catch (e: Exception) {
                callback.invoke(JSONObject().put("error", e.message ?: "Unknown error").toString())
            }
        }
    }

    /**
     * Check if a cached file exists for [songId].
     * Callback receives `{"path":"..."}` if present, `{"path":null}` otherwise.
     */
    @LynxMethod
    fun getCachedPath(songId: String, callback: Callback) {
        val file = File(getCacheDir(), songId)
        val result = JSONObject()
        if (file.exists()) {
            result.put("path", file.absolutePath)
        } else {
            result.put("path", JSONObject.NULL)
        }
        callback.invoke(result.toString())
    }

    /**
     * Delete the cached file for [songId]. Callback receives `{}`.
     */
    @LynxMethod
    fun remove(songId: String, callback: Callback) {
        val file = File(getCacheDir(), songId)
        if (file.exists()) file.delete()
        callback.invoke(JSONObject().toString())
    }

    /**
     * Compute total size of the song_cache directory in bytes.
     * Callback receives `{"bytes":12345}`.
     */
    @LynxMethod
    fun getCacheSize(callback: Callback) {
        val dir = getCacheDir()
        var totalBytes = 0L
        dir.listFiles()?.forEach { file ->
            if (file.isFile) totalBytes += file.length()
        }
        callback.invoke(JSONObject().put("bytes", totalBytes).toString())
    }
}
