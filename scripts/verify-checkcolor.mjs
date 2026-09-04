import { openSession, login, gotoSettings, clickTestid } from './lib-driver.mjs'
async function main(){
  const s=await openSession({width:390,height:844})
  await login(s); await gotoSettings(s); await clickTestid(s,'settings-appearance')
  await new Promise(r=>setTimeout(r,2500))
  const r=await s.evalJS(`(()=>{const h=[...document.querySelectorAll('*')].find(e=>e.shadowRoot);const sr=h.shadowRoot;
  const check=sr.querySelector('[data-icon="check"]');
  const content=check?check.getAttribute('content'):null;
  const fillMatch=content?content.match(/(?:fill|stroke)="(#[0-9a-fA-F]{6})"/):null;
  return JSON.stringify({checkPresent:!!check,accentHex:fillMatch?fillMatch[1]:null});})()`)
  console.log('check color:',r)
  await s.close();process.exit(0)
}
main().catch(e=>{console.error('FAIL',e);process.exit(1)})
