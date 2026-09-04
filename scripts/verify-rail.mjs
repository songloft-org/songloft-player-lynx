import { openSession, login } from './lib-driver.mjs'
async function main() {
  const s = await openSession({ width: 1280, height: 800 })
  await login(s)
  const r = await s.evalJS(`(()=>{
  const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const active=sr.querySelector('.nav-item--active .nav-item__pill');
  const inactive=sr.querySelector('.nav-item:not(.nav-item--active) .nav-item__pill');
  const brand=sr.querySelector('.shell__brand');
  const rail=sr.querySelector('.shell__rail');
  const cs=el=>el?getComputedStyle(el):null;
  return JSON.stringify({
    rail:{w:Math.round(rail.getBoundingClientRect().width),bg:cs(rail).backgroundColor,borderRight:cs(rail).borderRightWidth+' '+cs(rail).borderRightColor},
    activePill:active?{radius:cs(active).borderRadius,bg:cs(active).backgroundColor,w:Math.round(active.getBoundingClientRect().width),h:Math.round(active.getBoundingClientRect().height)}:null,
    inactivePill:inactive?{radius:cs(inactive).borderRadius,bg:cs(inactive).backgroundColor}:null,
    brandPresent:!!brand,
    brandText:brand?(brand.querySelector('.shell__brand-text')?.textContent):null,
    labelFont:active?cs(active.querySelector('.nav-item__label')).fontSize:null,
  },null,1);
})()`)
  console.log(r)
  await s.screenshot('/tmp/home-wide-v2.png')
  console.log('screenshot /tmp/home-wide-v2.png')
  await s.close(); process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
