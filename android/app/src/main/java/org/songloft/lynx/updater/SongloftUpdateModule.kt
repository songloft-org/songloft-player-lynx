package org.songloft.lynx.updater

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.Callback
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.behavior.LynxContext
import org.json.JSONObject
import java.util.concurrent.Executors

class SongloftUpdateModule(context: Context) : LynxModule(context) {
    companion object {
        // Commands are serialized; downloads use a separate worker so cancel/restore can interrupt them.
        private val commands = Executors.newSingleThreadExecutor()
        private val downloads = Executors.newSingleThreadExecutor()
        private val errors = setOf("invalid_manifest", "invalid_signature", "unknown_signing_key", "incompatible_channel",
            "incompatible_protocol", "incompatible_schema", "incompatible_platform", "incompatible_engine",
            "incompatible_host", "incompatible_bridge", "incompatible_capability", "invalid_task", "invalid_update_url",
            "update_busy", "update_not_newer", "update_storage_unavailable", "insufficient_space", "download_failed", "checksum_mismatch", "cancelled")
    }

    private fun store(): BundleUpdateStore = BundleUpdates.get(mContext) ?: error("update_unavailable")
    private fun answer(callback: Callback, action: () -> JSONObject) {
        try { callback.invoke(action().toString()) }
        catch (error: Exception) {
            // Never forward HTTP exception text: it may contain a URL or credentials.
            val code = error.message?.takeIf { it in errors || it == "update_unavailable" } ?: "update_failed"
            callback.invoke(JSONObject().put("error", code).toString())
        }
    }

    @LynxMethod fun getInfo(callback: Callback) { commands.execute { answer(callback) { store().hostInfo() } } }
    @LynxMethod fun getState(callback: Callback) { commands.execute { answer(callback) { store().info() } } }
    @LynxMethod fun inspectManifest(raw: String, signature: String, callback: Callback) {
        commands.execute { answer(callback) { store().inspect(raw, signature) } }
    }
    @LynxMethod fun download(requestJson: String, callback: Callback) {
        downloads.execute { answer(callback) {
            val request = JSONObject(requestJson)
            val taskId = request.getString("task_id")
            var lastEvent = 0L
            store().prepare(request.getString("manifest"), request.getString("signature"), request.getString("url"), taskId) { bytes, total ->
                val now = System.currentTimeMillis()
                if (bytes == 0L || bytes == total || now - lastEvent >= 100) {
                    lastEvent = now
                    val params = JavaOnlyArray()
                    params.pushMap(JavaOnlyMap.from(mapOf("task_id" to taskId, "bytes" to bytes.toDouble(), "total" to total.toDouble())))
                    (mContext as? LynxContext)?.sendGlobalEvent("SongloftUpdate.progress", params)
                }
            }
        } }
    }
    @LynxMethod fun cancel(taskId: String) { BundleUpdates.get(mContext)?.cancel(taskId) }
    @LynxMethod fun confirmStartup(bundleId: String) { commands.execute { runCatching { store().confirmStartup(bundleId) } } }
    @LynxMethod fun reportStartupFailure() { commands.execute { runCatching { store().failStartup() } } }
    @LynxMethod fun restoreBuiltin(callback: Callback) {
        commands.execute { answer(callback) { store().restoreBuiltin(); JSONObject() } }
    }
}
