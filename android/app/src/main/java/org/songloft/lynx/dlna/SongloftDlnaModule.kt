package org.songloft.lynx.dlna

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.lynx.jsbridge.LynxModule
import com.lynx.jsbridge.LynxMethod
import com.lynx.react.bridge.Callback
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * DLNA/UPnP media renderer discovery and control module.
 * Exposed to JS as `NativeModules.SongloftDlna`.
 *
 * Uses SSDP M-SEARCH for device discovery and SOAP AVTransport for playback control.
 */
class SongloftDlnaModule(context: Context) : LynxModule(context) {

    companion object {
        private const val SSDP_ADDRESS = "239.255.255.250"
        private const val SSDP_PORT = 1900
        private const val SEARCH_TARGET = "urn:schemas-upnp-org:service:AVTransport:1"
        private val M_SEARCH = (
            "M-SEARCH * HTTP/1.1\r\n" +
            "HOST: 239.255.255.250:1900\r\n" +
            "MAN: \"ssdp:discover\"\r\n" +
            "MX: 3\r\n" +
            "ST: $SEARCH_TARGET\r\n" +
            "\r\n"
        ).toByteArray()
    }

    private val executor = Executors.newCachedThreadPool()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val discovering = AtomicBoolean(false)
    private val devices = ConcurrentHashMap<String, DlnaDevice>()
    private var socket: DatagramSocket? = null

    data class DlnaDevice(
        val id: String,
        val name: String,
        val location: String,
        val controlUrl: String
    )

    @LynxMethod
    fun startDiscovery(callback: Callback) {
        if (discovering.getAndSet(true)) {
            callback.invoke(JSONObject().put("success", true).toString())
            return
        }
        devices.clear()
        executor.execute {
            try {
                val sock = DatagramSocket().apply { soTimeout = 4000 }
                socket = sock
                val group = InetAddress.getByName(SSDP_ADDRESS)
                val packet = DatagramPacket(M_SEARCH, M_SEARCH.size, group, SSDP_PORT)
                sock.send(packet)

                val buf = ByteArray(4096)
                val deadline = System.currentTimeMillis() + 4000
                while (System.currentTimeMillis() < deadline && discovering.get()) {
                    try {
                        val recv = DatagramPacket(buf, buf.size)
                        sock.receive(recv)
                        val response = String(recv.data, 0, recv.length)
                        parseResponse(response)
                    } catch (_: Exception) {
                        break
                    }
                }
                sock.close()
            } catch (_: Exception) {
            } finally {
                discovering.set(false)
            }
            mainHandler.post {
                callback.invoke(JSONObject().put("success", true).toString())
            }
        }
    }

    @LynxMethod
    fun stopDiscovery(callback: Callback) {
        discovering.set(false)
        socket?.close()
        socket = null
        callback.invoke(JSONObject().put("success", true).toString())
    }

    @LynxMethod
    fun getDevices(callback: Callback) {
        val arr = JSONArray()
        for (device in devices.values) {
            arr.put(JSONObject().apply {
                put("id", device.id)
                put("name", device.name)
                put("location", device.location)
            })
        }
        callback.invoke(arr.toString())
    }

    @LynxMethod
    fun cast(args: String, callback: Callback) {
        executor.execute {
            try {
                val json = JSONObject(args)
                val deviceId = json.getString("deviceId")
                val url = json.getString("url")
                val title = json.optString("title", "")
                val device = devices[deviceId]
                if (device == null) {
                    mainHandler.post { callback.invoke(JSONObject().put("error", "Device not found").toString()) }
                    return@execute
                }
                sendSetAVTransportURI(device.controlUrl, url, title)
                sendPlay(device.controlUrl)
                mainHandler.post { callback.invoke(JSONObject().put("success", true).toString()) }
            } catch (e: Exception) {
                mainHandler.post { callback.invoke(JSONObject().put("error", e.message).toString()) }
            }
        }
    }

