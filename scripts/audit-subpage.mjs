import { openSession, login, gotoSettings, clickTestid } from './lib-driver.mjs'
async function main() {
  const testid = process.argv[2] ?? 'settings-appearance'
  const s = await openSession({ width: 390, height: 844 })
  await login(s)
  await gotoSettings(s)
  const rc = await clickTestid(s, testid)
  if (!rc) { console.log('could not find', testid); await s.close(); process.exit(1) }
  await new Promise((r) => setTimeout(r, 2500))
  await s.screenshot(`/tmp/sub-${testid}.png`)
  const r = await s.evalJS(`(()=>{
  const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const page=sr.querySelector('.subpage,.page,[class*=subpage]');
  const cards=[...sr.querySelectorAll('x-view')].filter(e=>(e.className||'').includes('settings-section__card')).map(e=>{const b=e.getBoundingClientRect();const c=getComputedStyle(e);return{x:Math.round(b.x),w:Math.round(b.width),bg:c.backgroundColor,radius:c.borderRadius};});
  const back=sr.querySelector('.subpage__back,[class*=__back]');
  const title=sr.querySelector('.subpage__title,[class*=subpage__title]');
  return JSON.stringify({screen:sr.querySelector('.page,.subpage')?.className||'?',pageBg:page?getComputedStyle(page).backgroundColor:null,cards,title:title?{txt:title.textContent,fs:getComputedStyle(title).fontSize}:null,backPresent:!!back},null,1);
})()`)
  console.log(r)
  await s.close(); process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
