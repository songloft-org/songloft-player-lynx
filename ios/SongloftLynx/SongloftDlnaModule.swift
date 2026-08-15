import Foundation
import Network

/**
 * DLNA/UPnP media renderer discovery and control module.
 * Exposed to JS as `NativeModules.SongloftDlna`.
 *
 * Uses SSDP M-SEARCH over UDP multicast for device discovery and SOAP
 * AVTransport for playback control.
 */
final class SongloftDlnaModule: NSObject, LynxModule {
    @objc required init(param: Any) {}
    override init() { super.init() }

    @objc static var name: String { "SongloftDlna" }

    @objc static var methodLookup: [String: String] {
        [
            "startDiscovery": NSStringFromSelector(#selector(SongloftDlnaModule.startDiscovery(_:))),
            "stopDiscovery": NSStringFromSelector(#selector(SongloftDlnaModule.stopDiscovery(_:))),
            "getDevices": NSStringFromSelector(#selector(SongloftDlnaModule.getDevices(_:))),
            "cast": NSStringFromSelector(#selector(SongloftDlnaModule.cast(_:callback:))),
            "control": NSStringFromSelector(#selector(SongloftDlnaModule.control(_:callback:))),
        ]
    }

    private let queue = DispatchQueue(label: "org.songloft.dlna", qos: .userInitiated)
    private var devices: [String: DlnaDevice] = [:]
    private var discovering = false
    private var connection: NWConnection?

    struct DlnaDevice {
        let id: String
        let name: String
        let location: String
        let controlUrl: String
    }

    // MARK: - JS Methods

    @objc func startDiscovery(_ callback: @escaping (String) -> Void) {
        guard !discovering else {
            callback("{\"success\":true}")
            return
        }
        discovering = true
        devices.removeAll()

        queue.async { [weak self] in
            self?.performSsdpSearch()
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                self?.discovering = false
                callback("{\"success\":true}")
            }
        }
    }

    @objc func stopDiscovery(_ callback: @escaping (String) -> Void) {
        discovering = false
        connection?.cancel()
        connection = nil
        callback("{\"success\":true}")
    }

    @objc func getDevices(_ callback: @escaping (String) -> Void) {
        var arr: [[String: String]] = []
        for device in devices.values {
            arr.append(["id": device.id, "name": device.name, "location": device.location])
        }
        if let data = try? JSONSerialization.data(withJSONObject: arr),
           let json = String(data: data, encoding: .utf8) {
            callback(json)
        } else {
            callback("[]")
        }
    }

    @objc func cast(_ args: String, callback: @escaping (String) -> Void) {
        queue.async { [weak self] in
            guard let self = self,
                  let data = args.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let deviceId = json["deviceId"] as? String,
                  let url = json["url"] as? String else {
                DispatchQueue.main.async { callback("{\"error\":\"Invalid args\"}") }
                return
            }
            let title = json["title"] as? String ?? ""
            guard let device = self.devices[deviceId] else {
                DispatchQueue.main.async { callback("{\"error\":\"Device not found\"}") }
                return
            }
            do {
                try self.sendSetAVTransportURI(device.controlUrl, uri: url, title: title)
                try self.sendPlay(device.controlUrl)
                DispatchQueue.main.async { callback("{\"success\":true}") }
            } catch {
                DispatchQueue.main.async { callback("{\"error\":\"\(error.localizedDescription)\"}") }
            }
        }
    }

    @objc func control(_ args: String, callback: @escaping (String) -> Void) {
        queue.async { [weak self] in
            guard let self = self,
                  let data = args.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let action = json["action"] as? String else {
                DispatchQueue.main.async { callback("{\"error\":\"Invalid args\"}") }
                return
            }
            let deviceId = json["deviceId"] as? String ?? self.devices.keys.first ?? ""
            guard let device = self.devices[deviceId] else {
                DispatchQueue.main.async { callback("{\"error\":\"No device\"}") }
                return
            }
            do {
                switch action {
                case "play": try self.sendPlay(device.controlUrl)
                case "pause": try self.sendPause(device.controlUrl)
                case "stop": try self.sendStop(device.controlUrl)
                case "seek":
                    let value = json["value"] as? Int ?? 0
                    try self.sendSeek(device.controlUrl, seconds: value)
                default: break
                }
                DispatchQueue.main.async { callback("{\"success\":true}") }
            } catch {
                DispatchQueue.main.async { callback("{\"error\":\"\(error.localizedDescription)\"}") }
            }
        }
    }

    // MARK: - SSDP Discovery

    private func performSsdpSearch() {
        let message = [
            "M-SEARCH * HTTP/1.1",
            "HOST: 239.255.255.250:1900",
            "MAN: \"ssdp:discover\"",
            "MX: 3",
            "ST: urn:schemas-upnp-org:service:AVTransport:1",
            "", ""
        ].joined(separator: "\r\n")

        guard let data = message.data(using: .utf8) else { return }

        let host = NWEndpoint.Host("239.255.255.250")
        let port = NWEndpoint.Port(integerLiteral: 1900)
        let conn = NWConnection(host: host, port: port, using: .udp)
        self.connection = conn

        conn.stateUpdateHandler = { [weak self] state in
            guard case .ready = state else { return }
            conn.send(content: data, completion: .contentProcessed { _ in
                self?.receiveResponses(conn)
            })
        }
        conn.start(queue: queue)
    }

    private func receiveResponses(_ conn: NWConnection) {
        conn.receiveMessage { [weak self] data, _, _, _ in
            guard let self = self, self.discovering else { return }
            if let data = data, let response = String(data: data, encoding: .utf8) {
                self.parseResponse(response)
            }
            self.receiveResponses(conn)
        }
    }

    private func parseResponse(_ response: String) {
        guard let locationLine = response.split(separator: "\r\n")
            .first(where: { $0.lowercased().hasPrefix("location:") }) else { return }
        let location = String(locationLine.dropFirst(9)).trimmingCharacters(in: .whitespaces)

        let usnLine = response.split(separator: "\r\n")
            .first(where: { $0.lowercased().hasPrefix("usn:") })
        let usn = usnLine.map { String($0.dropFirst(4)).trimmingCharacters(in: .whitespaces) } ?? location

        queue.async { [weak self] in
            guard let desc = self?.fetchDeviceDescription(location) else { return }
            self?.devices[usn] = DlnaDevice(id: usn, name: desc.name, location: location, controlUrl: desc.controlUrl)
        }
    }

    private func fetchDeviceDescription(_ location: String) -> (name: String, controlUrl: String)? {
        guard let url = URL(string: location),
              let data = try? Data(contentsOf: url),
              let xml = String(data: data, encoding: .utf8) else { return nil }

        let name = xml.firstMatch(of: /<friendlyName>(.+?)<\/friendlyName>/)
            .map { String($0.output.1) } ?? "Unknown"

        let controlPath = xml.firstMatch(of: /AVTransport:1<\/serviceType>[\s\S]*?<controlURL>(.+?)<\/controlURL>/)
            .map { String($0.output.1) } ?? "/MediaRenderer/AVTransport/Control"

        let controlUrl: String
        if controlPath.hasPrefix("http") {
            controlUrl = controlPath
        } else {
            let base = url.deletingLastPathComponent()
            controlUrl = "\(url.scheme ?? "http")://\(url.host ?? "")\(url.port.map { ":\($0)" } ?? "")\(controlPath)"
        }
        return (name, controlUrl)
    }

    // MARK: - SOAP Control

    private func soapRequest(_ controlUrl: String, action: String, body: String) throws {
        guard let url = URL(string: controlUrl) else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("text/xml; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.setValue("\"urn:schemas-upnp-org:service:AVTransport:1#\(action)\"", forHTTPHeaderField: "SOAPAction")
        request.timeoutInterval = 5

        let envelope = """
        <?xml version="1.0" encoding="utf-8"?>
        <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body>
        <u:\(action) xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
        <InstanceID>0</InstanceID>
        \(body)
        </u:\(action)>
        </s:Body>
        </s:Envelope>
        """
        request.httpBody = envelope.data(using: .utf8)

        let sem = DispatchSemaphore(value: 0)
        var error: Error?
        // `InsecureTls.session`, not `URLSession.shared` — renderers on the LAN
        // routinely present self-signed certificates, and `shared` takes no
        // delegate so it can never accept one.
        InsecureTls.shared.session.dataTask(with: request) { _, _, err in
            error = err
            sem.signal()
        }.resume()
        sem.wait()
        if let e = error { throw e }
    }

    private func sendSetAVTransportURI(_ controlUrl: String, uri: String, title: String) throws {
        let metadata = "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><item><dc:title>\(escapeXml(title))</dc:title><res>\(escapeXml(uri))</res></item></DIDL-Lite>"
        try soapRequest(controlUrl, action: "SetAVTransportURI",
            body: "<CurrentURI>\(escapeXml(uri))</CurrentURI><CurrentURIMetaData>\(escapeXml(metadata))</CurrentURIMetaData>")
    }

    private func sendPlay(_ controlUrl: String) throws {
        try soapRequest(controlUrl, action: "Play", body: "<Speed>1</Speed>")
    }

    private func sendPause(_ controlUrl: String) throws {
        try soapRequest(controlUrl, action: "Pause", body: "")
    }

    private func sendStop(_ controlUrl: String) throws {
        try soapRequest(controlUrl, action: "Stop", body: "")
    }

    private func sendSeek(_ controlUrl: String, seconds: Int) throws {
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        let target = String(format: "%02d:%02d:%02d", h, m, s)
        try soapRequest(controlUrl, action: "Seek", body: "<Unit>REL_TIME</Unit><Target>\(target)</Target>")
    }

    private func escapeXml(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
         .replacingOccurrences(of: "<", with: "&lt;")
         .replacingOccurrences(of: ">", with: "&gt;")
         .replacingOccurrences(of: "\"", with: "&quot;")
    }
}
