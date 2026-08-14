package org.songloft.lynx.lyric

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.lynx.jsbridge.LynxModule
import com.lynx.jsbridge.LynxMethod
import com.lynx.react.bridge.Callback
import com.lynx.tasm.behavior.LynxContext
import org.json.JSONObject

/**
 * Native module for floating lyrics overlay (SYSTEM_ALERT_WINDOW).
 * Registered as `SongloftFloatingLyric` in NativeModules.
 */
class FloatingLyricModule(context: Context) : LynxModule(context) {

    companion object {
        const val NAME = "SongloftFloatingLyric"
        private var service: FloatingLyricService? = null

        fun setService(svc: FloatingLyricService?) {
            service = svc
        }
    }

    @LynxMethod
    fun requestPermission(args: String, callback: Callback) {
        val ctx = (mContext as LynxContext).getContext()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (Settings.canDrawOverlays(ctx)) {
                callback.invoke(JSONObject().put("result", true).toString())
            } else {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${ctx.packageName}")
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(intent)
                callback.invoke(JSONObject().put("result", false).toString())
            }
        } else {
            callback.invoke(JSONObject().put("result", true).toString())
        }
    }

    @LynxMethod
    fun show(args: String, callback: Callback) {
        val ctx = (mContext as LynxContext).getContext()
        val intent = Intent(ctx, FloatingLyricService::class.java).apply {
            action = "SHOW"
        }
        ctx.startService(intent)
        callback.invoke("{}")
    }

    @LynxMethod
    fun updateLyric(args: String, callback: Callback) {
        try {
            val json = JSONObject(args)
            val line = json.optString("line", "")
            service?.updateText(line)
        } catch (_: Exception) {}
        callback.invoke("{}")
    }

    @LynxMethod
    fun hide(args: String, callback: Callback) {
        val ctx = (mContext as LynxContext).getContext()
        val intent = Intent(ctx, FloatingLyricService::class.java).apply {
            action = "HIDE"
        }
        ctx.startService(intent)
        callback.invoke("{}")
    }

    @LynxMethod
    fun isShowing(args: String, callback: Callback) {
        val showing = service?.isShowing() ?: false
        callback.invoke(JSONObject().put("result", showing).toString())
    }
}