    @LynxMethod
    fun control(args: String, callback: Callback) {
        executor.execute {
            try {
                val json = JSONObject(args)
                val action = json.getString("action")
                val deviceId = json.optString("deviceId", devices.keys.firstOrNull() ?: "")
                val device = devices[deviceId]
                if (device == null) {
                    mainHandler.post { callback.invoke(JSONObject().put("error", "No device").toString()) }
                    return@execute
                }
                when (action) {
                    "play" -> sendPlay(device.controlUrl)
                    "pause" -> sendPause(device.controlUrl)
                    "stop" -> sendStop(device.controlUrl)
                    "seek" -> {
                        val value = json.optInt("value", 0)
                        sendSeek(device.controlUrl, value)
                    }
                }
                mainHandler.post { callback.invoke(JSONObject().put("success", true).toString()) }
            } catch (e: Exception) {
                mainHandler.post { callback.invoke(JSONObject().put("error", e.message).toString()) }
            }
        }
    }

    private fun parseResponse(response: String) {
        val locationRegex = Regex("LOCATION:\\s*(.+)", RegexOption.IGNORE_CASE)
        val location = locationRegex.find(response)?.groupValues?.get(1)?.trim() ?: return
        val usnRegex = Regex("USN:\\s*(.+)", RegexOption.IGNORE_CASE)
        val usn = usnRegex.find(response)?.groupValues?.get(1)?.trim() ?: location

        executor.execute {
            try {
                val desc = fetchDeviceDescription(location)
                if (desc != null) {
                    devices[usn] = desc.copy(id = usn)
                }
            } catch (_: Exception) {}
        }
    }

    private fun fetchDeviceDescription(location: String): DlnaDevice? {
        val conn = URL(location).openConnection() as HttpURLConnection
        conn.connectTimeout = 3000
        conn.readTimeout = 3000
        try {
            val xml = conn.inputStream.bufferedReader().readText()
            val name = Regex("<friendlyName>(.+?)</friendlyName>").find(xml)?.groupValues?.get(1) ?: "Unknown"
            val controlUrl = extractControlUrl(xml, location)
            return DlnaDevice(id = "", name = name, location = location, controlUrl = controlUrl)
        } finally {
            conn.disconnect()
        }
    }

    private fun extractControlUrl(xml: String, baseLocation: String): String {
        val serviceBlock = Regex(
            "<service>.*?<serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>.*?<controlURL>(.+?)</controlURL>.*?</service>",
            RegexOption.DOT_MATCHES_ALL
        ).find(xml)?.groupValues?.get(1) ?: "/MediaRenderer/AVTransport/Control"

        return if (serviceBlock.startsWith("http")) {
            serviceBlock
        } else {
            val base = URL(baseLocation)
            "${base.protocol}://${base.host}:${base.port}$serviceBlock"
        }
    }

    private fun soapRequest(controlUrl: String, action: String, body: String) {
        val conn = URL(controlUrl).openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "text/xml; charset=utf-8")
        conn.setRequestProperty("SOAPAction", "\"urn:schemas-upnp-org:service:AVTransport:1#$action\"")
        conn.doOutput = true
        conn.connectTimeout = 5000
        conn.readTimeout = 5000
        val envelope = """<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
<s:Body>
<u:$action xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
<InstanceID>0</InstanceID>
$body
</u:$action>
</s:Body>
</s:Envelope>"""
        conn.outputStream.write(envelope.toByteArray())
        conn.responseCode // trigger the request
        conn.disconnect()
    }

    private fun sendSetAVTransportURI(controlUrl: String, uri: String, title: String) {
        val metadata = """<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<item><dc:title>$title</dc:title><res>$uri</res></item></DIDL-Lite>"""
        soapRequest(controlUrl, "SetAVTransportURI",
            "<CurrentURI>$uri</CurrentURI><CurrentURIMetaData>${escapeXml(metadata)}</CurrentURIMetaData>")
    }

    private fun sendPlay(controlUrl: String) {
        soapRequest(controlUrl, "Play", "<Speed>1</Speed>")
    }

    private fun sendPause(controlUrl: String) {
        soapRequest(controlUrl, "Pause", "")
    }

    private fun sendStop(controlUrl: String) {
        soapRequest(controlUrl, "Stop", "")
    }

    private fun sendSeek(controlUrl: String, seconds: Int) {
        val h = seconds / 3600
        val m = (seconds % 3600) / 60
        val s = seconds % 60
        val target = String.format("%02d:%02d:%02d", h, m, s)
        soapRequest(controlUrl, "Seek", "<Unit>REL_TIME</Unit><Target>$target</Target>")
    }

    private fun escapeXml(s: String): String =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace("\"", "&quot;").replace("'", "&apos;")
}
