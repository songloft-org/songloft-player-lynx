package org.songloft.lynx.dlna

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.lynx.jsbridge.LynxModule
import com.lynx.jsbridge.LynxMethod
import com.lynx.react.bridge.Callback
import org.songloft.lynx.net.InsecureTls
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
    private val soapClient = DlnaSoapClient { url ->
        (URL(url).openConnection() as HttpURLConnection).also { InsecureTls.configure(it) }
    }
    private var socket: DatagramSocket? = null
    @Volatile private var activeDeviceId: String? = null

    data class DlnaDevice(
        val id: String,
        val name: String,
        val location: String,
        val controlUrl: String,
        val renderingControlUrl: String?
    )

    @LynxMethod
    fun startDiscovery(callback: Callback) {
        if (discovering.getAndSet(true)) {
            callback.invoke(JSONObject().put("success", true).toString())
            return
        }
        devices.keys.filter { it != activeDeviceId }.forEach { devices.remove(it) }
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
                soapClient.cast(device.controlUrl, url, title, json.optString("metadata", ""))
                activeDeviceId = device.id
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
                    "volume" -> {
                        val url = device.renderingControlUrl ?: error("Device does not support volume control")
                        val value = json.getInt("value").coerceIn(0, 100)
                        soapClient.request(url, "SetVolume", "<Channel>Master</Channel><DesiredVolume>$value</DesiredVolume>", "RenderingControl")
                    }
                    "status" -> {
                        val transport = soapClient.request(device.controlUrl, "GetTransportInfo", "")
                        val position = soapClient.request(device.controlUrl, "GetPositionInfo", "")
                        val state = transport.getElementsByTagNameNS("*", "CurrentTransportState").item(0)?.textContent ?: ""
                        val relTime = position.getElementsByTagNameNS("*", "RelTime").item(0)?.textContent ?: ""
                        val duration = position.getElementsByTagNameNS("*", "TrackDuration").item(0)?.textContent ?: ""
                        val result = JSONObject().put("state", state)
                            .put("positionMs", timeMilliseconds(relTime)).put("durationMs", timeMilliseconds(duration))
                        mainHandler.post { callback.invoke(result.toString()) }
                        return@execute
                    }
                    else -> error("Unsupported DLNA action: $action")
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
            val controlUrl = extractControlUrl(xml, location, "AVTransport") ?: return null
            val renderingControlUrl = extractControlUrl(xml, location, "RenderingControl")
            return DlnaDevice(id = "", name = name, location = location, controlUrl = controlUrl, renderingControlUrl = renderingControlUrl)
        } finally {
            conn.disconnect()
        }
    }

    private fun extractControlUrl(xml: String, baseLocation: String, service: String): String? {
        val blocks = Regex("<service>.*?</service>", RegexOption.DOT_MATCHES_ALL).findAll(xml)
        val block = blocks.firstOrNull { it.value.contains("urn:schemas-upnp-org:service:$service:") }?.value ?: return null
        val path = Regex("<controlURL>(.+?)</controlURL>").find(block)?.groupValues?.get(1)?.trim() ?: return null
        val urlBase = Regex("<URLBase>(.+?)</URLBase>").find(xml)?.groupValues?.get(1)?.trim() ?: baseLocation
        return URL(URL(urlBase), path).toString()
    }

    private fun timeMilliseconds(value: String): Long {
        val parts = value.trim().split(":")
        if (parts.size != 3) return 0
        val h = parts[0].toLongOrNull() ?: return 0
        val m = parts[1].toLongOrNull() ?: return 0
        val s = parts[2].toDoubleOrNull() ?: return 0
        return ((h * 3600 + m * 60 + s) * 1000).toLong().coerceAtLeast(0)
    }

    private fun soapRequest(controlUrl: String, action: String, body: String) {
        soapClient.request(controlUrl, action, body)
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

}
