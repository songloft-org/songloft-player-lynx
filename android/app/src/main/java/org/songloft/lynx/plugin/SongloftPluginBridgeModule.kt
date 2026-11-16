package org.songloft.lynx.plugin

import android.content.Context
import android.content.Intent
import android.net.Uri
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import org.songloft.lynx.net.SongloftHttpService
import org.songloft.lynx.net.InsecureTls
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
        if (hostRegistry[frameId] !== lynxContext()) return
        sockets.remove(frameId)?.values?.forEach { it.socket?.cancel() }
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


    private class SocketEntry { @Volatile var socket: WebSocket? = null }
    private val sockets = ConcurrentHashMap<String, ConcurrentHashMap<String, SocketEntry>>()

    private fun socketEvent(frameId: String, id: String, type: String, data: String = "") {
        pushToChild(frameId, "pluginSocket", JSONObject().put("id", id).put("type", type).put("data", data).toString())
    }

    @LynxMethod
    fun socketOpen(frameId: String, id: String, url: String) {
        if (hostRegistry[frameId] !== lynxContext()) return
        val active = sockets.getOrPut(frameId) { ConcurrentHashMap() }
        if (active.size >= 8 || active.containsKey(id)) { socketEvent(frameId, id, "error"); return }
        val entry = SocketEntry()
        active[id] = entry
        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                if (active[id] === entry) socketEvent(frameId, id, "open") else webSocket.cancel()
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                if (active[id] === entry) socketEvent(frameId, id, "message", text)
            }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (active.remove(id, entry)) socketEvent(frameId, id, "close")
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (active.remove(id, entry)) socketEvent(frameId, id, "error")
            }
        }
        val socket = SongloftHttpService.clientFor(InsecureTls.enabled).newWebSocket(Request.Builder().url(url).build(), listener)
        entry.socket = socket
        if (active[id] !== entry || sockets[frameId] !== active || hostRegistry[frameId] !== lynxContext()) {
            active.remove(id, entry)
            socket.cancel()
        }
    }

    @LynxMethod
    fun socketSend(frameId: String, id: String, text: String) {
        if (hostRegistry[frameId] === lynxContext()) sockets[frameId]?.get(id)?.socket?.send(text)
    }

    @LynxMethod
    fun socketClose(frameId: String, id: String) {
        if (hostRegistry[frameId] === lynxContext()) sockets[frameId]?.remove(id)?.socket?.close(1000, "client")
    }

    @LynxMethod
    fun openUrl(frameId: String, url: String) {
        if (hostRegistry[frameId] !== lynxContext()) return
        val uri = Uri.parse(url)
        if (uri.scheme?.lowercase() != "https" && uri.scheme?.lowercase() != "http") return
        try {
            mContext.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            android.util.Log.w(NAME, "No external browser is available")
        }
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
