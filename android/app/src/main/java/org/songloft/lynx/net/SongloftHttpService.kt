package org.songloft.lynx.net

import com.lynx.jsbridge.network.HttpRequest
import com.lynx.jsbridge.network.HttpResponse
import com.lynx.jsbridge.network.HttpStreamingDelegate
import com.lynx.react.bridge.JavaOnlyMap
import com.lynx.tasm.service.ILynxHttpService
import com.lynx.tasm.service.LynxHttpRequestCallback
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Headers.Companion.toHeaders
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException

/**
 * The host HTTP service backing the bare global `fetch` (AGENTS.md §3), replacing
 * the SDK's `com.lynx.service.http.LynxHttpService`.
 *
 * **Why we own this at all:** the SDK service holds a private `OkHttpClient()`
 * with no way to reach its TLS config. OkHttp builds its own `SSLSocketFactory`
 * and ignores the process-wide `HttpsURLConnection` defaults, so the old
 * `setInsecureTls` — which only mutated those defaults — never affected `fetch`.
 * Users who ticked "allow insecure TLS" for a self-signed server still could not
 * log in, which is the only reason the setting exists.
 *
 * Request/response mapping is deliberately a **transcription** of the SDK's
 * implementation (same 499 sentinel, same header joining, same streaming
 * branches) so replacing it changes TLS behaviour and nothing else. The one
 * intentional difference is [clientFor].
 *
 * Registered in place of the SDK service in `SongloftApplication.initLynxService`.
 * `ILynxHttpService.getServiceClass()` binds by interface and must not be
 * overridden, so registering ours *instead of* theirs is what makes this
 * deterministic — we do not rely on any last-registration-wins behaviour.
 */
object SongloftHttpService : ILynxHttpService {

    /** Mirrors the SDK's sentinel for "the request never reached the server". */
    private const val CODE_FAILED_INTERNALLY = 499

    private const val DEPRECATED_STREAMING_FLAG = "useStreaming"

    private var cachedClient: OkHttpClient? = null
    private var cachedInsecure: Boolean? = null

    /**
     * OkHttp's TLS config is immutable per client, so the client is rebuilt when
     * (and only when) the insecure-TLS flag has flipped since it was created.
     * In-flight calls keep the client they started with, which is correct — the
     * new setting applies from the next request on.
     */
    @Synchronized
    internal fun clientFor(insecure: Boolean): OkHttpClient {
        cachedClient?.let { if (cachedInsecure == insecure) return it }
        val client = if (insecure) {
            OkHttpClient.Builder()
                .sslSocketFactory(InsecureTls.socketFactory, InsecureTls.trustManager)
                .hostnameVerifier(InsecureTls.hostnameVerifier)
                .build()
        } else {
            OkHttpClient()
        }
        cachedClient = client
        cachedInsecure = insecure
        return client
    }

    private fun requestInner(
        request: HttpRequest,
        callback: LynxHttpRequestCallback,
        delegate: HttpStreamingDelegate?,
    ) {
        val okBody =
            if ("GET".equals(request.httpMethod, true)) null else request.httpBody.toRequestBody()

        val headers = request.httpHeaders.asHashMap().mapValues { it.value.toString() }.toMutableMap()
        val client = clientWithRequestTimeout(clientFor(InsecureTls.enabled), headers)

        val okRequest = Request.Builder()
            .url(request.url)
            .method(request.httpMethod, okBody)
            .headers(headers.toHeaders())
            .build()

        val httpResponse = HttpResponse().also {
            it.url = request.url
            it.statusCode = CODE_FAILED_INTERNALLY
        }

        client.newCall(okRequest).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback.invoke(httpResponse.also { it.statusText = e.toString() })
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val httpHeaders = JavaOnlyMap()
                    response.headers.toMultimap().map { entry ->
                        httpHeaders.put(entry.key, entry.value.joinToString(separator = ", "))
                    }
                    callback.invoke(httpResponse.also {
                        it.statusCode = response.code
                        it.statusText = response.message
                        it.httpHeaders = httpHeaders
                        if (delegate == null) {
                            it.httpBody = response.body?.bytes() ?: byteArrayOf()
                        }
                    })

                    if (delegate != null) {
                        response.body?.let { body ->
                            body.byteStream().use { inputStream ->
                                val useDeprecated =
                                    request.customConfig.getBoolean(DEPRECATED_STREAMING_FLAG, false)
                                if (useDeprecated) {
                                    delegate.deprecatedChunkedStreamingBody(inputStream)
                                } else {
                                    delegate.streamingBody(inputStream)
                                }
                                delegate.onEnd()
                            }
                        } ?: delegate.onEnd()
                    }
                }
            }
        })
    }

    override fun request(request: HttpRequest, callback: LynxHttpRequestCallback) {
        requestInner(request, callback, null)
    }

    override fun requestStreaming(
        request: HttpRequest,
        callback: LynxHttpRequestCallback,
        delegate: HttpStreamingDelegate,
    ) {
        requestInner(request, callback, delegate)
    }
}
