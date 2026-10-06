package org.songloft.lynx.platform

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.util.Base64
import androidx.core.content.FileProvider
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.jsbridge.LynxMethod
import org.songloft.lynx.net.InsecureTls
import java.io.BufferedOutputStream
import java.io.File
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Platform utilities native module — opens URLs and performs file-pick-then-upload.
 * Exposed to JS as `NativeModules.SongloftPlatform`.
 */
class SongloftPlatformModule(context: Context) : LynxModule(context) {

    init {
        // Hand the context to the shared client log file before anything else;
        // other holders (audio module/service) re-run it harmlessly.
        ClientFileLog.init(context)
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    @LynxMethod
    fun openURL(url: String) {
        mainHandler.post {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                mContext.startActivity(intent)
            } catch (_: Throwable) {}
        }
    }

    /**
     * Copy `text` to the system clipboard.
     *
     * Posted to the main thread deliberately: module methods run on the Lynx JS
     * thread, and `ClipboardManager.setPrimaryClip` reaches into window-owned
     * state — the same trap that silently killed the floating lyric overlay
     * (batch 48), where a bare `catch` swallowed the wrong-thread exception.
     */
    @LynxMethod
    fun setClipboard(text: String) {
        writeClipboard(text, null)
    }

    @LynxMethod
    fun setClipboardWithResult(text: String, callback: Callback) {
        writeClipboard(text, callback)
    }

    private fun writeClipboard(text: String, callback: Callback?) {
        mainHandler.post {
            try {
                val manager = mContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                    ?: throw IllegalStateException("clipboard_unavailable")
                manager.setPrimaryClip(ClipData.newPlainText("songloft", text))
            } catch (_: Throwable) {
                callback?.invoke("clipboard_failed")
                return@post
            }
            callback?.invoke(null)
        }
    }

    /**
     * Launch a file picker, then multipart-upload the chosen file.
     * The callback receives (error: String?, responseBody: String?).
     */
    @LynxMethod
    fun pickAndUploadFile(uploadUrl: String, fieldName: String, mimeType: String, callback: Callback) {
        mainHandler.post {
            FilePicker.pick(mContext, mimeType) { uri ->
                if (uri == null) {
                    callback.invoke("cancelled", null)
                    return@pick
                }
                Thread {
                    try {
                        val result = uploadFile(uri, uploadUrl, fieldName)
                        mainHandler.post { callback.invoke(null, result) }
                    } catch (e: Throwable) {
                        mainHandler.post { callback.invoke(e.message ?: "upload_failed", null) }
                    }
                }.start()
            }
        }
    }

    private fun uploadFile(uri: Uri, uploadUrl: String, fieldName: String): String {
        val boundary = "----LynxBoundary${UUID.randomUUID()}"
        val fileName = getFileName(uri) ?: "import.json"
        val conn = URL(uploadUrl).openConnection() as HttpURLConnection
        if (URL(uploadUrl).path.endsWith("/api/v1/jsplugins/upload")) {
            conn.connectTimeout = 15_000
            conn.readTimeout = 240_000
        }
        // Relaxed per connection rather than relying on the JVM-wide defaults
        // InsecureTls also mutates for ExoPlayer's sake: this path stays correct
        // if that global mutation is ever dropped.
        InsecureTls.configure(conn)
        conn.doOutput = true
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        conn.outputStream.use { out ->
            writeMultipart(out, boundary, fieldName, fileName, uri)
        }
        val code = conn.responseCode
        val body = if (code in 200..299) {
            conn.inputStream.bufferedReader().readText()
        } else {
            val err = conn.errorStream?.bufferedReader()?.readText() ?: ""
            throw RuntimeException("HTTP $code: $err")
        }
        conn.disconnect()
        return body
    }

    private fun writeMultipart(out: OutputStream, boundary: String, fieldName: String, fileName: String, uri: Uri) {
        val crlf = "\r\n"
        out.write("--$boundary$crlf".toByteArray())
        out.write("Content-Disposition: form-data; name=\"$fieldName\"; filename=\"$fileName\"$crlf".toByteArray())
        out.write("Content-Type: application/json$crlf".toByteArray())
        out.write(crlf.toByteArray())
        mContext.contentResolver.openInputStream(uri)?.use { input ->
            input.copyTo(out)
        }
        out.write("$crlf--$boundary--$crlf".toByteArray())
    }

