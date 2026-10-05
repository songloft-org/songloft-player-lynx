package org.songloft.lynx.net

import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/** Consume the JS deadline locally; the control header must never reach the server. */
internal fun clientWithRequestTimeout(
    client: OkHttpClient,
    headers: MutableMap<String, String>,
): OkHttpClient {
    var timeoutMs: Long? = null
    for (name in headers.keys.toList()) {
        if (name.equals("X-Songloft-Request-Timeout-Ms", ignoreCase = true)) {
            timeoutMs = headers.remove(name)?.toLongOrNull()?.takeIf { it in 1..1_800_000 }
        }
    }
    val deadline = timeoutMs ?: return client
    // newBuilder shares the connection pool and dispatcher with the TLS-aware client.
    return client.newBuilder()
        .readTimeout(deadline, TimeUnit.MILLISECONDS)
        .writeTimeout(deadline, TimeUnit.MILLISECONDS)
        .callTimeout(deadline, TimeUnit.MILLISECONDS)
        .build()
}
