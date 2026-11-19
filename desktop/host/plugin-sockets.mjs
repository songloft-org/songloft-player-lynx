export class DesktopPluginSockets {
  #frames = new Map()
  constructor({ network, send }) {
    Object.assign(this, { network, send })
    this.changed = () => this.closeAll()
    network.on('configure', this.changed)
  }
  #event(frameId, id, type, data = '') {
    this.send('SongloftDesktop.pluginSocket', { frameId, id, type, data })
  }
  open({ frameId, id, url, cookies = '' }) {
    if (
      typeof frameId !== 'string' ||
      frameId.length > 512 ||
      !/^socket-\d+$/.test(id)
    )
      throw new Error('Invalid plugin socket')
    if (!this.#frames.has(frameId)) this.#frames.set(frameId, new Map())
    const frame = this.#frames.get(frameId)
    if (frame.size >= 8 || frame.has(id))
      throw new Error('Plugin socket quota exceeded')
    if (typeof cookies !== 'string' || /[\r\n\0]/.test(cookies))
      throw new Error('Invalid socket cookies')
    const socket = this.network.websocket(
      url,
      cookies ? { Cookie: cookies } : {},
    )
    frame.set(id, socket)
    socket.addEventListener('open', () => {
      if (frame.get(id) === socket) this.#event(frameId, id, 'open')
      else socket.close()
    })
    socket.addEventListener('message', (event) => {
      if (frame.get(id) !== socket) return
      if (
        typeof event.data !== 'string' ||
        Buffer.byteLength(event.data) > 65536
      ) {
        socket.close(1009)
        return
      }
      this.#event(frameId, id, 'message', event.data)
    })
    const finish = (type) => {
      if (frame.get(id) !== socket) return
      frame.delete(id)
      if (frame.size === 0) this.#frames.delete(frameId)
      this.#event(frameId, id, type)
    }
    socket.addEventListener('close', () => finish('close'))
    socket.addEventListener('error', () => finish('error'))
    return null
  }
  sendMessage({ frameId, id, data }) {
    if (typeof data !== 'string' || Buffer.byteLength(data) > 65536)
      throw new Error('Invalid socket message')
    const socket = this.#frames.get(frameId)?.get(id)
    if (
      !socket ||
      socket.readyState !== 1 ||
      socket.bufferedAmount > 1024 * 1024
    )
      throw new Error('Plugin socket unavailable')
    socket.send(data)
    return null
  }
  closeSocket({ frameId, id }) {
    const frame = this.#frames.get(frameId),
      socket = frame?.get(id)
    frame?.delete(id)
    if (!frame?.size) this.#frames.delete(frameId)
    if (socket) socket.close(1000, 'client')
    return null
  }
  closeFrame({ frameId }) {
    const frame = this.#frames.get(frameId)
    this.#frames.delete(frameId)
    for (const socket of frame?.values() ?? [])
      socket.close(1000, 'frame closed')
    return null
  }
  closeAll() {
    for (const frameId of this.#frames.keys()) this.closeFrame({ frameId })
  }
  close() {
    this.closeAll()
    this.network.off('configure', this.changed)
  }
}
