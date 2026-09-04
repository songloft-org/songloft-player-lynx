import { openSession, login, gotoSettings } from './lib-driver.mjs'
async function main(){
  const s=await openSession({width:390,height:844})
  await login(s); await gotoSettings(s)
  await new Promise(r=>setTimeout(r,2000))
  const r=await s.evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const chevrons=[...sr.querySelectorAll('[data-icon="chevron-right"]')];
  const cols=new Set();chevrons.forEach(c=>{const m=(c.getAttribute('content')||'').match(/(?:fill|stroke)="(#[0-9a-fA-F]{6})"/);if(m)cols.add(m[1]);});
  return JSON.stringify({chevronCount:chevrons.length,chevronColors:[...cols]});})()`)
  console.log('chevrons:',r)
  await s.close();process.exit(0)
}
main().catch(e=>{console.error('FAIL',e);process.exit(1)})
