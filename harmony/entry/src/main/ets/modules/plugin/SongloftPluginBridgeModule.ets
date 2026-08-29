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
  constructor(context: LynxContext, param?: Object) {
    super(context, param)
  }

  public registerHost(frameId: string): void {
    hostRegistry.set(frameId, this.context)
  }

  public unregisterHost(frameId: string): void {
    hostRegistry.delete(frameId)
    childRegistry.delete(frameId)
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