    private fun getFileName(uri: Uri): String? {
        mContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) return cursor.getString(idx)
            }
        }
        return null
    }

    /**
     * Enable or disable trust-all certificate validation (self-signed servers).
     * Called from JS whenever `appConfig.insecureTls` is written — login,
     * startup hydrate, the server settings page, and profile switches.
     *
     * All the work lives in [InsecureTls] because the relaxation has to reach
     * three unrelated transports (the OkHttp-backed host `fetch` service,
     * ExoPlayer, and this module's own uploads), and because it must be
     * **reversible**: `enabled = false` used to be silently ignored, leaving a
     * process-wide trust-all in place until the app was killed.
     */
    @LynxMethod
    fun setInsecureTls(enabled: Boolean) {
        InsecureTls.update(enabled)
    }

    // ── Client log file (Lynx port of Flutter's FileLogger) ────────────────
    //
    // The TS layer (`core/logging/client-logger.ts`) owns timestamps and token
    // redaction; this side is a dumb appender that owns the file lifecycle —
    // per-day file name, 3-day cleanup and the 20 MB per-session cap, mirroring
    // `file_logger_native.dart`. The implementation lives in [ClientFileLog]
    // so native subsystems (audio engine, playback service) can log into the
    // same file an export reads.

    /** Append one already-formatted line. Fire-and-forget: JS never waits. */
    @LynxMethod
    fun logWrite(line: String) {
        ClientFileLog.writeRaw(line)
    }

    /** Read the current log file; callback receives (error, content-or-null). */
    @LynxMethod
    fun logRead(callback: Callback) {
        ClientFileLog.read { error, content ->
            mainHandler.post { callback.invoke(error, content) }
        }
    }

    /**
     * Decode a base64 payload into `cacheDir/shared/<fileName>` and hand it to
     * the system share sheet (`ACTION_SEND` chooser via [FileProvider]; the
     * provider and `res/xml/file_paths.xml` are declared in the manifest).
     * Callback receives (error-or-null).
     */
    @LynxMethod
    fun shareFile(base64: String, fileName: String, mimeType: String, callback: Callback) {
        Thread {
            try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                val file = File(sharedDir(), safeName(fileName))
                file.writeBytes(bytes)
                presentShareSheet(file, mimeType) { error -> callback.invoke(error) }
            } catch (e: Throwable) {
                mainHandler.post { callback.invoke(e.message ?: "decode_failed") }
            }
        }.start()
    }

    /**
     * Build the log archive here and hand it to the share sheet — the fast path
     * behind `SongloftPlatform.shareLogArchive`.
     *
     * Why it exists next to [shareFile]: the JS layer used to fetch the backend
     * log (≤10 MiB) and read this app's client log (≤20 MB) into JS strings,
     * deflate both with a pure-JS zipper and base64 the result by hand — on the
     * JS thread of an engine with no JIT — then push the whole payload back
     * across the bridge. That pause in front of the share sheet is
     * songloft-player-lynx#3. Here JS passes three short strings and every byte
     * is streamed natively.
     *
     * `backendLogUrl` empty skips the backend side. `authHeader` is sent
     * verbatim as `Authorization` (empty = no header). A backend failure writes
     * `backend-error.txt` into the archive rather than failing the export, which
     * is the semantic the JS path and the Flutter reference both keep.
     *
     * Callback receives (error-or-null, `{"hasBackend":…,"hasFrontend":…}`).
     */
    @LynxMethod
    fun shareLogArchive(backendLogUrl: String, authHeader: String, fileName: String, callback: Callback) {
        Thread {
            try {
                val staging = File(mContext.cacheDir, LOG_EXPORT_DIR)
                // A leftover staging dir from an interrupted run would ship
                // someone else's stale logs inside this archive.
                staging.deleteRecursively()
                staging.mkdirs()

                val hasBackend = if (backendLogUrl.isNotEmpty()) {
                    downloadBackendLog(backendLogUrl, authHeader, staging)
                } else {
                    false
                }
                val hasFrontend = copyClientLog(staging)

                // Sorted so the archive's entry order does not depend on the
                // filesystem's directory order.
                val entries = staging.listFiles()?.sortedBy { it.name } ?: emptyList()
                if (entries.isEmpty()) {
                    staging.deleteRecursively()
                    // Same message as the JS path, so the toast reads identically
                    // whichever path ran.
                    mainHandler.post { callback.invoke("no logs to export", null) }
                    return@Thread
                }

                val archive = File(sharedDir(), safeName(fileName))
                // No `setLevel`: ZipOutputStream already constructs its Deflater
                // with DEFAULT_COMPRESSION, and `setLevel`'s javadoc documents
                // 0–9 only — passing DEFAULT_COMPRESSION (-1) happens to work
                // but is a needless bet on an implementation detail.
                ZipOutputStream(BufferedOutputStream(archive.outputStream())).use { zip ->
                    for (entry in entries) {
                        zip.putNextEntry(ZipEntry(entry.name))
                        entry.inputStream().use { it.copyTo(zip) }
                        zip.closeEntry()
                    }
                }
                staging.deleteRecursively()

                val result = "{\"hasBackend\":$hasBackend,\"hasFrontend\":$hasFrontend}"
                presentShareSheet(archive, MIME_ZIP) { error ->
                    if (error != null) callback.invoke(error, null) else callback.invoke(null, result)
                }
            } catch (e: Throwable) {
                mainHandler.post { callback.invoke(reason(e, "archive_failed"), null) }
            }
        }.start()
    }

    /**
     * GET [url] straight into `staging/backend.log`. True when the file ended up
     * with content. Streamed rather than buffered: this is up to 10 MiB, and
     * holding it in memory is exactly what the fast path exists to stop doing.
     *
     * [InsecureTls.configure] per connection like [uploadFile] — a self-signed
     * LAN server is the common setup, and the whole point of an export is that
     * it works when things are broken.
     */
    private fun downloadBackendLog(url: String, authHeader: String, staging: File): Boolean {
        val target = File(staging, ENTRY_BACKEND)
        var conn: HttpURLConnection? = null
        try {
            conn = URL(url).openConnection() as HttpURLConnection
            InsecureTls.configure(conn)
            conn.requestMethod = "GET"
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            if (authHeader.isNotEmpty()) conn.setRequestProperty("Authorization", authHeader)
            val code = conn.responseCode
            if (code !in 200..299) {
                val detail = conn.errorStream?.bufferedReader()?.use { it.readText() }
                    ?.take(ERROR_DETAIL_CHARS) ?: ""
                writeBackendError(staging, if (detail.isEmpty()) "HTTP $code" else "HTTP $code: $detail")
                return false
            }
            conn.inputStream.use { input ->
                target.outputStream().use { output -> input.copyTo(output) }
            }
            if (target.length() == 0L) {
                // An empty side is omitted silently, not reported as a failure.
                target.delete()
                return false
            }
            return true
        } catch (e: Throwable) {
            try { target.delete() } catch (_: Throwable) {}
            writeBackendError(staging, reason(e, "download_failed"))
            return false
        } finally {
            conn?.disconnect()
        }
    }

    private fun writeBackendError(staging: File, reason: String) {
        try {
            File(staging, ENTRY_BACKEND_ERROR).writeText("Failed to fetch backend logs: $reason\n")
        } catch (_: Throwable) {
            // The note is a courtesy to whoever reads the archive; losing it
            // must not lose the export.
        }
    }

    /**
     * Copy this app's client log into `staging/frontend.log`. False when there
     * is nothing to copy. Blocks on [ClientFileLog.copyTo], which runs on the
     * log thread so lines queued before the export are already on disk — this
     * runs on a dedicated thread, never the JS or main thread, so the wait is
     * nobody's latency but this export's.
     */
    private fun copyClientLog(staging: File): Boolean {
        val target = File(staging, ENTRY_FRONTEND)
        val done = CountDownLatch(1)
        var copied = 0L
        ClientFileLog.copyTo(target) { bytes ->
            copied = bytes
            done.countDown()
        }
        done.await()
        if (copied <= 0L) {
            try { target.delete() } catch (_: Throwable) {}
            return false
        }
        return true
    }

    private fun sharedDir(): File {
        val dir = File(mContext.cacheDir, SHARED_DIR)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /**
     * Belt and braces: the name comes from our own TS layer, but a separator
     * here would escape the shared dir.
     */
    private fun safeName(fileName: String): String = fileName.substringAfterLast('/')

    /**
     * Present [file] through the `ACTION_SEND` chooser (the FileProvider and
     * `res/xml/file_paths.xml` are declared in the manifest). Always hops to the
     * main thread: `startActivity` from the export/share worker thread is the
     * same wrong-thread trap batch 48 hit with the lyric overlay.
     */
    private fun presentShareSheet(file: File, mimeType: String, onDone: (String?) -> Unit) {
        mainHandler.post {
            try {
                val uri = FileProvider.getUriForFile(
                    mContext, "${mContext.packageName}.fileprovider", file
                )
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = mimeType
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val chooser = Intent.createChooser(send, null).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                mContext.startActivity(chooser)
                onDone(null)
            } catch (e: Throwable) {
                onDone(reason(e, "share_failed"))
            }
        }
    }

    /**
     * A **non-empty** reason string for a bridge callback. The TS facade decides
     * "failed" from this argument, and a blank one would be read as success —
     * and `Throwable.message` is legitimately allowed to be blank, which `?:`
     * (null-only) does not catch.
     */
    private fun reason(e: Throwable, fallback: String): String {
        val message = e.message
        return if (message != null && message.isNotBlank()) message else fallback
    }

    private companion object {
        const val SHARED_DIR = "shared"
        const val LOG_EXPORT_DIR = "logexport"
        const val ENTRY_BACKEND = "backend.log"
        const val ENTRY_BACKEND_ERROR = "backend-error.txt"
        const val ENTRY_FRONTEND = "frontend.log"
        const val MIME_ZIP = "application/zip"
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 60_000
        const val ERROR_DETAIL_CHARS = 500
    }
}
