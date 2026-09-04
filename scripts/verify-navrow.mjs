import { openSession, login, gotoSettings, clickTestid } from './lib-driver.mjs'
async function main(){
  const s=await openSession({width:1280,height:800})  // wide -> dual-column settings
  await login(s); await gotoSettings(s); await clickTestid(s,'settings-appearance')
  await new Promise(r=>setTimeout(r,2500))
  const r=await s.evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const nav=sr.querySelector('[data-testid="settings-appearance"]');
  if(!nav)return JSON.stringify({found:false});
  const c=getComputedStyle(nav);
  return JSON.stringify({found:true,cls:nav.className,bg:c.backgroundColor,hasActive:nav.className.includes('--active')});})()`)
  console.log('wide nav row:',r)
  await s.close();process.exit(0)
}
main().catch(e=>{console.error('FAIL',e);process.exit(1)})
