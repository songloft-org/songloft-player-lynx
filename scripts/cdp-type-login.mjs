// Login by typing into the REAL <input> living inside each Lynx X-INPUT's
// shadow root (the X-INPUT shell is zero-size, but its inner native input has a
// real 342x44 box). Username is dev-defaulted to 'admin', apiUrl to
// localhost:58091; only the password needs typing. Then check agreement, login.
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
async function type(str) {
  for (const ch of str) await send('Input.dispatchKeyEvent', { type: 'char', text: ch }, sid)
}
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid)
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
  await new Promise((r) => setTimeout(r, 8000))

  // locate the password field's inner real <input> (2nd x-input) + agreement + button rects
  const p1 = JSON.parse(await evalJS(`(()=>{
    const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
    const xins=[...sr.querySelectorAll('x-input')];
    const pwInner=xins[1]?.shadowRoot.querySelector('input');
    const userInner=xins[0]?.shadowRoot.querySelector('input');
    const cb=sr.querySelector('.app-checkbox'); const btn=sr.querySelector('.login__button');
    const R=el=>{const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};};
    return JSON.stringify({pw:R(pwInner),user:R(userInner),userVal:userInner?.value,cb:R(cb),btn:R(btn),btnDisabled:btn.className.includes('disabled')});
  })()`))
  console.log('p1:', JSON.stringify(p1))

  // 1. set the password field's inner real <input> value directly + dispatch input
  //    (CDP char events dropped chars; a direct value set + native input event
  //    is reliable and Lynx X-INPUT's onInput listens to native input events —
  //    proven by the char-typing already flipping the button state.)
  if (p1.pw.w > 0) {
    await evalJS(`(()=>{
      const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);
      const xi=h.shadowRoot.querySelectorAll('x-input')[1];
      const inp=xi.shadowRoot.querySelector('input');
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setter.call(inp,'admin');
      inp.dispatchEvent(new InputEvent('input',{bubbles:true}));
      inp.dispatchEvent(new Event('change',{bubbles:true}));
      return inp.value;
    })()`)
    await new Promise((r) => setTimeout(r, 700))
  }
  // verify password value landed
  const pwVal = await evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const xi=h.shadowRoot.querySelectorAll('x-input')[1];return xi.shadowRoot.querySelector('input').value;})()`)
  console.log('password field value:', JSON.stringify(pwVal))

  // 2. check agreement
  await click(p1.cb.x, p1.cb.y); await new Promise((r) => setTimeout(r, 1000))

  // 3. probe button
  const p2 = JSON.parse(await evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const b=h.shadowRoot.querySelector('.login__button');const r=b.getBoundingClientRect();return JSON.stringify({disabled:b.className.includes('disabled'),x:r.x+r.width/2,y:r.y+r.height/2});})()`))
  console.log('p2 (after pwd+agreement):', JSON.stringify(p2))

  // 4. click login
  if (!p2.disabled) {
    await click(p2.x, p2.y)
    await new Promise((r) => setTimeout(r, 8000))
    const screen = await evalJS(`(()=>{
      const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
      const root=sr.querySelector('.theme-root')?.className;
      const page=sr.querySelector('.page')?.className||'?';
      const sample=[...sr.querySelectorAll('*')].map(e=>e.className).filter(Boolean).slice(0,15);
      return JSON.stringify({root,page,sample});
    })()`)
    console.log('post-login:', screen)
    const shot = await send('Page.captureScreenshot', { format: 'png' }, sid)
    writeFileSync(OUT, Buffer.from(shot.data, 'base64'))
    console.log('wrote', OUT)
  } else {
    console.log('STILL DISABLED — typing into inner input did not reach Lynx onInput')
  }
  try { await send('Target.closeTarget', { targetId }) } catch {}
  process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
