// Login (proven method) then verify the task-3 changed buttons present on the
// home screen via computed min-height, and capture a screenshot.
import { writeFileSync } from 'node:fs'

const APP = 'http://localhost:3010/'
const CDP = 'ws://localhost:3100'
let id = 0; const pending = new Map(); let ws, sid
const send = (m, p = {}, s) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, { res, rej })
  const o = { id: i, method: m, params: p }; if (s) o.sessionId = s
  ws.send(JSON.stringify(o))
})
async function click(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sid)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sid)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sid)
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid)
  return r.result?.value
}
async function login() {
  await new Promise((r) => setTimeout(r, 8000))
  const p1 = JSON.parse(await evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;const xins=[...sr.querySelectorAll('x-input')];const pw=xins[1]?.shadowRoot.querySelector('input');const cb=sr.querySelector('.app-checkbox');const R=el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}};return JSON.stringify({pw:R(pw),cb:R(cb)});})()`))
  await evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const xi=h.shadowRoot.querySelectorAll('x-input')[1];const inp=xi.shadowRoot.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inp,'admin');inp.dispatchEvent(new InputEvent('input',{bubbles:true}));return inp.value;})()`)
  await new Promise((r) => setTimeout(r, 700))
  await click(p1.cb.x, p1.cb.y); await new Promise((r) => setTimeout(r, 1000))
  const b = JSON.parse(await evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const b=h.shadowRoot.querySelector('.login__button');const r=b.getBoundingClientRect();return JSON.stringify({d:b.className.includes('disabled'),x:r.x+r.width/2,y:r.y+r.height/2});})()`))
  if (b.d) throw new Error('login button still disabled')
  await click(b.x, b.y); await new Promise((r) => setTimeout(r, 8000))
}
async function main() {
  ws = new WebSocket(CDP)
  await new Promise((r, e) => { ws.addEventListener('open', r); ws.addEventListener('error', e) })
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result) }
  })
  const { targetId } = await send('Target.createTarget', { url: APP })
  const a = await send('Target.attachToTarget', { targetId, flatten: true }); sid = a.sessionId
  await send('Page.enable', {}, sid); await send('Runtime.enable', {}, sid)
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenWidth: 390, screenHeight: 844 }, sid)
  await login()

  // probe task-3 changed buttons present on home + their computed min-height
  const probe = await evalJS(`(()=>{
    const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
    const want=['home-section__action','home-section__retry','home__empty-action','home__state-action'];
    const out={};
    for(const w of want){const els=sr.querySelectorAll('.'+w);out[w]=els.length?[...els].map(e=>{const cs=getComputedStyle(e);return{minH:cs.minHeight,h:cs.height,display:cs.display,justify:cs.justifyContent}}):'absent';}
    out.screen=sr.querySelector('.page')?.className;
    return JSON.stringify(out,null,1);
  })()`)
  console.log('home changed-buttons probe:'); console.log(probe)

  const shot = await send('Page.captureScreenshot', { format: 'png' }, sid)
  writeFileSync('/tmp/lynx-home.png', Buffer.from(shot.data, 'base64'))
  console.log('screenshot /tmp/lynx-home.png')
  try { await send('Target.closeTarget', { targetId }) } catch {}
  process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
