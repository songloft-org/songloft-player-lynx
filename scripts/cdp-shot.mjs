// CDP screenshot driver for the Lynx web bundle.
// Connects to the BROWSER-level ws (busy_poitras, host network, port 3100),
// creates a target pointing at the web serve, attaches (flatten), and captures.
import { writeFileSync } from 'node:fs'

const CDP = process.env.CDP ?? 'ws://localhost:3100'
const URL = process.env.URL ?? 'http://localhost:3010/'
const OUT = process.env.OUT ?? '/tmp/lynx-shot.png'
const WAIT_MS = Number(process.env.WAIT_MS ?? 7000)

let id = 0
const pending = new Map()
const events = []
let ws, sessionId

function send(method, params = {}, sid) {
  return new Promise((resolve, reject) => {
    const msgId = ++id
    pending.set(msgId, { resolve, reject })
    const msg = { id: msgId, method, params }
    if (sid) msg.sessionId = sid
    ws.send(JSON.stringify(msg))
  })
}

function onEvent(method, fn) { events.push([method, fn]) }

async function main() {
  ws = new WebSocket(CDP)
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id)
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
    } else if (m.method) {
      for (const [method, fn] of events) if (m.method === method) fn(m.params)
    }
  })

  const { targetId } = await send('Target.createTarget', { url: URL })
  const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true })
  sessionId = sid

  await send('Page.enable', {}, sid)
  await send('Runtime.enable', {}, sid)
  // iPhone-ish viewport (Lynx web renders to a canvas; the page CSS sizes it).
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
    screenWidth: 390, screenHeight: 844,
  }, sid)

  // Give the Lynx web-core engine time to boot + render.
  await new Promise((r) => setTimeout(r, WAIT_MS))

  // Surface any console / runtime errors for honest reporting.
  const evalRes = await send('Runtime.evaluate', {
    expression: '(() => { const c = document.querySelector("canvas"); return JSON.stringify({hasCanvas: !!c, cw: c&&c.width, ch: c&&c.height, bodyHTMLlen: document.body.innerHTML.length}); })()',
    returnByValue: true,
  }, sid).catch((e) => ({ result: { value: 'eval-failed: ' + e.message } }))
  console.log('page probe:', evalRes?.result?.value)

  const shot = await send('Page.captureScreenshot', { format: 'png' }, sid)
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
  console.log('wrote', OUT, Buffer.from(shot.data, 'base64').length, 'bytes')

  try { await send('Target.closeTarget', { targetId }) } catch {}
  process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
