package org.songloft.lynx.cache

import android.content.Context
import android.net.Uri
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.tasm.behavior.LynxContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import org.songloft.lynx.net.InsecureTls
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

/**
 * Song audio file cache module.
 *
 * Downloads playable song URLs into app-internal storage so they can be replayed
 * offline or without re-fetching. Exposed to JS as `NativeModules.SongloftSongCache`.
 *
 * Design notes (each is a bug this module previously shipped — keep them):
 *
 *  - **Storage lives under [Context.getFilesDir], not `cacheDir`.** This is a
 *    *user-directed* cache ("cache this song on the device"), not a transient one:
 *    the OS is free to evict `cacheDir` under storage pressure, which would drop
 *    files the user explicitly asked to keep. `filesDir` is only removed with the
 *    app. The directory name stays `song_cache`.
 *  - **Downloads honour [InsecureTls]** via [clientFor] instead of a bare
 *    `OkHttpClient()`. A bare client ignores the "allow insecure TLS" setting, so
 *    caching from a self-signed server failed while normal playback worked. The
 *    client is rebuilt when the flag flips, mirroring `SongloftHttpService`.
 *  - **Files are written atomically** to `{songId}.{ext}.part` and renamed into
 *    place, so a crashed or cancelled download never leaves a half-written file that
 *    `getCacheInfo` would report as playable.
 *  - **The download is byte-counted against `maxBytes`** and aborted (partial file
 *    deleted) when it would exceed the cap, reporting the machine-readable
 *    [LIMIT_EXCEEDED_ERROR] sentinel rather than a human string. The TS layer owns
 *    the user-facing wording.
 *  - **Callbacks return a playable `file://` URL** ([Uri.fromFile]), not a bare
 *    absolute path. The audio engine builds its media item from this string; a bare
 *    path is ambiguous and a `file://` URL is what both ExoPlayer and the JS side
 *    expect. Never hand-concatenate a file-scheme prefix onto the path — that breaks
 *    on spaces and non-ASCII.
 */
class SongloftSongCacheModule(context: Context) : LynxModule(context) {

    companion object {
        private const val CACHE_DIR_NAME = "song_cache"

        /**
         * Machine-readable sentinel for "download would exceed the byte cap".
         * Shared verbatim with the TS facade (`song-cache.ts`) and asserted by the
         * native-module contract test, so the two sides cannot drift.
         */
        const val LIMIT_EXCEEDED_ERROR = "limit_exceeded"
    }

    private val executor = Executors.newCachedThreadPool()

    // Rebuilt when the insecure-TLS flag flips (see KDoc above).
    private var cachedClient: OkHttpClient? = null
    private var cachedInsecure: Boolean? = null

    private fun clientFor(insecure: Boolean): OkHttpClient {
        cachedClient?.let { if (cachedInsecure == insecure) return it }
        val client = if (insecure) {
            OkHttpClient.Builder()
                .sslSocketFactory(InsecureTls.socketFactory, InsecureTls.trustManager)
                .hostnameVerifier(InsecureTls.hostnameVerifier)
                .build()
        } else {
            OkHttpClient()
        }
        cachedClient = client
        cachedInsecure = insecure
        return client
    }

