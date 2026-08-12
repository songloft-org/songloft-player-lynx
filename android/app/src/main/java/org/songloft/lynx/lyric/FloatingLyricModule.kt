package org.songloft.lynx.lyric

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.lynx.tasm.behavior.utils.LynxUIMethodModule
import com.lynx.tasm.behavior.LynxContext
import org.json.JSONObject

/**
 * Native module for floating lyrics overlay (SYSTEM_ALERT_WINDOW).
 * Registered as `SongloftFloatingLyric` in NativeModules.
 */
class FloatingLyricModule(private val lynxContext: LynxContext) : LynxUIMethodModule(lynxContext) {

    companion object {
        const val NAME = "SongloftFloatingLyric"
        private var service: FloatingLyricService? = null

        fun setService(svc: FloatingLyricService?) {
            service = svc
        }
    }

    fun requestPermission(args: String, callback: (String) -> Unit) {
        val ctx = lynxContext.androidContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (Settings.canDrawOverlays(ctx)) {
                callback(JSONObject().put("result", true).toString())
            } else {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${ctx.packageName}")
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(intent)
                callback(JSONObject().put("result", false).toString())
            }
        } else {
            callback(JSONObject().put("result", true).toString())
        }
    }

    fun show(args: String, callback: (String) -> Unit) {
        val ctx = lynxContext.androidContext
        val intent = Intent(ctx, FloatingLyricService::class.java).apply {
            action = "SHOW"
        }
        ctx.startService(intent)
        callback("{}")
    }

    fun updateLyric(args: String, callback: (String) -> Unit) {
        try {
            val json = JSONObject(args)
            val line = json.optString("line", "")
            service?.updateText(line)
        } catch (_: Exception) {}
        callback("{}")
    }

    fun hide(args: String, callback: (String) -> Unit) {
        val ctx = lynxContext.androidContext
        val intent = Intent(ctx, FloatingLyricService::class.java).apply {
            action = "HIDE"
        }
        ctx.startService(intent)
        callback("{}")
    }

    fun isShowing(args: String, callback: (String) -> Unit) {
        val showing = service?.isShowing() ?: false
        callback(JSONObject().put("result", showing).toString())
    }
}
