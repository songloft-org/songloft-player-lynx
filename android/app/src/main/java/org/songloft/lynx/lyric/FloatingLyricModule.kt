package org.songloft.lynx.lyric

import android.content.Context
import android.content.Intent
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

    /**
     * Read the grant **without** sending the user anywhere. Callers that only
     * want to restore a previously enabled overlay (app startup, opening the
     * lyrics settings page) must use this: [requestPermission] opens a system
     * screen, which at those moments hijacks the app unprompted.
     */
    @LynxMethod
    fun hasPermission(args: String, callback: Callback) {
        val ctx = (mContext as LynxContext).getContext()
        callback.invoke(JSONObject().put("result", OverlayPermission.isGranted(ctx)).toString())
    }

    /**
     * Ask for the overlay grant, answering **after the user returns** from the
     * system screen — see [OverlayPermission] for why answering earlier is the
     * same as answering "denied". Only user-initiated enabling belongs here.
     */
    @LynxMethod
    fun requestPermission(args: String, callback: Callback) {
        val ctx = (mContext as LynxContext).getContext()
        OverlayPermission.request(ctx) { granted ->
            callback.invoke(JSONObject().put("result", granted).toString())
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
            val nextLine = json.optString("nextLine", "")
            service?.updateText(line, nextLine)
        } catch (_: Exception) {}
        callback.invoke("{}")
    }

    @LynxMethod
    fun setTwoLine(args: String, callback: Callback) {
        try {
            val json = JSONObject(args)
            val twoLine = json.optBoolean("twoLine", true)
            service?.setTwoLine(twoLine)
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

    @LynxMethod
    fun setFontSize(args: String, callback: Callback) {
        try {
            val json = JSONObject(args)
            val size = json.optString("size", "medium")
            service?.setFontSize(size)
        } catch (_: Exception) {}
        callback.invoke("{}")
    }

    @LynxMethod
    fun setLocked(args: String, callback: Callback) {
        try {
            val json = JSONObject(args)
            val locked = json.optBoolean("locked", false)
            service?.setLocked(locked)
        } catch (_: Exception) {}
        callback.invoke("{}")
    }

    @LynxMethod
    fun setOpacity(args: String, callback: Callback) {
        try {
            val json = JSONObject(args)
            val opacity = json.optDouble("opacity", 0.4)
            service?.setOpacity(opacity.toFloat())
        } catch (_: Exception) {}
        callback.invoke("{}")
    }
}