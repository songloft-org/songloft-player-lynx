package org.songloft.lynx.updater

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.concurrent.TimeUnit

/** Public release metadata never inherits the server TLS bypass, credentials or cookies. */
class UpdateMetadata(client: OkHttpClient = OkHttpClient()) {
    private val client = client.newBuilder().followRedirects(false).followSslRedirects(false)
        .callTimeout(12, TimeUnit.SECONDS).build()

    fun fetch(request: JSONObject): JSONObject {
        val limit = request.getDouble("max_bytes")
        require(limit.isFinite() && limit == limit.toInt().toDouble() && limit in 1.0..524288.0) { "invalid_metadata_request" }
        var address = request.getString("url")
        val started = System.nanoTime()
        for (hop in 0..8) {
            val url = address.toHttpUrlOrNull()
            require(url != null && url.isHttps && url.username.isEmpty() && url.password.isEmpty() &&
                url.queryParameterNames.none { it.lowercase() in setOf("token", "access_token") } &&
                address.none { it <= ' ' || it == '\\' }) { "invalid_update_url" }
            val remaining = 12_000 - TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started)
            check(remaining > 0) { "metadata_failed" }
            val call = client.newCall(Request.Builder().url(url).header("Accept", "application/json").build())
            call.timeout().timeout(remaining, TimeUnit.MILLISECONDS)
            call.execute().use { response ->
                if (response.code in setOf(301, 302, 303, 307, 308)) {
                    require(hop < 8) { "invalid_update_url" }
                    address = url.resolve(response.header("Location") ?: error("invalid_update_url"))?.toString()
                        ?: error("invalid_update_url")
                } else {
                    val output = ByteArrayOutputStream()
                    response.body?.byteStream()?.use { input ->
                        val chunk = ByteArray(8192)
                        while (true) {
                            val count = input.read(chunk)
                            if (count < 0) break
                            check(output.size() + count <= limit.toInt()) { "metadata_too_large" }
                            output.write(chunk, 0, count)
                        }
                    }
                    val body = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(output.toByteArray())).toString()
                    return JSONObject().put("status", response.code).put("body", body)
                }
            }
        }
        error("metadata_failed")
    }
}
