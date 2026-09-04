import { openSession, login, gotoSettings, clickTestid } from './lib-driver.mjs'
async function main() {
  const s = await openSession({ width: 390, height: 844 })
  await login(s)
  await gotoSettings(s)
  const rc = await clickTestid(s, 'settings-appearance')
  if (!rc) { console.log('settings-appearance not found'); await s.close(); process.exit(1) }
  await new Promise((r) => setTimeout(r, 2500))

  const r = await s.evalJS(`(()=>{
  const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const tiles=[...sr.querySelectorAll('x-view')].filter(e=>(e.className||'').includes('theme-tile ')).length || [...sr.querySelectorAll('x-view')].filter(e=>(e.className||'').startsWith('theme-tile')).length;
  const picker=sr.querySelector('.theme-picker');
  const seg=sr.querySelector('.segmented');
  const segItems=seg?[...seg.children].length:0;
  const segSelected=seg?!!seg.querySelector('.segmented__item--selected'):false;
  const fslider=sr.querySelector('.font-scale-slider');
  const desc=sr.querySelector('.appearance-material-desc');
  const langRows=[...sr.querySelectorAll('x-view')].filter(e=>(e.className||'').split(' ')[0]==='settings-row').length;
  return JSON.stringify({pickerPresent:!!picker,themeTiles:tiles,segmentedPresent:!!seg,segItems,segSelected,fontSliderPresent:!!fslider,materialDesc:desc?desc.textContent.slice(0,30):null,langRows},null,1);
})()`)
  console.log(r)
  await s.screenshot('/tmp/appearance-ios.png')
  console.log('wrote /tmp/appearance-ios.png')
  await s.close(); process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
