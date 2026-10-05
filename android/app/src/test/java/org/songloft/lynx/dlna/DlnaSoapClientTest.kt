package org.songloft.lynx.dlna

import java.io.IOException
import java.io.InputStream
import java.io.StringReader
import java.net.ServerSocket
import java.net.SocketException
import java.util.Collections
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.w3c.dom.Document
import org.xml.sax.InputSource

class DlnaSoapClientTest {
    private lateinit var server: ServerSocket
    private lateinit var worker: Thread
    private lateinit var controlUrl: String
    private val actions = Collections.synchronizedList(mutableListOf<String>())
    private val bodies = Collections.synchronizedList(mutableListOf<String>())
    private val soapHeaders = Collections.synchronizedList(mutableListOf<String>())
    private var setStatus = 200
    private var setResponse: String? = null
    private var otherResponse: String? = null

    @Before
    fun startServer() {
        server = ServerSocket(0)
        worker = Thread {
            while (!server.isClosed) {
                try {
                    server.accept().use { socket ->
                        socket.soTimeout = 5000
                        val input = socket.getInputStream()
                        readLine(input) // request line
                        val headers = mutableMapOf<String, String>()
                        while (true) {
                            val line = readLine(input)
                            if (line.isEmpty()) break
                            headers[line.substringBefore(':').lowercase()] = line.substringAfter(':').trim()
                        }
                        val action = headers.getValue("soapaction").trim('"').substringAfter('#')
                        val body = ByteArray(headers.getValue("content-length").toInt())
                        var offset = 0
                        while (offset < body.size) {
                            val count = input.read(body, offset, body.size - offset)
                            if (count < 0) throw IOException("Incomplete test request")
                            offset += count
                        }
                        actions.add(action)
                        soapHeaders.add(headers.getValue("soapaction"))
                        bodies.add(body.toString(Charsets.UTF_8))
                        val response = if (action == "SetAVTransportURI") setResponse ?: success(action) else otherResponse ?: success(action)
                        val status = if (action == "SetAVTransportURI") setStatus else 200
                        val bytes = response.toByteArray(Charsets.UTF_8)
                        socket.getOutputStream().apply {
                            write("HTTP/1.1 $status Test\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray())
                            write(bytes)
                            flush()
                        }
                    }
                } catch (e: SocketException) {
                    if (!server.isClosed) throw e
                }
            }
        }
        worker.start()
        controlUrl = "http://127.0.0.1:${server.localPort}/control"
    }

    @After
    fun stopServer() {
        server.close()
        worker.join(5000)
    }

    private fun readLine(input: InputStream): String {
        val line = StringBuilder()
        while (true) {
            val byte = input.read()
            if (byte < 0) throw IOException("Incomplete test headers")
            if (byte == 10) return line.toString().trimEnd('\r')
            if (line.length >= 8192) throw IOException("Test header too large")
            line.append(byte.toChar())
        }
    }

    @Test
    fun successfulCastPreservesMetadataAndEscapesCurrentUri() {
        val uri = "http://source/api/v1/songs/2/play?access_token=example&quality=original"
        val metadata = "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" " +
            "xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><item><dc:title>中文 &amp; &lt;曲名&gt;</dc:title>" +
            "<res protocolInfo=\"http-get:*:audio/mpeg:*\">" +
            "http://source/api/v1/songs/2/play?access_token=example&amp;quality=original</res></item></DIDL-Lite>"
        DlnaSoapClient().cast(controlUrl, uri, "中文 & <曲名>", metadata)
        assertEquals(listOf("SetAVTransportURI", "Play"), actions)
        val document = parse(bodies.first())
        assertEquals(uri, document.getElementsByTagName("CurrentURI").item(0).textContent)
        assertEquals(metadata, document.getElementsByTagName("CurrentURIMetaData").item(0).textContent)
        val didl = parse(document.getElementsByTagName("CurrentURIMetaData").item(0).textContent)
        assertEquals("中文 & <曲名>", didl.getElementsByTagNameNS("*", "title").item(0).textContent)
        assertEquals(uri, didl.getElementsByTagName("res").item(0).textContent)
    }

    @Test
    fun httpFailureStopsBeforePlayAndReportsUpnpCode() {
        setStatus = 500
        setResponse = fault()
        expectRejected("HTTP 500: UPnP 714")
    }

    @Test
    fun soapFaultWithHttp200StopsBeforePlay() {
        setResponse = fault()
        expectRejected("UPnP 714")
    }

    @Test
    fun htmlResponseDoesNotPretendCastingSucceeded() {
        setResponse = "<html><body>Songloft</body></html>"
        expectRejected("invalid SOAP response")
    }

    @Test
    fun legacyCallsStillEncodeTitlesAndUrls() {
        DlnaSoapClient().cast(controlUrl, "http://source/a.mp3?a=1&b=2", "A & <B>")
        val metadata = parse(bodies.first()).getElementsByTagName("CurrentURIMetaData").item(0).textContent
        val didl = parse(metadata)
        assertEquals("A & <B>", didl.getElementsByTagNameNS("*", "title").item(0).textContent)
        assertEquals("http://source/a.mp3?a=1&b=2", didl.getElementsByTagName("res").item(0).textContent)
    }

    @Test
    fun positionQueriesHaveOnlyInstanceIdAndReturnRendererTime() {
        otherResponse = "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\"><s:Body>" +
            "<u:GetPositionInfoResponse xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">" +
            "<RelTime>00:01:23</RelTime><TrackDuration>00:04:56</TrackDuration>" +
            "</u:GetPositionInfoResponse></s:Body></s:Envelope>"
        val document = DlnaSoapClient().request(controlUrl, "GetPositionInfo", "")
        assertEquals("00:01:23", document.getElementsByTagName("RelTime").item(0).textContent)
        assertEquals("00:04:56", document.getElementsByTagName("TrackDuration").item(0).textContent)
        assertEquals(1, parse(bodies.first()).getElementsByTagName("InstanceID").length)
        assertEquals(0, parse(bodies.first()).getElementsByTagName("MediaDuration").length)
    }

    @Test
    fun volumeUsesRenderingControlNamespaceAndChannel() {
        DlnaSoapClient().request(controlUrl, "SetVolume", "<Channel>Master</Channel><DesiredVolume>40</DesiredVolume>", "RenderingControl")
        assertTrue(soapHeaders.first().contains("service:RenderingControl:1#SetVolume"))
        val document = parse(bodies.first())
        assertEquals(1, document.getElementsByTagNameNS("urn:schemas-upnp-org:service:RenderingControl:1", "SetVolume").length)
        assertEquals("40", document.getElementsByTagName("DesiredVolume").item(0).textContent)
    }

    private fun expectRejected(message: String) {
        val error = try {
            DlnaSoapClient().cast(controlUrl, "http://source/stream", "Rejected")
            throw AssertionError("Casting unexpectedly succeeded")
        } catch (e: IOException) { e }
        assertTrue(error.message.orEmpty(), error.message.orEmpty().contains(message))
        assertEquals(listOf("SetAVTransportURI"), actions)
    }

    private fun success(action: String): String =
        "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\"><s:Body>" +
            "<u:${action}Response xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\"/>" +
            "</s:Body></s:Envelope>"

    private fun fault(): String =
        "<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\"><s:Body><s:Fault>" +
            "<detail><UPnPError><errorCode>714</errorCode></UPnPError></detail>" +
            "</s:Fault></s:Body></s:Envelope>"

    private fun parse(xml: String): Document = DocumentBuilderFactory.newInstance().apply {
        isNamespaceAware = true
    }.newDocumentBuilder().parse(InputSource(StringReader(xml)))
}
