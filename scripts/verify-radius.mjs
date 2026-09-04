import { openSession, login, gotoSettings } from './lib-driver.mjs'
async function main() {
  const s = await openSession({ width: 390, height: 844 })
  await login(s)
  await gotoSettings(s)
  const r = await s.evalJS(`(()=>{
  const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const card=sr.querySelector('.settings-section__card');
  const c=getComputedStyle(card);
  return JSON.stringify({cardRadius:c.borderRadius,cardBg:c.backgroundColor});
})()`)
  console.log('settings card:', r)
  await s.screenshot('/tmp/settings-main-v2.png')
  console.log('wrote /tmp/settings-main-v2.png')
  await s.close()

  // wide rail selection radius check
  const w = await openSession({ width: 1280, height: 800 })
  await login(w)
  const rr = await w.evalJS(`(()=>{
  const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const a=sr.querySelector('.nav-item--active .nav-item__pill');
  const c=getComputedStyle(a);const b=a.getBoundingClientRect();
  return JSON.stringify({railSelRadius:c.borderRadius,railSelH:Math.round(b.height)});
})()`)
  console.log('rail selection:', rr)
  await w.close()
  process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