    private fun getCacheDir(): File {
        val ctx = (mContext as LynxContext).getContext()
        val dir = File(ctx.filesDir, CACHE_DIR_NAME)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /** The on-disk name for a song: `{songId}.{ext}`, or `{songId}` when ext is blank. */
    private fun fileName(songId: String, ext: String): String {
        val trimmed = ext.trim().removePrefix(".")
        return if (trimmed.isEmpty()) songId else "$songId.$trimmed"
    }

    /**
     * Locate a cached file for [songId]. Matches the exact `{songId}` name or any
     * `{songId}.<ext>` — the dotted prefix matters, so song `12` never matches
     * `123.mp3`.
     */
    private fun findCachedFile(songId: String): File? {
        val dir = getCacheDir()
        val exact = File(dir, songId)
        if (exact.isFile) return exact
        val prefix = "$songId."
        return dir.listFiles()?.firstOrNull { it.isFile && it.name.startsWith(prefix) }
    }

    /** A playable `file://` URL for [file] (never a hand-built string). */
    private fun fileUrl(file: File): String = Uri.fromFile(file).toString()

    /**
     * Download audio from [url] into `{filesDir}/song_cache/{songId}.{ext}`.
     *
     * Streams to a `.part` file, counting bytes; if the running total would exceed
     * [maxBytes] (> 0), the partial file is deleted and the callback receives
     * `{"error":"limit_exceeded"}`. On success the file is renamed into place and
     * the callback receives a JSON object whose `path` is a file-scheme URL; other
     * failures receive `{"error":"…"}`.
     */
    @LynxMethod
    fun download(songId: String, url: String, ext: String, maxBytes: Double, callback: Callback) {
        executor.execute {
            val cap = if (maxBytes.isFinite() && maxBytes > 0) maxBytes.toLong() else Long.MAX_VALUE
            val finalFile = File(getCacheDir(), fileName(songId, ext))
            val partFile = File(finalFile.absolutePath + ".part")
            try {
                val request = Request.Builder().url(url).build()
                val response = clientFor(InsecureTls.enabled).newCall(request).execute()
                if (!response.isSuccessful) {
                    partFile.delete()
                    callback.invoke(JSONObject().put("error", "HTTP ${response.code}").toString())
                    return@execute
                }
                val body = response.body
                if (body == null) {
                    partFile.delete()
                    callback.invoke(JSONObject().put("error", "Empty response body").toString())
                    return@execute
                }
                var written = 0L
                var exceeded = false
                body.byteStream().use { input ->
                    FileOutputStream(partFile).use { output ->
                        val buffer = ByteArray(8 * 1024)
                        while (true) {
                            val read = input.read(buffer)
                            if (read == -1) break
                            written += read
                            if (written > cap) {
                                exceeded = true
                                break
                            }
                            output.write(buffer, 0, read)
                        }
                    }
                }
                if (exceeded) {
                    partFile.delete()
                    callback.invoke(JSONObject().put("error", LIMIT_EXCEEDED_ERROR).toString())
                    return@execute
                }
                // Atomic-ish commit: replace any previous copy, then move into place.
                if (finalFile.exists()) finalFile.delete()
                if (!partFile.renameTo(finalFile)) {
                    partFile.delete()
                    callback.invoke(JSONObject().put("error", "Failed to finalize file").toString())
                    return@execute
                }
                callback.invoke(JSONObject().put("path", fileUrl(finalFile)).toString())
            } catch (e: Exception) {
                partFile.delete()
                callback.invoke(JSONObject().put("error", e.message ?: "Unknown error").toString())
            }
        }
    }

    /**
     * Report whether [songId] is cached. Callback receives a JSON object with
     * `cached` true, a file-scheme `url` and `sizeBytes` when present, or
     * `cached` false with a null `url` and zero `sizeBytes` otherwise.
     */
    @LynxMethod
    fun getCacheInfo(songId: String, callback: Callback) {
        val file = findCachedFile(songId)
        val result = JSONObject()
        if (file != null) {
            result.put("cached", true)
            result.put("url", fileUrl(file))
            result.put("sizeBytes", file.length())
        } else {
            result.put("cached", false)
            result.put("url", JSONObject.NULL)
            result.put("sizeBytes", 0)
        }
        callback.invoke(result.toString())
    }

    /**
     * Delete the cached file for [songId] (any extension). Callback receives `{}`.
     */
    @LynxMethod
    fun remove(songId: String, callback: Callback) {
        findCachedFile(songId)?.delete()
        callback.invoke(JSONObject().toString())
    }

    /**
     * Compute the total size of the song_cache directory in bytes (ignores `.part`
     * leftovers). Callback receives `{"bytes":N}`.
     */
    @LynxMethod
    fun getCacheSize(callback: Callback) {
        val dir = getCacheDir()
        var totalBytes = 0L
        dir.listFiles()?.forEach { file ->
            if (file.isFile && !file.name.endsWith(".part")) totalBytes += file.length()
        }
        callback.invoke(JSONObject().put("bytes", totalBytes).toString())
    }

    /** Delete every cached song file. Callback receives `{}`. */
    @LynxMethod
    fun clearAll(callback: Callback) {
        getCacheDir().listFiles()?.forEach { file ->
            if (file.isFile) file.delete()
        }
        callback.invoke(JSONObject().toString())
    }
}
