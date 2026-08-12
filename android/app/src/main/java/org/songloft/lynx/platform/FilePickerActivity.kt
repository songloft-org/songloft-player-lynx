package org.songloft.lynx.platform

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * Transparent trampoline Activity that launches ACTION_GET_CONTENT and forwards
 * the result back to [FilePicker]. Declared in the manifest with
 * `android:theme="@android:style/Theme.Translucent.NoTitleBar"` so it's invisible.
 */
class FilePickerActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) {
            // Restored after process death — we lost the callback, just finish.
            FilePicker.deliver(null)
            finish()
            return
        }
        val mimeType = intent.getStringExtra(FilePicker.EXTRA_MIME_TYPE) ?: "*/*"
        val picker = Intent(Intent.ACTION_GET_CONTENT).apply {
            type = mimeType
            addCategory(Intent.CATEGORY_OPENABLE)
        }
        startActivityForResult(picker, FilePicker.REQUEST_CODE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FilePicker.REQUEST_CODE) {
            val uri = if (resultCode == RESULT_OK) data?.data else null
            FilePicker.deliver(uri)
        } else {
            FilePicker.deliver(null)
        }
        finish()
    }
}
