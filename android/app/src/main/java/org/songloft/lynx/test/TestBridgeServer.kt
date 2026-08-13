package org.songloft.lynx.test

import android.util.Log
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.PrintWriter
import java.net.ServerSocket
import java.net.Socket

/**
 * Lightweight TCP server for e2e test driver communication.
 * Listens on port 9230 and accepts JSON-RPC-like commands:
 *   → {"id":1, "method":"eval", "expr":"..."}
 *   ← {"id":1, "result":...} or {"id":1, "error":"..."}
 *
 *   → {"id":2, "method":"ping"}
 *   ← {"id":2, "result":"pong"}
 *
 * The actual JS evaluation is delegated to [EvalCallback] which the
 * module registers after the LynxView is ready.
 */
class TestBridgeServer(private val port: Int = 9230) {

    private var serverSocket: ServerSocket? = null
    private var running = false

    fun start() {
        if (running) return
        running = true
        Thread(Runnable {
            try {
                serverSocket = ServerSocket(port)
                Log.i(TAG, "TestBridgeServer listening on :$port")
                while (running) {
                    try {
                        val client = serverSocket?.accept() ?: break
                        handleClient(client)
                    } catch (e: Exception) {
                        if (running) Log.w(TAG, "Accept error: ${e.message}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Server start failed: ${e.message}")
            }
        }, "TestBridgeServer").apply { isDaemon = true }.start()
    }

    fun stop() {
        running = false
        try { serverSocket?.close() } catch (_: Exception) {}
        serverSocket = null
    }

    private fun handleClient(socket: Socket) {
        Thread(Runnable {
            try {
                val reader = BufferedReader(InputStreamReader(socket.getInputStream()))
                val writer = PrintWriter(socket.getOutputStream(), true)

                while (running && !socket.isClosed) {
                    val line = reader.readLine() ?: break
                    val response = processCommand(line)
                    writer.println(response)
                }
            } catch (e: Exception) {
                Log.d(TAG, "Client disconnected: ${e.message}")
            } finally {
                try { socket.close() } catch (_: Exception) {}
            }
        }, "TestBridgeClient").apply { isDaemon = true }.start()
    }

    private fun processCommand(line: String): String {
        return try {
            val cmd = JSONObject(line)
            val id = cmd.optInt("id", 0)
            when (cmd.optString("method")) {
                "ping" -> makeResult(id, "\"pong\"")
                "eval" -> {
                    val expr = cmd.optString("expr", "")
                    evalSync(id, expr)
                }
                else -> makeError(id, "unknown method")
            }
        } catch (e: Exception) {
            makeError(0, "parse error: ${e.message}")
        }
    }

    private fun evalSync(id: Int, expression: String): String {
        val module = SongloftTestBridgeModule.instance
            ?: return makeError(id, "TestBridgeModule not initialized (LynxView not ready)")

        val (result, error) = module.evaluateJS(id, expression)
        if (error != null) return makeError(id, error)
        return makeResult(id, result ?: "null")
    }

    private fun makeResult(id: Int, result: String): String {
        return """{"id":$id,"result":$result}"""
    }

    private fun makeError(id: Int, error: String): String {
        val escaped = error.replace("\"", "\\\"").replace("\n", "\\n")
        return """{"id":$id,"error":"$escaped"}"""
    }

    companion object {
        private const val TAG = "TestBridge"
    }
}
