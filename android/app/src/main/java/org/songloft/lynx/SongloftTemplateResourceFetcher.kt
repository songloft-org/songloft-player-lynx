package org.songloft.lynx

import com.lynx.tasm.provider.AbsTemplateProvider
import com.lynx.tasm.resourceprovider.LynxResourceCallback
import com.lynx.tasm.resourceprovider.LynxResourceRequest
import com.lynx.tasm.resourceprovider.LynxResourceResponse
import com.lynx.tasm.resourceprovider.template.LynxTemplateResourceFetcher
import com.lynx.tasm.resourceprovider.template.TemplateProviderResult
import org.songloft.lynx.net.InsecureTls
import org.songloft.lynx.net.SongloftHttpService
import java.io.IOException

/** The legacy root provider alone is not used to fetch a <frame>'s lazy bundle. */
class SongloftTemplateResourceFetcher(private val embedded: AbsTemplateProvider) : LynxTemplateResourceFetcher() {
    override fun fetchTemplate(
        request: LynxResourceRequest,
        callback: LynxResourceCallback<TemplateProviderResult>,
    ) {
        val url = request.url
        if (url.startsWith("https://") || url.startsWith("http://")) {
            Thread {
                val response: LynxResourceResponse<TemplateProviderResult> = try {
                    val loader = PluginTemplateLoader(SongloftHttpService.clientFor(InsecureTls.enabled))
                    LynxResourceResponse.onSuccess(TemplateProviderResult.fromBinary(loader.load(url)))
                } catch (error: Exception) {
                    failed(error)
                }
                callback.onResponse(response)
            }.start()
        } else {
            // Preserve the root bundle's signed update selection and rollback.
            embedded.loadTemplate(url, object : AbsTemplateProvider.Callback {
                override fun onSuccess(binary: ByteArray) {
                    callback.onResponse(LynxResourceResponse.onSuccess(TemplateProviderResult.fromBinary(binary)))
                }

                override fun onFailed(message: String?) {
                    callback.onResponse(failed(IOException(message ?: "Template load failed")))
                }
            })
        }
    }

    override fun fetchSSRData(request: LynxResourceRequest, callback: LynxResourceCallback<ByteArray>) {
        callback.onResponse(failed(IOException("SSR data is not supported")))
    }

    // Lynx 4.0 declares onFailed as a raw Java response; failures contain no T.
    @Suppress("UNCHECKED_CAST")
    private fun <T> failed(error: Throwable): LynxResourceResponse<T> =
        LynxResourceResponse.onFailed(error) as LynxResourceResponse<T>
}
