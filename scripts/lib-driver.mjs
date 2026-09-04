// Reusable CDP driver for the Songloft Lynx web bundle.
// Exposes: connect, login, gotoTestid, screenshot, evalJS, setViewport, dumpScreen.
// Navigation is click-based (memory-history router; browser URL doesn't drive it),
// driven on the main-thread shadow DOM which is clickable.
import { writeFileSync } from 'node:fs'

export const APP = 'http://localhost:3010/'
export const CDP = process.env.CDP ?? 'ws://localhost:3100'

export async function openSession(viewport = { width: 390, height: 844 }) {
  const ws = new WebSocket(CDP)
  let id = 0
  const pending = new Map()
  const send = (m, p = {}, sid) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej })
    const o = { id: i, method: m, params: p }; if (sid) o.sessionId = sid
    ws.send(JSON.stringify(o))
  })
  await new Promise((r, e) => { ws.addEventListener('open', r); ws.addEventListener('error', e) })
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result) }
  })
  const { targetId } = await send('Target.createTarget', { url: APP })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const s = (m, p = {}) => send(m, { ...p }, sessionId) // session-scoped
  await s('Page.enable'); await s('Runtime.enable'); await s('Log.enable')
  await s('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 2, mobile: viewport.width < 600, screenWidth: viewport.width, screenHeight: viewport.height })
  return {
    send: s, sessionId, targetId,
    evalJS: async (expr, awaitP = false) => (await s('Runtime.evaluate', { expression: expr, awaitPromise: awaitP, returnByValue: true })).result?.value,
    async click(x, y) {
      await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    },
    async screenshot(path) {
      const shot = await s('Page.captureScreenshot', { format: 'png' })
      writeFileSync(path, Buffer.from(shot.data, 'base64'))
      return path
    },
    close: async () => { try { await send('Target.closeTarget', { targetId }) } catch {} },
  }
}

// Poll until a selector exists in the shadow root (the Lynx web-core boots async).
export async function waitForSelector(sess, sel, timeoutMs = 20000, stepMs = 500) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const ok = await sess.evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);return !!(h&&h.shadowRoot.querySelector(${JSON.stringify(sel)}));})()`)
    if (ok) return true
    await new Promise((r) => setTimeout(r, stepMs))
  }
  return false
}

// Type 'admin' into the password field's inner real <input>, check agreement, login.
// Skips if the session is already authenticated (tokens persist in the worker's IDB).
export async function login(sess) {
  // Wait for EITHER the login form or an authenticated shell.
  const t0 = Date.now()
  let mode = null
  while (Date.now() - t0 < 25000) {
    const st = await sess.evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);if(!h||!h.shadowRoot)return '';const sr=h.shadowRoot;return sr.querySelector('.login')?'login':(sr.querySelector('.shell')||sr.querySelector('.home')?'auth':'');})()`)
    if (st === 'login' || st === 'auth') { mode = st; break }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (mode === 'auth') { await new Promise((r) => setTimeout(r, 1500)); return }
  if (mode !== 'login') throw new Error('neither login form nor shell appeared')

  await sess.evalJS(`(()=>{
    const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);
    const xi=h.shadowRoot.querySelectorAll('x-input')[1];
    const inp=xi.shadowRoot.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(inp,'admin');
    inp.dispatchEvent(new InputEvent('input',{bubbles:true}));return inp.value;
  })()`)
  await new Promise((r) => setTimeout(r, 700))
  const cb = JSON.parse(await sess.evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const el=h.shadowRoot.querySelector('.app-checkbox');const r=el.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2});})()`))
  await sess.click(cb.x, cb.y); await new Promise((r) => setTimeout(r, 1000))
  const b = JSON.parse(await sess.evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const el=h.shadowRoot.querySelector('.login__button');const r=el.getBoundingClientRect();return JSON.stringify({d:el.className.includes('disabled'),x:r.x+r.width/2,y:r.y+r.height/2});})()`))
  if (b.d) throw new Error('login button still disabled after fill+agree')
  await sess.click(b.x, b.y)
  const t1 = Date.now()
  while (Date.now() - t1 < 20000) {
    const still = await sess.evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);return !!h.shadowRoot.querySelector('.login');})()`)
    if (!still) break
    await new Promise((r) => setTimeout(r, 500))
  }
  await new Promise((r) => setTimeout(r, 2500))
}

// Click an element found by data-testid (center of its rect). Returns rect or null.
export async function clickTestid(sess, testid) {
  const r = await sess.evalJS(`(()=>{
    const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);
    const el=h.shadowRoot.querySelector('[data-testid="${testid}"]');
    if(!el) return null;
    const b=el.getBoundingClientRect();
    if(b.width===0&&b.height===0){ const inner=el.shadowRoot&&el.shadowRoot.querySelector('*'); const ib=inner?inner.getBoundingClientRect():b; return JSON.stringify({x:ib.x+ib.width/2,y:ib.y+ib.height/2,w:ib.width,h:ib.height}); }
    return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2,w:b.width,h:b.height});
  })()`)
  if (!r) return null
  const rc = JSON.parse(r)
  await sess.click(rc.x, rc.y)
  return rc
}

// Navigate to settings main (uses the wide rail, so settings is always visible).
export async function gotoSettings(sess) {
  let rc = await clickTestid(sess, 'nav-item-settings')
  if (!rc) { await clickTestid(sess, 'nav-item-more'); await new Promise((r) => setTimeout(r, 1200)); rc = await clickTestid(sess, 'nav-item-settings') }
  await new Promise((r) => setTimeout(r, 2500))
  return rc
}

// Dump a structural report of the current screen for HIG conformance analysis.
// Captures page bg, sections/cards (radius+bg+rect), text runs (font/color/weight),
// row heights, and nav geometry.
export async function dumpScreen(sess, label) {
  const data = await sess.evalJS(`(()=>{
  const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const rootCs=getComputedStyle(sr.querySelector('.theme-root'));
  const page=sr.querySelector('.page,.home');
  const fmt=el=>{const b=el.getBoundingClientRect();const c=getComputedStyle(el);return {tag:el.tagName,cls:(el.className||'').slice(0,60),x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),bg:c.backgroundColor,radius:c.borderRadius,fs:c.fontSize,color:c.color,fw:c.fontWeight};};
  const out={label:${JSON.stringify(label)},viewport:{w:innerWidth,h:innerHeight},themeRootBg:rootCs.backgroundColor,pageClass:page?page.className:'',pageBg:page?getComputedStyle(page).backgroundColor:null};
  out.blocks=[...sr.querySelectorAll('x-view,view')].filter(e=>{const c=getComputedStyle(e);const b=e.getBoundingClientRect();return b.width>40&&b.height>16&&(c.backgroundColor!=='rgba(0, 0, 0, 0)'||parseInt(c.borderRadius)>0);}).slice(0,40).map(fmt);
  const texts=[...sr.querySelectorAll('x-text,text')].map(fmt);
  const seen=new Set();out.texts=texts.filter(t=>{const k=t.fs+'|'+t.color+'|'+t.fw;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,40);
  return JSON.stringify(out,null,1);
})()`)
  return data
}
