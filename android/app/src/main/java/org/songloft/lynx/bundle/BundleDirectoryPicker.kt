package org.songloft.lynx.bundle

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import java.io.File
import java.util.UUID

/** SAF picker that returns a filesystem path the embedded Go backend can scan. */
object BundleDirectoryPicker {
    private var pending: ((String?, String?) -> Unit)? = null
    private var activeId: String? = null

    fun pick(context: Context, callback: (String?, String?) -> Unit) {
        Handler(Looper.getMainLooper()).post {
            if (pending != null) {
                callback(null, "directory_picker_busy")
                return@post
            }
            val id = UUID.randomUUID().toString()
            activeId = id
            pending = callback
            try {
                context.startActivity(
                    Intent(context, BundleDirectoryPickerActivity::class.java)
                        .putExtra(EXTRA_REQUEST_ID, id)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            } catch (_: Exception) {
                deliver(id, null, "directory_picker_unavailable")
            }
        }
    }

    internal fun deliver(id: String?, path: String?, error: String?) {
        if (id == null || id != activeId) return
        val callback = pending
        pending = null
        activeId = null
        try {
            callback?.invoke(path, error)
        } catch (_: Exception) {
            // The Lynx view may have detached while the picker was open.
        }
    }

    const val EXTRA_REQUEST_ID = "bundle_picker_id"
    const val REQUEST_CODE = 5102
}

class BundleDirectoryPickerActivity : Activity() {
    private val requestId: String? get() = intent.getStringExtra(BundleDirectoryPicker.EXTRA_REQUEST_ID)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) {
            BundleDirectoryPicker.deliver(requestId, null, "directory_picker_cancelled")
            finish()
            return
        }
        try {
            startActivityForResult(
                Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                    addFlags(
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or
                            Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
                            Intent.FLAG_GRANT_PREFIX_URI_PERMISSION,
                    )
                    putExtra(Intent.EXTRA_LOCAL_ONLY, true)
                },
                BundleDirectoryPicker.REQUEST_CODE,
            )
        } catch (_: Exception) {
            BundleDirectoryPicker.deliver(requestId, null, "directory_picker_unavailable")
            finish()
        }
    }

    @Deprecated("The target SDK still uses the platform document picker callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != BundleDirectoryPicker.REQUEST_CODE) return
        val selected = try {
            val uri = data?.data ?: throw IllegalArgumentException("directory_picker_cancelled")
            require(resultCode == RESULT_OK && uri.authority == "com.android.externalstorage.documents")
            require(DocumentsContract.isTreeUri(uri))
            val flags = data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            require(flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
            contentResolver.takePersistableUriPermission(uri, flags)
            val id = DocumentsContract.getTreeDocumentId(uri)
            val volume = id.substringBefore(':')
            val relative = id.substringAfter(':', "").trim('/')
            val root = if (volume.equals("primary", ignoreCase = true)) {
                "/storage/emulated/0"
            } else {
                "/storage/$volume"
            }
            val path = if (relative.isEmpty()) root else "$root/$relative"
            require(File(path).isDirectory) { "selected_directory_unavailable" }
            path
        } catch (error: Exception) {
            BundleDirectoryPicker.deliver(requestId, null, error.message ?: "directory_picker_failed")
            finish()
            return
        }
        BundleDirectoryPicker.deliver(requestId, selected, null)
        finish()
    }

    override fun onDestroy() {
        BundleDirectoryPicker.deliver(requestId, null, "directory_picker_cancelled")
        super.onDestroy()
    }
}
