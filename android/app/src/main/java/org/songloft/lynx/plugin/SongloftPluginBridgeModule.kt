package org.songloft.lynx.plugin

import android.content.Context
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.behavior.LynxContext
import java.util.concurrent.ConcurrentHashMap

/**
 * Bidirectional bridge between a parent page and a child <frame> plugin.
 *
 * Registered at the application level, so each LynxContext (parent page or child
 * frame) gets its own module instance — but they share the companion-object
 * registry keyed by frameId. The parent calls registerHost; the child calls
 * registerChild (with the frameId received via global-props). Cross-context
 * communication is then: hostCall → parent's GlobalEvent, hostReply → child's
 * GlobalEvent.
 */
class SongloftPluginBridgeModule(context: Context) : LynxModule(context) {

    companion object {
        const val NAME = "SongloftPluginBridge"

        const val EVENT_HOST_CALL = "SongloftPluginBridge.hostCall"
        const val EVENT_HOST_REPLY = "SongloftPluginBridge.hostReply"
        const val EVENT_PUSH = "SongloftPluginBridge.push"

        private val hostRegistry = ConcurrentHashMap<String, LynxContext>()
        private val childRegistry = ConcurrentHashMap<String, LynxContext>()
    }

    private fun lynxContext(): LynxContext = mContext as LynxContext

    // --- Called by the PARENT page ---

    @LynxMethod
    fun registerHost(frameId: String) {
        hostRegistry[frameId] = lynxContext()
    }

    @LynxMethod
    fun unregisterHost(frameId: String) {
        hostRegistry.remove(frameId)
        childRegistry.remove(frameId)
    }

    @LynxMethod
    fun hostReply(frameId: String, callId: String, resultJson: String) {
        val childCtx = childRegistry[frameId] ?: return
        val params = JavaOnlyArray()
        val map = JavaOnlyMap()
        map.putString("callId", callId)
        map.putString("result", resultJson)
        params.pushMap(map)
        childCtx.sendGlobalEvent(EVENT_HOST_REPLY, params)
    }

    @LynxMethod
    fun pushToChild(frameId: String, eventName: String, dataJson: String) {
        val childCtx = childRegistry[frameId] ?: return
        val params = JavaOnlyArray()
        val map = JavaOnlyMap()
        map.putString("event", eventName)
        map.putString("data", dataJson)
        params.pushMap(map)
        childCtx.sendGlobalEvent(EVENT_PUSH, params)
    }

    // --- Called by the CHILD frame ---

    @LynxMethod
    fun registerChild(frameId: String) {
        childRegistry[frameId] = lynxContext()
    }

    @LynxMethod
    fun hostCall(frameId: String, callId: String, ns: String, method: String, paramsJson: String) {
        val hostCtx = hostRegistry[frameId] ?: return
        val params = JavaOnlyArray()
        val map = JavaOnlyMap()
        map.putString("frameId", frameId)
        map.putString("callId", callId)
        map.putString("ns", ns)
        map.putString("method", method)
        map.putString("params", paramsJson)
        params.pushMap(map)
        hostCtx.sendGlobalEvent(EVENT_HOST_CALL, params)
    }
}
