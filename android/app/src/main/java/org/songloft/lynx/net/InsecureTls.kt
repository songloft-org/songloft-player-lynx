package org.songloft.lynx.net

import java.net.HttpURLConnection
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Process-wide "allow insecure TLS" switch, driven by the user's server setting
 * (`appConfig.insecureTls` → `SongloftPlatform.setInsecureTls`). Exists so that
 * a Songloft behind a self-signed certificate is reachable at all.
 *
 * There are **three** outbound paths on Android and they do not share a client,
 * so each has to be relaxed separately:
 *
 *  1. **JS `fetch`** — the Lynx host HTTP service, which is OkHttp-backed.
 *     Handled by [SongloftHttpService], which reads [enabled] when it builds its
 *     client. This is the path that actually matters: without it, login itself
 *     fails and the toggle looks completely broken.
 *  2. **ExoPlayer media streaming** — `DefaultHttpDataSource` is
 *     `HttpURLConnection`-backed and exposes no SSL hook, so it can only be
 *     reached through the process-wide `HttpsURLConnection` defaults that
 *     [update] mutates. Swapping it for `OkHttpDataSource` would make this
 *     explicit but costs a new `media3-datasource-okhttp` dependency plus
 *     version alignment; deliberately not done.
 *  3. **This app's own `HttpURLConnection` uploads** — relaxed per connection
 *     via [configure] rather than leaning on the globals from (2), so that path
 *     keeps working if the global mutation is ever removed.
 *
 * ⚠️ [update] is **reversible on purpose**. The previous implementation only
 * handled `enabled == true` and installed a trust-all factory that survived
 * until the process died — so turning the switch back off, or moving to a
 * profile that never asked for it, silently left every HTTPS connection in the
 * app unauthenticated. Restoring the captured defaults is the whole point of
 * [savedSocketFactory] / [savedHostnameVerifier].
 */
object InsecureTls {

    /** Current state; read by [SongloftHttpService] and [configure]. */
    @Volatile
    var enabled: Boolean = false
        private set

    /**
     * The JVM defaults as they were before the first [update]`(true)`. Captured
     * once and never refreshed: capturing again while our own trust-all factory
     * is installed would "restore" to trust-all and make the switch one-way.
     */
    private var savedSocketFactory: SSLSocketFactory? = null
    private var savedHostnameVerifier: HostnameVerifier? = null
    private var defaultsCaptured = false

    private val trustAllManagers: Array<TrustManager> = arrayOf(
        object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
        },
    )

    /** The single `X509TrustManager` above — OkHttp needs it alongside the factory. */
    val trustManager: X509TrustManager = trustAllManagers[0] as X509TrustManager

    val socketFactory: SSLSocketFactory by lazy {
        SSLContext.getInstance("TLS").apply {
            init(null, trustAllManagers, SecureRandom())
        }.socketFactory
    }

    val hostnameVerifier = HostnameVerifier { _, _ -> true }

    /**
     * Turn the relaxation on or off. Idempotent, and a no-op when the state is
     * already what was asked for — which means the boot-time `update(false)`
     * never touches the JVM defaults at all.
     */
    @Synchronized
    fun update(enable: Boolean) {
        if (enable == enabled) return
        if (enable) {
            if (!defaultsCaptured) {
                savedSocketFactory = HttpsURLConnection.getDefaultSSLSocketFactory()
                savedHostnameVerifier = HttpsURLConnection.getDefaultHostnameVerifier()
                defaultsCaptured = true
            }
            HttpsURLConnection.setDefaultSSLSocketFactory(socketFactory)
            HttpsURLConnection.setDefaultHostnameVerifier(hostnameVerifier)
        } else {
            savedSocketFactory?.let { HttpsURLConnection.setDefaultSSLSocketFactory(it) }
            savedHostnameVerifier?.let { HttpsURLConnection.setDefaultHostnameVerifier(it) }
        }
        enabled = enable
    }

    /** Relax a single connection (no-op when disabled, or for plain HTTP). */
    fun configure(connection: HttpURLConnection) {
        if (!enabled) return
        (connection as? HttpsURLConnection)?.let {
            it.sslSocketFactory = socketFactory
            it.hostnameVerifier = hostnameVerifier
        }
    }
}
