import { socket } from '@kit.NetworkKit'
import { http } from '@kit.NetworkKit'
import { LynxModule, LynxMethod, LynxCallback } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'
import { util } from '@kit.ArkTS'

const SSDP_ADDRESS = '239.255.255.250'
const SSDP_PORT = 1900
const SEARCH_TARGET = 'urn:schemas-upnp-org:service:AVTransport:1'
const SEARCH_TIMEOUT_MS = 5000

interface DlnaDevice {
  name: string
  location: string
  usn: string
}

@LynxModule('SongloftDlna')
export class SongloftDlnaModule {
  private context: common.UIAbilityContext

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  @LynxMethod
  discover(callback: LynxCallback): void {
    this.doDiscover(callback)
  }

  @LynxMethod
  play(location: string, mediaUrl: string, title: string, callback: LynxCallback): void {
    const body = this.buildSetTransportURIBody(mediaUrl, title)
    this.soapAction(location, 'SetAVTransportURI', body).then(() => {
      return this.soapAction(location, 'Play', this.buildPlayBody())
    }).then(() => {
      callback(JSON.stringify({ success: true }))
    }).catch((err: Error) => {
      callback(JSON.stringify({ success: false, error: err.message }))
    })
  }

  @LynxMethod
  pause(location: string, callback: LynxCallback): void {
    this.soapAction(location, 'Pause', this.buildSimpleBody('Pause')).then(() => {
      callback(JSON.stringify({ success: true }))
    }).catch((err: Error) => {
      callback(JSON.stringify({ success: false, error: err.message }))
    })
  }

  @LynxMethod
  stop(location: string, callback: LynxCallback): void {
    this.soapAction(location, 'Stop', this.buildSimpleBody('Stop')).then(() => {
      callback(JSON.stringify({ success: true }))
    }).catch((err: Error) => {
      callback(JSON.stringify({ success: false, error: err.message }))
    })
  }

  @LynxMethod
  seek(location: string, position: string, callback: LynxCallback): void {
    const body = this.buildSeekBody(position)
    this.soapAction(location, 'Seek', body).then(() => {
      callback(JSON.stringify({ success: true }))
    }).catch((err: Error) => {
      callback(JSON.stringify({ success: false, error: err.message }))
    })
  }

  @LynxMethod
  getPosition(location: string, callback: LynxCallback): void {
    this.soapAction(location, 'GetPositionInfo', this.buildSimpleBody('GetPositionInfo')).then((response: string) => {
      const trackDuration = this.extractXmlValue(response, 'TrackDuration') ?? '00:00:00'
      const relTime = this.extractXmlValue(response, 'RelTime') ?? '00:00:00'
      callback(JSON.stringify({
        success: true,
        trackDuration: trackDuration,
        relTime: relTime,
      }))
    }).catch((err: Error) => {
      callback(JSON.stringify({ success: false, error: err.message }))
    })
  }

  private async doDiscover(callback: LynxCallback): Promise<void> {
    const devices: DlnaDevice[] = []
    const multicastSocket = socket.constructMulticastSocketInstance()

    try {
      await multicastSocket.bind({ address: '0.0.0.0', port: 0 })
      await multicastSocket.addMembership(SSDP_ADDRESS)

      multicastSocket.on('message', (value: socket.SocketMessageInfo) => {
        const textDecoder = util.TextDecoder.create('utf-8')
        const message = textDecoder.decodeToString(new Uint8Array(value.message))
        const device = this.parseSsdpResponse(message)
        if (device && !devices.find((d: DlnaDevice) => d.usn === device.usn)) {
          devices.push(device)
        }
      })

      const searchMessage =
        `M-SEARCH * HTTP/1.1\r\n` +
        `HOST: ${SSDP_ADDRESS}:${SSDP_PORT}\r\n` +
        `MAN: "ssdp:discover"\r\n` +
        `MX: 3\r\n` +
        `ST: ${SEARCH_TARGET}\r\n` +
        `\r\n`

      const encoder = new util.TextEncoder()
      const sendData = encoder.encodeInto(searchMessage)

      const sendOptions: socket.UDPSendOptions = {
        data: sendData.buffer,
        address: { address: SSDP_ADDRESS, port: SSDP_PORT, family: 1 },
      }
      await multicastSocket.send(sendOptions)

      await new Promise<void>((resolve) => setTimeout(resolve, SEARCH_TIMEOUT_MS))

      multicastSocket.off('message')
      multicastSocket.close()

      callback(JSON.stringify({ devices: devices }))
    } catch (err) {
      multicastSocket.close()
      callback(JSON.stringify({ devices: [], error: String(err) }))
    }
  }

  private parseSsdpResponse(message: string): DlnaDevice | null {
    if (!message.includes('HTTP/1.1 200 OK') && !message.includes('NOTIFY')) return null
    const location = this.extractHeader(message, 'LOCATION')
    const usn = this.extractHeader(message, 'USN')
    const server = this.extractHeader(message, 'SERVER') ?? 'Unknown'
    if (!location || !usn) return null
    const device: DlnaDevice = { name: server, location: location, usn: usn }
    return device
  }

  private extractHeader(message: string, header: string): string | null {
    const regex = new RegExp(`${header}:\\s*(.+)`, 'i')
    const match = message.match(regex)
    return match ? match[1].trim() : null
  }

  private async soapAction(controlUrl: string, action: string, body: string): Promise<string> {
    const httpRequest = http.createHttp()
    const headerMap: Record<string, string> = {
      'Content-Type': 'text/xml; charset="utf-8"',
      'SOAPAction': `"urn:schemas-upnp-org:service:AVTransport:1#${action}"`,
    }
    const options: http.HttpRequestOptions = {
      method: http.RequestMethod.POST,
      header: headerMap,
      extraData: body,
    }
    const response = await httpRequest.request(controlUrl, options)
    httpRequest.destroy()

    if (response.responseCode !== 200) {
      throw new Error(`SOAP ${action} failed: HTTP ${response.responseCode}`)
    }
    return response.result as string
  }

  private buildSetTransportURIBody(url: string, title: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <CurrentURI>${this.escapeXml(url)}</CurrentURI>
      <CurrentURIMetaData>&lt;DIDL-Lite&gt;&lt;item&gt;&lt;dc:title&gt;${this.escapeXml(title)}&lt;/dc:title&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</CurrentURIMetaData>
    </u:SetAVTransportURI>
  </s:Body>
</s:Envelope>`
  }

  private buildPlayBody(): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <Speed>1</Speed>
    </u:Play>
  </s:Body>
</s:Envelope>`
  }

  private buildSeekBody(position: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:Seek xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
      <Unit>REL_TIME</Unit>
      <Target>${position}</Target>
    </u:Seek>
  </s:Body>
</s:Envelope>`
  }

  private buildSimpleBody(action: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
      <InstanceID>0</InstanceID>
    </u:${action}>
  </s:Body>
</s:Envelope>`
  }

  private escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  }

  private extractXmlValue(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`)
    const match = xml.match(regex)
    return match ? match[1] : null
  }
}
