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
import java.io.File
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Platform utilities native module — opens URLs and performs file-pick-then-upload.
 * Exposed to JS as `NativeModules.SongloftPlatform`.
 */
class SongloftPlatformModule(context: Context) : LynxModule(context) {

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
        mainHandler.post {
            try {
                val manager = mContext.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                manager?.setPrimaryClip(ClipData.newPlainText("songloft", text))
            } catch (_: Throwable) {}
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
    // `file_logger_native.dart`.

    private val logExecutor = Executors.newSingleThreadExecutor()
    private var logFile: File? = null
    private var logSessionBytes = 0L
    private var logCapReached = false

    /** Append one already-formatted line. Fire-and-forget: JS never waits. */
    @LynxMethod
    fun logWrite(line: String) {
        logExecutor.execute {
            try {
                if (logCapReached) return@execute
                val file = ensureLogFile() ?: return@execute
                val bytes = line.toByteArray(Charsets.UTF_8)
                if (logSessionBytes + bytes.size + 1 > LOG_MAX_SESSION_BYTES) {
                    logCapReached = true
                    file.appendText(
                        "[FileLogger] session log cap reached "
                            + "(${LOG_MAX_SESSION_BYTES / (1024 * 1024)}MB); further lines go to logcat only\n"
                    )
                    return@execute
                }
                file.appendText(line + "\n")
                logSessionBytes += bytes.size + 1
            } catch (_: Throwable) {
                // Logging must never crash the code path being logged.
            }
        }
    }

    /** Read the current log file; callback receives (error, content-or-null). */
    @LynxMethod
    fun logRead(callback: Callback) {
        logExecutor.execute {
            try {
                val file = ensureLogFile()
                val content = if (file != null && file.exists()) file.readText() else null
                mainHandler.post { callback.invoke(null, content) }
            } catch (e: Throwable) {
                mainHandler.post { callback.invoke(e.message ?: "read_failed", null) }
            }
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
                val dir = File(mContext.cacheDir, "shared")
                if (!dir.exists()) dir.mkdirs()
                // Belt and braces: the name comes from our own TS layer, but a
                // separator here would escape the shared dir.
                val file = File(dir, fileName.substringAfterLast('/'))
                file.writeBytes(bytes)
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
                        callback.invoke(null)
                    } catch (e: Throwable) {
                        callback.invoke(e.message ?: "share_failed")
                    }
                }
            } catch (e: Throwable) {
                mainHandler.post { callback.invoke(e.message ?: "decode_failed") }
            }
        }.start()
    }

    /** Lazily create today's log file and sweep files older than 3 days. */
    private fun ensureLogFile(): File? {
        logFile?.let { return it }
        return try {
            val dir = File(mContext.filesDir, LOG_DIR)
            if (!dir.exists()) dir.mkdirs()
            cleanOldLogs(dir)
            val file = File(dir, "songloft_${LOG_DATE_FORMAT.format(Date())}.log")
            logFile = file
            file
        } catch (_: Throwable) {
            null
        }
    }

    private fun cleanOldLogs(dir: File) {
        try {
            val cutoff = System.currentTimeMillis() - LOG_MAX_AGE_DAYS * 24L * 60L * 60L * 1000L
            dir.listFiles()?.forEach { file ->
                val match = LOG_NAME_PATTERN.matchEntire(file.name) ?: return@forEach
                val date = try {
                    LOG_DATE_FORMAT.parse(match.groupValues[1])
                } catch (_: Throwable) {
                    null
                }
                if (date != null && date.time < cutoff) file.delete()
            }
        } catch (_: Throwable) {
            // Cleanup is best-effort; never block logging on it.
        }
    }

    companion object {
        private const val LOG_DIR = "logs"
        private const val LOG_MAX_SESSION_BYTES = 20L * 1024L * 1024L
        private const val LOG_MAX_AGE_DAYS = 3L

        // Same file-name shape as Flutter's `_logNamePattern`, so cleanup only
        // ever touches files this feature wrote.
        private val LOG_NAME_PATTERN =
            Regex("^songloft_(\\d{4}-\\d{2}-\\d{2})(?:_[A-Za-z0-9]+)?\\.log$")
        private val LOG_DATE_FORMAT = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    }
}
