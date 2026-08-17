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
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.jsbridge.LynxMethod
import org.songloft.lynx.net.InsecureTls
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

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
}
