/**
 * Regression harness for the plugin-tab renderer crash (error code 11 / SIGSEGV).
 *
 * Switching away from a Web plugin tab used to detach the plugin iframe, and that
 * detach crashed Chrome's renderer. Full forensics and the bisect that isolated
 * each condition: `docs/archive/web-plugin-tab-crash.md`.
 *
 * ── Why this script launches its own Chrome ──────────────────────────────────
 *
 * The crash needs THREE conditions at once. Miss any one and the test passes
 * whether or not the bug is present, which is why the generic CDP scripts in this
 * directory cannot cover it:
 *
 *   1. the app detaching a plugin frame  — what the fix removed;
 *   2. an extension whose content script injects into every frame
 *      (`all_frames: true` + `match_about_blank`), e.g. KISS Translator;
 *   3. DevTools actually open — a real DevTools frontend. Enabling the CDP
 *      `Accessibility` domain alone is NOT enough (0/3 with it, 4/4 with DevTools).
 *
 * So this script owns the browser: throwaway profile, DevTools auto-opened and
 * docked, and the amplifier extension side-loaded through CDP
 * `Extensions.loadUnpacked` (Chrome 137+ ignores `--load-extension`).
 *
 * ── A pass is only meaningful WITH the extension ─────────────────────────────
 *
 * Without condition 2 this harness cannot fail, so it refuses to report a pass:
 * it verifies the extension really injected and exits non-zero if it did not.
 * "0 crashes" from a run that never loaded the amplifier means nothing.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *   # 1. backend on :58091 and the built web bundle on :3010
 *   #    (cd ../.. && make run)   +   pnpm run build:web && PORT=3010 node web/serve.mjs
 *   # 2. point EXT_DIR at an unpacked copy of an all-frames extension. A
 *   #    Chrome-installed one must be COPIED and have `_metadata/` deleted —
 *   #    unpacked loading rejects reserved `_`-prefixed directories:
 *   #      cp -R ~/Library/Application\ Support/Google/Chrome/Default/Extensions/\
 *   #        bdiifdefkgmcblbcghdlonllpjhhjgof/*\/ /tmp/kiss && rm -rf /tmp/kiss/_metadata
 *   node scripts/cdp-plugin-tab-crash.mjs
 *
 * Env: EXT_DIR (required) · APP (http://localhost:3010/) · API
 * (http://localhost:58091) · SWITCHES (24) · PLUGIN_TABS (comma-separated tab
 * labels) · HOME_TAB (首页) · DWELL (700) · CHROME · PORT (9333) · KEEP=1 to
 * leave the browser running for inspection.
 *
 * Exit: 0 = no crash (the fix holds) · 1 = renderer crashed · 2 = harness could
 * not establish the preconditions (never read as a pass).
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = process.env.PORT ?? '9333'
const APP = process.env.APP ?? 'http://localhost:3010/'
const API = process.env.API ?? 'http://localhost:58091'
const EXT_DIR = process.env.EXT_DIR ?? ''
const SWITCHES = Number(process.env.SWITCHES ?? 24)
const DWELL = Number(process.env.DWELL ?? 700)
const HOME_TAB = process.env.HOME_TAB ?? '首页'
const PLUGIN_TABS = (process.env.PLUGIN_TABS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)
const KEEP = process.env.KEEP === '1'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(2) }

/** The app's shadow root. Pinned to `lynx-view`, NOT "first host with a shadow
 *  root" — the amplifier extension injects shadow hosts of its own, and a
 *  heuristic picks one of those and silently measures nothing. */
const SR = "(()=>{const h=document.querySelector('lynx-view')"
  + "||document.getElementById('app');return h&&h.shadowRoot?h.shadowRoot:null})()"

let id = 0
const pending = new Map()
const handlers = []
let ws
let crash = null

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const i = ++id
    pending.set(i, { resolve, reject })
    const msg = { id: i, method, params }
    if (sessionId) msg.sessionId = sessionId
    ws.send(JSON.stringify(msg))
    setTimeout(() => {
      if (pending.has(i)) { pending.delete(i); reject(new Error(`timeout ${method}`)) }
    }, 25000)
  })
}
const on = (method, fn) => handlers.push([method, fn])

