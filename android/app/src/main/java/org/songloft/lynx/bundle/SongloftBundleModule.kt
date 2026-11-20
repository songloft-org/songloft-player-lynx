package org.songloft.lynx.bundle

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.tasm.behavior.LynxContext
import java.io.File
import kotlin.concurrent.thread

/** Lynx bridge for the optional gomobile backend. */
class SongloftBundleModule(context: Context) : LynxModule(context) {
    private val appContext: Context get() = (mContext as LynxContext).getContext().applicationContext
    private val main = Handler(Looper.getMainLooper())

    @LynxMethod
    fun start(dataDir: String, musicDir: String, port: Int, callback: Callback) {
        if (!isAvailable()) {
            callback.invoke("bundle_backend_unavailable", null)
            return
        }
        if (dataDir.isBlank() || musicDir.isBlank() || !File(musicDir).isDirectory) {
            callback.invoke("bundle_invalid_directory", null)
            return
        }
        thread(name = "songloft-bundle-start") {
            try {
                val toolDir = File(appContext.applicationInfo.nativeLibraryDir)
                val ffmpeg = File(toolDir, "libffmpeg.so")
                val ffprobe = File(toolDir, "libffprobe.so")
                val startTypes = arrayOf(String::class.java, String::class.java, Long::class.javaPrimitiveType!!)
                val actualPort = if (ffmpeg.exists() || ffprobe.exists()) {
                    val method = mobileClass!!.getMethod(
                        "startWithMediaTools", *startTypes, String::class.java, String::class.java,
                    )
                    method.invoke(null, dataDir, musicDir, port.toLong(), ffmpeg.path, ffprobe.path)
                } else {
                    mobileClass!!.getMethod("start", *startTypes).invoke(null, dataDir, musicDir, port.toLong())
                } as Number
                val listenPort = actualPort.toInt()
                main.post { callback.invoke(null, listenPort) }
            } catch (error: Exception) {
                val cause = error.cause ?: error
                main.post { callback.invoke(cause.message ?: "bundle_start_failed", null) }
            }
        }
    }

    @LynxMethod
    fun stop(callback: Callback) {
        if (!isAvailable()) {
            callback.invoke(null)
            return
        }
        thread(name = "songloft-bundle-stop") {
            try {
                mobileClass!!.getMethod("stop").invoke(null)
                main.post { callback.invoke(null) }
            } catch (error: Exception) {
                main.post { callback.invoke((error.cause ?: error).message ?: "bundle_stop_failed") }
            }
        }
    }

    @LynxMethod
    fun isRunning(callback: Callback) {
        callback.invoke(runCatching { mobileClass?.getMethod("isRunning")?.invoke(null) as? Boolean ?: false }.getOrDefault(false))
    }

    @LynxMethod
    fun getPort(callback: Callback) {
        val port = runCatching { (mobileClass?.getMethod("getPort")?.invoke(null) as? Number)?.toInt() ?: 0 }.getOrDefault(0)
        callback.invoke(port)
    }

    @LynxMethod
    fun isAvailable(callback: Callback) {
        callback.invoke(isAvailable())
    }

    @LynxMethod
    fun getAdminPassword(dataDir: String, callback: Callback) {
        val password = runCatching { File(dataDir, "admin_password").readText().trim().takeIf(String::isNotEmpty) }.getOrNull()
        if (password == null) callback.invoke("bundle_password_unavailable", null)
        else callback.invoke(null, password)
    }

    @LynxMethod
    fun getDefaultMusicDirectory(callback: Callback) {
        callback.invoke(File(android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_MUSIC).absolutePath).absolutePath)
    }

    @LynxMethod
    fun pickMusicDirectory(callback: Callback) {
        BundleDirectoryPicker.pick((mContext as LynxContext).getContext()) { path, error ->
            callback.invoke(error, path)
        }
    }

    @LynxMethod
    fun ensureMusicPermission(callback: Callback) {
        val permission = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE
        if (Build.VERSION.SDK_INT >= 33 || Build.VERSION.SDK_INT < 23) {
            if (Build.VERSION.SDK_INT < 23 || appContext.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
                callback.invoke(null, true)
            } else {
                BundlePermission.request((mContext as LynxContext).getContext(), callback)
            }
        } else if (appContext.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
            callback.invoke(null, true)
        } else {
            BundlePermission.request((mContext as LynxContext).getContext(), callback)
        }
    }

    private fun isAvailable(): Boolean = isBundleBackendAvailable()

    companion object {
        private val mobileClass: Class<*>? = try { Class.forName("mobile.Mobile") } catch (_: ClassNotFoundException) { null }
        fun isBundleBackendAvailable(): Boolean = mobileClass != null
    }
}

/** Permission prompt is hosted by the existing MainActivity, with one pending request. */
object BundlePermission {
    private var pending: Callback? = null
    private var activity: android.app.Activity? = null
    private const val REQUEST_CODE = 5103

    fun request(context: Context, callback: Callback) {
        Handler(Looper.getMainLooper()).post {
            val host = context as? android.app.Activity
            if (host == null || pending != null) {
                callback.invoke("music_permission_unavailable", false)
                return@post
            }
            pending = callback
            activity = host
            val permission = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE
            host.requestPermissions(arrayOf(permission), REQUEST_CODE)
        }
    }

    fun onRequestPermissionsResult(requestCode: Int, grantResults: IntArray) {
        if (requestCode != REQUEST_CODE) return
        val callback = pending ?: return
        pending = null
        activity = null
        val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
        callback.invoke(if (granted) null else "music_permission_denied", granted)
    }
}
