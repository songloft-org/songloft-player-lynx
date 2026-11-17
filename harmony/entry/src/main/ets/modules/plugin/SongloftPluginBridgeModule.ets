import { webSocket } from '@kit.NetworkKit'
import { common, Want } from '@kit.AbilityKit'
import { BusinessError } from '@kit.BasicServicesKit'
import { LynxModule, LynxContext } from '@lynx/lynx'

interface HostCallPayload {
  frameId: string
  callId: string
  ns: string
  method: string
  params: string
}

interface HostReplyPayload {
  callId: string
  result: string
}

interface SocketEvent { id: string; type: string; data: string }

interface PushPayload {
  event: string
  data: string
}

const EVENT_HOST_CALL = 'SongloftPluginBridge.hostCall'
const EVENT_HOST_REPLY = 'SongloftPluginBridge.hostReply'
const EVENT_PUSH = 'SongloftPluginBridge.push'

const hostRegistry = new Map<string, LynxContext>()
const childRegistry = new Map<string, LynxContext>()

export class SongloftPluginBridgeModule extends LynxModule {
  static detachChild(context: LynxContext): void {
    for (const entry of childRegistry.entries()) {
      if (entry[1] === context) childRegistry.delete(entry[0])
    }
  }

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.abilityContext = param as common.UIAbilityContext
  }

  public registerHost(frameId: string): void {
    hostRegistry.set(frameId, this.context)
  }

  public unregisterHost(frameId: string): void {
    if (hostRegistry.get(frameId) !== this.context) return
    for (const key of this.sockets.keys()) {
      if (key.startsWith(frameId + '|')) { this.sockets.get(key)?.close(); this.sockets.delete(key) }
    }
    hostRegistry.delete(frameId)
    childRegistry.delete(frameId)
  }

  private abilityContext: common.UIAbilityContext
  private sockets: Map<string, webSocket.WebSocket> = new Map<string, webSocket.WebSocket>()

  private socketEvent(frameId: string, id: string, type: string, data: string = ''): void {
    const event: SocketEvent = { id, type, data }
    this.pushToChild(frameId, 'pluginSocket', JSON.stringify(event))
  }

  public socketOpen(frameId: string, id: string, url: string): void {
    if (hostRegistry.get(frameId) !== this.context) return
    const key = frameId + '|' + id
    const count = Array.from(this.sockets.keys()).filter((value: string) => value.startsWith(frameId + '|')).length
    if (count >= 8 || this.sockets.has(key)) { this.socketEvent(frameId, id, 'error'); return }
    const socket = webSocket.createWebSocket()
    this.sockets.set(key, socket)
    const current = (): boolean => this.sockets.get(key) === socket
    socket.on('open', () => { if (current()) this.socketEvent(frameId, id, 'open') })
    socket.on('message', (_error: BusinessError, data: string | ArrayBuffer) => { if (current() && typeof data === 'string') this.socketEvent(frameId, id, 'message', data) })
    socket.on('close', () => { if (current()) { this.sockets.delete(key); this.socketEvent(frameId, id, 'close') } })
    socket.on('error', () => { if (current()) { this.sockets.delete(key); this.socketEvent(frameId, id, 'error'); socket.close() } })
    socket.connect(url).catch(() => { if (current()) { this.sockets.delete(key); this.socketEvent(frameId, id, 'error'); socket.close() } })
  }

  public socketSend(frameId: string, id: string, text: string): void {
    if (hostRegistry.get(frameId) === this.context) this.sockets.get(frameId + '|' + id)?.send(text)
  }

  public socketClose(frameId: string, id: string): void {
    if (hostRegistry.get(frameId) !== this.context) return
    const key = frameId + '|' + id, socket = this.sockets.get(key)
    this.sockets.delete(key)
    socket?.close()
  }

  public openUrl(frameId: string, url: string): void {
    if (hostRegistry.get(frameId) !== this.context || !/^https?:\/\//i.test(url)) return
    const want: Want = { action: 'ohos.want.action.viewData', uri: url }
    this.abilityContext.startAbility(want).catch(() => {})
  }

  public registerChild(frameId: string): void {
    childRegistry.set(frameId, this.context)
  }

  public hostCall(frameId: string, callId: string, ns: string, method: string, paramsJson: string): void {
    const hostCtx = hostRegistry.get(frameId)
    if (!hostCtx) return
    const payload: HostCallPayload = { frameId, callId, ns, method, params: paramsJson }
    hostCtx.sendGlobalEvent(EVENT_HOST_CALL, [payload])
  }

  public hostReply(frameId: string, callId: string, resultJson: string): void {
    const childCtx = childRegistry.get(frameId)
    if (!childCtx) return
    const payload: HostReplyPayload = { callId, result: resultJson }
    childCtx.sendGlobalEvent(EVENT_HOST_REPLY, [payload])
  }

  public pushToChild(frameId: string, eventName: string, dataJson: string): void {
    const childCtx = childRegistry.get(frameId)
    if (!childCtx) return
    const payload: PushPayload = { event: eventName, data: dataJson }
    childCtx.sendGlobalEvent(EVENT_PUSH, [payload])
  }
}
