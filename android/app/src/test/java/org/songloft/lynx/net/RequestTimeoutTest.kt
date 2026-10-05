package org.songloft.lynx.net

import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.ServerSocket
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Test

class RequestTimeoutTest {
    @Test
    fun delayedResponseUsesTheJsDeadlineInsteadOfTheBaseClientTimeout() {
        ServerSocket(0).use { server ->
            val worker = Thread {
                server.accept().use { socket ->
                    val input = socket.getInputStream().bufferedReader()
                    while (!input.readLine().isNullOrEmpty()) { /* consume headers */ }
                    Thread.sleep(300)
                    socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK".toByteArray())
                }
            }
            worker.start()
            try {
                val base = OkHttpClient.Builder().readTimeout(100, TimeUnit.MILLISECONDS).build()
                val headers = mutableMapOf("X-Songloft-Request-Timeout-Ms" to "2000")
                val client = clientWithRequestTimeout(base, headers)
                val request = Request.Builder().url("http://127.0.0.1:${server.localPort}/update").build()
                client.newCall(request).execute().use { response ->
                    assertEquals(200, response.code)
                    assertEquals("OK", response.body?.string())
                }
            } finally {
                worker.join(3000)
            }
        }
    }

    @Test
    fun consumesDeadlineAndKeepsPoolAndOriginalClient() {
        val base = OkHttpClient()
        val headers = mutableMapOf("x-songloft-request-timeout-ms" to "1800000", "Authorization" to "Bearer test")
        val client = clientWithRequestTimeout(base, headers)
        assertEquals(1_800_000, client.readTimeoutMillis)
        assertEquals(1_800_000, client.writeTimeoutMillis)
        assertEquals(1_800_000, client.callTimeoutMillis)
        assertSame(base.connectionPool, client.connectionPool)
        assertSame(base.dispatcher, client.dispatcher)
        assertEquals(10_000, base.readTimeoutMillis)
        assertEquals(mapOf("Authorization" to "Bearer test"), headers)
    }

    @Test
    fun missingOrInvalidDeadlineKeepsTheOriginalClientAndStripsTheControlHeader() {
        val base = OkHttpClient()
        assertSame(base, clientWithRequestTimeout(base, mutableMapOf()))
        for (value in listOf("0", "-1", "NaN", "240000.5", "1800001")) {
            val headers = mutableMapOf("X-Songloft-Request-Timeout-Ms" to value)
            assertSame(base, clientWithRequestTimeout(base, headers))
            assertFalse(headers.containsKey("X-Songloft-Request-Timeout-Ms"))
        }
    }
}
