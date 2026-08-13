package org.songloft.lynx.test

import android.content.Context
import android.util.Log
import com.lynx.jsbridge.LynxMethod
import com.lynx.jsbridge.LynxModule
import com.lynx.react.bridge.JavaOnlyArray
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.behavior.LynxContext
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * E2E test bridge native module — enables the test driver to evaluate JS
 * expressions in the running Lynx BTS context and read back results.
 *
 * Protocol:
 *   1. TCP driver sends {"id":N, "method":"eval", "expr":"..."}
 *   2. This module fires a global event `TestBridge.eval` with {id, expr}
 *   3. The JS listener (src/e2e-bridge.ts) evaluates and calls back:
 *      NativeModules.SongloftTestBridge.respond(id, resultJson)
 *   4. The TCP thread unblocks and sends the result back to the driver
 *
 * Registered as `SongloftTestBridge` in NativeModules.
 */
class SongloftTestBridgeModule(context: Context) : LynxModule(context) {

    private val pendingEvals = ConcurrentHashMap<Int, PendingEval>()

    data class PendingEval(
        val latch: CountDownLatch = CountDownLatch(1),
        var result: String? = null,
        var error: String? = null,
    )

    /**
     * Called by the JS eval listener to deliver the result of an expression.
     */
    @LynxMethod
    fun respond(id: Int, resultJson: String?) {
        val pending = pendingEvals[id] ?: return
        pending.result = resultJson
        pending.latch.countDown()
    }

    /**
     * Called by the JS eval listener when evaluation throws.
     */
    @LynxMethod
    fun respondError(id: Int, errorMsg: String?) {
        val pending = pendingEvals[id] ?: return
        pending.error = errorMsg ?: "unknown error"
        pending.latch.countDown()
    }

    /**
     * Evaluate a JS expression by posting it as a global event and waiting
     * for the JS side to call respond/respondError.
     */
    fun evaluateJS(id: Int, expression: String): Pair<String?, String?> {
        val pending = PendingEval()
        pendingEvals[id] = pending

        // Fire global event to JS with the expression
        val lynxContext = mContext as? LynxContext
        if (lynxContext == null) {
            pendingEvals.remove(id)
            return null to "no LynxContext"
        }

        val params = JavaOnlyArray()
        val payload = JavaOnlyMap()
        payload.putInt("id", id)
        payload.putString("expr", expression)
        params.pushMap(payload)

        lynxContext.lynxView?.sendGlobalEvent("TestBridge.eval", params)

        // Wait for JS to respond (max 15s)
        val ok = pending.latch.await(15, TimeUnit.SECONDS)
        pendingEvals.remove(id)

        if (!ok) return null to "eval timeout (15s)"
        if (pending.error != null) return null to pending.error
        return pending.result to null
    }

    companion object {
        private const val TAG = "TestBridge"
        var instance: SongloftTestBridgeModule? = null
    }

    init {
        instance = this
        Log.i(TAG, "SongloftTestBridgeModule initialized")
    }
}