async function main() {
  if (!EXT_DIR) {
    fail('EXT_DIR is required — without an all-frames extension this harness cannot '
      + 'fail, so a pass would be meaningless. See the header.')
  }
  if (!existsSync(join(EXT_DIR, 'manifest.json'))) fail(`no manifest.json under EXT_DIR=${EXT_DIR}`)
  if (existsSync(join(EXT_DIR, '_metadata'))) {
    fail(`${EXT_DIR} still has _metadata/ — unpacked loading rejects reserved `
      + `"_" directories. Delete it from your copy.`)
  }

  const profile = mkdtempSync(join(tmpdir(), 'songloft-crash-'))
  // DevTools must come up docked on the Elements panel: condition 3 is the real
  // DevTools frontend, and a fresh profile has no dock state to inherit.
  writeFileSync(join(profile, 'Default_Preferences.tmp'), '')
  const prefsDir = join(profile, 'Default')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(prefsDir, { recursive: true })
  writeFileSync(join(prefsDir, 'Preferences'), JSON.stringify({
    extensions: { ui: { developer_mode: true } },
    devtools: { preferences: { currentDockState: '"bottom"', 'panel-selected-tab': '"elements"' } },
  }))

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--auto-open-devtools-for-tabs',
    'about:blank',
  ], { stdio: 'ignore', detached: true })
  chrome.unref()

  const cleanup = () => {
    if (KEEP) { console.log(`  (browser left running, profile ${profile})`); return }
    try { process.kill(-chrome.pid) } catch { /* already gone */ }
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* best effort */ }
  }

  let version
  for (let i = 0; i < 30; i++) {
    try { version = await (await fetch(`http://localhost:${PORT}/json/version`)).json(); break }
    catch { await sleep(500) }
  }
  if (!version) { cleanup(); fail(`Chrome never exposed CDP on :${PORT}`) }
  console.log(`  ${version.Browser}`)

  ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id)
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result)
    } else if (m.method) {
      for (const [name, fn] of handlers) if (m.method === name) fn(m.params, m.sessionId)
    }
  })
  on('Target.targetCrashed', (p) => { crash ??= { where: 'browser', ...p } })
  on('Inspector.targetCrashed', () => { crash ??= { where: 'page' } })
  await send('Target.setDiscoverTargets', { discover: true })

  try {
    const loaded = await send('Extensions.loadUnpacked', { path: EXT_DIR })
    console.log(`  amplifier extension loaded: ${loaded.id}`)
  } catch (e) {
    cleanup()
    fail(`Extensions.loadUnpacked failed: ${e.message}`)
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId: sid } = await send('Target.attachToTarget', { targetId, flatten: true })
  await send('Page.enable', {}, sid)
  await send('Runtime.enable', {}, sid)
  // Accessibility on top of DevTools: it is how the crash was first chased, it is
  // harmless, and it keeps the renderer's AX tree churning during the switches.
  await send('Accessibility.enable', {}, sid).catch(() => {})
  await send('Page.navigate', { url: APP }, sid)
  await sleep(10000)

  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }, sid)
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.text}`)
    return r.result?.value
  }

  // Condition 2, verified rather than assumed: the extension must really have
  // injected into this page. Its own shadow hosts are the observable proof.
  const injected = await evalJS(
    `[...document.querySelectorAll('*')].some((e) => e.shadowRoot && e !== document.querySelector('lynx-view'))`,
  )
  if (!injected) {
    cleanup()
    fail('the extension did not inject into the page — a "no crash" result here '
      + 'would prove nothing. Check EXT_DIR points at an all-frames extension.')
  }
  console.log('  extension injection confirmed')

  const probe = async () => JSON.parse(await evalJS(`(()=>{const sr=${SR};
    if(!sr) return JSON.stringify({sr:false});
    const R=(e)=>{const r=e.getBoundingClientRect();
      return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),h:Math.round(r.height)}};
    return JSON.stringify({sr:true,
      navs:[...sr.querySelectorAll('.nav-item')].map((n)=>Object.assign(
        {label:(n.textContent||'').trim()},R(n))),
      frames:sr.querySelectorAll('iframe').length,
      lynxViews:sr.querySelectorAll('lynx-view').length});})()`))

  const click = async (t) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: t.x, y: t.y }, sid)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: 1 }, sid)
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: 1 }, sid)
  }

  let state = await probe()
  if (state.sr && !state.navs?.length) {
    // Login page: username and API URL are dev-defaulted, so only the password
    // and the agreement checkbox need driving.
    const login = JSON.parse(await evalJS(`(()=>{const sr=${SR};
      const R=(e)=>{const r=e.getBoundingClientRect();
        return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}};
      const b=sr.querySelector('.login__button'), c=sr.querySelector('.app-checkbox');
      return JSON.stringify({btn:b?R(b):null,cb:c?R(c):null});})()`))
    if (!login.btn) { cleanup(); fail('neither nav items nor a login form — is the app serving?') }
    await evalJS(`(()=>{const sr=${SR};
      const set=(i,v)=>{const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        s.call(i,v);i.dispatchEvent(new InputEvent('input',{bubbles:true}));
        i.dispatchEvent(new Event('change',{bubbles:true}))};
      const vals=['admin','admin',${JSON.stringify(API)}];
      [...sr.querySelectorAll('x-input')].forEach((x,i)=>{
        const inp=x.shadowRoot?.querySelector('input'); if(inp&&!inp.value) set(inp,vals[i]??'')});})()`)
    await sleep(700)
    if (login.cb) { await click(login.cb); await sleep(700) }
    const btn = JSON.parse(await evalJS(`(()=>{const sr=${SR};
      const b=sr.querySelector('.login__button'); const r=b.getBoundingClientRect();
      return JSON.stringify({disabled:b.className.includes('disabled'),
        x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()`))
    if (btn.disabled) { cleanup(); fail('the login button never enabled') }
    await click(btn)
    await sleep(8000)
    state = await probe()
  }
  if (!state.navs?.length) { cleanup(); fail('no nav items after login') }

  const home = state.navs.find((n) => n.label === HOME_TAB) ?? state.navs[0]
  const wanted = PLUGIN_TABS.length ? PLUGIN_TABS : null
  const plugins = (wanted
    ? wanted.map((l) => state.navs.find((n) => n.label === l)).filter(Boolean)
    // No explicit list: everything between the fixed head tabs and 设置 is a
    // plugin tab, which is what we want to churn.
    : state.navs.filter((n) => n !== home && n.h > 0 && !['曲库', '设置'].includes(n.label)))
  if (!plugins.length) { cleanup(); fail('no plugin tabs found — configure at least one') }
  console.log(`  churning ${plugins.map((p) => p.label).join(' / ')} against "${home.label}", `
    + `${SWITCHES} switches`)

  let peakFrames = 0
  for (let i = 1; i <= SWITCHES && !crash; i++) {
    const target = i % 2 === 1 ? plugins[Math.floor((i - 1) / 2) % plugins.length] : home
    await click(target)
    await sleep(DWELL)
    if (crash) break
    // What DevTools' own a11y pane does, and the moment a detached frame used to
    // be dereferenced.
    await send('Accessibility.getFullAXTree', {}, sid).catch(() => {})
    if (crash) break
    try {
      const s = await probe()
      peakFrames = Math.max(peakFrames, s.frames)
      console.log(`    #${i} → ${target.label}  frames=${s.frames} lynx-views=${s.lynxViews}`)
    } catch (e) {
      // A dead session IS the crash signal when the event has not landed yet.
      crash ??= { where: 'probe', detail: e.message }
    }
  }

  await sleep(1500)
  console.log('')
  if (crash) {
    console.error(`✗ renderer crashed: ${JSON.stringify(crash)}`)
    cleanup()
    process.exit(1)
  }
  console.log(`✓ ${SWITCHES} switches, no crash. Peak frames in the shadow root: ${peakFrames} `
    + `(1 web-core realm + one kept-alive frame per visited plugin — it must plateau, `
    + `not keep climbing).`)
  cleanup()
  process.exit(0)
}

main().catch((e) => { console.error('✗ harness error:', e); process.exit(2) })
