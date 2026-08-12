package org.songloft.lynx.platform

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Minimal file picker that leverages the system document picker.
 * Since the host Activity is a plain `android.app.Activity` (not ComponentActivity),
 * we register a result callback via a transparent trampoline Activity.
 */
object FilePicker {
    private var pendingCallback: ((Uri?) -> Unit)? = null

    fun pick(context: Context, mimeType: String, callback: (Uri?) -> Unit) {
        pendingCallback = callback
        val intent = Intent(context, FilePickerActivity::class.java)
        intent.putExtra(EXTRA_MIME_TYPE, mimeType)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    internal fun deliver(uri: Uri?) {
        pendingCallback?.invoke(uri)
        pendingCallback = null
    }

    const val EXTRA_MIME_TYPE = "mime_type"
    const val REQUEST_CODE = 9001
}
