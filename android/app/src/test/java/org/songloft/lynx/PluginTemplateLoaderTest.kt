package org.songloft.lynx

import com.lynx.tasm.provider.AbsTemplateProvider
import com.lynx.tasm.resourceprovider.LynxResourceCallback
import com.lynx.tasm.resourceprovider.LynxResourceRequest
import com.lynx.tasm.resourceprovider.LynxResourceRequest.LynxResourceType
import com.lynx.tasm.resourceprovider.LynxResourceResponse
import com.lynx.tasm.resourceprovider.template.TemplateProviderResult
import okhttp3.OkHttpClient
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.Executors

class PluginTemplateLoaderTest {
    private class Server(private val response: ByteArray) : AutoCloseable {
        private val socket = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
        private val executor = Executors.newSingleThreadExecutor()
        @Volatile var headers = emptyList<String>()
        val url = "http://127.0.0.1:${socket.localPort}/main.lynx.bundle"

        init {
            executor.execute {
                socket.accept().use { connection ->
                    val reader = connection.getInputStream().bufferedReader()
                    val lines = mutableListOf<String>()
                    while (true) {
                        val line = reader.readLine() ?: break
                        if (line.isEmpty()) break
                        lines.add(line)
                    }
                    headers = lines
                    connection.getOutputStream().write(response)
                }
            }
        }

        override fun close() {
            socket.close()
            executor.shutdownNow()
        }
    }

    private fun rejected(expected: String, response: String, limit: Long = 1024) {
        Server(response.toByteArray()).use { server ->
            try {
                PluginTemplateLoader(OkHttpClient(), limit).load(server.url)
                fail("Expected $expected")
            } catch (error: IOException) {
                assertEquals(expected, error.message)
            }
        }
    }

    @Test fun downloadsExactBinaryWithoutAccountCredentials() {
        val data = byteArrayOf(0, 1, 127, -128, -1)
        val header = "HTTP/1.1 200 OK\r\nContent-Length: ${data.size}\r\nConnection: close\r\n\r\n"
        Server(header.toByteArray() + data).use { server ->
            assertArrayEquals(data, PluginTemplateLoader(OkHttpClient()).load(server.url))
            assertFalse(server.headers.any { it.startsWith("Authorization:", true) || it.startsWith("Cookie:", true) })
        }
    }

    @Test fun rejectsHttpErrorsAndEmptyBodies() {
        rejected("Plugin template HTTP 404", "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n")
        rejected("Empty plugin template", "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n")
    }

    @Test fun limitsDeclaredAndUnknownBodyLengths() {
        rejected("Plugin template too large", "HTTP/1.1 200 OK\r\nContent-Length: 1000000\r\n\r\n", 16)
        rejected("Plugin template too large", "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n12345678901234567", 16)
    }

    @Test fun delegatesRootSelectionToExistingUpdateProvider() {
        val candidate = byteArrayOf(4, 5, 6)
        val loaded = mutableListOf<String>()
        val embedded = object : AbsTemplateProvider() {
            override fun loadTemplate(uri: String, callback: Callback) {
                loaded.add(uri)
                callback.onSuccess(candidate)
            }
        }
        var response: LynxResourceResponse<TemplateProviderResult>? = null
        val callback = LynxResourceCallback<TemplateProviderResult> { response = it }
        SongloftTemplateResourceFetcher(embedded).fetchTemplate(
            LynxResourceRequest("main.lynx.bundle", LynxResourceType.LynxResourceTypeTemplate), callback,
        )
        assertEquals(listOf("main.lynx.bundle"), loaded)
        assertArrayEquals(candidate, response?.data?.templateBinary)
    }

    @Test fun reportsEmbeddedProviderFailure() {
        val embedded = object : AbsTemplateProvider() {
            override fun loadTemplate(uri: String, callback: Callback) = callback.onFailed("missing template")
        }
        var response: LynxResourceResponse<TemplateProviderResult>? = null
        SongloftTemplateResourceFetcher(embedded).fetchTemplate(
            LynxResourceRequest("missing.bundle", LynxResourceType.LynxResourceTypeTemplate),
            LynxResourceCallback { response = it },
        )
        assertEquals("missing template", response?.error?.message)
    }
}
