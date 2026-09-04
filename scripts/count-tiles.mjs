import { openSession, login, gotoSettings, clickTestid } from './lib-driver.mjs'
async function main(){
  const s=await openSession({width:390,height:844})
  await login(s); await gotoSettings(s); await clickTestid(s,'settings-appearance')
  await new Promise(r=>setTimeout(r,2500))
  const r=await s.evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const tiles=[...sr.querySelectorAll('x-view')].filter(e=>(e.className||'').split(' ')[0]==='theme-tile');
  const labels=tiles.map(t=>{const l=t.querySelector('.theme-tile__label');const sel=t.className.includes('selected');return {label:l?l.textContent:null,selected:sel};});
  return JSON.stringify(labels,null,1);})()`)
  console.log('theme tiles:',r)
  await s.close();process.exit(0)
}
main().catch(e=>{console.error('FAIL',e);process.exit(1)})
