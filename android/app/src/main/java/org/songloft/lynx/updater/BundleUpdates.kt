package org.songloft.lynx.updater

import android.content.Context
import org.json.JSONObject
import java.io.File

/** One store per process, shared by template loading and every module instance. */
object BundleUpdates {
    private var initialized = false
    private var store: BundleUpdateStore? = null

    @Synchronized fun get(context: Context): BundleUpdateStore? {
        if (!initialized) {
            initialized = true
            store = try {
                val app = context.applicationContext
                val host = app.assets.open("native-host.json").bufferedReader().use { JSONObject(it.readText()) }
                    .put("platform", "android")
                BundleUpdateStore(File(app.filesDir, "bundle_updates"), host)
            } catch (_: Exception) { null }
        }
        return store
    }
}
