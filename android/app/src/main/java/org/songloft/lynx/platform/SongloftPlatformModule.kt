package org.songloft.lynx.platform

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import com.lynx.tasm.behavior.utils.LynxUIMethodModule
import com.lynx.react.bridge.Callback
import com.lynx.tasm.annotation.LynxMethod
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/**
 * Platform utilities native module — opens URLs and performs file-pick-then-upload.
 * Exposed to JS as `NativeModules.SongloftPlatform`.
 */
class SongloftPlatformModule(private val context: Context) : LynxUIMethodModule(context) {

    private val mainHandler = Handler(Looper.getMainLooper())

    @LynxMethod
    fun openURL(url: String) {
        mainHandler.post {
            try {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
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
            FilePicker.pick(context, mimeType) { uri ->
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
        context.contentResolver.openInputStream(uri)?.use { input ->
            input.copyTo(out)
        }
        out.write("$crlf--$boundary--$crlf".toByteArray())
    }

    private fun getFileName(uri: Uri): String? {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (idx >= 0) return cursor.getString(idx)
            }
        }
        return null
    }
}
