import { socket } from '@kit.NetworkKit'
import { http } from '@kit.NetworkKit'
import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'
import { util } from '@kit.ArkTS'

const SSDP_ADDRESS = '239.255.255.250'
const SSDP_PORT = 1900
const SEARCH_TARGET = 'urn:schemas-upnp-org:service:AVTransport:1'
const SEARCH_TIMEOUT_MS = 5000

interface SsdpDevice {
  id: string
  name: string
  location: string
}

interface DlnaDevice extends SsdpDevice {
  controlUrl: string
}

export class SongloftDlnaModule extends LynxModule {
  private abilityContext: common.UIAbilityContext
  private devices: DlnaDevice[] = []
  private discoveryGeneration: number = 0

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.abilityContext = param as common.UIAbilityContext
  }

  public startDiscovery(callback: (result: string) => void): void {
    this.devices = []
    this.discoveryGeneration += 1
    this.doDiscover(this.discoveryGeneration, callback)
  }

  public stopDiscovery(callback: (result: string) => void): void {
    this.discoveryGeneration += 1
    callback(JSON.stringify({ success: true }))
  }

  public getDevices(callback: (result: string) => void): void {
    callback(JSON.stringify(this.devices))
  }

  public cast(args: string, callback: (result: string) => void): void {
    try {
      const parsed: Record<string, string> = JSON.parse(args)
      const deviceId = parsed.deviceId ?? ''
      const mediaUrl = parsed.url ?? ''
      const title = parsed.title ?? ''
      const device = this.findDevice(deviceId)
      if (!device) {
        callback(JSON.stringify({ error: 'Device not found' }))
        return
      }
      const body = this.buildSetTransportURIBody(mediaUrl, title)
      this.soapAction(device.controlUrl, 'SetAVTransportURI', body).then(() => {
        return this.soapAction(device.controlUrl, 'Play', this.buildPlayBody())
      }).then(() => {
        callback(JSON.stringify({ success: true }))
      }).catch((err: Error) => {
        callback(JSON.stringify({ error: err.message }))
      })
    } catch (err) {
      callback(JSON.stringify({ error: String(err) }))
    }
  }

  public control(args: string, callback: (result: string) => void): void {
    try {
      const parsed: Record<string, string> = JSON.parse(args)
      const action = parsed.action ?? ''
      const deviceId = parsed.deviceId ?? ''
      const value = parsed.value ?? ''
      const device = deviceId.length > 0
        ? this.findDevice(deviceId)
        : (this.devices.length > 0 ? this.devices[0] : null)
      if (!device) {
        callback(JSON.stringify({ error: 'Device not found' }))
        return
      }

      let soapAction: string
      let soapBody: string
      switch (action) {
        case 'pause':
          soapAction = 'Pause'
          soapBody = this.buildSimpleBody('Pause')
          break
        case 'stop':
          soapAction = 'Stop'
          soapBody = this.buildSimpleBody('Stop')
          break
        case 'seek':
          soapAction = 'Seek'
          soapBody = this.buildSeekBody(value)
          break
        default:
          soapAction = 'Play'
          soapBody = this.buildPlayBody()
      }

      this.soapAction(device.controlUrl, soapAction, soapBody).then(() => {
        callback(JSON.stringify({ success: true }))
      }).catch((err: Error) => {
        callback(JSON.stringify({ error: err.message }))
      })
    } catch (err) {
      callback(JSON.stringify({ error: String(err) }))
    }
  }

  private async doDiscover(
    generation: number,
    callback: (result: string) => void,
  ): Promise<void> {
    const discoveredIds: string[] = []
    const multicastSocket = socket.constructMulticastSocketInstance()

    try {
      await multicastSocket.bind({ address: '0.0.0.0', port: 0 })
      const groupAddr: socket.NetAddress = { address: SSDP_ADDRESS, port: SSDP_PORT }
      await multicastSocket.addMembership(groupAddr)

      multicastSocket.on('message', (value: socket.SocketMessageInfo) => {
        const textDecoder = util.TextDecoder.create('utf-8')
        const message = textDecoder.decodeToString(new Uint8Array(value.message))
        const device = this.parseSsdpResponse(message)
        if (device && !discoveredIds.includes(device.id)) {
          discoveredIds.push(device.id)
          this.resolveAndStoreDevice(device, generation).catch(() => {})
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

      callback(JSON.stringify({ success: true }))
    } catch (err) {
      multicastSocket.close()
      callback(JSON.stringify({ error: String(err) }))
    }
  }

  private parseSsdpResponse(message: string): SsdpDevice | null {
    if (!message.includes('HTTP/1.1 200 OK') && !message.includes('NOTIFY')) return null
    const location = this.extractHeader(message, 'LOCATION')
    const usn = this.extractHeader(message, 'USN')
    const server = this.extractHeader(message, 'SERVER') ?? 'Unknown'
    if (!location || !usn) return null
    const device: SsdpDevice = { id: usn, name: server, location: location }
    return device
  }

  private async resolveAndStoreDevice(device: SsdpDevice, generation: number): Promise<void> {
    const resolved = await this.fetchDeviceDescription(device)
    if (!resolved || generation !== this.discoveryGeneration) return
    if (!this.findDevice(resolved.id)) {
      this.devices.push(resolved)
    }
  }

  private async fetchDeviceDescription(device: SsdpDevice): Promise<DlnaDevice | null> {
    const httpRequest = http.createHttp()
    try {
      const options: http.HttpRequestOptions = {
        method: http.RequestMethod.GET,
        connectTimeout: 3000,
        readTimeout: 3000,
      }
      const response = await httpRequest.request(device.location, options)
      if (response.responseCode < 200 || response.responseCode >= 300) return null
      const xml = typeof response.result === 'string' ? response.result : ''
      if (xml.length === 0) return null

      const friendlyName = this.firstCapture(xml, '<friendlyName>(.+?)</friendlyName>') ?? device.name
      const controlPath = this.firstCapture(
        xml,
        '<service>[\\s\\S]*?<serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>' +
          '[\\s\\S]*?<controlURL>(.+?)</controlURL>[\\s\\S]*?</service>',
      ) ?? '/MediaRenderer/AVTransport/Control'
      const controlUrl = this.resolveUrl(device.location, controlPath)
      if (controlUrl.length === 0) return null

      const resolved: DlnaDevice = {
        id: device.id,
        name: friendlyName,
        location: device.location,
        controlUrl: controlUrl,
      }
      return resolved
    } catch (err) {
      return null
    } finally {
      httpRequest.destroy()
    }
  }

  private firstCapture(text: string, pattern: string): string | null {
    const match = text.match(new RegExp(pattern, 'i'))
    if (!match || match.length < 2) return null
    return match[1].trim()
  }

  private resolveUrl(location: string, target: string): string {
    if (target.startsWith('http://') || target.startsWith('https://')) return target
    const schemeEnd = location.indexOf('://')
    if (schemeEnd < 0) return ''
    const pathStart = location.indexOf('/', schemeEnd + 3)
    const origin = pathStart >= 0 ? location.substring(0, pathStart) : location
    if (target.startsWith('/')) return `${origin}${target}`
    const directoryEnd = location.lastIndexOf('/')
    if (directoryEnd <= schemeEnd + 2) return `${origin}/${target}`
    return `${location.substring(0, directoryEnd + 1)}${target}`
  }

  private findDevice(deviceId: string): DlnaDevice | null {
    for (let i = 0; i < this.devices.length; i += 1) {
      if (this.devices[i].id === deviceId) return this.devices[i]
    }
    return null
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
      <CurrentURIMetaData></CurrentURIMetaData>
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
  }
}
