// Inject the remembered password into IDB so the login form prefills, then
// drive the real user flow the operator described: check agreement, login.
import { writeFileSync } from 'node:fs'

const APP = 'http://localhost:3010/'
const CDP = 'ws://localhost:3100'
const OUT = '/tmp/lynx-postlogin.png'
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
async function evalJS(expr, awaitP = false) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: awaitP, returnByValue: true }, sid)
  return r.result?.value
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
  await new Promise((r) => setTimeout(r, 7000))

  // 1. inject remembered password (+ prefs) into the songloft IDB
  const inj = await evalJS(`new Promise((resolve)=>{
    const r=indexedDB.open('songloft',1);
    r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv')};
    r.onsuccess=e=>{const d=e.target.result;const t=d.transaction('kv','readwrite');const s=t.objectStore('kv');
      s.put('secure.last_password','admin');s.put('prefs.last_username','admin');
      s.put('prefs.server_url','http://localhost:58091');s.put('prefs.insecure_tls','false');
      t.oncomplete=()=>resolve('injected');t.onerror=()=>resolve('txerr '+t.error);};
    r.onerror=()=>resolve('openerr '+r.error);})`, true)
  console.log('inject:', inj)

  // 2. reload so the login useEffect re-reads the secure store
  await send('Page.reload', {}, sid)
  await new Promise((r) => setTimeout(r, 8000))

  // 3. probe button state + agreement rect + button rect (inside shadow root)
  const probe1 = await evalJS(`(()=>{
    const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
    const btn=sr.querySelector('.login__button');
    const cb=sr.querySelector('.app-checkbox');
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};};
    return JSON.stringify({btnDisabled:btn.className.includes('disabled'),btnRect:rect(btn),cbRect:rect(cb),root:sr.querySelector('.theme-root')?.className});
  })()`)
  console.log('probe1:', probe1)
  const p1 = JSON.parse(probe1)

  // 4. click agreement checkbox
  if (p1.cbRect.w === 0) { console.log('checkbox zero-size — cannot click'); }
  else {
    await click(p1.cbRect.x, p1.cbRect.y); await new Promise((r) => setTimeout(r, 1200))
  }

  // 5. probe button enabled now?
  const probe2 = JSON.parse(await evalJS(`(()=>{
    const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
    const btn=sr.querySelector('.login__button');
    const r=btn.getBoundingClientRect();
    return JSON.stringify({disabled:btn.className.includes('disabled'),x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height});
  })()`))
  console.log('probe2 (after agreement):', JSON.stringify(probe2))

  // 6. click login if enabled
  if (!probe2.disabled && probe2.w > 0) {
    await click(probe2.x, probe2.y)
    await new Promise((r) => setTimeout(r, 7000))
    const screen = await evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;return sr.querySelector('.theme-root')?.className+' | firstPage='+(sr.querySelector('.page')?.className||'?');})()`)
    console.log('post-login screen:', screen)
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sid)
    writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
    console.log('wrote', OUT)
  } else {
    console.log('login button not enabled — password likely did NOT prefill (IDB not shared with worker)')
  }
  try { await send('Target.closeTarget', { targetId }) } catch {}
  process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
