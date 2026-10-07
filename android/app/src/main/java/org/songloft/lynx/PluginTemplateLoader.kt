package org.songloft.lynx

import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Loads plugin templates without account credentials; defaults to the ZIP upload's 50 MiB limit. */
internal class PluginTemplateLoader(
    private val client: OkHttpClient,
    private val maxBytes: Long = 50L * 1024 * 1024,
) {
    fun load(url: String): ByteArray {
        val request = Request.Builder().url(url).build()
        client.newBuilder().callTimeout(30, TimeUnit.SECONDS).build().newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Plugin template HTTP ${response.code}")
            val body = response.body ?: throw IOException("Empty plugin template")
            if (body.contentLength() > maxBytes) throw IOException("Plugin template too large")
            body.byteStream().use { input ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count == -1) break
                    if (output.size().toLong() + count > maxBytes) throw IOException("Plugin template too large")
                    output.write(buffer, 0, count)
                }
                if (output.size() == 0) throw IOException("Empty plugin template")
                return output.toByteArray()
            }
        }
    }
}
