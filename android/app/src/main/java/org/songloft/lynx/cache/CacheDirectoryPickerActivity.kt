package org.songloft.lynx.cache

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import org.json.JSONObject

/** One lifecycle-bound system picker; no strong reference to the host Activity. */
object CacheDirectoryPicker {
    private var pending: ((JSONObject) -> Unit)? = null
    private var requestId: String? = null
    fun pick(context: Context, callback: (JSONObject) -> Unit) {
        Handler(Looper.getMainLooper()).post {
            if (pending != null) { callback(JSONObject().put("error", "cache_busy")); return@post }
            pending = callback
            val id = java.util.UUID.randomUUID().toString()
            requestId = id
            try { context.startActivity(Intent(context, CacheDirectoryPickerActivity::class.java).putExtra("cache_picker_id", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            catch (_: Exception) { deliver(id, JSONObject().put("error", "cache_storage_unavailable")) }
        }
    }
    internal fun deliver(id: String?, value: JSONObject) {
        if (id == null || id != requestId) return
        val callback = pending; pending = null; requestId = null
        try { callback?.invoke(value) } catch (_: Exception) { /* The Lynx view may have detached while the system picker was open. */ }
    }
}

class CacheDirectoryPickerActivity : Activity() {
    private val requestId: String? get() = intent.getStringExtra("cache_picker_id")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) { CacheDirectoryPicker.deliver(requestId, JSONObject().put("cancelled", true)); finish(); return }
        try {
            startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
                putExtra(Intent.EXTRA_LOCAL_ONLY, true)
            }, 5101)
        } catch (_: Exception) { CacheDirectoryPicker.deliver(requestId, JSONObject().put("error", "cache_storage_unavailable")); finish() }
    }
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        val value = try {
            val uri = data?.data
            if (requestCode != 5101 || resultCode != RESULT_OK || uri == null) JSONObject().put("cancelled", true)
            else {
                require(uri.authority == "com.android.externalstorage.documents" && DocumentsContract.isTreeUri(uri))
                val flags = data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                require(flags == (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION))
                contentResolver.takePersistableUriPermission(uri, flags)
                JSONObject().put("tree", uri.toString()).put("label", DocumentsContract.getTreeDocumentId(uri))
            }
        } catch (_: Exception) { JSONObject().put("error", "cache_storage_unavailable") }
        CacheDirectoryPicker.deliver(requestId, value); finish()
    }
    override fun onDestroy() {
        CacheDirectoryPicker.deliver(requestId, JSONObject().put("cancelled", true))
        super.onDestroy()
    }
}
