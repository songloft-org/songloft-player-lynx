package org.songloft.lynx

import android.content.Context
import com.lynx.tasm.provider.AbsTemplateProvider
import java.io.ByteArrayOutputStream
import java.io.IOException
import org.songloft.lynx.updater.BundleUpdates

/**
 * Reads a Lynx template bundle from the APK's assets. Copied verbatim (bar the
 * package) from the official KotlinEmptyProject demo. `uri` is the asset path,
 * e.g. "main.lynx.bundle".
 */
class DemoTemplateProvider(context: Context) : AbsTemplateProvider() {

    private var mContext: Context = context.applicationContext

    override fun loadTemplate(uri: String, callback: Callback) {
        Thread {
            try {
                if (uri == "main.lynx.bundle") {
                    val update = BundleUpdates.get(mContext)
                    val candidate = try { update?.beginLaunch() } catch (_: Exception) {
                        runCatching { update?.failStartup() }
                        null
                    }
                    if (candidate != null) {
                        callback.onSuccess(candidate)
                        return@Thread
                    }
                }
                mContext.assets.open(uri).use { inputStream ->
                    ByteArrayOutputStream().use { byteArrayOutputStream ->
                        val buffer = ByteArray(1024)
                        var length: Int
                        while ((inputStream.read(buffer).also { length = it }) != -1) {
                            byteArrayOutputStream.write(buffer, 0, length)
                        }
                        callback.onSuccess(byteArrayOutputStream.toByteArray())
                    }
                }
            } catch (e: IOException) {
                callback.onFailed(e.message)
            }
        }.start()
    }
}
