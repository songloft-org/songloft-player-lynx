package org.songloft.lynx.dlna

import java.io.IOException
import java.io.StringReader
import java.net.HttpURLConnection
import java.net.URL
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Document
import org.xml.sax.InputSource
import org.xml.sax.SAXParseException
import org.xml.sax.helpers.DefaultHandler

/** SOAP transport shared by cast and playback controls; a rejected URI must not reach Play. */
internal class DlnaSoapClient(
    private val connect: (String) -> HttpURLConnection = {
        URL(it).openConnection() as HttpURLConnection
    },
) {
    fun cast(controlUrl: String, uri: String, title: String, metadata: String = "") {
        val didl = metadata.ifEmpty {
            "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" " +
                "xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><item>" +
                "<dc:title>${escapeXml(title)}</dc:title><res>${escapeXml(uri)}</res></item></DIDL-Lite>"
        }
        request(controlUrl, "SetAVTransportURI",
            "<CurrentURI>${escapeXml(uri)}</CurrentURI><CurrentURIMetaData>${escapeXml(didl)}</CurrentURIMetaData>")
        request(controlUrl, "Play", "<Speed>1</Speed>")
    }

    fun request(controlUrl: String, action: String, body: String, service: String = "AVTransport"): Document {
        val conn = connect(controlUrl)
        try {
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "text/xml; charset=utf-8")
            conn.setRequestProperty("SOAPAction", "\"urn:schemas-upnp-org:service:$service:1#$action\"")
            conn.doOutput = true
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            val envelope = """<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body><u:$action xmlns:u="urn:schemas-upnp-org:service:$service:1">
<InstanceID>0</InstanceID>$body
</u:$action></s:Body></s:Envelope>"""
            conn.outputStream.use { it.write(envelope.toByteArray(Charsets.UTF_8)) }
            val status = conn.responseCode
            val stream = if (status >= 400) conn.errorStream else conn.inputStream
            val response = stream?.bufferedReader(Charsets.UTF_8)?.use { reader ->
                val result = StringBuilder()
                val buffer = CharArray(4096)
                while (true) {
                    val count = reader.read(buffer)
                    if (count < 0) break
                    if (result.length + count > 65536) throw IOException("SOAP $action response too large")
                    result.append(buffer, 0, count)
                }
                result.toString()
            } ?: ""
            val document = try { parseResponse(response) } catch (_: Exception) { null }
            val code = document?.getElementsByTagNameNS("*", "errorCode")?.item(0)?.textContent
                ?.trim()?.takeIf { it.matches(Regex("[0-9]{1,5}")) }
            val fault = document?.getElementsByTagNameNS("*", "Fault")?.length ?: 0
            val detail = code?.let { ": UPnP $it" } ?: ""
            if (status != 200) throw IOException("SOAP $action failed: HTTP $status$detail")
            if (fault > 0) throw IOException("SOAP $action failed$detail")
            if (document?.documentElement?.localName != "Envelope" ||
                document.getElementsByTagNameNS("*", "${action}Response").length != 1) {
                throw IOException("SOAP $action failed: invalid SOAP response")
            }
            return document
        } finally {
            conn.disconnect()
        }
    }

    private fun parseResponse(xml: String): Document {
        if (Regex("<!DOCTYPE|<!ENTITY", RegexOption.IGNORE_CASE).containsMatchIn(xml)) {
            throw IOException("Invalid SOAP response")
        }
        val factory = DocumentBuilderFactory.newInstance()
        factory.isNamespaceAware = true
        val builder = factory.newDocumentBuilder()
        builder.setEntityResolver { _, _ -> InputSource(StringReader("")) }
        builder.setErrorHandler(object : DefaultHandler() {
            override fun error(e: SAXParseException) { throw e }
            override fun fatalError(e: SAXParseException) { throw e }
        })
        return builder.parse(InputSource(StringReader(xml)))
    }

    private fun escapeXml(value: String): String =
        value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace("\"", "&quot;").replace("'", "&apos;")
}
